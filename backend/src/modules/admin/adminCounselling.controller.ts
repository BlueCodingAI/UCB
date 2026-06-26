import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../../db/connection';
import { ok, created, noContent } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { parseOffset, offsetMeta } from '../../lib/paginate';
import { writeAudit } from '../../middleware/audit';
import { createNotification } from '../notifications/notifications.service';
import type { Locale } from '../../types';
import type { UpdateRequestInput, AddNoteInput, CreateSlotInput } from './adminCounselling.schema';

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

interface RequestRow {
  id: string;
  user_id: string;
  type: string;
  topic: string | null;
  message: string | null;
  preferred_language: string;
  preferred_mode: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: number | null;
  created_at: number;
  updated_at: number;
  user_full_name: string | null;
  user_email: string | null;
}

function mapRequest(r: RequestRow) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_full_name ?? null,
    userEmail: r.user_email ?? null,
    type: r.type,
    topic: r.topic ?? null,
    message: r.message ?? null,
    preferredLanguage: r.preferred_language,
    preferredMode: r.preferred_mode ?? null,
    status: r.status,
    priority: r.priority,
    assignedTo: r.assigned_to ?? null,
    resolutionNotes: r.resolution_notes ?? null,
    resolvedAt: r.resolved_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const REQ_SORT: Record<string, string> = {
  createdAt: 'cr.created_at',
  updatedAt: 'cr.updated_at',
  priority: 'cr.priority',
  status: 'cr.status',
};

/** GET /requests — paginated list with user name, filters status/priority/assignedTo. */
export const listRequests = asyncHandler(async (req, res) => {
  const { page, pageSize, offset, sort, order, q, filters } = parseOffset(req, { sort: 'createdAt' });
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    where.push('cr.status = ?');
    params.push(filters.status);
  }
  if (filters.priority) {
    where.push('cr.priority = ?');
    params.push(filters.priority);
  }
  if (filters.assignedTo) {
    where.push('cr.assigned_to = ?');
    params.push(filters.assignedTo);
  }
  if (q) {
    where.push('(cr.topic LIKE ? OR cr.message LIKE ? OR u.full_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortCol = REQ_SORT[sort] ?? 'cr.created_at';

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM counselling_requests cr LEFT JOIN users u ON u.id = cr.user_id ${whereSql}`)
      .get(...params) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT cr.*, u.full_name AS user_full_name, u.email AS user_email
         FROM counselling_requests cr
         LEFT JOIN users u ON u.id = cr.user_id
         ${whereSql}
         ORDER BY ${sortCol} ${order.toUpperCase()}
         LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as RequestRow[];

  ok(res, rows.map(mapRequest), { pagination: offsetMeta(page, pageSize, total) });
});

function getRequestRow(id: string): RequestRow | undefined {
  return db
    .prepare(
      `SELECT cr.*, u.full_name AS user_full_name, u.email AS user_email
         FROM counselling_requests cr
         LEFT JOIN users u ON u.id = cr.user_id
         WHERE cr.id = ?`,
    )
    .get(id) as RequestRow | undefined;
}

/** PATCH /requests/:id — update status/priority/assigned_to/resolution_notes. */
export const updateRequest = asyncHandler(async (req, res) => {
  const before = getRequestRow(req.params.id);
  if (!before) throw Errors.notFound('Counselling request not found');
  const input = req.body as UpdateRequestInput;

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.status !== undefined) {
    sets.push('status = ?');
    params.push(input.status);
    if (input.status === 'resolved' || input.status === 'closed') {
      sets.push('resolved_at = ?');
      params.push(now());
    }
  }
  if (input.priority !== undefined) {
    sets.push('priority = ?');
    params.push(input.priority);
  }
  if (input.assignedTo !== undefined) {
    sets.push('assigned_to = ?');
    params.push(input.assignedTo);
  }
  if (input.resolutionNotes !== undefined) {
    sets.push('resolution_notes = ?');
    params.push(input.resolutionNotes);
  }
  sets.push('updated_at = ?');
  params.push(now());
  params.push(req.params.id);

  db.prepare(`UPDATE counselling_requests SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'counselling.request.update',
    entityType: 'counselling_request',
    entityId: req.params.id,
    before: { status: before.status, priority: before.priority, assignedTo: before.assigned_to },
    after: { status: input.status, priority: input.priority, assignedTo: input.assignedTo },
    req,
  });

  ok(res, mapRequest(getRequestRow(req.params.id)!));
});

/** POST /requests/:id/notes — add an internal note; optionally notify the user. */
export const addRequestNote = asyncHandler(async (req, res) => {
  const reqRow = getRequestRow(req.params.id);
  if (!reqRow) throw Errors.notFound('Counselling request not found');
  const input = req.body as AddNoteInput;

  const noteId = newId();
  db.prepare(
    `INSERT INTO counselling_notes (id, request_id, appointment_id, author_admin_id, note, created_at)
     VALUES (?, ?, NULL, ?, ?, ?)`,
  ).run(noteId, req.params.id, req.auth?.sub ?? null, input.note, now());

  let notificationId: string | null = null;
  if (input.notifyUser) {
    notificationId = createNotification({
      userId: reqRow.user_id,
      type: 'counselling',
      title: input.notificationTitle ?? 'Update on your counselling request',
      body: input.notificationBody ?? input.note,
      language: reqRow.preferred_language as Locale,
      relatedEntityType: 'counselling_request',
      relatedEntityId: req.params.id,
    });
  }

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'counselling.request.note',
    entityType: 'counselling_request',
    entityId: req.params.id,
    after: { noteId, notified: !!notificationId },
    req,
  });

  created(res, {
    id: noteId,
    requestId: req.params.id,
    note: input.note,
    authorAdminId: req.auth?.sub ?? null,
    notificationId,
    createdAt: now(),
  });
});

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

interface SlotRow {
  id: string;
  counsellor_id: string | null;
  mode: string;
  start_at: number;
  end_at: number | null;
  location: string | null;
  meeting_link: string | null;
  capacity: number;
  booked_count: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

function mapSlot(r: SlotRow) {
  return {
    id: r.id,
    counsellorId: r.counsellor_id ?? null,
    mode: r.mode,
    startAt: r.start_at,
    endAt: r.end_at ?? null,
    location: r.location ?? null,
    meetingLink: r.meeting_link ?? null,
    capacity: r.capacity,
    bookedCount: r.booked_count,
    isActive: !!r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** POST /slots — publish a bookable slot (counsellorId defaults to caller). */
export const createSlot = asyncHandler(async (req, res) => {
  const input = req.body as CreateSlotInput;
  const id = newId();
  const ts = now();
  const counsellorId = input.counsellorId ?? req.auth?.sub ?? null;

  db.prepare(
    `INSERT INTO counselling_slots
       (id, counsellor_id, mode, start_at, end_at, location, meeting_link, capacity, booked_count, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
  ).run(
    id,
    counsellorId,
    input.mode,
    input.startAt,
    input.endAt ?? null,
    input.location ?? null,
    input.meetingLink ?? null,
    input.capacity ?? 1,
    ts,
    ts,
  );

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'counselling.slot.create',
    entityType: 'counselling_slot',
    entityId: id,
    after: { mode: input.mode, startAt: input.startAt },
    req,
  });

  const row = db.prepare('SELECT * FROM counselling_slots WHERE id = ?').get(id) as SlotRow;
  created(res, mapSlot(row));
});

/** GET /slots — list upcoming active slots. */
export const listSlots = asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = parseOffset(req, { sort: 'startAt' });
  const ts = now();

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM counselling_slots WHERE is_active = 1 AND start_at >= ?`)
      .get(ts) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT * FROM counselling_slots
         WHERE is_active = 1 AND start_at >= ?
         ORDER BY start_at ASC
         LIMIT ? OFFSET ?`,
    )
    .all(ts, pageSize, offset) as SlotRow[];

  ok(res, rows.map(mapSlot), { pagination: offsetMeta(page, pageSize, total) });
});

/** DELETE /slots/:id — deactivate a slot (soft). */
export const deleteSlot = asyncHandler(async (req, res) => {
  const row = db.prepare('SELECT * FROM counselling_slots WHERE id = ?').get(req.params.id) as SlotRow | undefined;
  if (!row) throw Errors.notFound('Slot not found');

  db.prepare('UPDATE counselling_slots SET is_active = 0, updated_at = ? WHERE id = ?').run(now(), row.id);

  writeAudit({
    actorType: 'admin',
    actorId: req.auth?.sub ?? null,
    action: 'counselling.slot.deactivate',
    entityType: 'counselling_slot',
    entityId: row.id,
    req,
  });

  noContent(res);
});

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

interface AppointmentRow {
  id: string;
  request_id: string | null;
  user_id: string;
  counsellor_id: string | null;
  mode: string;
  scheduled_start: number;
  scheduled_end: number | null;
  location: string | null;
  meeting_link: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  user_full_name: string | null;
  user_email: string | null;
}

function mapAppointment(r: AppointmentRow) {
  return {
    id: r.id,
    requestId: r.request_id ?? null,
    userId: r.user_id,
    userName: r.user_full_name ?? null,
    userEmail: r.user_email ?? null,
    counsellorId: r.counsellor_id ?? null,
    mode: r.mode,
    scheduledStart: r.scheduled_start,
    scheduledEnd: r.scheduled_end ?? null,
    location: r.location ?? null,
    meetingLink: r.meeting_link ?? null,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const APPT_SORT: Record<string, string> = {
  createdAt: 'a.created_at',
  scheduledStart: 'a.scheduled_start',
  status: 'a.status',
};

/** GET /appointments — paginated appointments, filters counsellor/status, join user. */
export const listAppointments = asyncHandler(async (req, res) => {
  const { page, pageSize, offset, sort, order, filters } = parseOffset(req, { sort: 'scheduledStart' });
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.counsellor) {
    where.push('a.counsellor_id = ?');
    params.push(filters.counsellor);
  }
  if (filters.status) {
    where.push('a.status = ?');
    params.push(filters.status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortCol = APPT_SORT[sort] ?? 'a.scheduled_start';

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM counselling_appointments a LEFT JOIN users u ON u.id = a.user_id ${whereSql}`,
      )
      .get(...params) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT a.*, u.full_name AS user_full_name, u.email AS user_email
         FROM counselling_appointments a
         LEFT JOIN users u ON u.id = a.user_id
         ${whereSql}
         ORDER BY ${sortCol} ${order.toUpperCase()}
         LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset) as AppointmentRow[];

  ok(res, rows.map(mapAppointment), { pagination: offsetMeta(page, pageSize, total) });
});
