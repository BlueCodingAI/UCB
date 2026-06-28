import fs from 'node:fs';
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
  type DocAnswerMode,
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
import { tryStructuredInstituteAnswer } from '../../services/capMatrixLookup';
import { effectivePlan } from '../../middleware/auth';
import { db } from '../../db/connection';
import { env, integrations } from '../../config/env';
import { logger } from '../../lib/logger';
import type { CitationDTO, Locale } from '../../types';

/** Max combined PDF bytes to attach all files in context (whole_file mode). */
const WHOLE_FILE_MAX_BYTES = 25 * 1024 * 1024;
const WHOLE_FILE_MAX_DOCS = 8;

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
  mode: DocAnswerMode;
  sources: DocSource[];
  vectorStoreId: string | null;
}

const INACTIVE_PLAN: DocPlan = { active: false, mode: 'file_search', sources: [], vectorStoreId: null };

export function getDocPlan(): DocPlan {
  if (!integrations.openaiDocsEnabled) return INACTIVE_PLAN;
  const rows = db
    .prepare(
      `SELECT d.id AS documentId, d.title AS title, d.openai_file_id AS fileId, d.file_path AS filePath,
              d.source_type AS sourceType
         FROM kb_documents d
        WHERE d.is_active = 1 AND d.deleted_at IS NULL AND d.openai_file_id IS NOT NULL`,
    )
    .all() as Array<{
      documentId: string;
      title: string;
      fileId: string;
      filePath: string | null;
      sourceType: string;
    }>;

  const sources: DocSource[] = rows
    .filter((r) => r.fileId)
    .map((r) => ({ documentId: r.documentId, title: r.title, fileId: r.fileId }));
  if (sources.length === 0) return INACTIVE_PLAN;

  const vectorStoreId = getVectorStoreId();
  let totalPdfBytes = 0;
  for (const r of rows) {
    if (r.sourceType === 'pdf' && r.filePath && fs.existsSync(r.filePath)) {
      totalPdfBytes += fs.statSync(r.filePath).size;
    }
  }

  const useWholeFile =
    sources.length <= WHOLE_FILE_MAX_DOCS &&
    (totalPdfBytes === 0 || totalPdfBytes <= WHOLE_FILE_MAX_BYTES);

  if (useWholeFile) {
    return { active: true, mode: 'whole_file', sources, vectorStoreId };
  }
  if (vectorStoreId) return { active: true, mode: 'file_search', sources, vectorStoreId };
  return INACTIVE_PLAN;
}

/** Pick whole_file (PDFs attached) vs file_search for a scoped set of sources. */
export function resolveDocMode(sources: DocSource[], analysis: QueryAnalysis): DocAnswerMode {
  if (sources.length === 0) return 'file_search';
  if (analysis.isInstituteLookup || analysis.intent === 'seat_matrix') {
    if (sources.length <= WHOLE_FILE_MAX_DOCS) return 'whole_file';
  }
  if (sources.length <= WHOLE_FILE_MAX_DOCS) return 'whole_file';
  return 'file_search';
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

function docRetrievalHint(analysis: QueryAnalysis): string {
  const parts: string[] = [
    'Read the attached PDF(s) completely before answering. For seat-matrix PDFs, scan ALL pages.',
  ];
  if (analysis.instituteCodes.length) {
    parts.push(
      `Find institute code(s) ${analysis.instituteCodes.join(', ')}. List EVERY course/branch with sanctioned intake (SI), MS seats, and category breakdown. Do not stop after the first course.`,
    );
  }
  if (analysis.categoryHint) {
    parts.push(
      `User asked about ${analysis.categoryHint} category — use ${analysis.categoryHint} columns only, not All India/Open unless asked.`,
    );
  }
  if (analysis.districtHint) {
    parts.push(`Focus on ${analysis.districtHint} district if relevant.`);
  }
  return parts.join(' ');
}

export async function tryDocEngine(params: {
  question: string;
  language: Locale;
  plan: DocPlan;
  analysis: QueryAnalysis;
}): Promise<AnswerResult | null> {
  if (!params.plan.active) return null;

  let sources = filterDocSources(params.plan.sources, params.question, params.analysis.intent);
  if (!sources.length) sources = params.plan.sources;

  const mode = resolveDocMode(sources, params.analysis);
  const scopedPlan: DocPlan = { ...params.plan, sources, mode };

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

function buildLocalAnswer(
  language: Locale,
  retrieved: RetrievedChunk[],
  result: { content: string; model: string; promptTokens: number; completionTokens: number },
  isFallback: boolean,
): AnswerResult {
  return {
    content: isFallback ? getFallbackMessage(language) : result.content,
    language,
    citations: isFallback
      ? []
      : retrieved.map((c) => ({
          documentId: c.documentId,
          chunkId: c.chunkId,
          title: c.title,
          sourceLocator: c.sourceLocator,
          score: c.score,
        })),
    isFallback,
    retrievalScore: isFallback ? 0 : retrieved[0]?.score ?? 0,
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    sourceChunks: isFallback
      ? []
      : retrieved.map((c) => ({ chunkId: c.chunkId, documentId: c.documentId, score: c.score })),
  };
}

async function answerQuestionHybrid(params: {
  question: string;
  language: Locale;
  userId?: string | null;
  analysis: QueryAnalysis;
  plan: DocPlan;
}): Promise<AnswerResult> {
  const { question, language, userId, analysis, plan } = params;
  const { englishQuery } = await detectAndTranslate(question);

  if (analysis.instituteCodes.length) {
    const structured = tryStructuredInstituteAnswer({ question, language, analysis });
    if (structured) return structured;
  }

  if (plan.active && analysis.intent === 'seat_matrix' && (analysis.isInstituteLookup || analysis.isSeatMatrix)) {
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

  const docFallback =
    plan.active &&
    (analysis.isInstituteLookup ||
      analysis.isSeatMatrix ||
      topScore < 0.42 ||
      /institute|intake|seat|matrix|cut.?off|sanctioned/i.test(question));
  if (docFallback) {
    const docAnswer = await tryDocEngine({ question, language, plan, analysis });
    if (docAnswer) return docAnswer;
  }

  if (retrieved.length === 0) return fallbackResult(language);

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

/**
 * KB-grounded answer.
 * OPENAI_PDF_ONLY=true (default): OpenAI Responses API reads uploaded PDFs directly.
 * OPENAI_PDF_ONLY=false: hybrid local RAG + structured lookup + doc engine fallback.
 */
export async function answerQuestion(params: {
  question: string;
  language?: Locale;
  userId?: string | null;
}): Promise<AnswerResult> {
  const { question, userId } = params;
  const { language } = await detectAndTranslate(question);
  const analysis = analyzeQuery(question);
  const plan = getDocPlan();

  if (integrations.openaiPdfOnly) {
    if (!plan.active) {
      logger.warn('OPENAI_PDF_ONLY enabled but no OpenAI-uploaded KB documents');
      return fallbackResult(language);
    }
    const docAnswer = await tryDocEngine({ question, language, plan, analysis });
    return docAnswer ?? fallbackResult(language);
  }

  return answerQuestionHybrid({ question, language, userId, analysis, plan });
}

export { analyzeQuery, type QueryAnalysis };
