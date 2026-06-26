import { db } from '../../db/connection';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { Errors } from '../../lib/errors';
import type { Locale } from '../../types';

/** Recommendation wire shape (camelCase) — mirrors frontend Recommendation. */
export interface RecommendationDTO {
  id: string;
  stepType: string;
  title: string;
  description: string | null;
  language: Locale;
  priority: number;
  dueAt: number | null;
  status: 'pending' | 'in_progress' | 'done' | 'dismissed' | 'expired';
  sourceDocumentId: string | null;
}

type RecoStatus = RecommendationDTO['status'];

interface RecoRow {
  id: string;
  user_id: string;
  step_type: string;
  title: string;
  description: string | null;
  language: Locale;
  priority: number;
  due_at: number | null;
  status: RecoStatus;
  source_document_id: string | null;
  generated_by: string;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

/** Ordered CAP stages used for next-step generation (excludes admission_confirmed terminal state). */
const STAGE_ORDER = [
  'registration',
  'document_verification',
  'merit_list',
  'option_form',
  'allotment',
  'reporting',
] as const;
type CapStageStep = (typeof STAGE_ORDER)[number];

/** Helpful EN copy + a topic keyword (used to attach a matching active KB document). */
const STAGE_COPY: Record<CapStageStep, { title: string; description: string; topic: string }> = {
  registration: {
    title: 'Complete your CAP registration',
    description:
      'Register on the official CAP portal, fill in your personal and academic details, and pay the registration fee before the deadline.',
    topic: 'registration',
  },
  document_verification: {
    title: 'Get your documents verified',
    description:
      'Upload and verify your required documents (mark sheets, category certificate, domicile, etc.) so your application is confirmed.',
    topic: 'document_verification',
  },
  merit_list: {
    title: 'Check the provisional merit list',
    description:
      'Review the provisional merit list, confirm your merit number and category, and raise a grievance if anything is incorrect.',
    topic: 'merit_list',
  },
  option_form: {
    title: 'Fill and lock your option form',
    description:
      'Add your preferred colleges and courses in priority order, then lock your option form before the cut-off time.',
    topic: 'option_form',
  },
  allotment: {
    title: 'Review your seat allotment',
    description:
      'Check the allotment result, decide whether to accept, freeze or improve, and proceed as per your CAP round status.',
    topic: 'allotment',
  },
  reporting: {
    title: 'Report to your allotted college',
    description:
      'Confirm your admission by reporting to the allotted institute with the required documents and fees within the reporting window.',
    topic: 'reporting',
  },
};

function mapReco(row: RecoRow): RecommendationDTO {
  return {
    id: row.id,
    stepType: row.step_type,
    title: row.title,
    description: row.description,
    language: row.language,
    priority: row.priority,
    dueAt: row.due_at,
    status: row.status,
    sourceDocumentId: row.source_document_id,
  };
}

/** List a user's recommendations ordered by priority desc, optionally filtered by status. */
export function listRecommendations(userId: string, status?: RecoStatus): RecommendationDTO[] {
  const rows = status
    ? (db
        .prepare(
          `SELECT * FROM recommendations WHERE user_id = ? AND status = ?
           ORDER BY priority DESC, created_at ASC`,
        )
        .all(userId, status) as RecoRow[])
    : (db
        .prepare(
          `SELECT * FROM recommendations WHERE user_id = ?
           ORDER BY priority DESC, created_at ASC`,
        )
        .all(userId) as RecoRow[]);
  return rows.map(mapReco);
}

/** Update the status of a single recommendation step (with owner check). */
export function updateStepStatus(
  userId: string,
  stepId: string,
  status: 'pending' | 'in_progress' | 'done' | 'dismissed',
): RecommendationDTO {
  const row = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(stepId) as RecoRow | undefined;
  if (!row) throw Errors.notFound('Recommendation not found');
  if (row.user_id !== userId) throw Errors.forbidden('You do not own this recommendation');

  const ts = now();
  const completedAt = status === 'done' ? ts : null;
  db.prepare(
    `UPDATE recommendations SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
  ).run(status, completedAt, ts, stepId);

  const updated = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(stepId) as RecoRow;
  return mapReco(updated);
}

interface ProfileStageRow {
  current_stage: string | null;
}
interface UserLangRow {
  preferred_language: Locale;
}

/**
 * Regenerate next-step recommendations from the user's CAP stage.
 * For each stage at/after current_stage with no active recommendation, create one
 * (priority by proximity to the current stage). Dismiss stale recommendations whose
 * stage is already completed (before current_stage). Returns the fresh list.
 */
export function refreshRecommendations(userId: string): RecommendationDTO[] {
  const profile = db
    .prepare('SELECT current_stage FROM user_profiles WHERE user_id = ?')
    .get(userId) as ProfileStageRow | undefined;
  const userRow = db
    .prepare('SELECT preferred_language FROM users WHERE id = ?')
    .get(userId) as UserLangRow | undefined;
  const language: Locale = userRow?.preferred_language ?? 'en';

  // Resolve the starting index in STAGE_ORDER. Unknown/null → start from the beginning.
  // admission_confirmed (terminal) → all CAP stages are behind the user.
  const rawStage = profile?.current_stage ?? null;
  let startIdx: number;
  if (rawStage === 'admission_confirmed') {
    startIdx = STAGE_ORDER.length;
  } else {
    const idx = STAGE_ORDER.indexOf(rawStage as CapStageStep);
    startIdx = idx >= 0 ? idx : 0;
  }

  const ts = now();

  const tx = db.transaction(() => {
    // Active (pending/in_progress) stage-type recommendations for this user.
    const active = db
      .prepare(
        `SELECT * FROM recommendations
         WHERE user_id = ? AND generated_by = 'system'
           AND status IN ('pending','in_progress')`,
      )
      .all(userId) as RecoRow[];
    const activeByStage = new Map<string, RecoRow>();
    for (const r of active) activeByStage.set(r.step_type, r);

    // Dismiss stale ones: active recommendations for a stage already completed
    // (its stage index is before the user's current stage, i.e. < startIdx).
    for (const r of active) {
      const stageIdx = STAGE_ORDER.indexOf(r.step_type as CapStageStep);
      if (stageIdx >= 0 && stageIdx < startIdx) {
        db.prepare(`UPDATE recommendations SET status = 'dismissed', updated_at = ? WHERE id = ?`).run(ts, r.id);
      }
    }

    // For each stage at/after current_stage with no active recommendation, create one.
    for (let i = startIdx; i < STAGE_ORDER.length; i++) {
      const stage = STAGE_ORDER[i];
      if (activeByStage.has(stage)) continue;
      const copy = STAGE_COPY[stage];
      // Priority by proximity: the nearest upcoming stage ranks highest.
      const priority = STAGE_ORDER.length - i;
      const sourceDocumentId = findSourceDocId(copy.topic);
      db.prepare(
        `INSERT INTO recommendations
          (id, user_id, step_type, title, description, language, priority, due_at,
           status, source_document_id, generated_by, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, 'system', NULL, ?, ?)`,
      ).run(newId(), userId, stage, copy.title, copy.description, language, priority, sourceDocumentId, ts, ts);
    }
  });
  tx();

  return listRecommendations(userId);
}

/** Find an active, non-deleted KB document whose topic matches; null if none. */
function findSourceDocId(topic: string): string | null {
  const row = db
    .prepare(
      `SELECT id FROM kb_documents
       WHERE is_active = 1 AND deleted_at IS NULL AND topic = ?
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(topic) as { id: string } | undefined;
  return row?.id ?? null;
}
