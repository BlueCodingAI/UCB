import fs from 'node:fs';
import { db } from '../../db/connection';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { logger } from '../../lib/logger';
import { integrations } from '../../config/env';
import { indexFileToLlamaCloud, parsePdfWithLlamaParse } from '../../services/llamaCloud.service';
import {
  embedBatch,
  currentEmbeddingModel,
  uploadOpenAIFile,
  ensureVectorStore,
  getVectorStoreId,
  addFileToVectorStore,
  removeFileFromVectorStore,
  deleteOpenAIFile,
} from '../../services/openai';
import { encodeEmbedding, rebuildVectorCache } from '../../services/vectorStore';
import {
  extractDocumentText,
  prepareIndexChunks,
  type KbDocMeta,
  type PreparedChunk,
} from '../../services/kbExtract';
import { persistStructuredExtract } from '../../services/kbStructuredExtract';
import { registerJobHandler } from '../../services/jobs';

const insertChunkStmt = db.prepare(
  `INSERT INTO kb_chunks
     (id, document_id, chunk_index, content, token_count, language, course, cap_year, topic,
      is_active, embedding, embedding_dim, embedding_model, source_locator, metadata_json, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
);

function safeFileStem(title: string): string {
  const s = title.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return (s || 'document').slice(0, 80);
}

function assertFileExists(doc: KbDocMeta): void {
  if (!doc.file_path) {
    throw new Error('Document has no file on disk. Re-upload the PDF from Admin → KB.');
  }
  if (!fs.existsSync(doc.file_path)) {
    throw new Error(
      `File missing on server (${doc.file_path}). Re-upload the document — storage may have been cleared after deploy.`,
    );
  }
}

/** Upload KB file to OpenAI Files + Vector Store. Returns false when upload fails. */
async function syncDocToOpenAI(doc: KbDocMeta, rawText: string): Promise<boolean> {
  if (!integrations.openaiDocsEnabled) return false;
  try {
    if (!integrations.openaiEnabled) {
      throw new Error('OPENAI_API_KEY is not set. Add it to backend/.env and restart the server.');
    }

    if (doc.openai_file_id) {
      const vsId = getVectorStoreId();
      if (vsId) await removeFileFromVectorStore(vsId, doc.openai_file_id);
      await deleteOpenAIFile(doc.openai_file_id);
    }

    const stem = safeFileStem(doc.title);
    const isPdf = doc.source_type === 'pdf';

    if (isPdf) {
      assertFileExists(doc);
    } else if (!rawText.trim()) {
      db.prepare(`UPDATE kb_documents SET openai_file_id=NULL, openai_file_status=NULL WHERE id=?`).run(doc.id);
      return false;
    }

    const fileId = isPdf
      ? await uploadOpenAIFile({ path: doc.file_path as string }, `${stem}.pdf`)
      : await uploadOpenAIFile(
          { buffer: Buffer.from(rawText, 'utf8') },
          `${stem}.txt`,
        );

    const vsId = await ensureVectorStore();
    await addFileToVectorStore(vsId, fileId);

    db.prepare(
      `UPDATE kb_documents SET openai_file_id=?, openai_file_status='uploaded', updated_at=? WHERE id=?`,
    ).run(fileId, now(), doc.id);
    logger.info({ documentId: doc.id, fileId }, 'kb index: uploaded to OpenAI doc engine');
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE kb_documents SET openai_file_status='failed', index_error=?, updated_at=? WHERE id=?`,
    ).run(message.slice(0, 2000), now(), doc.id);
    logger.error({ err, documentId: doc.id }, 'kb index: OpenAI doc engine upload failed');
    return false;
  }
}

async function writeIndexedChunks(
  documentId: string,
  doc: KbDocMeta,
  prepared: PreparedChunk[],
): Promise<void> {
  const vectors = await embedBatch(prepared.map((p) => p.embedText));
  const ts = now();

  const writeAll = db.transaction(() => {
    db.prepare('DELETE FROM kb_chunks WHERE document_id = ?').run(documentId);
    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i];
      const vec = vectors[i];
      insertChunkStmt.run(
        newId(),
        documentId,
        i,
        p.body,
        p.tokenCount,
        doc.language,
        doc.course,
        doc.cap_year,
        doc.topic,
        encodeEmbedding(vec),
        vec.length,
        currentEmbeddingModel(),
        p.sourceLocator,
        JSON.stringify(p.metadata),
        ts,
      );
    }
    db.prepare(
      `UPDATE kb_documents SET chunk_count=?, index_status='indexed', index_error=NULL,
         indexed_at=?, embedding_model=?, updated_at=? WHERE id=?`,
    ).run(prepared.length, ts, currentEmbeddingModel(), ts, documentId);
  });
  writeAll();
  rebuildVectorCache();
}

/**
 * Core index path: extract text → save structured rows → chunk + embed for search fallback.
 */
async function indexDocumentWithExtract(documentId: string, doc: KbDocMeta, raw: string): Promise<void> {
  const persisted = persistStructuredExtract(documentId, doc, raw);
  const prepared = prepareIndexChunks(raw, doc, persisted.recordIdByKey);

  if (!prepared.length) {
    db.prepare('DELETE FROM kb_chunks WHERE document_id = ?').run(documentId);
    db.prepare(
      `UPDATE kb_documents SET chunk_count=0, index_status='indexed', index_error=NULL,
         indexed_at=?, embedding_model=?, updated_at=? WHERE id=?`,
    ).run(now(), currentEmbeddingModel(), now(), documentId);
    rebuildVectorCache();
    await syncDocToOpenAI(doc, raw);
    logger.info({ documentId, extractType: persisted.extractType }, 'kb index: no chunks; extract saved');
    return;
  }

  await writeIndexedChunks(documentId, doc, prepared);
  await syncDocToOpenAI(doc, raw);
  logger.info(
    {
      documentId,
      chunks: prepared.length,
      structuredRecords: persisted.recordCount,
      extractType: persisted.extractType,
      chars: raw.length,
    },
    'kb index: extracted, saved, and indexed',
  );
}

/** Best-effort local chunk + embed (never throws — used as optional supplement in PDF-only mode). */
async function tryLocalIndex(documentId: string, doc: KbDocMeta): Promise<number> {
  try {
    const raw = await extractDocumentText(doc);
    const persisted = persistStructuredExtract(documentId, doc, raw);
    const prepared = prepareIndexChunks(raw, doc, persisted.recordIdByKey);
    if (!prepared.length) return 0;

    await writeIndexedChunks(documentId, doc, prepared);
    return prepared.length;
  } catch (err) {
    logger.warn({ err, documentId }, 'kb index: local chunking skipped');
    return 0;
  }
}

/** PDF-only indexing: OpenAI upload is required; local parsing is optional. */
async function indexDocumentPdfOnly(documentId: string, doc: KbDocMeta): Promise<void> {
  if (doc.source_type === 'pdf') assertFileExists(doc);

  let raw = '';
  try {
    raw = await extractDocumentText(doc);
  } catch (err) {
    logger.warn({ err, documentId }, 'kb index: PDF text extract skipped (OpenAI will parse PDF)');
  }

  const uploaded = await syncDocToOpenAI(doc, raw);
  if (!uploaded) {
    const row = db
      .prepare('SELECT index_error FROM kb_documents WHERE id = ?')
      .get(documentId) as { index_error: string | null } | undefined;
    throw new Error(
      row?.index_error ??
        'OpenAI PDF upload failed. Check OPENAI_API_KEY, OPENAI_FILE_SEARCH=true, and pm2 logs.',
    );
  }

  const chunkCount = await tryLocalIndex(documentId, doc);
  logger.info({ documentId, chunkCount, openai: true }, 'kb index: PDF-only indexed');
}

/** LlamaParse only — agentic PDF → markdown → embed in SQLite (no pipeline id). */
async function indexDocumentLlamaParse(documentId: string, doc: KbDocMeta): Promise<void> {
  if (doc.source_type !== 'pdf') {
    throw new Error('LlamaParse mode supports PDF uploads. Use PDF or disable LLAMA_CLOUD_ENABLED.');
  }
  assertFileExists(doc);

  const markdown = await parsePdfWithLlamaParse(doc.file_path as string);
  await indexDocumentWithExtract(documentId, doc, markdown);
}

/** LlamaCloud managed Index — optional; needs pipeline id. */
async function indexDocumentLlamaCloudIndex(documentId: string, doc: KbDocMeta): Promise<void> {
  if (doc.source_type !== 'pdf') {
    throw new Error('LlamaCloud mode currently supports PDF uploads. Convert other types to PDF or disable LLAMA_CLOUD_ENABLED.');
  }
  assertFileExists(doc);

  const fileId = await indexFileToLlamaCloud(doc.file_path as string, {
    documentId: doc.id,
    title: doc.title,
  });

  let raw = '';
  try {
    raw = await extractDocumentText(doc);
    persistStructuredExtract(documentId, doc, raw);
  } catch (err) {
    logger.warn({ err, documentId }, 'kb index: structured extract skipped for LlamaCloud Index doc');
  }

  const ts = now();
  db.prepare(
    `UPDATE kb_documents SET llama_cloud_file_id=?, chunk_count=0, index_status='indexed', index_error=NULL,
       indexed_at=?, embedding_model='llama-cloud', updated_at=? WHERE id=?`,
  ).run(fileId, ts, ts, documentId);
  logger.info({ documentId, fileId }, 'kb index: LlamaCloud indexed');
}

export async function indexDocument(documentId: string): Promise<void> {
  const doc = db
    .prepare(
      `SELECT id, title, description, source_type, file_path, file_mime, source_url,
              course, cap_year, language, topic, openai_file_id
         FROM kb_documents WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(documentId) as KbDocMeta | undefined;

  if (!doc) {
    logger.warn({ documentId }, 'kb index: document not found or deleted');
    return;
  }

  db.prepare(`UPDATE kb_documents SET index_status='processing', index_error=NULL, updated_at=? WHERE id=?`).run(
    now(),
    documentId,
  );

  try {
    if (integrations.llamaCloudIndexEnabled) {
      await indexDocumentLlamaCloudIndex(documentId, doc);
      return;
    }

    if (integrations.llamaCloudEnabled) {
      await indexDocumentLlamaParse(documentId, doc);
      return;
    }

    if (integrations.openaiPdfOnly && integrations.openaiDocsEnabled) {
      await indexDocumentPdfOnly(documentId, doc);
      return;
    }

    if (doc.source_type === 'pdf') assertFileExists(doc);

    const raw = await extractDocumentText(doc);
    await indexDocumentWithExtract(documentId, doc, raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE kb_documents SET index_status='failed', index_error=?, updated_at=? WHERE id=?`,
    ).run(message.slice(0, 2000), now(), documentId);
    logger.error({ err, documentId }, 'kb index: failed');
    throw err;
  }
}

registerJobHandler('kb_index', (p) => indexDocument(String(p.documentId)));
registerJobHandler('kb_reindex', (p) => indexDocument(String(p.documentId)));
registerJobHandler('embed_chunks', (p) => indexDocument(String(p.documentId)));
