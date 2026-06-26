import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ok, created, noContent } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { parseOffset, offsetMeta } from '../../lib/paginate';
import { writeAudit } from '../../middleware/audit';
import { enqueue } from '../../services/jobs';
import { embed } from '../../services/openai';
import { retrieve, rebuildVectorCache } from '../../services/vectorStore';
import { getRagTopK, getRagMinScore } from '../../services/settings';
import type { Locale } from '../../types';
import {
  createDocument,
  getDocumentOrThrow,
  getChunkPreview,
  listDocuments,
  updateDocument,
  replaceFile,
  setActive,
  softDelete,
  listKbJobs,
} from './adminKb.service';

/** Wrap an async controller so thrown errors reach the central error handler. */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

function adminId(req: Request): string | null {
  return req.auth?.sub ?? null;
}

/** POST /documents — create a KB document (multipart or json) and enqueue indexing. */
export const createDoc = asyncHandler(async (req, res) => {
  const body = req.body as {
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
  };

  const file = req.file
    ? { path: req.file.path, mimetype: req.file.mimetype, size: req.file.size }
    : null;

  const doc = createDocument({
    title: body.title,
    description: body.description,
    sourceType: body.sourceType,
    language: body.language,
    course: body.course,
    capYear: body.capYear,
    topic: body.topic,
    sourceUrl: body.sourceUrl,
    content: body.content,
    isActive: body.isActive,
    uploadedBy: adminId(req),
    file,
  });

  const jobId = enqueue('kb_index', { documentId: doc.id });

  writeAudit({
    actorType: 'admin',
    actorId: adminId(req),
    action: 'kb.document.create',
    entityType: 'kb_document',
    entityId: doc.id,
    after: { title: doc.title, sourceType: doc.sourceType, jobId },
    req,
  });

  // 202-style: accepted; indexing runs asynchronously via the job worker.
  return created(res, { document: doc, jobId, indexing: 'queued' });
});

/** GET /documents — offset-paginated list with filters. */
export const listDocs: RequestHandler = (req, res) => {
  const p = parseOffset(req, { sort: 'createdAt', pageSize: 25 });
  const { rows, total } = listDocuments(
    {
      q: p.q || undefined,
      language: p.filters.language,
      sourceType: p.filters.sourceType,
      isActive: p.filters.isActive,
      indexStatus: p.filters.indexStatus,
    },
    { offset: p.offset, pageSize: p.pageSize, sort: p.sort, order: p.order },
  );
  ok(res, rows, { pagination: offsetMeta(p.page, p.pageSize, total) });
};

/** GET /documents/:id — document detail (flat) + chunk preview. */
export const getDoc: RequestHandler = (req, res) => {
  const doc = getDocumentOrThrow(req.params.id);
  // Frontend KbDocumentDetail = flat KbDocument fields + chunks[{id,ordinal,text,...}].
  const chunks = getChunkPreview(doc.id, 20).map((c) => ({
    id: c.id,
    ordinal: c.chunkIndex,
    text: c.content,
    tokenCount: c.tokenCount,
    sourceLocator: c.sourceLocator,
  }));
  ok(res, { ...doc, chunks });
};

/** PUT /documents/:id — update metadata/tags. */
export const updateDoc: RequestHandler = (req, res) => {
  const before = getDocumentOrThrow(req.params.id);
  const doc = updateDocument(req.params.id, req.body);
  writeAudit({
    actorType: 'admin',
    actorId: adminId(req),
    action: 'kb.document.update',
    entityType: 'kb_document',
    entityId: doc.id,
    before,
    after: doc,
    req,
  });
  ok(res, doc);
};

/** PUT /documents/:id/file — replace the file and re-enqueue indexing. */
export const replaceDocFile: RequestHandler = (req, res, next) => {
  if (!req.file) return next(Errors.validation('A file is required'));
  const doc = replaceFile(req.params.id, {
    path: req.file.path,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
  const jobId = enqueue('kb_reindex', { documentId: doc.id });
  writeAudit({
    actorType: 'admin',
    actorId: adminId(req),
    action: 'kb.document.replace_file',
    entityType: 'kb_document',
    entityId: doc.id,
    after: { jobId, fileMime: doc.fileMime },
    req,
  });
  ok(res, { document: doc, jobId, indexing: 'queued' });
};

/** PATCH /documents/:id/active — toggle is_active and rebuild the vector cache. */
export const toggleActive: RequestHandler = (req, res) => {
  const doc = setActive(req.params.id, req.body.isActive);
  rebuildVectorCache();
  writeAudit({
    actorType: 'admin',
    actorId: adminId(req),
    action: 'kb.document.toggle_active',
    entityType: 'kb_document',
    entityId: doc.id,
    after: { isActive: doc.isActive },
    req,
  });
  ok(res, doc);
};

/** POST /documents/:id/reindex — enqueue a re-index job. */
export const reindexDoc: RequestHandler = (req, res) => {
  const doc = getDocumentOrThrow(req.params.id);
  const jobId = enqueue('kb_reindex', { documentId: doc.id });
  writeAudit({
    actorType: 'admin',
    actorId: adminId(req),
    action: 'kb.document.reindex',
    entityType: 'kb_document',
    entityId: doc.id,
    after: { jobId },
    req,
  });
  ok(res, { document: doc, jobId, indexing: 'queued' });
};

/** DELETE /documents/:id — soft delete, drop chunks, rebuild cache. */
export const deleteDoc: RequestHandler = (req, res) => {
  const before = getDocumentOrThrow(req.params.id);
  softDelete(req.params.id);
  rebuildVectorCache();
  writeAudit({
    actorType: 'admin',
    actorId: adminId(req),
    action: 'kb.document.delete',
    entityType: 'kb_document',
    entityId: before.id,
    before,
    req,
  });
  noContent(res);
};

/** POST /search-test — run retrieval and return chunks + scores (coverage check). */
export const searchTest = asyncHandler(async (req, res) => {
  const { query, language } = req.body as { query: string; language: Locale };
  const queryVec = await embed(query);
  const chunks = retrieve(queryVec, query, {
    language,
    topK: getRagTopK(),
    minScore: getRagMinScore(),
  });
  ok(res, {
    query,
    language,
    topK: getRagTopK(),
    minScore: getRagMinScore(),
    hits: chunks.length,
    wouldFallback: chunks.length === 0,
    chunks,
  });
});

/** GET /jobs — recent kb_* job rows. */
export const listJobs: RequestHandler = (_req, res) => {
  ok(res, listKbJobs(50));
};
