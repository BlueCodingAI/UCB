import { db } from '../../db/connection';
import { Errors } from '../../lib/errors';
import { mapUser } from '../../lib/mappers';
import { now } from '../../lib/time';
import type { UserDTO, Locale, CapStage } from '../../types';
import type { UpdateProfileInput, UpdateCapProfileInput } from './profile.schema';

// ---- Account basics ---------------------------------------------------------

export interface AccountInfo {
  id: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  preferredLanguage: Locale;
  locationCity: string | null;
  locationDistrict: string | null;
  notifyInApp: boolean;
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
  notifySms: boolean;
}

function loadUserRow(userId: string): any {
  const row = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(userId);
  if (!row) throw Errors.notFound('User not found');
  return row;
}

/** Account info for the profile screen. */
export function getAccount(userId: string): AccountInfo {
  const r = loadUserRow(userId);
  return {
    id: r.id,
    fullName: r.full_name ?? null,
    email: r.email ?? null,
    mobile: r.mobile ?? null,
    preferredLanguage: (r.preferred_language ?? 'en') as Locale,
    locationCity: r.location_city ?? null,
    locationDistrict: r.location_district ?? null,
    notifyInApp: !!r.notify_in_app,
    notifyEmail: !!r.notify_email,
    notifyWhatsapp: !!r.notify_whatsapp,
    notifySms: !!r.notify_sms,
  };
}

/** Update account basics; returns the updated UserDTO. */
export function updateAccount(userId: string, input: UpdateProfileInput): UserDTO {
  loadUserRow(userId);

  const sets: string[] = [];
  const params: unknown[] = [];
  const setField = (col: string, value: unknown) => {
    sets.push(`${col} = ?`);
    params.push(value);
  };

  if ('fullName' in input) setField('full_name', input.fullName ?? null);
  if (input.preferredLanguage !== undefined) setField('preferred_language', input.preferredLanguage);
  if ('locationCity' in input) setField('location_city', input.locationCity ?? null);
  if ('locationDistrict' in input) setField('location_district', input.locationDistrict ?? null);
  if (input.notifyInApp !== undefined) setField('notify_in_app', input.notifyInApp ? 1 : 0);
  if (input.notifyEmail !== undefined) setField('notify_email', input.notifyEmail ? 1 : 0);
  if (input.notifyWhatsapp !== undefined) setField('notify_whatsapp', input.notifyWhatsapp ? 1 : 0);
  if (input.notifySms !== undefined) setField('notify_sms', input.notifySms ? 1 : 0);

  if (sets.length > 0) {
    setField('updated_at', now());
    params.push(userId);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  return mapUser(loadUserRow(userId));
}

// ---- CAP profile memory -----------------------------------------------------

export interface CapProfileDTO {
  userId: string;
  category: string | null;
  courseInterest: string | null;
  cetExam: string | null;
  cetScore: number | null;
  cetPercentile: number | null;
  meritNumber: number | null;
  capYear: number | null;
  capApplicationNo: string | null;
  homeUniversity: string | null;
  preferredDistricts: string[];
  preferredColleges: string[];
  documentsStatus: Record<string, unknown>;
  currentStage: CapStage | null;
  createdAt: number | null;
  updatedAt: number | null;
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapCapProfile(userId: string, r: any | undefined): CapProfileDTO {
  if (!r) {
    return {
      userId,
      category: null,
      courseInterest: null,
      cetExam: null,
      cetScore: null,
      cetPercentile: null,
      meritNumber: null,
      capYear: null,
      capApplicationNo: null,
      homeUniversity: null,
      preferredDistricts: [],
      preferredColleges: [],
      documentsStatus: {},
      currentStage: null,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    userId: r.user_id,
    category: r.category ?? null,
    courseInterest: r.course_interest ?? null,
    cetExam: r.cet_exam ?? null,
    cetScore: r.cet_score ?? null,
    cetPercentile: r.cet_percentile ?? null,
    meritNumber: r.merit_number ?? null,
    capYear: r.cap_year ?? null,
    capApplicationNo: r.cap_application_no ?? null,
    homeUniversity: r.home_university ?? null,
    preferredDistricts: parseJsonArray(r.preferred_districts),
    preferredColleges: parseJsonArray(r.preferred_colleges),
    documentsStatus: parseJsonObject(r.documents_status),
    currentStage: (r.current_stage ?? null) as CapStage | null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

/** Read the CAP profile row (or null-defaults if none). */
export function getCapProfile(userId: string): CapProfileDTO {
  const row = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  return mapCapProfile(userId, row);
}

/** Upsert the CAP profile row (INSERT ... ON CONFLICT(user_id) DO UPDATE). */
export function upsertCapProfile(userId: string, input: UpdateCapProfileInput): CapProfileDTO {
  loadUserRow(userId);

  const ts = now();
  const districtsJson = input.preferredDistricts !== undefined ? JSON.stringify(input.preferredDistricts) : null;
  const collegesJson = input.preferredColleges !== undefined ? JSON.stringify(input.preferredColleges) : null;
  const docsJson = input.documentsStatus !== undefined ? JSON.stringify(input.documentsStatus) : null;

  db.prepare(
    `INSERT INTO user_profiles (
        user_id, category, course_interest, cet_exam, cet_score, cet_percentile,
        merit_number, cap_year, cap_application_no, home_university,
        preferred_districts, preferred_colleges, documents_status, current_stage,
        created_at, updated_at
     ) VALUES (
        @userId, @category, @courseInterest, @cetExam, @cetScore, @cetPercentile,
        @meritNumber, @capYear, @capApplicationNo, @homeUniversity,
        @preferredDistricts, @preferredColleges,
        COALESCE(@documentsStatus, '{}'), @currentStage,
        @ts, @ts
     )
     ON CONFLICT(user_id) DO UPDATE SET
        category           = COALESCE(@category, category),
        course_interest    = COALESCE(@courseInterest, course_interest),
        cet_exam           = COALESCE(@cetExam, cet_exam),
        cet_score          = COALESCE(@cetScore, cet_score),
        cet_percentile     = COALESCE(@cetPercentile, cet_percentile),
        merit_number       = COALESCE(@meritNumber, merit_number),
        cap_year           = COALESCE(@capYear, cap_year),
        cap_application_no = COALESCE(@capApplicationNo, cap_application_no),
        home_university    = COALESCE(@homeUniversity, home_university),
        preferred_districts = COALESCE(@preferredDistricts, preferred_districts),
        preferred_colleges  = COALESCE(@preferredColleges, preferred_colleges),
        documents_status    = COALESCE(@documentsStatus, documents_status),
        current_stage       = COALESCE(@currentStage, current_stage),
        updated_at          = @ts`,
  ).run({
    userId,
    category: input.category ?? null,
    courseInterest: input.courseInterest ?? null,
    cetExam: input.cetExam ?? null,
    cetScore: input.cetScore ?? null,
    cetPercentile: input.cetPercentile ?? null,
    meritNumber: input.meritNumber ?? null,
    capYear: input.capYear ?? null,
    capApplicationNo: input.capApplicationNo ?? null,
    homeUniversity: input.homeUniversity ?? null,
    preferredDistricts: districtsJson,
    preferredColleges: collegesJson,
    documentsStatus: docsJson,
    currentStage: input.currentStage ?? null,
    ts,
  });

  return getCapProfile(userId);
}

/** Clear (delete) the CAP profile row. */
export function clearCapProfile(userId: string): void {
  db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(userId);
}
