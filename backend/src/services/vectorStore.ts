import { db } from '../db/connection';
import { logger } from '../lib/logger';
import { fetchInstituteChunksFromDb } from './capMatrixLookup';
import type { Locale } from '../types';
import type { RetrievedChunk } from './openai';

interface CachedChunk {
  chunkId: string;
  rowid: number;
  documentId: string;
  title: string;
  content: string;
  sourceLocator: string | null;
  language: string;
  course: string | null;
  capYear: number | null;
  vec: Float32Array;
}

let cache: CachedChunk[] = [];
let loaded = false;

/** Encode a Float32Array as a little-endian BLOB for storage. */
export function encodeEmbedding(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/** Decode a stored BLOB back to a Float32Array. */
export function decodeEmbedding(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** (Re)load active chunk vectors into memory. Call on boot and after KB changes. */
export function rebuildVectorCache(): void {
  const rows = db
    .prepare(
      `SELECT c.id AS chunkId, c.rowid AS rowid, c.document_id AS documentId, c.content AS content,
              c.source_locator AS sourceLocator, c.language AS language, c.course AS course,
              c.cap_year AS capYear, c.embedding AS embedding, d.title AS title
         FROM kb_chunks c
         JOIN kb_documents d ON d.id = c.document_id
        WHERE c.is_active = 1 AND c.embedding IS NOT NULL
          AND d.is_active = 1 AND d.deleted_at IS NULL`,
    )
    .all() as Array<{
    chunkId: string;
    rowid: number;
    documentId: string;
    content: string;
    sourceLocator: string | null;
    language: string;
    course: string | null;
    capYear: number | null;
    embedding: Buffer;
    title: string;
  }>;

  cache = rows.map((r) => ({
    chunkId: r.chunkId,
    rowid: r.rowid,
    documentId: r.documentId,
    title: r.title,
    content: r.content,
    sourceLocator: r.sourceLocator,
    language: r.language,
    course: r.course,
    capYear: r.capYear,
    vec: decodeEmbedding(r.embedding),
  }));
  loaded = true;
  logger.info({ chunks: cache.length }, 'vector cache rebuilt');
}

function ensureLoaded(): void {
  if (!loaded) rebuildVectorCache();
}

export interface RetrieveOpts {
  language: Locale;
  course?: string | null;
  capYear?: number | null;
  topK: number;
  minScore: number;
}

/** Significant query tokens for FTS and lexical re-ranking. */
function queryTokens(queryText: string): string[] {
  const cleaned = queryText.replace(/["'^*]/g, ' ').trim().toLowerCase();
  if (!cleaned) return [];
  const stop = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'was', 'our', 'out',
    'has', 'have', 'had', 'how', 'what', 'when', 'where', 'which', 'who', 'why', 'this', 'that',
    'with', 'from', 'about', 'into', 'your', 'their', 'there', 'will', 'would', 'should', 'could',
    'maharashtra', 'cap', 'admission', 'process', 'centralised', 'centralized',
  ]);
  return [...new Set(cleaned.split(/\s+/).filter((t) => t.length > 1 && !stop.has(t)))].slice(0, 16);
}

/** Fraction of query tokens found in chunk content (0..1). */
function lexicalOverlap(queryText: string, content: string): number {
  const tokens = queryTokens(queryText);
  if (!tokens.length) return 0;
  const hay = content.toLowerCase();
  let hits = 0;
  for (const t of tokens) if (hay.includes(t)) hits += 1;
  return hits / tokens.length;
}

/** FTS5 keyword scores keyed by chunk rowid (normalized 0..~1). */
function ftsScores(queryText: string): Map<number, number> {
  const scores = new Map<number, number>();
  const tokens = queryTokens(queryText);
  if (!tokens.length) return scores;
  const match = tokens.map((t) => `"${t}"`).join(' OR ');
  try {
    const rows = db
      .prepare(
        `SELECT rowid, bm25(kb_chunks_fts) AS rank FROM kb_chunks_fts WHERE kb_chunks_fts MATCH ? ORDER BY rank LIMIT 50`,
      )
      .all(match) as Array<{ rowid: number; rank: number }>;
    // bm25: lower is better. Convert to a 0..1-ish similarity.
    for (const r of rows) {
      const sim = 1 / (1 + Math.max(0, r.rank));
      scores.set(r.rowid, sim);
    }
  } catch (err) {
    logger.warn({ err }, 'fts query failed');
  }
  return scores;
}

/**
 * Hybrid retrieval: cosine over the in-memory vector cache merged with FTS5
 * keyword scores. Returns top chunks above minScore, MMR-lite de-duplicated.
 */
export function retrieve(queryVec: Float32Array, queryText: string, opts: RetrieveOpts): RetrievedChunk[] {
  ensureLoaded();
  const fts = ftsScores(queryText);

  // No HARD metadata gating. The KB is small and admin-curated, so a course or
  // CAP-year mismatch must NEVER silently drop a chunk — that previously caused
  // permanent fallbacks (e.g. a "2025-26" brochure tagged cap_year=2025 vanished
  // entirely under current_cap_year=2026, so the bot answered "not in knowledge
  // base" for everything). Instead every active chunk stays a candidate and we
  // apply a gentle ranking penalty for mismatches, so the right-year / right-course
  // content still floats to the top WHEN it exists, without hiding the rest.
  // Language is intentionally not filtered either: the KB is primarily English and
  // OpenAI embeddings are multilingual, so a Hindi/Marathi question (normalised to
  // English upstream) matches the English passages; the answer is then written in
  // the user's language by the grounding prompt.
  const scored = cache.map((c) => {
    const cos = dot(queryVec, c.vec); // unit vectors → cosine
    const kw = fts.get(c.rowid) ?? 0;
    const lex = lexicalOverlap(queryText, c.content);
    // Semantic + keyword + lexical overlap (helps CAP terms, institute codes, dates).
    let score = 0.52 * cos + 0.28 * kw + 0.2 * lex;
    // Soft preferences (ranking only, never exclusion): de-prioritise off-course
    // and off-cycle chunks so current-year / on-course material wins ties.
    if (opts.course && c.course && c.course !== opts.course) score *= 0.9;
    if (opts.capYear && c.capYear && c.capYear !== opts.capYear) score *= 0.9;
    return { c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: { c: CachedChunk; score: number }[] = [];
  for (const cand of scored) {
    if (cand.score < opts.minScore) break;
    // MMR-lite: skip a chunk that is near-identical to one already chosen.
    const dup = selected.some((s) => dot(s.c.vec, cand.c.vec) > 0.95);
    if (dup) continue;
    selected.push(cand);
    if (selected.length >= opts.topK) break;
  }

  return selected.map((s) => ({
    documentId: s.c.documentId,
    chunkId: s.c.chunkId,
    title: s.c.title,
    content: s.c.content,
    sourceLocator: s.c.sourceLocator,
    score: Number(s.score.toFixed(4)),
  }));
}

/** Merge two retrieval lists, keeping the best score per chunk. */
export function fuseRetrievalResults(
  a: RetrievedChunk[],
  b: RetrievedChunk[],
  topK: number,
  minScore: number,
): RetrievedChunk[] {
  const map = new Map<string, RetrievedChunk>();
  for (const c of [...a, ...b]) {
    const prev = map.get(c.chunkId);
    if (!prev || c.score > prev.score) map.set(c.chunkId, c);
  }
  return [...map.values()]
    .sort((x, y) => y.score - x.score)
    .filter((c) => c.score >= minScore)
    .slice(0, topK);
}

/**
 * Fetch every active chunk whose content contains an institute code (e.g. 06217).
 * Used for seat-matrix queries so ALL courses across pages are available to the LLM.
 */
export function retrieveByInstituteCodes(codes: string[], maxChunks = 40): RetrievedChunk[] {
  if (!codes.length) return [];
  ensureLoaded();

  const matched: RetrievedChunk[] = [];
  const seen = new Set<string>();

  for (const code of codes) {
    for (const c of cache) {
      if (!c.content.includes(code)) continue;
      if (seen.has(c.chunkId)) continue;
      seen.add(c.chunkId);
      matched.push({
        documentId: c.documentId,
        chunkId: c.chunkId,
        title: c.title,
        content: c.content,
        sourceLocator: c.sourceLocator,
        score: 0.95,
      });
    }
  }

  // DB fallback when cache is stale or institute chunks were added after last rebuild.
  if (matched.length === 0) {
    for (const row of fetchInstituteChunksFromDb(codes)) {
      if (seen.has(row.chunkId)) continue;
      seen.add(row.chunkId);
      matched.push({
        documentId: row.documentId,
        chunkId: row.chunkId,
        title: row.title,
        content: row.content,
        sourceLocator: row.sourceLocator,
        score: 0.98,
      });
    }
  }

  // Prefer institute-grouped chunks (locator mentions the code) then larger chunks.
  matched.sort((a, b) => {
    const aInst = a.sourceLocator?.includes('Institute') ? 1 : 0;
    const bInst = b.sourceLocator?.includes('Institute') ? 1 : 0;
    if (aInst !== bInst) return bInst - aInst;
    return b.content.length - a.content.length;
  });

  return matched.slice(0, maxChunks);
}

/** Cap total context size while keeping as many chunks as possible. */
export function trimChunksToCharBudget(chunks: RetrievedChunk[], maxChars = 70000): RetrievedChunk[] {
  let total = 0;
  const out: RetrievedChunk[] = [];
  for (const c of chunks) {
    if (total + c.content.length > maxChars && out.length > 0) break;
    out.push(c);
    total += c.content.length;
  }
  return out;
}

export function vectorCacheSize(): number {
  ensureLoaded();
  return cache.length;
}
