import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/connection';
import { ok } from '../../lib/response';
import { mapPlan } from '../../lib/mappers';
import { validate } from '../../middleware/validate';
import { env, integrations } from '../../config/env';
import { getFallbackMessage, getSetting } from '../../services/settings';
import { LOCALES, type Locale } from '../../types';

const router = Router();

const langQuery = z.object({ lang: z.enum(['en', 'hi', 'mr']).optional() });

/** Public client bootstrap: plans, languages, flags, fallback strings, Razorpay key. */
router.get('/config', validate({ query: langQuery }), (req, res) => {
  const lang = (req.query.lang as Locale) ?? 'en';
  const plans = (db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order ASC').all() as any[]).map(
    mapPlan,
  );
  ok(res, {
    plans,
    languages: LOCALES,
    featureFlags: {
      voiceEnabled: integrations.sarvamEnabled,
      paymentsEnabled: integrations.razorpayEnabled,
      aiEnabled: integrations.openaiEnabled,
    },
    seasonMode: env.seasonMode,
    fallbackStrings: { kbMiss: getFallbackMessage(lang) },
    razorpayKeyId: env.razorpayKeyId || null,
    officialSourceUrl: 'https://cetcell.mahacet.org',
    currentCapYear: getSetting('current_cap_year', env.currentCapYear),
  });
});

/** Public, read-only feed of active KB notices/circulars/schedules. */
router.get('/notices', validate({ query: langQuery }), (req, res) => {
  const lang = (req.query.lang as Locale) ?? 'en';
  const rows = db
    .prepare(
      `SELECT id, title, description, source_type, language, topic, cap_year, source_url, updated_at
         FROM kb_documents
        WHERE is_active = 1 AND deleted_at IS NULL
          AND source_type IN ('notice','circular','schedule')
          AND (language = ? OR language = 'mixed')
        ORDER BY updated_at DESC
        LIMIT 100`,
    )
    .all(lang) as any[];
  ok(
    res,
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? null,
      sourceType: r.source_type,
      language: r.language,
      topic: r.topic ?? null,
      capYear: r.cap_year ?? null,
      sourceUrl: r.source_url ?? null,
      updatedAt: r.updated_at,
    })),
  );
});

/** Localized fallback / shared strings (admin-editable source). */
router.get('/strings', validate({ query: langQuery }), (req, res) => {
  const lang = (req.query.lang as Locale) ?? 'en';
  ok(res, {
    kbMiss: getFallbackMessage(lang),
    disclaimer: getSetting(`disclaimer_${lang}`, ''),
  });
});

export default router;
