import fs from 'node:fs';
import LlamaCloud from '@llamaindex/llama-cloud';
import { env, integrations } from '../config/env';
import { getSetting } from './settings';
import { logger } from '../lib/logger';
import { getPdfPageCount } from './pdfExtract';
import type { RetrievedChunk } from './openai';

/** Agentic tier rejects jobs above 1000 pages — stay under with a margin. */
const LLAMA_PARSE_MAX_PAGES_PER_JOB = 900;

let _client: LlamaCloud | null = null;

function client(): LlamaCloud {
  if (!_client) {
    _client = new LlamaCloud({
      apiKey: env.llamaCloudApiKey,
      timeout: 10 * 60 * 1000,
    });
  }
  return _client;
}

export function llamaCloudPipelineId(): string {
  return getSetting<string>('llama_cloud_pipeline_id', env.llamaCloudPipelineId);
}

function buildPageRangeBatches(totalPages: number, batchSize: number): string[] {
  const ranges: string[] = [];
  for (let start = 1; start <= totalPages; start += batchSize) {
    const end = Math.min(start + batchSize - 1, totalPages);
    ranges.push(`${start}-${end}`);
  }
  return ranges;
}

function extractParsedText(result: unknown): string {
  const markdown = String((result as { markdown?: string }).markdown ?? '').trim();
  const text = String((result as { text?: string }).text ?? '').trim();
  return markdown || text;
}

async function parsePdfBatch(
  filePath: string,
  opts: { fileId?: string; targetPages?: string },
): Promise<string> {
  const timeoutMs = 30 * 60 * 1000;
  const result = await client().parsing.parse(
    {
      tier: 'agentic',
      version: 'latest',
      ...(opts.fileId
        ? { file_id: opts.fileId }
        : { upload_file: fs.createReadStream(filePath) }),
      expand: ['markdown', 'text'],
      ...(opts.targetPages ? { page_ranges: { target_pages: opts.targetPages } } : {}),
      processing_control: {
        timeouts: {
          base_in_seconds: 7200,
          extra_time_per_page_in_seconds: 30,
        },
      },
    },
    { timeout: timeoutMs, verbose: false },
  );

  const out = extractParsedText(result);
  if (!out) {
    throw new Error(
      opts.targetPages
        ? `LlamaParse returned empty content for pages ${opts.targetPages}.`
        : 'LlamaParse returned empty content for this PDF.',
    );
  }
  return out;
}

/**
 * Parse a PDF with LlamaParse (agentic tier) → clean markdown.
 * Only needs LLAMA_CLOUD_API_KEY — no pipeline id.
 * Large PDFs (>900 pages) are split into page-range batches automatically.
 */
export async function parsePdfWithLlamaParse(filePath: string): Promise<string> {
  if (!integrations.llamaCloudEnabled) {
    throw new Error('LLAMA_CLOUD_API_KEY is not set.');
  }

  const pageCount = await getPdfPageCount(filePath);
  logger.info({ filePath, pageCount }, 'llama parse: starting agentic parse');

  if (pageCount <= LLAMA_PARSE_MAX_PAGES_PER_JOB) {
    const out = await parsePdfBatch(filePath, {});
    logger.info({ filePath, pageCount, chars: out.length }, 'llama parse: completed');
    return out;
  }

  const batches = buildPageRangeBatches(pageCount, LLAMA_PARSE_MAX_PAGES_PER_JOB);
  logger.info(
    { filePath, pageCount, batches: batches.length, batchSize: LLAMA_PARSE_MAX_PAGES_PER_JOB },
    'llama parse: document exceeds single-job page limit; batching',
  );

  const uploaded = await client().files.create({
    file: fs.createReadStream(filePath),
    purpose: 'parse',
  });
  const fileId = uploaded.id;
  if (!fileId) throw new Error('LlamaCloud file upload returned no file id');

  const parts: string[] = [];
  try {
    for (let i = 0; i < batches.length; i++) {
      const targetPages = batches[i];
      logger.info(
        { filePath, batch: i + 1, totalBatches: batches.length, targetPages },
        'llama parse: batch started',
      );
      const part = await parsePdfBatch(filePath, { fileId, targetPages });
      parts.push(part);
      logger.info(
        { filePath, batch: i + 1, targetPages, chars: part.length },
        'llama parse: batch completed',
      );
    }
  } finally {
    client()
      .files.delete(fileId)
      .catch((err) => logger.warn({ err, fileId }, 'llama parse: failed to delete temp file'));
  }

  const out = parts.join('\n\n---\n\n').trim();
  if (!out) {
    throw new Error(`LlamaParse returned empty content after ${batches.length} batches.`);
  }

  logger.info(
    { filePath, pageCount, batches: batches.length, chars: out.length },
    'llama parse: completed (batched)',
  );
  return out;
}

/** Upload a PDF to LlamaCloud Index pipeline (optional — needs pipeline id). */
export async function indexFileToLlamaCloud(
  filePath: string,
  meta: { documentId: string; title: string },
): Promise<string> {
  if (!integrations.llamaCloudIndexEnabled) {
    throw new Error('LLAMA_CLOUD_PIPELINE_ID is required for managed Index mode.');
  }

  const pipelineId = llamaCloudPipelineId();
  const uploaded = await client().files.create({
    file: fs.createReadStream(filePath),
    purpose: 'user_data',
  });

  const fileId = uploaded.id;
  if (!fileId) throw new Error('LlamaCloud file upload returned no file id');

  await client().pipelines.files.create(pipelineId, {
    body: [
      {
        file_id: fileId,
        custom_metadata: {
          documentId: meta.documentId,
          title: meta.title,
        },
      },
    ],
  });

  await waitForPipelineFile(pipelineId, fileId);
  logger.info({ documentId: meta.documentId, fileId, pipelineId }, 'llama cloud index: file indexed');
  return fileId;
}

async function waitForPipelineFile(
  pipelineId: string,
  fileId: string,
  maxWaitMs = 10 * 60 * 1000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = await client().pipelines.files.getStatus(fileId, { pipeline_id: pipelineId });
    const s = String((status as { status?: string }).status ?? '').toUpperCase();
    if (['SUCCESS', 'COMPLETED', 'INDEXED', 'READY'].includes(s)) return;
    if (['FAILED', 'ERROR', 'CANCELLED'].includes(s)) {
      throw new Error(`LlamaCloud pipeline rejected file ${fileId} (status: ${s})`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('LlamaCloud indexing timed out after 10 minutes');
}

/** Hybrid retrieval from LlamaCloud managed index (pipeline id required). */
export async function retrieveFromLlamaCloud(query: string, topK = 25): Promise<RetrievedChunk[]> {
  if (!integrations.llamaCloudIndexEnabled) return [];

  const pipelineId = llamaCloudPipelineId();
  const res = await client().pipelines.retrieve(pipelineId, {
    query,
    dense_similarity_top_k: topK,
    sparse_similarity_top_k: topK,
    alpha: 0.5,
    enable_reranking: true,
    rerank_top_n: Math.min(topK, 12),
  });

  const nodes =
    (res as { retrieval_nodes?: Array<{ score?: number; node?: { text?: string; metadata?: Record<string, unknown> } }> })
      .retrieval_nodes ?? [];

  return nodes
    .map((n, i) => {
      const meta = n.node?.metadata ?? {};
      return {
        documentId: String(meta.documentId ?? meta.document_id ?? 'llama-cloud'),
        chunkId: `llama-${i}`,
        title: String(meta.title ?? meta.file_name ?? 'Knowledge Base'),
        content: (n.node?.text ?? '').trim(),
        sourceLocator: meta.page != null ? `Page ${meta.page}` : null,
        score: typeof n.score === 'number' ? n.score : 0.8,
      };
    })
    .filter((c) => c.content.length > 0);
}
