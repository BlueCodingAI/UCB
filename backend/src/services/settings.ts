import { db } from '../db/connection';
import { now } from '../lib/time';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import type { Locale } from '../types';

/** Read a JSON app_setting by key, with a typed fallback. */
export function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key) as
    | { value_json: string }
    | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown, description?: string, updatedBy?: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value_json, description, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
       description = COALESCE(excluded.description, app_settings.description),
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), description ?? null, updatedBy ?? null, now());
}

export const FALLBACK_DEFAULTS: Record<Locale, string> = {
  en: 'This information is not available in the current knowledge base. Please check the official CET Cell / CAP website or contact support.',
  hi: 'यह जानकारी वर्तमान नॉलेज बेस में उपलब्ध नहीं है। कृपया आधिकारिक CET Cell / CAP वेबसाइट देखें या सपोर्ट से संपर्क करें।',
  mr: 'ही माहिती सध्याच्या नॉलेज बेसमध्ये उपलब्ध नाही. कृपया अधिकृत CET Cell / CAP वेबसाइट पाहा किंवा सपोर्टशी संपर्क साधा.',
};

/** The mandated KB-miss fallback message in the requested language. */
export function getFallbackMessage(lang: Locale): string {
  return getSetting(`fallback_message_${lang}`, FALLBACK_DEFAULTS[lang]);
}

export function getRagTopK(): number {
  return getSetting('rag_top_k', env.ragTopK);
}

export function getRagMinScore(): number {
  return getSetting('rag_min_score', env.ragMinScore);
}

/**
 * One-time reconciliation of the DB-persisted RAG tuning so improved defaults
 * reach EXISTING databases (getRagMinScore/getRagTopK read app_settings first,
 * so changing env defaults alone would not affect a system that has already been
 * seeded). Versioned + idempotent: it applies once, then leaves admin overrides
 * untouched forever after. Called on boot.
 */
export function reconcileRagDefaults(): void {
  const VERSION_KEY = 'rag_tuning_version';
  const TARGET = 2;
  if (getSetting<number>(VERSION_KEY, 0) >= TARGET) return;
  setSetting('rag_min_score', env.ragMinScore, 'Minimum hybrid relevance score');
  setSetting('rag_top_k', env.ragTopK, 'Top-K chunks for retrieval');
  setSetting(VERSION_KEY, TARGET, 'RAG tuning defaults version (auto-applied on boot)');
  logger.info(
    { ragMinScore: env.ragMinScore, ragTopK: env.ragTopK },
    'rag tuning defaults reconciled',
  );
}

/**
 * True only when an LLM reply IS (essentially) the KB-miss fallback sentence —
 * i.e. the model declined for lack of context. We must NOT misclassify a real,
 * grounded answer that merely *mentions* something is missing (the old 28-char
 * prefix check did exactly that and silently discarded good answers). So we match
 * the fallback verbatim, or a reply that is just the fallback plus trivial trailing
 * text (length guard); a substantive answer always passes through.
 */
export function isFallbackAnswer(content: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const c = norm(content);
  if (!c) return true;
  return (['en', 'hi', 'mr'] as Locale[]).some((l) => {
    const fb = norm(getFallbackMessage(l));
    if (!fb) return false;
    if (c === fb) return true;
    return c.startsWith(fb) && c.length <= Math.ceil(fb.length * 1.15);
  });
}
