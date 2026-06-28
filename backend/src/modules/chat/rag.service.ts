import {
  embed,
  embedQuery,
  generateAnswer,
  detectAndTranslate,
  answerFromDocs,
  getVectorStoreId,
  type RetrievedChunk,
  type DocAnswerResult,
  type DocSource,
} from '../../services/openai';
import { retrieve, fuseRetrievalResults } from '../../services/vectorStore';
import {
  getFallbackMessage,
  getRagTopK,
  getRagMinScore,
  getSetting,
  isFallbackAnswer,
} from '../../services/settings';
import { effectivePlan } from '../../middleware/auth';
import { db } from '../../db/connection';
import { env, integrations } from '../../config/env';
import { logger } from '../../lib/logger';
import type { CitationDTO, Locale } from '../../types';

export interface AnswerResult {
  content: string;
  language: Locale;
  citations: CitationDTO[];
  isFallback: boolean;
  retrievalScore: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  sourceChunks: { chunkId: string; documentId: string; score: number }[];
}

interface ProfileRow {
  course_interest: string | null;
}

function resolveCourse(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const plan = effectivePlan(userId);
  if (plan === 'freemium') return null;
  const row = db
    .prepare('SELECT course_interest FROM user_profiles WHERE user_id = ?')
    .get(userId) as ProfileRow | undefined;
  return row?.course_interest ?? null;
}

export interface DocPlan {
  active: boolean;
  mode: import('../../services/openai').DocAnswerMode;
  sources: DocSource[];
  vectorStoreId: string | null;
}

const INACTIVE_PLAN: DocPlan = { active: false, mode: 'file_search', sources: [], vectorStoreId: null };

export function getDocPlan(): DocPlan {
  if (!integrations.openaiDocsEnabled) return INACTIVE_PLAN;
  const rows = db
    .prepare(
      `SELECT d.id AS documentId, d.title AS title, d.openai_file_id AS fileId,
              COALESCE(SUM(LENGTH(c.content)), 0) AS chars
         FROM kb_documents d
         LEFT JOIN kb_chunks c ON c.document_id = d.id AND c.is_active = 1
        WHERE d.is_active = 1 AND d.deleted_at IS NULL AND d.openai_file_id IS NOT NULL
        GROUP BY d.id, d.title, d.openai_file_id`,
    )
    .all() as Array<{ documentId: string; title: string; fileId: string; chars: number }>;

  const sources: DocSource[] = rows
    .filter((r) => r.fileId)
    .map((r) => ({ documentId: r.documentId, title: r.title, fileId: r.fileId }));
  if (sources.length === 0) return INACTIVE_PLAN;

  const totalChars = rows.reduce((s, r) => s + (r.chars || 0), 0);
  const vectorStoreId = getVectorStoreId();
  if (totalChars <= env.kbWholeFileMaxChars) {
    return { active: true, mode: 'whole_file', sources, vectorStoreId };
  }
  if (vectorStoreId) return { active: true, mode: 'file_search', sources, vectorStoreId };
  return INACTIVE_PLAN;
}

export function buildDocCitations(result: DocAnswerResult, plan: DocPlan): CitationDTO[] {
  const byFile = new Map(plan.sources.map((s) => [s.fileId, s]));
  let cited: DocSource[];
  if (result.citedFileIds.length) {
    cited = result.citedFileIds.map((id) => byFile.get(id)).filter((s): s is DocSource => !!s);
  } else {
    cited = plan.sources.slice(0, plan.mode === 'whole_file' ? 8 : 5);
  }
  return cited.map((s) => ({
    documentId: s.documentId,
    chunkId: '',
    title: s.title,
    sourceLocator: null,
    score: 1,
  }));
}

export function fallbackResult(
  language: Locale,
  model = 'fallback',
  promptTokens = 0,
  completionTokens = 0,
): AnswerResult {
  return {
    content: getFallbackMessage(language),
    language,
    citations: [],
    isFallback: true,
    retrievalScore: 0,
    model,
    promptTokens,
    completionTokens,
    sourceChunks: [],
  };
}

/** Dual embedding retrieval: domain-prefixed + raw query, fused and de-duplicated. */
export async function retrieveForQuestion(params: {
  englishQuery: string;
  language: Locale;
  userId?: string | null;
}): Promise<RetrievedChunk[]> {
  const topK = getRagTopK();
  const minScore = getRagMinScore();
  const poolK = Math.min(topK * 2, 20);

  const [vecPrefixed, vecRaw] = await Promise.all([
    embedQuery(params.englishQuery),
    embed(params.englishQuery),
  ]);

  const baseOpts = {
    language: params.language,
    course: resolveCourse(params.userId),
    capYear: getSetting<number>('current_cap_year', env.currentCapYear),
    topK: poolK,
    minScore: minScore * 0.75,
  };

  const fromPrefixed = retrieve(vecPrefixed, params.englishQuery, baseOpts);
  const fromRaw = retrieve(vecRaw, params.englishQuery, baseOpts);
  return fuseRetrievalResults(fromPrefixed, fromRaw, topK, minScore);
}

function toCitations(retrieved: RetrievedChunk[]): CitationDTO[] {
  return retrieved.map((c) => ({
    documentId: c.documentId,
    chunkId: c.chunkId,
    title: c.title,
    sourceLocator: c.sourceLocator,
    score: c.score,
  }));
}

function toSourceChunks(retrieved: RetrievedChunk[]) {
  return retrieved.map((c) => ({
    chunkId: c.chunkId,
    documentId: c.documentId,
    score: c.score,
  }));
}

function buildLocalAnswer(
  language: Locale,
  retrieved: RetrievedChunk[],
  result: { content: string; model: string; promptTokens: number; completionTokens: number },
  isFallback: boolean,
): AnswerResult {
  return {
    content: isFallback ? getFallbackMessage(language) : result.content,
    language,
    citations: isFallback ? [] : toCitations(retrieved),
    isFallback,
    retrievalScore: isFallback ? 0 : retrieved[0]?.score ?? 0,
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    sourceChunks: isFallback ? [] : toSourceChunks(retrieved),
  };
}

/** Questions that benefit from OpenAI's native PDF/table engine. */
export function prefersDocEngine(question: string, topScore: number): boolean {
  if (topScore >= 0.38) return false;
  const q = question.toLowerCase();
  return /institute|college|intake|fee|fees|seat|table|list|schedule|code|category|cut.?off|merit|allotment|option\s*form|round\s*\d|pdf|document|brochure|sanctioned/.test(
    q,
  );
}

async function tryDocEngine(params: {
  question: string;
  language: Locale;
  plan: DocPlan;
}): Promise<AnswerResult | null> {
  if (!params.plan.active) return null;
  try {
    const docRes = await answerFromDocs({
      question: params.question,
      language: params.language,
      mode: params.plan.mode,
      sources: params.plan.sources,
      vectorStoreId: params.plan.vectorStoreId,
    });
    if (!docRes.content || isFallbackAnswer(docRes.content)) return null;
    return {
      content: docRes.content,
      language: params.language,
      citations: buildDocCitations(docRes, params.plan),
      isFallback: false,
      retrievalScore: 1,
      model: docRes.model,
      promptTokens: docRes.promptTokens,
      completionTokens: docRes.completionTokens,
      sourceChunks: [],
    };
  } catch (err) {
    logger.error({ err }, 'doc engine answer failed');
    return null;
  }
}

/**
 * Strict KB-grounded answer. Uses improved local chunk RAG first; escalates to
 * the OpenAI document engine for table/PDF-heavy or low-confidence queries.
 */
export async function answerQuestion(params: {
  question: string;
  language?: Locale;
  userId?: string | null;
}): Promise<AnswerResult> {
  const { question, userId } = params;
  const { language, englishQuery } = await detectAndTranslate(question);
  const plan = getDocPlan();

  const retrieved = await retrieveForQuestion({ englishQuery, language, userId });
  const topScore = retrieved[0]?.score ?? 0;

  // Strong local retrieval → answer from improved chunks (primary path after re-index).
  if (retrieved.length > 0 && topScore >= 0.32) {
    const result = await generateAnswer(englishQuery, retrieved, language);
    if (!isFallbackAnswer(result.content)) {
      return buildLocalAnswer(language, retrieved, result, false);
    }
  }

  // Low confidence or table-heavy → try OpenAI document engine (native PDF parsing).
  if (plan.active && (prefersDocEngine(question, topScore) || retrieved.length === 0)) {
    const docAnswer = await tryDocEngine({ question, language, plan });
    if (docAnswer) return docAnswer;
  }

  // KB miss at retrieval layer.
  if (retrieved.length === 0) {
    // Last attempt: doc engine even for generic questions if local found nothing.
    const docAnswer = await tryDocEngine({ question, language, plan });
    if (docAnswer) return docAnswer;
    return fallbackResult(language);
  }

  // Have chunks but model declined — still grounded attempt before final fallback.
  const result = await generateAnswer(englishQuery, retrieved, language);
  if (isFallbackAnswer(result.content)) {
    const docAnswer = await tryDocEngine({ question, language, plan });
    if (docAnswer) return docAnswer;
    return buildLocalAnswer(language, retrieved, result, true);
  }

  return buildLocalAnswer(language, retrieved, result, false);
}
