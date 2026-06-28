import fs from 'node:fs';
import { db } from '../../db/connection';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { logger } from '../../lib/logger';
import { env, integrations } from '../../config/env';
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
} from '../../services/kbExtract';
import { registerJobHandler } from '../../services/jobs';

const insertChunkStmt = db.prepare(
  `INSERT INTO kb_chunks
     (id, document_id, chunk_index, content, token_count, language, course, cap_year, topic,
      is_active, embedding, embedding_dim, embedding_model, source_locator, metadata_json, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, '{}', ?)`,
);

function safeFileStem(title: string): string {
  const s = title.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return (s || 'document').slice(0, 80);
}

async function syncDocToOpenAI(
  doc: KbDocMeta,
  rawText: string,
  prepared?: Array<{ body: string }>,
): Promise<void> {
  if (!integrations.openaiDocsEnabled) return;
  try {
    if (doc.openai_file_id) {
      const vsId = getVectorStoreId();
      if (vsId) await removeFileFromVectorStore(vsId, doc.openai_file_id);
      await deleteOpenAIFile(doc.openai_file_id);
    }

    const stem = safeFileStem(doc.title);
    const isPdf = doc.source_type === 'pdf' && !!doc.file_path && fs.existsSync(doc.file_path);
    const capStructured =
      prepared?.length && prepared[0]?.body.startsWith('CAP Seat Matrix Record')
        ? prepared.map((p) => p.body).join('\n\n---\n\n')
        : null;

    if (!isPdf && !rawText.trim() && !capStructured) {
      db.prepare(`UPDATE kb_documents SET openai_file_id=NULL, openai_file_status=NULL WHERE id=?`).run(doc.id);
      return;
    }

    const fileId = capStructured
      ? await uploadOpenAIFile(
          { buffer: Buffer.from(capStructured, 'utf8') },
          `${stem}_cap_matrix.txt`,
        )
      : isPdf
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
  } catch (err) {
    db.prepare(`UPDATE kb_documents SET openai_file_status='failed', updated_at=? WHERE id=?`).run(
      now(),
      doc.id,
    );
    logger.error({ err, documentId: doc.id }, 'kb index: OpenAI doc engine upload failed');
  }
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
    const raw = await extractDocumentText(doc);
    const prepared = prepareIndexChunks(raw, doc);

    if (!prepared.length) {
      db.prepare('DELETE FROM kb_chunks WHERE document_id = ?').run(documentId);
      db.prepare(
        `UPDATE kb_documents SET chunk_count=0, index_status='indexed', index_error=NULL,
           indexed_at=?, embedding_model=?, updated_at=? WHERE id=?`,
      ).run(now(), currentEmbeddingModel(), now(), documentId);
      rebuildVectorCache();
      await syncDocToOpenAI(doc, raw, prepared);
      logger.info({ documentId }, 'kb index: no extractable text; indexed empty');
      return;
    }

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
    await syncDocToOpenAI(doc, raw, prepared);
    logger.info({ documentId, chunks: prepared.length, chars: raw.length }, 'kb index: indexed');
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
