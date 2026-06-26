import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../../db/connection';
import { ok } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { mapPlan } from '../../lib/mappers';
import { now } from '../../lib/time';
import { writeAudit } from '../../middleware/audit';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function getPlanRow(code: string): any {
  const row = db.prepare('SELECT * FROM plans WHERE code = ?').get(code) as any;
  if (!row) throw Errors.notFound('Plan not found');
  return row;
}

/** GET /admin/plans — all plans incl. inactive. */
export const list = asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM plans ORDER BY sort_order ASC').all() as any[];
  ok(res, rows.map(mapPlan));
});

// camelCase body field → DB column.
const FIELD_MAP: Record<string, string> = {
  name: 'name',
  description: 'description',
  pricePaise: 'price_paise',
  validityDays: 'validity_days',
  cutoffDate: 'cutoff_date',
  dailyChatLimit: 'daily_chat_limit',
  isActive: 'is_active',
  featProfileMemory: 'feat_profile_memory',
  featNextSteps: 'feat_next_steps',
  featCounsellingAssist: 'feat_counselling_assist',
  featOneToOne: 'feat_one_to_one',
  featInPerson: 'feat_in_person',
  featVoice: 'feat_voice',
};

const BOOL_FIELDS = new Set([
  'isActive',
  'featProfileMemory',
  'featNextSteps',
  'featCounsellingAssist',
  'featOneToOne',
  'featInPerson',
  'featVoice',
]);

/** PUT /admin/plans/:code — update editable plan fields. */
export const update = asyncHandler((req, res) => {
  const code = req.params.code;
  const before = getPlanRow(code);
  const body = req.body as Record<string, unknown>;

  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, col] of Object.entries(FIELD_MAP)) {
    if (!(key in body)) continue;
    let value: unknown = body[key];
    if (BOOL_FIELDS.has(key)) value = value ? 1 : 0;
    sets.push(`${col} = ?`);
    params.push(value == null ? null : (value as string | number));
  }
  if (sets.length === 0) throw Errors.validation('At least one field is required');

  sets.push('updated_at = ?');
  params.push(now());
  params.push(code);

  db.prepare(`UPDATE plans SET ${sets.join(', ')} WHERE code = ?`).run(...params);
  const after = getPlanRow(code);

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'plan.update',
    entityType: 'plan',
    entityId: code,
    before,
    after,
    req,
  });
  ok(res, mapPlan(after));
});
