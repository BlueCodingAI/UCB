import { Router } from 'express';
import { kbUpload } from '../../middleware/upload';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createDocumentSchema,
  updateDocumentSchema,
  toggleActiveSchema,
  searchTestSchema,
  idParamSchema,
} from './adminKb.schema';
import {
  createDoc,
  listDocs,
  getDoc,
  updateDoc,
  replaceDocFile,
  toggleActive,
  reindexDoc,
  reindexAll,
  deleteDoc,
  searchTest,
  listJobs,
} from './adminKb.controller';
// Importing the index service registers its kb_index/kb_reindex/embed_chunks job handlers.
import './kbIndex.service';

const router = Router();

// Defense in depth: integrator already mounts under requireRole at /admin, but
// guard here too so only admins / KB managers reach these routes.
router.use(requireRole('admin', 'kb_manager'));

router.post('/documents', kbUpload.single('file'), validate({ body: createDocumentSchema }), createDoc);
// Bulk re-index — must precede the ':id' routes so it isn't captured as an id.
router.post('/documents/reindex-all', reindexAll);
router.get('/documents', listDocs);
router.get('/documents/:id', validate({ params: idParamSchema }), getDoc);
router.put('/documents/:id', validate({ params: idParamSchema, body: updateDocumentSchema }), updateDoc);
router.put('/documents/:id/file', validate({ params: idParamSchema }), kbUpload.single('file'), replaceDocFile);
router.patch(
  '/documents/:id/active',
  validate({ params: idParamSchema, body: toggleActiveSchema }),
  toggleActive,
);
router.post('/documents/:id/reindex', validate({ params: idParamSchema }), reindexDoc);
router.delete('/documents/:id', validate({ params: idParamSchema }), deleteDoc);

router.post('/search-test', validate({ body: searchTestSchema }), searchTest);
router.get('/jobs', listJobs);

export default router;
