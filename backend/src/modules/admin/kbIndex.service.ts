import fs from 'node:fs';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { db } from '../../db/connection';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';
import { embedBatch, currentEmbeddingModel } from '../../services/openai';
import { encodeEmbedding, rebuildVectorCache } from '../../services/vectorStore';
import { registerJobHandler } from '../../services/jobs';

interface KbDocRow {
  id: string;
  title: string;
  description: string | null;
  source_type: string;
  file_path: string | null;
  file_mime: string | null;
  source_url: string | null;
  course: string | null;
  cap_year: number | null;
  language: string;
  topic: string | null;
}

const TARGET_CHARS = 2000; // ~500 tokens
const OVERLAP_CHARS = Math.round(TARGET_CHARS * 0.15); // ~15% overlap
const MAX_CHARS = TARGET_CHARS; // never exceed a chunk body of this size

/** Rough token estimate (~4 chars/token) for storing token_count. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

/** Split text into sentences, treating the Devanagari danda '।' as a terminator. */
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?।])\s+/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Split a paragraph that is itself larger than MAX_CHARS by sentence/hard cut. */
function splitOversizedParagraph(para: string): string[] {
  const out: string[] = [];
  const sentences = splitSentences(para);
  let buf = '';
  for (const s of sentences) {
    if (s.length > MAX_CHARS) {
      // A single sentence bigger than the budget: hard-slice it.
      if (buf) {
        out.push(buf);
        buf = '';
      }
      for (let i = 0; i < s.length; i += MAX_CHARS) out.push(s.slice(i, i + MAX_CHARS));
      continue;
    }
    if (buf && buf.length + 1 + s.length > MAX_CHARS) {
      out.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Chunk text into ~TARGET_CHARS pieces, splitting first on paragraph then
 * sentence boundaries, never exceeding MAX_CHARS, with ~OVERLAP_CHARS carryover.
 */
function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  // Expand any oversized paragraph into sentence-bounded units up front.
  const units: string[] = [];
  for (const p of paragraphs) {
    if (p.length > MAX_CHARS) units.push(...splitOversizedParagraph(p));
    else units.push(p);
  }

  const chunks: string[] = [];
  let buf = '';
  for (const u of units) {
    if (buf && buf.length + 2 + u.length > MAX_CHARS) {
      chunks.push(buf);
      // Carry an overlap tail from the previous chunk for context continuity.
      const tail = buf.slice(Math.max(0, buf.length - OVERLAP_CHARS));
      buf = `${tail}\n\n${u}`.slice(0, MAX_CHARS);
      // If the overlapped seed already overflows, flush the seed alone.
      if (buf.length >= MAX_CHARS) {
        chunks.push(buf);
        buf = u.length > MAX_CHARS ? u.slice(0, MAX_CHARS) : u;
      }
    } else {
      buf = buf ? `${buf}\n\n${u}` : u;
    }
  }
  if (buf.trim()) chunks.push(buf);
  return chunks.map((c) => c.trim()).filter(Boolean);
}

/**
 * Read the stored text for a document depending on its source type.
 * PDFs are handled separately in extractTextAsync (they require an async parse).
 */
function extractText(doc: KbDocRow): string {
  const type = doc.source_type;

  if (type === 'google_sheet' || (doc.file_mime && /sheet|excel|csv/i.test(doc.file_mime))) {
    if (!doc.file_path) throw new Error('spreadsheet document has no file_path');
    return extractSpreadsheet(doc.file_path);
  }

  // Text-bearing types: faq/notice/circular/schedule/counselling_note/manual_text/url.
  // The create endpoint persists the provided text body to file_path (a .txt
  // sidecar) when given, otherwise we fall back to description.
  if (doc.file_path && fs.existsSync(doc.file_path) && /\.txt$/i.test(doc.file_path)) {
    return fs.readFileSync(doc.file_path, 'utf8');
  }
  return doc.description ?? '';
}

function extractSpreadsheet(filePath: string): string {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const lines: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    for (const row of rows) {
      const line = Object.entries(row)
        .map(([k, v]) => `${k}: ${String(v).trim()}`)
        .filter((cell) => !cell.endsWith(': '))
        .join(' | ');
      if (line.trim()) lines.push(line);
    }
  }
  return lines.join('\n');
}

/** Async text extraction (PDFs require an async parse). */
async function extractTextAsync(doc: KbDocRow): Promise<string> {
  if (doc.source_type === 'pdf') {
    if (!doc.file_path) throw new Error('pdf document has no file_path');
    const buf = fs.readFileSync(doc.file_path);
    const parsed = await pdfParse(buf);
    return parsed.text ?? '';
  }
  return extractText(doc);
}

const insertChunkStmt = db.prepare(
  `INSERT INTO kb_chunks
     (id, document_id, chunk_index, content, token_count, language, course, cap_year, topic,
      is_active, embedding, embedding_dim, embedding_model, source_locator, metadata_json, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, '{}', ?)`,
);

/**
 * Full ingestion for one KB document: extract → chunk → embed → replace chunks
 * → mark indexed. On any failure the document is flagged 'failed' with the error.
 */
export async function indexDocument(documentId: string): Promise<void> {
  const doc = db
    .prepare(
      `SELECT id, title, description, source_type, file_path, file_mime, source_url,
              course, cap_year, language, topic
         FROM kb_documents WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(documentId) as KbDocRow | undefined;

  if (!doc) {
    logger.warn({ documentId }, 'kb index: document not found or deleted');
    return;
  }

  db.prepare(`UPDATE kb_documents SET index_status='processing', index_error=NULL, updated_at=? WHERE id=?`).run(
    now(),
    documentId,
  );

  try {
    const raw = await extractTextAsync(doc);
    const bodies = chunkText(raw);

    if (!bodies.length) {
      // Nothing to index — clear old chunks and mark indexed with zero chunks.
      db.prepare('DELETE FROM kb_chunks WHERE document_id = ?').run(documentId);
      db.prepare(
        `UPDATE kb_documents SET chunk_count=0, index_status='indexed', index_error=NULL,
           indexed_at=?, embedding_model=?, updated_at=? WHERE id=?`,
      ).run(now(), currentEmbeddingModel(), now(), documentId);
      rebuildVectorCache();
      logger.info({ documentId }, 'kb index: no extractable text; indexed empty');
      return;
    }

    const header = `[Source: ${doc.title} | topic: ${doc.topic ?? ''} | lang: ${doc.language}]`;
    const texts = bodies.map((b) => `${header}\n${b}`);

    const vectors = await embedBatch(texts);

    const ts = now();
    const writeAll = db.transaction(() => {
      db.prepare('DELETE FROM kb_chunks WHERE document_id = ?').run(documentId);
      for (let i = 0; i < bodies.length; i++) {
        const vec = vectors[i];
        insertChunkStmt.run(
          newId(),
          documentId,
          i,
          texts[i],
          estimateTokens(texts[i]),
          doc.language,
          doc.course,
          doc.cap_year,
          doc.topic,
          encodeEmbedding(vec),
          vec.length,
          currentEmbeddingModel(),
          `part ${i + 1}`,
          ts,
        );
      }
      db.prepare(
        `UPDATE kb_documents SET chunk_count=?, index_status='indexed', index_error=NULL,
           indexed_at=?, embedding_model=?, updated_at=? WHERE id=?`,
      ).run(bodies.length, ts, currentEmbeddingModel(), ts, documentId);
    });
    writeAll();

    rebuildVectorCache();
    logger.info({ documentId, chunks: bodies.length }, 'kb index: indexed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE kb_documents SET index_status='failed', index_error=?, updated_at=? WHERE id=?`,
    ).run(message.slice(0, 2000), now(), documentId);
    logger.error({ err, documentId }, 'kb index: failed');
    throw err; // let the job worker record/retry
  }
}

// Register handlers so the in-process job worker can run indexing jobs.
registerJobHandler('kb_index', (p) => indexDocument(String(p.documentId)));
registerJobHandler('kb_reindex', (p) => indexDocument(String(p.documentId)));
registerJobHandler('embed_chunks', (p) => indexDocument(String(p.documentId)));
