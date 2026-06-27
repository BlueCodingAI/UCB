import fs from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from './connection';
import { logger } from '../lib/logger';

/** Add a column to an existing table if it is not already present (idempotent). */
function addColumnIfMissing(table: string, column: string, ddl: string): void {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  logger.info({ table, column }, 'schema: added missing column');
}

/**
 * Additive migrations for already-existing databases. CREATE TABLE IF NOT EXISTS
 * never alters an existing table, so new columns must be added explicitly here.
 */
function applyAdditiveMigrations(): void {
  addColumnIfMissing('kb_documents', 'openai_file_id', 'openai_file_id TEXT');
  addColumnIfMissing('kb_documents', 'openai_file_status', 'openai_file_status TEXT');
}

/** Apply schema.sql (idempotent — uses CREATE TABLE IF NOT EXISTS) + additive migrations. */
export function migrate(): void {
  const db = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
  applyAdditiveMigrations();
  logger.info('database schema applied');
}

if (require.main === module) {
  try {
    migrate();
    closeDb();
    // eslint-disable-next-line no-console
    console.log('✓ Migration complete.');
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('✗ Migration failed:', err);
    process.exit(1);
  }
}
