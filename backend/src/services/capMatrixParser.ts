/**
 * Structured parser for Maharashtra CAP engineering seat-matrix documents.
 * Converts PDF line dumps / spreadsheet rows into one searchable record per
 * institute + course (choice code), preserving category seat breakdowns.
 */

export interface CapMatrixRecord {
  instituteCode: string;
  instituteName: string;
  instituteStatus: string | null;
  capSeats: number | null;
  choiceCode: string | null;
  courseName: string | null;
  si: number | null;
  msSeats: number | null;
  minoritySeats: number | null;
  allIndiaSeats: number | null;
  instituteSeats: number | null;
  orphanSeats: number | null;
  categoryLines: string[];
  ewsSeats: number | null;
  tfwsDetail: string | null;
  page: number | null;
  extraLines: string[];
}


const CHOICE_CODE = /\b(0\d{4}\d{5,6}T?)\b/;
const COURSE_KEYWORDS =
  /engineering|technology|pharmacy|architecture|planning|design|management|b\.?tech|b\.?pharm|m\.?tech|hmct|pharm\.?\s*d|computer|civil|mechanical|electrical|electronics|artificial|data science|machine learning|information/i;

/** True when document content/title looks like a CAP seat matrix. */
export function isCapMatrixContent(text: string, title?: string | null): boolean {
  const t = `${title ?? ''} ${text}`.toLowerCase();
  if (/seat\s*matrix|cap\s*seat|cut[\s-]?off\s*ai|engineering_cap|sanctioned\s*intake|\bsi\b.*\bms\s*seats/i.test(t)) {
    return true;
  }
  const codes = text.match(/\b0\d{4}\b/g) ?? [];
  const choices = text.match(/\b0\d{4}\d{5,6}T?\b/g) ?? [];
  return codes.length >= 2 && choices.length >= 2;
}

function parseIntField(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] != null) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function extractFields(block: string): Partial<CapMatrixRecord> {
  const si = parseIntField(block, [
    /\bSI\b\s*:?\s*(\d+)/i,
    /sanctioned\s*intake\s*:?\s*(\d+)/i,
  ]);
  const msSeats = parseIntField(block, [/MS\s*Seats?\s*:?\s*(\d+)/i]);
  const minoritySeats = parseIntField(block, [/minority\s*seats?\s*:?\s*(\d+)/i]);
  const allIndiaSeats = parseIntField(block, [/all\s*india\s*:?\s*(\d+)/i]);
  const instituteSeats = parseIntField(block, [/institute\s*(?:level\s*)?seats?\s*:?\s*(\d+)/i]);
  const orphanSeats = parseIntField(block, [/orphan\s*:?\s*(\d+)/i]);
  const capSeats = parseIntField(block, [/\bCAP\s*:?\s*(\d+)/i]);
  const ewsSeats = parseIntField(block, [
    /economically\s*weaker\s*section\s*\(?EWS?\)?\s*seats?\s*:?\s*(\d+)/i,
    /\bEWS\s*seats?\s*:?\s*(\d+)/i,
  ]);

  let tfwsDetail: string | null = null;
  const tfwsM = block.match(/tuition\s*fee\s*waiver[^:\n]*(?:choice\s*code\s*:?\s*)?(0\d{4}\d{5,6}T?)[^:\n]*seats?\s*:?\s*(\d+)/i);
  if (tfwsM) tfwsDetail = `Choice Code ${tfwsM[1]}: ${tfwsM[2]} seats`;

  let choiceCode: string | null = null;
  const ccLine = block.match(/choice\s*code\s*:?\s*(0\d{4}\d{5,6}T?)/i);
  if (ccLine) choiceCode = ccLine[1];
  else {
    const all = block.match(/\b(0\d{4}\d{5,6}T?)\b/g) ?? [];
    choiceCode = all.find((c) => !c.endsWith('T') && c.length === 10) ?? all[0] ?? null;
  }

  let courseName: string | null = null;
  for (const line of block.split('\n')) {
    const t = line.trim();
    if (COURSE_KEYWORDS.test(t) && t.length < 120 && !/choice\s*code/i.test(t)) {
      courseName = t.replace(/^\d{10}\s*/, '').replace(/^[\d\s|]+/, '').trim();
      if (courseName.length > 3) break;
    }
  }
  if (!courseName) {
    const courseM = block.match(
      /(?:course|branch|programme?)\s*:?\s*([A-Za-z0-9 &().,'/-]{4,80})/i,
    );
    if (courseM) courseName = courseM[1].trim();
  }

  const categoryLines: string[] = [];
  for (const line of block.split('\n')) {
    const t = line.trim();
    if (
      /state\s*level|^\s*OPEN\b|^\s*SC\b|^\s*ST\b|^\s*OBC|^\s*SEBC|^\s*VJ|^\s*NT[A-D]|PWD|DEF\b|common\s*reserved|total\s*G\+L/i.test(
        t,
      ) ||
      (/\b(G|L)\b/.test(t) && /\d/.test(t) && t.split(/\s+/).length >= 4)
    ) {
      categoryLines.push(t);
    }
  }

  const extraLines: string[] = [];
  for (const line of block.split('\n')) {
    const t = line.trim();
    if (/reserved\s*seats|tfws|tuition\s*fee|autonomous|un-?aided|aided/i.test(t)) {
      extraLines.push(t);
    }
  }

  return {
    choiceCode,
    courseName,
    si,
    msSeats,
    minoritySeats,
    allIndiaSeats,
    instituteSeats,
    orphanSeats,
    capSeats,
    ewsSeats,
    tfwsDetail,
    categoryLines,
    extraLines,
  };
}

function parseInstituteHeader(line: string): { code: string; name: string } | null {
  const marker = line.match(/^===\s*Institute\s+(\d{5})\s*===$/i);
  if (marker) return { code: marker[1], name: '' };
  const m = line.match(/^(\d{5})\s*[-–—]\s*(.+)$/);
  if (m) return { code: m[1], name: m[2].trim() };
  const m2 = line.match(/^(\d{5})\s+(.{10,})$/);
  if (m2 && !COURSE_KEYWORDS.test(m2[2])) return { code: m2[1], name: m2[2].trim() };
  return null;
}

/** Parse PDF/page-oriented text into structured seat-matrix records. */
export function parseCapMatrixFromText(text: string): CapMatrixRecord[] {
  const records: CapMatrixRecord[] = [];
  let currentPage: number | null = null;
  let instituteCode = '';
  let instituteName = '';
  let instituteStatus: string | null = null;
  let capSeats: number | null = null;
  let courseBuffer: string[] = [];
  let pendingInstituteName = false;

  function flushCourse(): void {
    if (!instituteCode || courseBuffer.length === 0) return;
    const block = courseBuffer.join('\n');
    if (!CHOICE_CODE.test(block) && !COURSE_KEYWORDS.test(block)) {
      courseBuffer = [];
      return;
    }

    const fields = extractFields(block);
    if (!fields.choiceCode && !fields.courseName) {
      courseBuffer = [];
      return;
    }

    records.push({
      instituteCode,
      instituteName: instituteName || `Institute ${instituteCode}`,
      instituteStatus,
      capSeats,
      choiceCode: fields.choiceCode ?? null,
      courseName: fields.courseName ?? null,
      si: fields.si ?? null,
      msSeats: fields.msSeats ?? null,
      minoritySeats: fields.minoritySeats ?? null,
      allIndiaSeats: fields.allIndiaSeats ?? null,
      instituteSeats: fields.instituteSeats ?? null,
      orphanSeats: fields.orphanSeats ?? null,
      categoryLines: fields.categoryLines ?? [],
      ewsSeats: fields.ewsSeats ?? null,
      tfwsDetail: fields.tfwsDetail ?? null,
      page: currentPage,
      extraLines: fields.extraLines ?? [],
    });
    courseBuffer = [];
  }

  for (const rawLine of text.split('\n')) {
    const t = rawLine.trim();
    if (!t || t.startsWith('[Sheet:')) continue;

    const pageM = t.match(/^\[Page (\d+)\]$/);
    if (pageM) {
      flushCourse();
      currentPage = parseInt(pageM[1], 10);
      continue;
    }

    const inst = parseInstituteHeader(t);
    if (inst) {
      flushCourse();
      instituteCode = inst.code;
      instituteName = inst.name;
      instituteStatus = null;
      capSeats = null;
      pendingInstituteName = !inst.name;
      continue;
    }

    if (pendingInstituteName && instituteCode && t.length > 8 && !CHOICE_CODE.test(t) && !COURSE_KEYWORDS.test(t)) {
      instituteName = t;
      pendingInstituteName = false;
      continue;
    }
    pendingInstituteName = false;

    if (/un-?aided|aided|autonomous|partially\s*autonomous/i.test(t) && instituteCode && !courseBuffer.length) {
      instituteStatus = t;
      continue;
    }

    if (instituteCode && /\bCAP\s*:?\s*\d+/i.test(t) && !courseBuffer.length) {
      capSeats = parseIntField(t, [/\bCAP\s*:?\s*(\d+)/i]);
    }

    const startsNewCourse =
      instituteCode &&
      (CHOICE_CODE.test(t) || (/choice\s*code/i.test(t) && CHOICE_CODE.test(t)));

    if (startsNewCourse) {
      if (courseBuffer.length > 0) flushCourse();
      courseBuffer.push(t);
      continue;
    }

    if (instituteCode && COURSE_KEYWORDS.test(t) && !courseBuffer.length) {
      courseBuffer.push(t);
      continue;
    }

    if (instituteCode && courseBuffer.length > 0) {
      courseBuffer.push(t);
    }
  }

  flushCourse();
  return dedupeRecords(records);
}

export function dedupeRecords(records: CapMatrixRecord[]): CapMatrixRecord[] {
  const map = new Map<string, CapMatrixRecord>();
  for (const r of records) {
    const key = `${r.instituteCode}|${r.choiceCode ?? ''}|${r.courseName ?? ''}`;
    const prev = map.get(key);
    if (!prev || (r.categoryLines.length > prev.categoryLines.length)) map.set(key, r);
  }
  return [...map.values()];
}

/** Format one record as indexable/searchable text (one chunk body). */
export function formatCapMatrixRecord(r: CapMatrixRecord, docTitle?: string): string {
  const lines: string[] = [
    'CAP Seat Matrix Record',
    `Institute Code: ${r.instituteCode}`,
    `Institute Name: ${r.instituteName}`,
  ];
  if (r.instituteStatus) lines.push(`Status: ${r.instituteStatus}`);
  if (r.capSeats != null) lines.push(`CAP Seats (institute total): ${r.capSeats}`);
  if (r.choiceCode) lines.push(`Choice Code: ${r.choiceCode}`);
  if (r.courseName) lines.push(`Course / Branch: ${r.courseName}`);
  if (r.si != null) lines.push(`Sanctioned Intake (SI): ${r.si}`);
  if (r.msSeats != null) lines.push(`MS Seats (Maharashtra State): ${r.msSeats}`);
  if (r.minoritySeats != null) lines.push(`Minority Seats: ${r.minoritySeats}`);
  if (r.allIndiaSeats != null) lines.push(`All India Seats: ${r.allIndiaSeats}`);
  if (r.instituteSeats != null) lines.push(`Institute Level Seats: ${r.instituteSeats}`);
  if (r.orphanSeats != null) lines.push(`Orphan Seats: ${r.orphanSeats}`);

  if (r.categoryLines.length) {
    lines.push('', 'Category-wise seat distribution:');
    for (const cl of r.categoryLines) lines.push(`  ${cl}`);
  }
  if (r.extraLines.length) {
    lines.push('', 'Additional allocations:');
    for (const el of r.extraLines) lines.push(`  ${el}`);
  }
  if (r.ewsSeats != null) lines.push(`EWS Seats: ${r.ewsSeats}`);
  if (r.tfwsDetail) lines.push(`TFWS: ${r.tfwsDetail}`);

  if (r.page != null) lines.push('', `Source Page: ${r.page}`);
  if (docTitle) lines.push(`Document: ${docTitle}`);

  return lines.join('\n');
}

export function recordSourceLocator(r: CapMatrixRecord): string {
  const parts = [`Institute ${r.instituteCode}`];
  if (r.courseName) parts.push(r.courseName.slice(0, 60));
  if (r.page != null) parts.push(`Page ${r.page}`);
  return parts.join(' · ');
}
