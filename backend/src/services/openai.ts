import crypto from 'node:crypto';
import fs from 'node:fs';
import OpenAI, { type ClientOptions, toFile } from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { env, integrations } from '../config/env';
import { logger } from '../lib/logger';
import { TtlCache } from './cache';
import { getSetting, setSetting } from './settings';
import { buildQueryEmbeddingText } from './textChunker';
import { buildGroundingSystemPrompt, buildDocEngineInstructions } from './groundingPrompt';
import type { Locale } from '../types';

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) {
    const opts: ClientOptions = { apiKey: env.openaiApiKey };
    // Route outbound OpenAI traffic through a proxy when enabled.
    if (env.openaiProxyEnabled && env.openaiProxyUrl) {
      opts.httpAgent = new HttpsProxyAgent(env.openaiProxyUrl);
      logger.info({ proxy: maskProxy(env.openaiProxyUrl) }, 'openai requests routed through proxy');
    }
    _client = new OpenAI(opts);
  }
  return _client;
}

/** Hide credentials in a proxy URL before logging. */
function maskProxy(url: string): string {
  return url.replace(/\/\/[^@/]+@/, '//***@');
}

const embedCache = new TtlCache<Float32Array>(2000, 24 * 60 * 60 * 1000);

/** @deprecated Use buildGroundingSystemPrompt(language) — kept for BUILD_SPEC reference. */
export const GROUNDING_PROMPT = buildGroundingSystemPrompt('en');

export interface RetrievedChunk {
  documentId: string;
  chunkId: string;
  title: string;
  content: string;
  sourceLocator: string | null;
  score: number;
}

export interface ChatResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

function l2normalize(vec: number[]): Float32Array {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/**
 * Deterministic local embedding used when no OpenAI key is configured.
 * Hashes token n-grams into the embedding space so cosine similarity over
 * seeded KB content still functions for demos. NOT semantic-quality.
 */
const DEV_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one', 'our', 'out',
  'has', 'have', 'had', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'did', 'its',
  'let', 'put', 'say', 'she', 'too', 'use', 'with', 'from', 'this', 'that', 'they', 'will', 'your', 'what',
  'when', 'which', 'their', 'there', 'about', 'would', 'these', 'into', 'than', 'then', 'them', 'such',
]);

function devEmbed(text: string): Float32Array {
  const dim = env.embeddingDim;
  const vec = new Array<number>(dim).fill(0);
  const tokens = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (t) => t.length >= 4 && !DEV_STOPWORDS.has(t),
  );
  for (const tok of tokens) {
    const h = crypto.createHash('md5').update(tok).digest();
    for (let i = 0; i < 4; i++) {
      const idx = h.readUInt32LE(i * 4) % dim;
      vec[idx] += 1;
    }
  }
  return l2normalize(vec);
}

/** Embed a single text → unit-normalized Float32Array (cached). */
export async function embed(text: string): Promise<Float32Array> {
  const key = crypto.createHash('sha1').update(text).digest('hex');
  const cached = embedCache.get(key);
  if (cached) return cached;

  let vec: Float32Array;
  if (!integrations.openaiEnabled) {
    vec = devEmbed(text);
  } else {
    const res = await client().embeddings.create({ model: env.openaiEmbeddingModel, input: text });
    vec = l2normalize(res.data[0].embedding as number[]);
  }
  embedCache.set(key, vec);
  return vec;
}

/** Embed a user question for KB retrieval (domain-prefixed, symmetric with index embeddings). */
export async function embedQuery(englishQuery: string): Promise<Float32Array> {
  return embed(buildQueryEmbeddingText(englishQuery));
}

/** Embed a batch of texts (used during indexing). */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (!integrations.openaiEnabled) return texts.map(devEmbed);
  const out: Float32Array[] = [];
  const BATCH = 96;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await client().embeddings.create({ model: env.openaiEmbeddingModel, input: slice });
    for (const d of res.data) out.push(l2normalize(d.embedding as number[]));
  }
  return out;
}

function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[Excerpt ${i + 1}]\nSource: ${c.title}${c.sourceLocator ? ` (${c.sourceLocator})` : ''}\n${c.content}`,
    )
    .join('\n\n---\n\n');
}

/**
 * Generate a grounded answer from retrieved chunks. Caller guarantees chunks
 * is non-empty (empty → caller returns the fallback without calling this).
 */
export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[],
  language: Locale,
  opts?: { categoryHint?: string | null },
): Promise<ChatResult> {
  const system = buildGroundingSystemPrompt(language, { categoryHint: opts?.categoryHint ?? null })
    .replace('{{RETRIEVED_CHUNKS}}', buildContext(chunks))
    .replaceAll('{{LANGUAGE}}', language);

  if (!integrations.openaiEnabled) {
    // Dev fallback: quote the top chunks verbatim so the strict-KB guarantee holds.
    const top = chunks.slice(0, 2);
    const body = top.map((c) => c.content.trim()).join('\n\n');
    const sources = [...new Set(top.map((c) => c.title))].join(', ');
    return {
      content: `[dev mode · no OPENAI_API_KEY] Based on the knowledge base:\n\n${body}\n\nSource: ${sources}`,
      model: 'dev-fallback',
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  const res = await client().chat.completions.create({
    model: env.openaiChatModel,
    temperature: 0.1,
    max_tokens: 2800,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: question },
    ],
  });
  const choice = res.choices[0];
  return {
    content: choice.message.content?.trim() ?? '',
    model: res.model,
    promptTokens: res.usage?.prompt_tokens ?? 0,
    completionTokens: res.usage?.completion_tokens ?? 0,
  };
}

/** Streaming variant for SSE. Yields content deltas. */
export async function* generateAnswerStream(
  question: string,
  chunks: RetrievedChunk[],
  language: Locale,
  opts?: { categoryHint?: string | null },
): AsyncGenerator<string, ChatResult, void> {
  const system = buildGroundingSystemPrompt(language, { categoryHint: opts?.categoryHint ?? null })
    .replace('{{RETRIEVED_CHUNKS}}', buildContext(chunks))
    .replaceAll('{{LANGUAGE}}', language);

  if (!integrations.openaiEnabled) {
    const full = (await generateAnswer(question, chunks, language)).content;
    // emit in small slices to simulate streaming
    const words = full.split(/(\s+)/);
    for (const w of words) yield w;
    return { content: full, model: 'dev-fallback', promptTokens: 0, completionTokens: 0 };
  }

  const stream = await client().chat.completions.create({
    model: env.openaiChatModel,
    temperature: 0.1,
    max_tokens: 2800,
    stream: true,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: question },
    ],
  });
  let content = '';
  let model = env.openaiChatModel;
  for await (const part of stream) {
    model = part.model || model;
    const delta = part.choices[0]?.delta?.content ?? '';
    if (delta) {
      content += delta;
      yield delta;
    }
  }
  return { content: content.trim(), model, promptTokens: 0, completionTokens: 0 };
}

export function openaiHealth(): 'ok' | 'degraded' {
  return integrations.openaiEnabled ? 'ok' : 'degraded';
}

/** Truthful label of the embedding method actually in use ('dev-hash' without a key). */
export function currentEmbeddingModel(): string {
  return integrations.openaiEnabled ? env.openaiEmbeddingModel : 'dev-hash';
}

const translateCache = new TtlCache<string>(1000, 24 * 60 * 60 * 1000);
const detectCache = new TtlCache<{ language: Locale; englishQuery: string }>(1000, 24 * 60 * 60 * 1000);

// Devanagari Unicode block (U+0900–U+097F) — escapes used so the check is
// independent of source-file encoding.
const DEVANAGARI = /[ऀ-ॿ]/;

// Distinctive Marathi markers (rare/absent in Hindi). 'यचा'/'यचे' catch the
// Marathi infinitive (भरायचा/करायचे); ळ (U+0933) is Marathi-specific.
const MARATHI_MARKERS = ['आहे', 'नाही', 'काय', 'कसा', 'कसे', 'कशी', 'तुम्ही', 'आणि', 'च्या', 'ळ', 'यचा', 'यचे', 'मराठी'];

function hasMarathiMarkers(text: string): boolean {
  return MARATHI_MARKERS.some((m) => text.includes(m));
}

/** Heuristic Hindi-vs-Marathi guess (used only in dev mode without a key). */
function guessDevanagariLang(text: string): Locale {
  return hasMarathiMarkers(text) ? 'mr' : 'hi';
}

/**
 * Auto-detect the question language (en/hi/mr) AND produce an English version
 * for retrieval. Latin-only text is treated as English with no API call;
 * Devanagari text is classified + translated in a single cheap call (cached).
 * This lets the chat answer in whatever language the user typed in, grounded in
 * the (English) knowledge base — no language selector needed.
 */
export async function detectAndTranslate(text: string): Promise<{ language: Locale; englishQuery: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { language: 'en', englishQuery: text };
  // No Devanagari → English. (Western digits/punctuation alone stay English too.)
  if (!DEVANAGARI.test(trimmed)) return { language: 'en', englishQuery: trimmed };

  const cached = detectCache.get(trimmed);
  if (cached) return cached;

  if (!integrations.openaiEnabled) {
    return { language: guessDevanagariLang(trimmed), englishQuery: trimmed };
  }

  try {
    const res = await client().chat.completions.create({
      model: env.openaiChatModel,
      temperature: 0,
      max_tokens: 320,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Detect the language of the user message — "en" (English), "hi" (Hindi), or "mr" (Marathi) — and translate it into English for a search query. ' +
            'Hindi vs Marathi (both Devanagari): Marathi typically uses आहे, नाही, का, कसे/कसा/कशी, -चा/-ची/-चे, तुम्ही, आणि, मध्ये, ळ; ' +
            'Hindi typically uses है/हैं, क्या, कैसे, और, नहीं, में, का/की/के, आप. ' +
            'Reply ONLY as compact JSON: {"lang":"en|hi|mr","english":"..."}. ' +
            'Preserve names, numbers, dates and Maharashtra CAP / admission terms (CAP, option form, merit list, allotment, CET).',
        },
        { role: 'user', content: trimmed },
      ],
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as { lang?: string; english?: string };
    let language: Locale = parsed.lang === 'hi' || parsed.lang === 'mr' ? parsed.lang : 'en';
    // Marathi is easily misread as Hindi by the model; trust distinctive markers.
    if (language !== 'en' && hasMarathiMarkers(trimmed)) language = 'mr';
    const englishQuery = (parsed.english || trimmed).trim();
    const out = { language, englishQuery };
    detectCache.set(trimmed, out);
    return out;
  } catch {
    return { language: guessDevanagariLang(trimmed), englishQuery: trimmed };
  }
}

/**
 * Translate a question to English so it can be matched against the (English)
 * knowledge base. The KB is primarily English; OpenAI embeddings match far more
 * strongly within one language, so we "recognize as English" before retrieval.
 * The final answer is still written in the user's own language by the caller.
 * Returns the original text unchanged for English, or when no key is set.
 */
export async function translateToEnglish(text: string, from: Locale): Promise<string> {
  if (from === 'en' || !integrations.openaiEnabled || !text.trim()) return text;
  const key = `${from}:${text}`;
  const cached = translateCache.get(key);
  if (cached) return cached;
  try {
    const res = await client().chat.completions.create({
      model: env.openaiChatModel,
      temperature: 0,
      max_tokens: 256,
      messages: [
        {
          role: 'system',
          content:
            'Translate the user message into English for a search query. Output ONLY the English translation, with no quotes or extra text. Preserve names, numbers, dates and Maharashtra CAP / admission terminology (e.g. CAP, option form, merit list, allotment, CET).',
        },
        { role: 'user', content: text },
      ],
    });
    const out = res.choices[0]?.message?.content?.trim() || text;
    translateCache.set(key, out);
    return out;
  } catch {
    return text; // on any failure, fall back to the original text
  }
}

// ===========================================================================
// OpenAI document-understanding engine (Files + Vector Store + Responses API)
// ---------------------------------------------------------------------------
// Uploaded KB files are ingested by OpenAI and answered over with far better
// PDF/table parsing than the local chunk pipeline. Hybrid at query time:
//   - whole_file : the full source files go into context (the model sees ALL
//                  rows of every table) — used when the active KB fits the budget
//   - file_search: OpenAI vector-store retrieval — used for large KBs
// Strict KB-only grounding, multilingual answers and the exact fallback sentence
// are all preserved.
// ===========================================================================

export type DocAnswerMode = 'whole_file' | 'file_search';

export interface DocSource {
  documentId: string;
  title: string;
  fileId: string;
}

export interface DocAnswerResult {
  content: string;
  model: string;
  citedFileIds: string[];
  promptTokens: number;
  completionTokens: number;
}

/** Upload a file (PDF path stream, or an in-memory text buffer) to OpenAI; returns the file id. */
export async function uploadOpenAIFile(
  source: { path: string } | { buffer: Buffer },
  filename: string,
): Promise<string> {
  const data = 'path' in source ? fs.createReadStream(source.path) : source.buffer;
  const uploadable = await toFile(data, filename);
  const file = await client().files.create({ file: uploadable, purpose: 'assistants' });
  return file.id;
}

/** Get (or lazily create) the shared KB vector store id, persisted in app_settings. */
export async function ensureVectorStore(): Promise<string> {
  const existing = getSetting<string>('openai_vector_store_id', '');
  if (existing) return existing;
  const vs = await client().vectorStores.create({ name: 'disha-kb' });
  setSetting('openai_vector_store_id', vs.id, 'OpenAI vector store id for KB file search');
  return vs.id;
}

export function getVectorStoreId(): string | null {
  return getSetting<string>('openai_vector_store_id', '') || null;
}

/** Attach a file to the vector store and wait until it is searchable. */
export async function addFileToVectorStore(vectorStoreId: string, fileId: string): Promise<void> {
  await client().vectorStores.files.createAndPoll(vectorStoreId, { file_id: fileId });
}

export async function removeFileFromVectorStore(vectorStoreId: string, fileId: string): Promise<void> {
  try {
    await client().vectorStores.files.del(vectorStoreId, fileId);
  } catch (err) {
    logger.warn({ err, fileId }, 'vector store file remove failed');
  }
}

export async function deleteOpenAIFile(fileId: string): Promise<void> {
  try {
    await client().files.del(fileId);
  } catch (err) {
    logger.warn({ err, fileId }, 'openai file delete failed');
  }
}

function docGroundingInstructions(language: Locale, categoryHint?: string | null): string {
  return buildDocEngineInstructions(language, categoryHint);
}

function buildDocInput(question: string, mode: DocAnswerMode, sources: DocSource[], extraContext?: string) {
  const text = extraContext ? `${question}\n\n${extraContext}` : question;
  const content: Array<Record<string, unknown>> = [{ type: 'input_text', text }];
  if (mode === 'whole_file') {
    for (const s of sources) content.push({ type: 'input_file', file_id: s.fileId });
  }
  return [{ role: 'user', content }];
}

function fileSearchTools(mode: DocAnswerMode, vectorStoreId: string | null) {
  if (mode !== 'file_search' || !vectorStoreId) return undefined;
  return [
    {
      type: 'file_search' as const,
      vector_store_ids: [vectorStoreId],
      max_num_results: env.ragFileSearchMaxResults,
    },
  ];
}

/** Pull the file ids the model actually cited (file_search annotations). */
function extractCitedFileIds(res: unknown): string[] {
  const ids = new Set<string>();
  const output = (res as { output?: unknown[] })?.output ?? [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (item?.type !== 'message') continue;
    for (const c of (item.content as Array<Record<string, unknown>>) ?? []) {
      for (const a of (c?.annotations as Array<Record<string, unknown>>) ?? []) {
        if (a?.type === 'file_citation' && typeof a.file_id === 'string') ids.add(a.file_id);
      }
    }
  }
  return [...ids];
}

export async function answerFromDocs(params: {
  question: string;
  language: Locale;
  mode: DocAnswerMode;
  sources: DocSource[];
  vectorStoreId: string | null;
  categoryHint?: string | null;
  retrievalHint?: string;
}): Promise<DocAnswerResult> {
  const res = await client().responses.create({
    model: env.openaiDocModel,
    instructions: docGroundingInstructions(params.language, params.categoryHint),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: buildDocInput(params.question, params.mode, params.sources, params.retrievalHint) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: fileSearchTools(params.mode, params.vectorStoreId) as any,
    temperature: 0.1,
    max_output_tokens: 3500,
  });
  return {
    content: (res.output_text ?? '').trim(),
    model: res.model,
    citedFileIds: extractCitedFileIds(res),
    promptTokens: res.usage?.input_tokens ?? 0,
    completionTokens: res.usage?.output_tokens ?? 0,
  };
}

export async function* answerFromDocsStream(params: {
  question: string;
  language: Locale;
  mode: DocAnswerMode;
  sources: DocSource[];
  vectorStoreId: string | null;
  categoryHint?: string | null;
  retrievalHint?: string;
}): AsyncGenerator<string, DocAnswerResult, void> {
  const stream = await client().responses.create({
    model: env.openaiDocModel,
    instructions: docGroundingInstructions(params.language, params.categoryHint),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: buildDocInput(params.question, params.mode, params.sources, params.retrievalHint) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: fileSearchTools(params.mode, params.vectorStoreId) as any,
    temperature: 0.1,
    max_output_tokens: 3500,
    stream: true,
  });

  let content = '';
  let model = env.openaiDocModel;
  let citedFileIds: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      content += event.delta;
      yield event.delta;
    } else if (event.type === 'response.completed') {
      const r = event.response;
      model = r.model || model;
      citedFileIds = extractCitedFileIds(r);
      promptTokens = r.usage?.input_tokens ?? 0;
      completionTokens = r.usage?.output_tokens ?? 0;
      if (r.output_text) content = r.output_text;
    }
  }

  return { content: content.trim(), model, citedFileIds, promptTokens, completionTokens };
}

logger.info({ openai: integrations.openaiEnabled }, 'openai service initialized');
