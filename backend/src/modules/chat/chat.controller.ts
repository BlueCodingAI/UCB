import type { Request, Response } from 'express';
import { ok, created, noContent } from '../../lib/response';
import { logger } from '../../lib/logger';
import { embed, generateAnswerStream, detectAndTranslate, type RetrievedChunk } from '../../services/openai';
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
import { answerQuestion } from './rag.service';
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

interface ProfileRow {
  course_interest: string | null;
}

function resolveCourse(userId: string): string | null {
  if (effectivePlan(userId) === 'freemium') return null;
  const row = db
    .prepare('SELECT course_interest FROM user_profiles WHERE user_id = ?')
    .get(userId) as ProfileRow | undefined;
  return row?.course_interest ?? null;
}

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
    // Retrieve once (mirrors rag.service path so streaming + persistence agree).
    const queryVec = await embed(englishQuery);
    const retrieved: RetrievedChunk[] = retrieve(queryVec, englishQuery, {
      language,
      course: resolveCourse(userId),
      capYear: getSetting<number>('current_cap_year', env.currentCapYear),
      topK: getRagTopK(),
      minScore: getRagMinScore(),
    });

    let fullText = '';
    let model = 'fallback';
    let promptTokens = 0;
    let completionTokens = 0;
    let isFallback: boolean;
    let citations: CitationDTO[] = [];
    let sourceChunks: { chunkId: string; documentId: string; score: number }[] = [];
    let retrievalScore = 0;

    if (retrieved.length === 0) {
      // KB miss: stream the fixed fallback string, no LLM call.
      isFallback = true;
      fullText = getFallbackMessage(language);
      send({ delta: fullText });
    } else {
      isFallback = false;
      retrievalScore = retrieved[0].score;
      citations = retrieved.map((c) => ({
        documentId: c.documentId,
        chunkId: c.chunkId,
        title: c.title,
        sourceLocator: c.sourceLocator,
        score: c.score,
      }));
      sourceChunks = retrieved.map((c) => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        score: c.score,
      }));
      // Generate against the English-normalised query (EN-parity), answer in language.
      const gen = generateAnswerStream(englishQuery, retrieved, language);
      let next = await gen.next();
      while (!next.done) {
        const delta = next.value;
        fullText += delta;
        send({ delta });
        next = await gen.next();
      }
      const result = next.value;
      fullText = result.content || fullText;
      model = result.model;
      promptTokens = result.promptTokens;
      completionTokens = result.completionTokens;

      // If the model emitted the KB-miss fallback, flag it as a fallback turn.
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
