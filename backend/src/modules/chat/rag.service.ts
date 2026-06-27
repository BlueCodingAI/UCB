import {
  embed,
  generateAnswer,
  detectAndTranslate,
  answerFromDocs,
  getVectorStoreId,
  type RetrievedChunk,
  type DocAnswerMode,
  type DocAnswerResult,
  type DocSource,
} from '../../services/openai';
import { retrieve } from '../../services/vectorStore';
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
  /** The auto-detected language of the question (also the answer language). */
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

/**
 * Resolve the course filter from the user's saved profile, but only for
 * premium (or higher) users. Anonymous / freemium users get no course filter.
 */
function resolveCourse(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const plan = effectivePlan(userId);
  if (plan === 'freemium') return null;
  const row = db
    .prepare('SELECT course_interest FROM user_profiles WHERE user_id = ?')
    .get(userId) as ProfileRow | undefined;
  return row?.course_interest ?? null;
}

// ---- OpenAI document engine (hybrid: whole-file vs file_search) ------------

export interface DocPlan {
  active: boolean;
  mode: DocAnswerMode;
  sources: DocSource[];
  vectorStoreId: string | null;
}

const INACTIVE_PLAN: DocPlan = { active: false, mode: 'file_search', sources: [], vectorStoreId: null };

/**
 * Decide whether (and how) to answer via the OpenAI document engine. Whole-file
 * mode (the model reads the entire source — sees ALL table rows) is used while the
 * active KB fits the char budget; beyond that we use file_search retrieval. Falls
 * back to the local RAG (returns active:false) when the engine is off, no docs are
 * uploaded, or the KB is too big with no vector store.
 */
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
  return INACTIVE_PLAN; // too big for whole-file and no vector store → use local RAG
}

/** Map the engine's cited files (or the in-scope docs) to citation chips. */
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

/** The localized KB-miss fallback as an AnswerResult (no citations, no LLM cost claimed). */
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

/**
 * Strict KB-grounded answer. Prefers the OpenAI document engine (full-document /
 * file_search understanding of the uploaded files) when available; otherwise
 * falls back to the local embedded-chunk RAG. Persists nothing.
 */
export async function answerQuestion(params: {
  question: string;
  /** Optional hint; ignored — the language is auto-detected from the question. */
  language?: Locale;
  userId?: string | null;
}): Promise<AnswerResult> {
  const { question, userId } = params;

  // Auto-detect the question's language and get an English version for retrieval.
  // The KB is English; we match against it in English, then answer in the detected
  // language. No language selector needed.
  const { language, englishQuery } = await detectAndTranslate(question);

  // Preferred path: OpenAI document engine (best PDF/table understanding).
  const plan = getDocPlan();
  if (plan.active) {
    try {
      const docRes = await answerFromDocs({
        question,
        language,
        mode: plan.mode,
        sources: plan.sources,
        vectorStoreId: plan.vectorStoreId,
      });
      if (!docRes.content || isFallbackAnswer(docRes.content)) {
        return fallbackResult(language, docRes.model, docRes.promptTokens, docRes.completionTokens);
      }
      return {
        content: docRes.content,
        language,
        citations: buildDocCitations(docRes, plan),
        isFallback: false,
        retrievalScore: 1,
        model: docRes.model,
        promptTokens: docRes.promptTokens,
        completionTokens: docRes.completionTokens,
        sourceChunks: [],
      };
    } catch (err) {
      logger.error({ err }, 'doc engine answer failed; falling back to local RAG');
      // fall through to the local RAG path below
    }
  }

  const queryVec = await embed(englishQuery);

  const course = resolveCourse(userId);
  const capYear = getSetting<number>('current_cap_year', env.currentCapYear);

  const retrieved: RetrievedChunk[] = retrieve(queryVec, englishQuery, {
    language,
    course,
    capYear,
    topK: getRagTopK(),
    minScore: getRagMinScore(),
  });

  // Golden rule: nothing above the floor → fixed fallback, no LLM call.
  if (retrieved.length === 0) {
    return {
      content: getFallbackMessage(language),
      language,
      citations: [],
      isFallback: true,
      retrievalScore: 0,
      model: 'fallback',
      promptTokens: 0,
      completionTokens: 0,
      sourceChunks: [],
    };
  }

  // Generate against the English-normalised question (EN-parity grounding) but
  // answer in the detected language.
  const result = await generateAnswer(englishQuery, retrieved, language);

  // The model may still emit the KB-miss fallback when the context doesn't cover
  // the question — surface that as a proper fallback (no citations).
  if (isFallbackAnswer(result.content)) {
    return {
      content: getFallbackMessage(language),
      language,
      citations: [],
      isFallback: true,
      retrievalScore: retrieved[0]?.score ?? 0,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      sourceChunks: [],
    };
  }

  const citations: CitationDTO[] = retrieved.map((c) => ({
    documentId: c.documentId,
    chunkId: c.chunkId,
    title: c.title,
    sourceLocator: c.sourceLocator,
    score: c.score,
  }));

  return {
    content: result.content,
    language,
    citations,
    isFallback: false,
    retrievalScore: retrieved[0].score,
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    sourceChunks: retrieved.map((c) => ({
      chunkId: c.chunkId,
      documentId: c.documentId,
      score: c.score,
    })),
  };
}
