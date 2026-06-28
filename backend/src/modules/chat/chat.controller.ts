import type { Request, Response } from 'express';
import { ok, created, noContent } from '../../lib/response';
import { logger } from '../../lib/logger';
import {
  generateAnswerStream,
  detectAndTranslate,
  answerFromDocsStream,
  type RetrievedChunk,
} from '../../services/openai';
import { getFallbackMessage, isFallbackAnswer } from '../../services/settings';
import { filterDocSources } from '../../services/queryAnalysis';
import { tryStructuredInstituteAnswer } from '../../services/capMatrixLookup';
import { integrations } from '../../config/env';
import {
  answerQuestion,
  getDocPlan,
  buildDocCitations,
  retrieveForQuestion,
  analyzeQuery,
  resolveDocMode,
} from './rag.service';
import {
  listSessions,
  createSession,
  getOwnedSession,
  renameSession,
  deleteSession,
  listMessages,
  insertUserMessage,
  persistAssistantTurn,
  recordFeedback,
  getUsage,
  assertWithinQuota,
} from './chat.service';
import type { CitationDTO, Locale } from '../../types';

// ---- GET /chat/sessions ---------------------------------------------------

export function getSessions(req: Request, res: Response): void {
  const userId = req.auth!.sub;
  ok(res, listSessions(userId));
}

// ---- POST /chat/sessions --------------------------------------------------

export function postSession(req: Request, res: Response): void {
  const userId = req.auth!.sub;
  const { language, channel } = req.body as { language?: Locale; channel?: 'chat' | 'voice' };
  const session = createSession(userId, language ?? 'en', channel ?? 'chat');
  created(res, session);
}

// ---- GET /chat/sessions/:id/messages --------------------------------------

export function getMessages(req: Request, res: Response): void {
  const userId = req.auth!.sub;
  const sessionId = req.params.id;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const cursor = req.query.cursor ? String(req.query.cursor) : null;
  const { messages, nextCursor, hasMore } = listMessages(sessionId, userId, limit, cursor);
  ok(res, messages, { pagination: { nextCursor, hasMore, limit } });
}

// ---- POST /chat/sessions/:id/messages -------------------------------------

export async function postMessage(req: Request, res: Response): Promise<void> {
  const userId = req.auth!.sub;
  const sessionId = req.params.id;
  const { content, inputMode } = req.body as {
    content: string;
    inputMode?: 'text' | 'voice';
  };

  const session = getOwnedSession(sessionId, userId); // owner check
  assertWithinQuota(userId);

  // Language is auto-detected from the question; the answer comes back in it.
  const answer = await answerQuestion({ question: content, userId });

  const userMessage = insertUserMessage({
    sessionId,
    userId,
    content,
    language: answer.language,
    inputMode: inputMode ?? 'text',
  });

  const assistantMessage = persistAssistantTurn({
    sessionId,
    userId,
    content: answer.content,
    language: answer.language,
    isGrounded: !answer.isFallback,
    isFallback: answer.isFallback,
    citations: answer.citations,
    retrievalScore: answer.retrievalScore,
    model: answer.model,
    promptTokens: answer.promptTokens,
    completionTokens: answer.completionTokens,
    sourceChunks: answer.sourceChunks,
    firstUserContent: session.title ? '' : content,
  });

  ok(res, { userMessage, assistantMessage });
}

// ---- POST /chat/sessions/:id/messages/stream (SSE) ------------------------

export async function streamMessage(req: Request, res: Response): Promise<void> {
  const userId = req.auth!.sub;
  const sessionId = req.params.id;
  const { content, inputMode } = req.body as {
    content: string;
    inputMode?: 'text' | 'voice';
  };

  const session = getOwnedSession(sessionId, userId); // owner check
  assertWithinQuota(userId);

  // Auto-detect the question language; retrieve in English, answer in that language.
  const { language, englishQuery } = await detectAndTranslate(content);

  insertUserMessage({ sessionId, userId, content, language, inputMode: inputMode ?? 'text' });

  // SSE headers.
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (payload: unknown): void => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const analysis = analyzeQuery(content);
    const plan = getDocPlan();
    let sources = filterDocSources(plan.sources, content, analysis.intent);
    if (!sources.length) sources = plan.sources;
    const docMode = resolveDocMode(sources, analysis);

    const streamDocEngine = async (): Promise<boolean> => {
      if (!plan.active) return false;
      let sentAny = false;
      try {
        const hintParts: string[] = [
          'Read the attached PDF(s) completely. For seat-matrix PDFs, scan ALL pages.',
        ];
        if (analysis.instituteCodes.length) {
          hintParts.push(
            `List ALL courses and sanctioned intake for institute code(s) ${analysis.instituteCodes.join(', ')} across ALL pages.`,
          );
        }
        if (analysis.categoryHint) {
          hintParts.push(`Use ${analysis.categoryHint} category data only.`);
        }

        const gen = answerFromDocsStream({
          question: content,
          language,
          mode: docMode,
          sources,
          vectorStoreId: plan.vectorStoreId,
          categoryHint: analysis.categoryHint,
          retrievalHint: hintParts.join(' '),
        });
        let fullText = '';
        let next = await gen.next();
        while (!next.done) {
          sentAny = true;
          fullText += next.value;
          send({ delta: next.value });
          next = await gen.next();
        }
        const r = next.value;
        fullText = r.content || fullText;

        if (!fullText || isFallbackAnswer(fullText)) return false;

        const scopedPlan = { ...plan, sources, mode: docMode };
        const assistantMessage = persistAssistantTurn({
          sessionId,
          userId,
          content: fullText,
          language,
          isGrounded: true,
          isFallback: false,
          citations: buildDocCitations(r, scopedPlan),
          retrievalScore: 1,
          model: r.model,
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
          sourceChunks: [],
          firstUserContent: session.title ? '' : content,
        });
        send({ done: true, message: assistantMessage });
        res.end();
        return true;
      } catch (err) {
        logger.error({ err, sessionId }, 'doc engine stream failed');
        if (sentAny) {
          send({ error: 'stream_failed' });
          res.end();
          return true;
        }
        return false;
      }
    };

    const streamLocal = async (chunks: RetrievedChunk[]): Promise<void> => {
      let fullText = '';
      let model = 'fallback';
      let promptTokens = 0;
      let completionTokens = 0;
      let isFallback = false;
      let citations: CitationDTO[] = [];
      let sourceChunks: { chunkId: string; documentId: string; score: number }[] = [];
      let retrievalScore = 0;

      if (chunks.length === 0) {
        isFallback = true;
        fullText = getFallbackMessage(language);
        send({ delta: fullText });
      } else {
        retrievalScore = chunks[0].score;
        citations = chunks.map((c) => ({
          documentId: c.documentId,
          chunkId: c.chunkId,
          title: c.title,
          sourceLocator: c.sourceLocator,
          score: c.score,
        }));
        sourceChunks = chunks.map((c) => ({
          chunkId: c.chunkId,
          documentId: c.documentId,
          score: c.score,
        }));

        const gen = generateAnswerStream(englishQuery, chunks, language, {
          categoryHint: analysis.categoryHint,
        });
        let next = await gen.next();
        while (!next.done) {
          fullText += next.value;
          send({ delta: next.value });
          next = await gen.next();
        }
        const result = next.value;
        fullText = result.content || fullText;
        model = result.model;
        promptTokens = result.promptTokens;
        completionTokens = result.completionTokens;

        if (isFallbackAnswer(fullText)) {
          isFallback = true;
          fullText = getFallbackMessage(language);
          citations = [];
          sourceChunks = [];
          retrievalScore = 0;
        }
      }

      const assistantMessage = persistAssistantTurn({
        sessionId,
        userId,
        content: fullText,
        language,
        isGrounded: !isFallback,
        isFallback,
        citations,
        retrievalScore,
        model,
        promptTokens,
        completionTokens,
        sourceChunks,
        firstUserContent: session.title ? '' : content,
      });
      send({ done: true, message: assistantMessage });
      res.end();
    };

    // PDF-only mode: OpenAI reads uploaded PDFs directly (no local RAG).
    if (integrations.openaiPdfOnly) {
      if (await streamDocEngine()) return;
      const fb = getFallbackMessage(language);
      send({ delta: fb });
      const assistantMessage = persistAssistantTurn({
        sessionId,
        userId,
        content: fb,
        language,
        isGrounded: false,
        isFallback: true,
        citations: [],
        retrievalScore: 0,
        model: 'fallback',
        promptTokens: 0,
        completionTokens: 0,
        sourceChunks: [],
        firstUserContent: session.title ? '' : content,
      });
      send({ done: true, message: assistantMessage });
      res.end();
      return;
    }

    const streamStructuredInstitute = (): boolean => {
      if (!analysis.instituteCodes.length) return false;
      const structured = tryStructuredInstituteAnswer({ question: content, language, analysis });
      if (!structured) return false;

      send({ delta: structured.content });
      const assistantMessage = persistAssistantTurn({
        sessionId,
        userId,
        content: structured.content,
        language,
        isGrounded: true,
        isFallback: false,
        citations: structured.citations,
        retrievalScore: structured.retrievalScore,
        model: structured.model,
        promptTokens: structured.promptTokens,
        completionTokens: structured.completionTokens,
        sourceChunks: structured.sourceChunks,
        firstUserContent: session.title ? '' : content,
      });
      send({ done: true, message: assistantMessage });
      res.end();
      return true;
    };

    if (streamStructuredInstitute()) return;

    if (plan.active && analysis.intent === 'seat_matrix' && (analysis.isInstituteLookup || analysis.isSeatMatrix)) {
      if (await streamDocEngine()) return;
    }

    const retrieved = await retrieveForQuestion({
      englishQuery,
      language,
      userId,
      analysis,
    });

    if (retrieved.length > 0) {
      let fullText = '';
      const gen = generateAnswerStream(englishQuery, retrieved, language, {
        categoryHint: analysis.categoryHint,
      });
      let next = await gen.next();
      while (!next.done) {
        fullText += next.value;
        send({ delta: next.value });
        next = await gen.next();
      }
      const result = next.value;
      fullText = result.content || fullText;
      if (!isFallbackAnswer(fullText)) {
        const assistantMessage = persistAssistantTurn({
          sessionId,
          userId,
          content: fullText,
          language,
          isGrounded: true,
          isFallback: false,
          citations: retrieved.map((c) => ({
            documentId: c.documentId,
            chunkId: c.chunkId,
            title: c.title,
            sourceLocator: c.sourceLocator,
            score: c.score,
          })),
          retrievalScore: retrieved[0]?.score ?? 0,
          model: result.model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          sourceChunks: retrieved.map((c) => ({
            chunkId: c.chunkId,
            documentId: c.documentId,
            score: c.score,
          })),
          firstUserContent: session.title ? '' : content,
        });
        send({ done: true, message: assistantMessage });
        res.end();
        return;
      }
    }

    if (await streamDocEngine()) return;

    if (retrieved.length === 0) {
      await streamLocal([]);
      return;
    }

    await streamLocal(retrieved);
  } catch (err) {
    logger.error({ err, sessionId }, 'chat stream failed');
    // Best-effort error event; headers already sent so we cannot use the
    // central error handler.
    try {
      send({ error: 'stream_failed' });
    } catch {
      /* ignore */
    }
    res.end();
  }
}

// ---- PATCH /chat/sessions/:id ---------------------------------------------

export function patchSession(req: Request, res: Response): void {
  const userId = req.auth!.sub;
  const { title } = req.body as { title: string };
  ok(res, renameSession(req.params.id, userId, title));
}

// ---- DELETE /chat/sessions/:id --------------------------------------------

export function removeSession(req: Request, res: Response): void {
  const userId = req.auth!.sub;
  deleteSession(req.params.id, userId);
  noContent(res);
}

// ---- POST /chat/messages/:msgId/feedback ----------------------------------

export function postFeedback(req: Request, res: Response): void {
  const userId = req.auth!.sub;
  const { helpful } = req.body as { helpful: boolean };
  recordFeedback(req.params.msgId, userId, helpful);
  noContent(res);
}

// ---- GET /chat/usage ------------------------------------------------------

export function getUsageController(req: Request, res: Response): void {
  ok(res, getUsage(req.auth!.sub));
}
