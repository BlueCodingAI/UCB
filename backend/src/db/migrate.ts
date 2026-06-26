import fs from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from './connection';
import { logger } from '../lib/logger';

/** Apply schema.sql (idempotent — uses CREATE TABLE IF NOT EXISTS). */
export function migrate(): void {
  const db = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
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
