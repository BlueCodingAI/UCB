import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { migrate } from './db/migrate';
import { closeDb } from './db/connection';
import { rebuildVectorCache } from './services/vectorStore';
import { reconcileRagDefaults } from './services/settings';
import { startWorker, stopWorker } from './services/jobs';

function main(): void {
  // Ensure schema exists (idempotent) so first boot works without a separate step.
  migrate();
  // Apply improved RAG tuning defaults to existing databases (idempotent, once).
  reconcileRagDefaults();
  // Warm the RAG vector cache from any seeded/indexed chunks.
  rebuildVectorCache();
  // Start the background job worker (KB indexing, broadcasts, reminders).
  startWorker();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`Disha backend listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  function shutdown(signal: string): void {
    logger.info(`${signal} received, shutting down...`);
    stopWorker();
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
