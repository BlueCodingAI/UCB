import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env';
import { Errors } from '../lib/errors';

const uploadsDir = path.join(env.storageDir, 'uploads');
const audioDir = path.join(env.storageDir, 'audio');
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(audioDir, { recursive: true });

export const STORAGE_DIRS = { uploadsDir, audioDir };

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12) || '';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`);
  },
});

const KB_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
]);
const IMG_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

/** KB document upload: PDFs/sheets/csv/text on disk, max 25MB. */
export const kbUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (KB_MIMES.has(file.mimetype)) cb(null, true);
    else cb(Errors.unsupportedMedia(`Unsupported file type: ${file.mimetype}`));
  },
});

/** Banner / image upload: in memory (small), max 3MB. */
export const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 8) || '.img';
      cb(null, `banner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMG_MIMES.has(file.mimetype)) cb(null, true);
    else cb(Errors.unsupportedMedia(`Unsupported image type: ${file.mimetype}`));
  },
});

/** Audio upload for STT: in memory, max 10MB. */
export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
