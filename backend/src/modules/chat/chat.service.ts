import { db } from '../../db/connection';
import { Errors } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { now, istDateKey } from '../../lib/time';
import { effectivePlan } from '../../middleware/auth';
import { writeAudit } from '../../middleware/audit';
import type { ChatMessageDTO, ChatSessionDTO, CitationDTO, Locale } from '../../types';

// ---- row shapes -----------------------------------------------------------

interface SessionRow {
  id: string;
  user_id: string | null;
  title: string | null;
  language: string;
  channel: string;
  message_count: number;
  last_message_at: number | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  user_id: string | null;
  role: string;
  content: string;
  language: string;
  input_mode: string;
  is_grounded: number;
  is_fallback: number;
  citations_json: string;
  retrieval_score: number | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: number;
}

// ---- mappers --------------------------------------------------------------

export function mapSession(r: SessionRow): ChatSessionDTO {
  return {
    id: r.id,
    title: r.title,
    language: r.language as Locale,
    channel: r.channel as 'chat' | 'voice',
    messageCount: r.message_count,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
  };
}

export function mapMessage(r: MessageRow): ChatMessageDTO {
  let citations: CitationDTO[] = [];
  try {
    citations = JSON.parse(r.citations_json) as CitationDTO[];
  } catch {
    citations = [];
  }
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role as 'user' | 'assistant' | 'system',
    content: r.content,
    language: r.language as Locale,
    inputMode: r.input_mode as 'text' | 'voice',
    isGrounded: r.is_grounded === 1,
    isFallback: r.is_fallback === 1,
    citations,
    createdAt: r.created_at,
  };
}

// ---- sessions -------------------------------------------------------------

export function listSessions(userId: string): ChatSessionDTO[] {
  const rows = db
    .prepare(
      `SELECT * FROM chat_sessions
        WHERE user_id = ?
        ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC`,
    )
    .all(userId) as SessionRow[];
  return rows.map(mapSession);
}

export function createSession(
  userId: string,
  language: Locale,
  channel: 'chat' | 'voice' = 'chat',
): ChatSessionDTO {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO chat_sessions (id, user_id, title, language, channel, message_count, last_message_at, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, 0, NULL, ?, ?)`,
  ).run(id, userId, language, channel, ts, ts);
  return mapSession(getSessionRowOrThrow(id, userId));
}

function getSessionRowOrThrow(sessionId: string, userId: string): SessionRow {
  const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId) as
    | SessionRow
    | undefined;
  if (!row) throw Errors.notFound('Chat session not found');
  if (row.user_id !== userId) throw Errors.forbidden('You do not own this chat session');
  return row;
}

/** Owner-checked fetch (throws not_found / forbidden). */
export function getOwnedSession(sessionId: string, userId: string): ChatSessionDTO {
  return mapSession(getSessionRowOrThrow(sessionId, userId));
}

export function renameSession(sessionId: string, userId: string, title: string): ChatSessionDTO {
  getSessionRowOrThrow(sessionId, userId);
  db.prepare('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?').run(
    title,
    now(),
    sessionId,
  );
  return mapSession(getSessionRowOrThrow(sessionId, userId));
}

export function deleteSession(sessionId: string, userId: string): void {
  getSessionRowOrThrow(sessionId, userId);
  db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId);
}

// ---- messages -------------------------------------------------------------

export function listMessages(
  sessionId: string,
  userId: string,
  limit: number,
  cursor: string | null,
): { messages: ChatMessageDTO[]; nextCursor: string | null; hasMore: boolean } {
  getSessionRowOrThrow(sessionId, userId);
  // Ascending feed; cursor is the last seen message id (ULID, sortable).
  const params: unknown[] = [sessionId];
  let where = 'session_id = ?';
  if (cursor) {
    where += ' AND id > ?';
    params.push(cursor);
  }
  const rows = db
    .prepare(`SELECT * FROM chat_messages WHERE ${where} ORDER BY id ASC LIMIT ?`)
    .all(...params, limit + 1) as MessageRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  return { messages: page.map(mapMessage), nextCursor, hasMore };
}

export interface AssistantPersistInput {
  sessionId: string;
  userId: string;
  content: string;
  language: Locale;
  isGrounded: boolean;
  isFallback: boolean;
  citations: CitationDTO[];
  retrievalScore: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  sourceChunks: { chunkId: string; documentId: string; score: number }[];
  /** First user message text — used to auto-title an untitled session. */
  firstUserContent: string;
}

export function insertUserMessage(input: {
  sessionId: string;
  userId: string;
  content: string;
  language: Locale;
  inputMode: 'text' | 'voice';
}): ChatMessageDTO {
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO chat_messages
       (id, session_id, user_id, role, content, language, input_mode, is_grounded, is_fallback, citations_json, created_at)
     VALUES (?, ?, ?, 'user', ?, ?, ?, 1, 0, '[]', ?)`,
  ).run(id, input.sessionId, input.userId, input.content, input.language, input.inputMode, ts);
  return mapMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as MessageRow);
}

/**
 * Persist the assistant reply + its source rows, bump the session counters,
 * auto-title from the first user message, and increment today's usage — all
 * in a single transaction. Returns the assistant ChatMessageDTO.
 */
export function persistAssistantTurn(input: AssistantPersistInput): ChatMessageDTO {
  const assistantId = newId();
  const ts = now();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO chat_messages
         (id, session_id, user_id, role, content, language, input_mode, is_grounded, is_fallback,
          citations_json, retrieval_score, model, prompt_tokens, completion_tokens, created_at)
       VALUES (?, ?, ?, 'assistant', ?, ?, 'text', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      assistantId,
      input.sessionId,
      input.userId,
      input.content,
      input.language,
      input.isGrounded ? 1 : 0,
      input.isFallback ? 1 : 0,
      JSON.stringify(input.citations),
      input.retrievalScore,
      input.model,
      input.promptTokens,
      input.completionTokens,
      ts,
    );

    const srcStmt = db.prepare(
      `INSERT OR IGNORE INTO chat_message_sources (message_id, chunk_id, document_id, score, rank)
       VALUES (?, ?, ?, ?, ?)`,
    );
    input.sourceChunks.forEach((s, i) => {
      srcStmt.run(assistantId, s.chunkId, s.documentId, s.score, i + 1);
    });

    // Bump session: +2 messages (user + assistant), refresh last_message_at,
    // and auto-title from the first user message if still untitled.
    db.prepare(
      `UPDATE chat_sessions
          SET message_count = message_count + 2,
              last_message_at = ?,
              updated_at = ?,
              title = CASE WHEN title IS NULL OR title = '' THEN ? ELSE title END
        WHERE id = ?`,
    ).run(ts, ts, autoTitle(input.firstUserContent), input.sessionId);

    incrementUsageTx(input.userId, ts);
  });
  tx();

  return mapMessage(
    db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(assistantId) as MessageRow,
  );
}

function autoTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}

function incrementUsageTx(userId: string, ts: number): void {
  const dateKey = istDateKey(ts);
  db.prepare(
    `INSERT INTO chat_usage_daily (user_id, usage_date, chat_count, voice_count, updated_at)
     VALUES (?, ?, 1, 0, ?)
     ON CONFLICT(user_id, usage_date)
     DO UPDATE SET chat_count = chat_count + 1, updated_at = excluded.updated_at`,
  ).run(userId, dateKey, ts);
}

// ---- feedback -------------------------------------------------------------

/**
 * Record thumbs up/down on an assistant message. The chat_messages table has
 * no dedicated feedback column, so we persist it durably in the audit log
 * (actor = the owning user, entity = the message).
 */
export function recordFeedback(msgId: string, userId: string, helpful: boolean): void {
  const row = db
    .prepare('SELECT session_id, user_id FROM chat_messages WHERE id = ?')
    .get(msgId) as { session_id: string; user_id: string | null } | undefined;
  if (!row) throw Errors.notFound('Message not found');
  // Owner check: the user_id on assistant rows is the same user who chatted.
  if (row.user_id !== userId) {
    const sess = db
      .prepare('SELECT user_id FROM chat_sessions WHERE id = ?')
      .get(row.session_id) as { user_id: string | null } | undefined;
    if (!sess || sess.user_id !== userId) throw Errors.forbidden('You do not own this message');
  }
  writeAudit({
    actorType: 'user',
    actorId: userId,
    action: 'chat.message.feedback',
    entityType: 'chat_message',
    entityId: msgId,
    after: { helpful },
  });
}

// ---- quota ----------------------------------------------------------------

export interface UsageInfo {
  used: number;
  limit: number | null;
  remaining: number | null;
  date: string;
}

interface PlanLimitRow {
  daily_chat_limit: number | null;
}

export function getDailyLimit(userId: string): number | null {
  const plan = effectivePlan(userId);
  const row = db
    .prepare('SELECT daily_chat_limit FROM plans WHERE code = ?')
    .get(plan) as PlanLimitRow | undefined;
  return row ? row.daily_chat_limit : null;
}

export function getUsedToday(userId: string, ts: number = now()): number {
  const dateKey = istDateKey(ts);
  const row = db
    .prepare('SELECT chat_count FROM chat_usage_daily WHERE user_id = ? AND usage_date = ?')
    .get(userId, dateKey) as { chat_count: number } | undefined;
  return row?.chat_count ?? 0;
}

export function getUsage(userId: string): UsageInfo {
  const ts = now();
  const limit = getDailyLimit(userId);
  const used = getUsedToday(userId, ts);
  return {
    used,
    limit,
    remaining: limit == null ? null : Math.max(0, limit - used),
    date: istDateKey(ts),
  };
}

/** Throw rate_limited (429) if the user has hit today's chat quota. */
export function assertWithinQuota(userId: string): void {
  const limit = getDailyLimit(userId);
  if (limit == null) return; // unlimited
  const used = getUsedToday(userId);
  if (used >= limit) {
    throw Errors.rateLimited(
      `You have reached today's chat limit of ${limit}. Upgrade your plan for more.`,
    );
  }
}
