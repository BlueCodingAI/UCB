import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env';
import { logger } from '../lib/logger';

let _db: Database.Database | null = null;

/** Lazily-opened better-sqlite3 singleton with WAL + tuning pragmas. */
export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(env.databasePath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(env.databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -64000'); // ~64MB
  db.pragma('temp_store = MEMORY');

  _db = db;
  logger.debug({ path: env.databasePath }, 'sqlite connection opened');
  return db;
}

/** Shared instance for convenient imports. */
export const db = getDb();

/** Checkpoint WAL and close (called on graceful shutdown). */
export function closeDb(): void {
  if (_db) {
    try {
      _db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      /* ignore */
    }
    _db.close();
    _db = null;
  }
}
