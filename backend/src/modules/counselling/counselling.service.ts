import { db } from '../../db/connection';
import { Errors } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { now } from '../../lib/time';
import { effectivePlan } from '../../middleware/auth';
import { createNotification } from '../notifications/notifications.service';
import type { Locale, PlanCode } from '../../types';
import type { CreateRequestBody } from './counselling.schema';

// ---- DTOs (mirror frontend/src/lib/types.ts) ------------------------------

export interface CounsellingSlotDTO {
  id: string;
  counsellorId: string | null;
  mode: string;
  startAt: number;
  endAt: number | null;
  location: string | null;
  meetingLink: string | null;
  capacity: number;
  bookedCount: number;
}

export interface CounsellingRequestDTO {
  id: string;
  type: 'assist' | 'one_to_one' | 'in_person' | 'general_query';
  topic: string | null;
  message: string | null;
  preferredLanguage: Locale;
  preferredMode: string | null;
  preferredTimes: number[];
  status: string;
  priority: string;
  planCodeAtRequest: PlanCode | null;
  createdAt: number;
}

export interface CounsellingNoteDTO {
  id: string;
  note: string;
  createdAt: number;
}

export interface CounsellingAppointmentDTO {
  id: string;
  requestId: string | null;
  mode: string;
  scheduledStart: number;
  scheduledEnd: number | null;
  location: string | null;
  meetingLink: string | null;
  status: string;
}

export interface CounsellingRequestDetailDTO extends CounsellingRequestDTO {
  appointment: CounsellingAppointmentDTO | null;
  notes: CounsellingNoteDTO[];
}

// ---- Row shapes -----------------------------------------------------------

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
}

interface RequestRow {
  id: string;
  user_id: string;
  type: 'assist' | 'one_to_one' | 'in_person' | 'general_query';
  topic: string | null;
  message: string | null;
  preferred_language: Locale;
  preferred_mode: string | null;
  preferred_time_json: string;
  status: string;
  priority: string;
  plan_code_at_request: PlanCode | null;
  created_at: number;
}

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
}

interface NoteRow {
  id: string;
  note: string;
  created_at: number;
}

// ---- Mappers --------------------------------------------------------------

function mapSlot(r: SlotRow): CounsellingSlotDTO {
  return {
    id: r.id,
    counsellorId: r.counsellor_id,
    mode: r.mode,
    startAt: r.start_at,
    endAt: r.end_at,
    location: r.location,
    meetingLink: r.meeting_link,
    capacity: r.capacity,
    bookedCount: r.booked_count,
  };
}

function parseTimes(json: string): number[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function mapRequest(r: RequestRow): CounsellingRequestDTO {
  return {
    id: r.id,
    type: r.type,
    topic: r.topic,
    message: r.message,
    preferredLanguage: r.preferred_language,
    preferredMode: r.preferred_mode,
    preferredTimes: parseTimes(r.preferred_time_json),
    status: r.status,
    priority: r.priority,
    planCodeAtRequest: r.plan_code_at_request,
    createdAt: r.created_at,
  };
}

function mapAppointment(r: AppointmentRow): CounsellingAppointmentDTO {
  return {
    id: r.id,
    requestId: r.request_id,
    mode: r.mode,
    scheduledStart: r.scheduled_start,
    scheduledEnd: r.scheduled_end,
    location: r.location,
    meetingLink: r.meeting_link,
    status: r.status,
  };
}

function mapNote(r: NoteRow): CounsellingNoteDTO {
  return { id: r.id, note: r.note, createdAt: r.created_at };
}

// ---- Plan-feature gate per request type -----------------------------------

interface FeatureRow {
  feat_one_to_one: number;
  feat_in_person: number;
}

/** Ensure the user's live plan permits the given request type. */
function assertTypeAllowed(plan: PlanCode, type: CreateRequestBody['type']): void {
  if (type !== 'one_to_one' && type !== 'in_person') return;
  const row = db
    .prepare('SELECT feat_one_to_one, feat_in_person FROM plans WHERE code = ?')
    .get(plan) as FeatureRow | undefined;
  const allowed =
    type === 'one_to_one' ? row?.feat_one_to_one === 1 : row?.feat_in_person === 1;
  if (!allowed) {
    throw Errors.planRequired(
      'super_premium',
      type === 'one_to_one'
        ? 'One-to-one counselling is not included in your plan.'
        : 'In-person counselling is not included in your plan.',
    );
  }
}

// ---- Queries / commands ---------------------------------------------------

/** Open, future, non-full active slots, optionally filtered by mode. */
export function listOpenSlots(mode?: string): CounsellingSlotDTO[] {
  const params: unknown[] = [now()];
  let sql =
    'SELECT * FROM counselling_slots WHERE is_active = 1 AND start_at > ? AND booked_count < capacity';
  if (mode) {
    sql += ' AND mode = ?';
    params.push(mode);
  }
  sql += ' ORDER BY start_at ASC';
  const rows = db.prepare(sql).all(...params) as SlotRow[];
  return rows.map(mapSlot);
}

/** Create a new counselling request for the user. */
export function createRequest(userId: string, input: CreateRequestBody): CounsellingRequestDTO {
  const plan = effectivePlan(userId);
  assertTypeAllowed(plan, input.type);

  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO counselling_requests
       (id, user_id, type, topic, message, preferred_language, preferred_mode,
        preferred_time_json, status, priority, plan_code_at_request, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', 'normal', ?, ?, ?)`,
  ).run(
    id,
    userId,
    input.type,
    input.topic ?? null,
    input.message ?? null,
    input.preferredLanguage,
    input.preferredMode ?? null,
    JSON.stringify(input.preferredTimes ?? []),
    plan,
    ts,
    ts,
  );

  return mapRequest(getRequestRow(id, userId)!);
}

/** All of the user's requests, newest first. */
export function listRequests(userId: string): CounsellingRequestDTO[] {
  const rows = db
    .prepare('SELECT * FROM counselling_requests WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as RequestRow[];
  return rows.map(mapRequest);
}

function getRequestRow(id: string, userId: string): RequestRow | undefined {
  return db
    .prepare('SELECT * FROM counselling_requests WHERE id = ? AND user_id = ?')
    .get(id, userId) as RequestRow | undefined;
}

/** Owner detail: request + its linked appointment + shared notes. */
export function getRequestDetail(userId: string, id: string): CounsellingRequestDetailDTO {
  const row = getRequestRow(id, userId);
  if (!row) throw Errors.notFound('Counselling request not found');

  const apptRow = db
    .prepare(
      `SELECT * FROM counselling_appointments
       WHERE request_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(id, userId) as AppointmentRow | undefined;

  const noteRows = db
    .prepare(
      'SELECT id, note, created_at FROM counselling_notes WHERE request_id = ? ORDER BY created_at ASC',
    )
    .all(id) as NoteRow[];

  return {
    ...mapRequest(row),
    appointment: apptRow ? mapAppointment(apptRow) : null,
    notes: noteRows.map(mapNote),
  };
}

/** Book a slot against a request, transactionally. */
export function bookSlot(userId: string, requestId: string, slotId: string): CounsellingAppointmentDTO {
  const reqRow = getRequestRow(requestId, userId);
  if (!reqRow) throw Errors.notFound('Counselling request not found');

  const ts = now();

  const txn = db.transaction((): AppointmentRow => {
    const slot = db
      .prepare('SELECT * FROM counselling_slots WHERE id = ?')
      .get(slotId) as SlotRow | undefined;
    if (!slot) throw Errors.notFound('Slot not found');
    if (slot.is_active !== 1 || slot.start_at <= ts) throw Errors.conflict('Slot is not available');
    if (slot.booked_count >= slot.capacity) throw Errors.conflict('Slot is fully booked');

    const inc = db
      .prepare(
        'UPDATE counselling_slots SET booked_count = booked_count + 1, updated_at = ? WHERE id = ? AND booked_count < capacity AND is_active = 1',
      )
      .run(ts, slotId);
    if (inc.changes !== 1) throw Errors.conflict('Slot is fully booked');

    const apptId = newId();
    db.prepare(
      `INSERT INTO counselling_appointments
         (id, request_id, user_id, counsellor_id, mode, scheduled_start, scheduled_end,
          location, meeting_link, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
    ).run(
      apptId,
      requestId,
      userId,
      slot.counsellor_id,
      slot.mode,
      slot.start_at,
      slot.end_at,
      slot.location,
      slot.meeting_link,
      ts,
      ts,
    );

    db.prepare(
      "UPDATE counselling_requests SET status = 'scheduled', updated_at = ? WHERE id = ?",
    ).run(ts, requestId);

    return db
      .prepare('SELECT * FROM counselling_appointments WHERE id = ?')
      .get(apptId) as AppointmentRow;
  });

  const apptRow = txn();

  createNotification({
    userId,
    type: 'counselling',
    title: 'Counselling appointment booked',
    body: 'Your counselling session has been scheduled. Check your appointments for details.',
    language: reqRow.preferred_language,
    relatedEntityType: 'counselling_appointment',
    relatedEntityId: apptRow.id,
  });

  return mapAppointment(apptRow);
}

/** Cancel an owned appointment; releases the slot if linked. */
export function cancelAppointment(userId: string, appointmentId: string): void {
  const ts = now();
  const txn = db.transaction(() => {
    const appt = db
      .prepare('SELECT * FROM counselling_appointments WHERE id = ? AND user_id = ?')
      .get(appointmentId, userId) as AppointmentRow | undefined;
    if (!appt) throw Errors.notFound('Appointment not found');
    if (appt.status === 'cancelled') return;

    db.prepare(
      "UPDATE counselling_appointments SET status = 'cancelled', updated_at = ? WHERE id = ?",
    ).run(ts, appointmentId);

    // Release a slot seat if this appointment maps to a still-bookable slot.
    db.prepare(
      `UPDATE counselling_slots SET booked_count = MAX(booked_count - 1, 0), updated_at = ?
       WHERE counsellor_id IS ? AND mode = ? AND start_at = ? AND booked_count > 0`,
    ).run(ts, appt.counsellor_id, appt.mode, appt.scheduled_start);
  });
  txn();
}
