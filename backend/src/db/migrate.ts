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
  addColumnIfMissing('kb_documents', 'llama_cloud_file_id', 'llama_cloud_file_id TEXT');
  addColumnIfMissing('kb_documents', 'extract_type', 'extract_type TEXT');
  addColumnIfMissing(
    'kb_documents',
    'structured_record_count',
    'structured_record_count INTEGER NOT NULL DEFAULT 0',
  );

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_document_extracts (
      document_id     TEXT PRIMARY KEY REFERENCES kb_documents(id) ON DELETE CASCADE,
      extract_type    TEXT NOT NULL CHECK (extract_type IN ('cap_matrix','prose','empty')),
      raw_text        TEXT,
      parser_version  TEXT NOT NULL DEFAULT '1',
      record_count    INTEGER NOT NULL DEFAULT 0,
      char_count      INTEGER NOT NULL DEFAULT 0,
      extracted_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb_cap_matrix_records (
      id              TEXT PRIMARY KEY,
      document_id     TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
      institute_code  TEXT NOT NULL,
      institute_name  TEXT NOT NULL,
      institute_status TEXT,
      choice_code     TEXT,
      course_name     TEXT,
      si              INTEGER,
      ms_seats        INTEGER,
      minority_seats  INTEGER,
      all_india_seats INTEGER,
      institute_seats INTEGER,
      orphan_seats    INTEGER,
      ews_seats       INTEGER,
      cap_seats       INTEGER,
      tfws_detail     TEXT,
      source_page     INTEGER,
      source_locator  TEXT,
      created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_cap_institute   ON kb_cap_matrix_records(institute_code);
    CREATE INDEX IF NOT EXISTS ix_cap_doc_inst    ON kb_cap_matrix_records(document_id, institute_code);
    CREATE INDEX IF NOT EXISTS ix_cap_choice      ON kb_cap_matrix_records(choice_code);
    CREATE TABLE IF NOT EXISTS kb_cap_category_seats (
      id          TEXT PRIMARY KEY,
      record_id   TEXT NOT NULL REFERENCES kb_cap_matrix_records(id) ON DELETE CASCADE,
      category    TEXT NOT NULL,
      subcategory TEXT,
      seats       INTEGER,
      raw_line    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_cap_cat_record ON kb_cap_category_seats(record_id);
  `);
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
