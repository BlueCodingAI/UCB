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
import {
  retrieve,
  fuseRetrievalResults,
  retrieveByInstituteCodes,
  trimChunksToCharBudget,
} from '../../services/vectorStore';
import {
  getFallbackMessage,
  getRagTopK,
  getRagMinScore,
  getSetting,
  isFallbackAnswer,
} from '../../services/settings';
import {
  analyzeQuery,
  expandRetrievalQuery,
  filterDocSources,
  type QueryAnalysis,
} from '../../services/queryAnalysis';
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

function docRetrievalHint(analysis: QueryAnalysis): string | undefined {
  const parts: string[] = [];
  if (analysis.instituteCodes.length) {
    parts.push(
      `Find institute code(s) ${analysis.instituteCodes.join(', ')} in the seat matrix. List EVERY course/branch and sanctioned intake (SI) for each institute across ALL pages of the document.`,
    );
  }
  if (analysis.categoryHint) {
    parts.push(`Use ${analysis.categoryHint} category cut-offs/seats only — not a different category.`);
  }
  if (analysis.districtHint) {
    parts.push(`Focus on institutes in ${analysis.districtHint} district if present in sources.`);
  }
  return parts.length ? parts.join(' ') : undefined;
}

/** Semantic + institute-code literal retrieval merged for seat-matrix completeness. */
export async function retrieveForQuestion(params: {
  englishQuery: string;
  language: Locale;
  userId?: string | null;
  analysis?: QueryAnalysis;
}): Promise<RetrievedChunk[]> {
  const analysis = params.analysis ?? analyzeQuery(params.englishQuery);
  const expanded = expandRetrievalQuery(params.englishQuery, analysis);
  const topK = analysis.isInstituteLookup ? Math.max(getRagTopK(), 15) : getRagTopK();
  const minScore = analysis.isInstituteLookup ? getRagMinScore() * 0.65 : getRagMinScore();
  const poolK = Math.min(topK * 2, 30);

  const [vecPrefixed, vecRaw] = await Promise.all([embedQuery(expanded), embed(expanded)]);

  const baseOpts = {
    language: params.language,
    course: resolveCourse(params.userId),
    capYear: getSetting<number>('current_cap_year', env.currentCapYear),
    topK: poolK,
    minScore: minScore * 0.7,
  };

  const fromPrefixed = retrieve(vecPrefixed, expanded, baseOpts);
  const fromRaw = retrieve(vecRaw, params.englishQuery, baseOpts);
  let merged = fuseRetrievalResults(fromPrefixed, fromRaw, poolK, minScore);

  if (analysis.instituteCodes.length) {
    const literal = retrieveByInstituteCodes(analysis.instituteCodes, 40);
    merged = fuseRetrievalResults(literal, merged, topK, 0.1);
  }

  return trimChunksToCharBudget(merged, analysis.isInstituteLookup ? 80000 : 50000);
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

export function prefersDocEngine(question: string, analysis: QueryAnalysis, topScore: number): boolean {
  if (analysis.isInstituteLookup || analysis.isSeatMatrix) return true;
  if (topScore >= 0.42) return false;
  const q = question.toLowerCase();
  return /institute|college|intake|fee|seat|matrix|cut.?off|merit|allotment|sanctioned|percentile/.test(q);
}

async function tryDocEngine(params: {
  question: string;
  language: Locale;
  plan: DocPlan;
  analysis: QueryAnalysis;
}): Promise<AnswerResult | null> {
  if (!params.plan.active) return null;

  const sources = filterDocSources(params.plan.sources, params.question);
  const scopedPlan: DocPlan = { ...params.plan, sources };

  // Prefer whole_file when only 1–2 matrix docs (model sees every page/table row).
  let mode = scopedPlan.mode;
  if (scopedPlan.sources.length <= 2 && params.analysis.isInstituteLookup) {
    mode = 'whole_file';
  }

  try {
    const docRes = await answerFromDocs({
      question: params.question,
      language: params.language,
      mode,
      sources: scopedPlan.sources,
      vectorStoreId: scopedPlan.vectorStoreId,
      categoryHint: params.analysis.categoryHint,
      retrievalHint: docRetrievalHint(params.analysis),
    });
    if (!docRes.content || isFallbackAnswer(docRes.content)) return null;
    return {
      content: docRes.content,
      language: params.language,
      citations: buildDocCitations(docRes, scopedPlan),
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
 * KB-grounded answer. Seat-matrix / institute-code queries prefer the OpenAI document
 * engine (full PDF page scan); local RAG uses institute-grouped chunks as fallback.
 */
export async function answerQuestion(params: {
  question: string;
  language?: Locale;
  userId?: string | null;
}): Promise<AnswerResult> {
  const { question, userId } = params;
  const { language, englishQuery } = await detectAndTranslate(question);
  const analysis = analyzeQuery(`${question} ${englishQuery}`);
  const plan = getDocPlan();

  // Seat matrix / institute intake → doc engine first (NotebookLM-style full-doc read).
  if (plan.active && (analysis.isInstituteLookup || analysis.isSeatMatrix)) {
    const docAnswer = await tryDocEngine({ question, language, plan, analysis });
    if (docAnswer) return docAnswer;
  }

  const retrieved = await retrieveForQuestion({ englishQuery, language, userId, analysis });
  const topScore = retrieved[0]?.score ?? 0;

  if (retrieved.length > 0) {
    const result = await generateAnswer(englishQuery, retrieved, language, {
      categoryHint: analysis.categoryHint,
    });
    if (!isFallbackAnswer(result.content)) {
      return buildLocalAnswer(language, retrieved, result, false);
    }
  }

  if (plan.active && prefersDocEngine(question, analysis, topScore)) {
    const docAnswer = await tryDocEngine({ question, language, plan, analysis });
    if (docAnswer) return docAnswer;
  }

  if (retrieved.length === 0) {
    const docAnswer = await tryDocEngine({ question, language, plan, analysis });
    if (docAnswer) return docAnswer;
    return fallbackResult(language);
  }

  const result = await generateAnswer(englishQuery, retrieved, language, {
    categoryHint: analysis.categoryHint,
  });
  if (isFallbackAnswer(result.content)) {
    const docAnswer = await tryDocEngine({ question, language, plan, analysis });
    if (docAnswer) return docAnswer;
    return buildLocalAnswer(language, retrieved, result, true);
  }

  return buildLocalAnswer(language, retrieved, result, false);
}

export { analyzeQuery, type QueryAnalysis };
