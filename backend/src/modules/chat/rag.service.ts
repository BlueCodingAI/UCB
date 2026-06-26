import { embed, generateAnswer, detectAndTranslate, type RetrievedChunk } from '../../services/openai';
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
import { env } from '../../config/env';
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

/**
 * Strict KB-grounded answer. Embeds the question, retrieves candidate chunks,
 * and either returns the localized fallback (no LLM call) when nothing survives
 * the score floor, or calls the LLM with the retrieved context. Persists nothing.
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
