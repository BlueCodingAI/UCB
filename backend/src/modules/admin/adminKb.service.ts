import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../../db/connection';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { integrations } from '../../config/env';
import {
  ensureVectorStore,
  getVectorStoreId,
  addFileToVectorStore,
  removeFileFromVectorStore,
  deleteOpenAIFile,
} from '../../services/openai';
import { STORAGE_DIRS } from '../../middleware/upload';
import { deleteStructuredData } from '../../services/kbStructuredStore';

/** Best-effort: keep the shared vector store's membership in sync with active state. */
function syncVectorStoreMembership(fileId: string | null | undefined, active: boolean): void {
  if (!integrations.openaiDocsEnabled || !fileId) return;
  void (async () => {
    try {
      if (active) {
        const vs = await ensureVectorStore();
        await addFileToVectorStore(vs, fileId);
      } else {
        const vs = getVectorStoreId();
        if (vs) await removeFileFromVectorStore(vs, fileId);
      }
    } catch (err) {
      logger.warn({ err, fileId }, 'vector store membership sync failed');
    }
  })();
}

/** Best-effort: detach + delete the OpenAI file when a document is removed. */
function purgeOpenAIFile(fileId: string | null | undefined): void {
  if (!integrations.openaiDocsEnabled || !fileId) return;
  void (async () => {
    try {
      const vs = getVectorStoreId();
      if (vs) await removeFileFromVectorStore(vs, fileId);
      await deleteOpenAIFile(fileId);
    } catch (err) {
      logger.warn({ err, fileId }, 'openai file purge failed');
    }
  })();
}

export interface KbDocumentDTO {
  id: string;
  title: string;
  description: string | null;
  sourceType: string;
  course: string | null;
  capYear: number | null;
  language: string;
  topic: string | null;
  sourceUrl: string | null;
  filePath: string | null;
  fileMime: string | null;
  fileSizeBytes: number | null;
  isActive: boolean;
  indexStatus: string;
  indexError: string | null;
  chunkCount: number;
  embeddingModel: string | null;
  openaiFileStatus: string | null;
  extractType: string | null;
  structuredRecordCount: number;
  indexedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** DB row → KbDocument DTO. */
export function mapKbDocument(r: any): KbDocumentDTO {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    sourceType: r.source_type,
    course: r.course ?? null,
    capYear: r.cap_year ?? null,
    language: r.language,
    topic: r.topic ?? null,
    sourceUrl: r.source_url ?? null,
    filePath: r.file_path ?? null,
    fileMime: r.file_mime ?? null,
    fileSizeBytes: r.file_size_bytes ?? null,
    isActive: !!r.is_active,
    indexStatus: r.index_status,
    indexError: r.index_error ?? null,
    chunkCount: r.chunk_count ?? 0,
    embeddingModel: r.embedding_model ?? null,
    openaiFileStatus: r.openai_file_status ?? null,
    extractType: r.extract_type ?? null,
    structuredRecordCount: r.structured_record_count ?? 0,
    indexedAt: r.indexed_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface ChunkPreviewDTO {
  id: string;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  sourceLocator: string | null;
  language: string;
}

function mapChunkPreview(r: any): ChunkPreviewDTO {
  return {
    id: r.id,
    chunkIndex: r.chunk_index,
    content: r.content,
    tokenCount: r.token_count ?? null,
    sourceLocator: r.source_locator ?? null,
    language: r.language,
  };
}

/** Persist a provided text body to a .txt sidecar so indexDocument can read it. */
export function writeTextSidecar(text: string): { filePath: string; fileSize: number } {
  const name = `kbtext_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.txt`;
  const filePath = path.join(STORAGE_DIRS.uploadsDir, name);
  fs.writeFileSync(filePath, text, 'utf8');
  return { filePath, fileSize: Buffer.byteLength(text, 'utf8') };
}

function fileHash(filePath: string): string | null {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

export interface CreateDocumentInput {
  title: string;
  description?: string;
  sourceType: string;
  language: string;
  course?: string;
  capYear?: number;
  topic?: string;
  sourceUrl?: string;
  content?: string;
  isActive?: boolean;
  uploadedBy?: string | null;
  file?: { path: string; mimetype: string; size: number } | null;
}

const TEXT_TYPES = new Set(['faq', 'notice', 'circular', 'schedule', 'counselling_note', 'manual_text', 'url']);

export function createDocument(input: CreateDocumentInput): KbDocumentDTO {
  const id = newId();
  const ts = now();

  let filePath: string | null = input.file?.path ?? null;
  let fileMime: string | null = input.file?.mimetype ?? null;
  let fileSize: number | null = input.file?.size ?? null;

  // For text-bearing types with an inline `content` body, persist a .txt sidecar
  // so the indexer reads the full text (description column is for short blurbs).
  if (!filePath && input.content && TEXT_TYPES.has(input.sourceType)) {
    const sidecar = writeTextSidecar(input.content);
    filePath = sidecar.filePath;
    fileMime = 'text/plain';
    fileSize = sidecar.fileSize;
  }

  const hash = filePath ? fileHash(filePath) : null;

  db.prepare(
    `INSERT INTO kb_documents
       (id, title, description, source_type, file_path, file_mime, file_size_bytes, file_hash,
        source_url, course, cap_year, language, topic, version, is_active, index_status,
        chunk_count, uploaded_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending', 0, ?, ?, ?)`,
  ).run(
    id,
    input.title,
    input.description ?? null,
    input.sourceType,
    filePath,
    fileMime,
    fileSize,
    hash,
    input.sourceUrl ?? null,
    input.course ?? null,
    input.capYear ?? null,
    input.language,
    input.topic ?? null,
    input.isActive === false ? 0 : 1,
    input.uploadedBy ?? null,
    ts,
    ts,
  );

  return getDocumentOrThrow(id);
}

export function getDocumentRow(id: string): any | undefined {
  return db.prepare('SELECT * FROM kb_documents WHERE id = ? AND deleted_at IS NULL').get(id);
}

export function getDocumentOrThrow(id: string): KbDocumentDTO {
  const row = getDocumentRow(id);
  if (!row) throw Errors.notFound('KB document not found');
  return mapKbDocument(row);
}

export function getChunkPreview(documentId: string, limit = 20): ChunkPreviewDTO[] {
  const rows = db
    .prepare(
      `SELECT id, chunk_index, content, token_count, source_locator, language
         FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index ASC LIMIT ?`,
    )
    .all(documentId, limit) as any[];
  return rows.map(mapChunkPreview);
}

export interface ListFilters {
  q?: string;
  language?: string;
  sourceType?: string;
  isActive?: string;
  indexStatus?: string;
}

const SORT_COLUMNS: Record<string, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  title: 'title',
  indexStatus: 'index_status',
  chunkCount: 'chunk_count',
};

export function listDocuments(
  filters: ListFilters,
  opts: { offset: number; pageSize: number; sort: string; order: 'asc' | 'desc' },
): { rows: KbDocumentDTO[]; total: number } {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.q) {
    where.push('title LIKE ?');
    params.push(`%${filters.q}%`);
  }
  if (filters.language) {
    where.push('language = ?');
    params.push(filters.language);
  }
  if (filters.sourceType) {
    where.push('source_type = ?');
    params.push(filters.sourceType);
  }
  if (filters.isActive === '0' || filters.isActive === '1') {
    where.push('is_active = ?');
    params.push(Number(filters.isActive));
  } else if (filters.isActive === 'true' || filters.isActive === 'false') {
    where.push('is_active = ?');
    params.push(filters.isActive === 'true' ? 1 : 0);
  }
  if (filters.indexStatus) {
    where.push('index_status = ?');
    params.push(filters.indexStatus);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const sortCol = SORT_COLUMNS[opts.sort] ?? 'created_at';
  const orderSql = opts.order === 'asc' ? 'ASC' : 'DESC';

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM kb_documents ${whereSql}`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(`SELECT * FROM kb_documents ${whereSql} ORDER BY ${sortCol} ${orderSql} LIMIT ? OFFSET ?`)
    .all(...params, opts.pageSize, opts.offset) as any[];

  return { rows: rows.map(mapKbDocument), total };
}

export interface UpdateDocumentInput {
  title?: string;
  description?: string | null;
  language?: string;
  course?: string | null;
  capYear?: number | null;
  topic?: string | null;
  sourceUrl?: string | null;
}

const UPDATE_COLUMNS: Record<keyof UpdateDocumentInput, string> = {
  title: 'title',
  description: 'description',
  language: 'language',
  course: 'course',
  capYear: 'cap_year',
  topic: 'topic',
  sourceUrl: 'source_url',
};

export function updateDocument(id: string, input: UpdateDocumentInput): KbDocumentDTO {
  getDocumentOrThrow(id); // 404 if missing
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(UPDATE_COLUMNS)) {
    const k = key as keyof UpdateDocumentInput;
    if (input[k] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(input[k]);
    }
  }
  if (sets.length) {
    sets.push('updated_at = ?');
    params.push(now(), id);
    db.prepare(`UPDATE kb_documents SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }
  return getDocumentOrThrow(id);
}

/** Replace the underlying file; marks the doc pending so it gets re-indexed. */
export function replaceFile(
  id: string,
  file: { path: string; mimetype: string; size: number },
): KbDocumentDTO {
  getDocumentOrThrow(id);
  const hash = fileHash(file.path);
  db.prepare(
    `UPDATE kb_documents SET file_path=?, file_mime=?, file_size_bytes=?, file_hash=?,
       index_status='pending', index_error=NULL, updated_at=? WHERE id=?`,
  ).run(file.path, file.mimetype, file.size, hash, now(), id);
  return getDocumentOrThrow(id);
}

export function setActive(id: string, isActive: boolean): KbDocumentDTO {
  getDocumentOrThrow(id);
  const row = getDocumentRow(id);
  db.prepare('UPDATE kb_documents SET is_active=?, updated_at=? WHERE id=?').run(isActive ? 1 : 0, now(), id);
  // Keep chunk activity in sync so the vector cache reflects the toggle.
  db.prepare('UPDATE kb_chunks SET is_active=? WHERE document_id=?').run(isActive ? 1 : 0, id);
  // Mirror the toggle in the OpenAI vector store (best-effort, async).
  syncVectorStoreMembership(row?.openai_file_id, isActive);
  return getDocumentOrThrow(id);
}

/** Soft-delete: flag deleted, deactivate, remove chunks, and purge the OpenAI file. */
export function softDelete(id: string): void {
  getDocumentOrThrow(id);
  const row = getDocumentRow(id);
  const fileId = row?.openai_file_id as string | null | undefined;
  const ts = now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE kb_documents SET deleted_at=?, is_active=0, openai_file_id=NULL, openai_file_status=NULL, updated_at=? WHERE id=?').run(ts, ts, id);
    db.prepare('DELETE FROM kb_chunks WHERE document_id = ?').run(id);
    deleteStructuredData(id);
  });
  tx();
  purgeOpenAIFile(fileId);
}

export interface JobRowDTO {
  id: string;
  jobType: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  runAfter: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * IDs of every non-deleted KB document, oldest first — used to re-index the whole
 * corpus (e.g. after an embedding-format change or a new CAP cycle). Returns the
 * list so the caller can enqueue one re-index job per document.
 */
export function listAllDocumentIds(): string[] {
  const rows = db
    .prepare('SELECT id FROM kb_documents WHERE deleted_at IS NULL ORDER BY created_at ASC')
    .all() as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

export function listKbJobs(limit = 50): JobRowDTO[] {
  const rows = db
    .prepare(
      `SELECT id, job_type, status, attempts, max_attempts, run_after, last_error, created_at, updated_at
         FROM job_queue WHERE job_type IN ('kb_index','kb_reindex','embed_chunks')
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    jobType: r.job_type,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    runAfter: r.run_after,
    lastError: r.last_error ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
