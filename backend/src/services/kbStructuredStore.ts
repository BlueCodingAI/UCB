import { db } from '../db/connection';
import { newId } from '../lib/ids';
import { now } from '../lib/time';
import {
  type CapMatrixRecord,
  dedupeRecords,
  recordSourceLocator,
} from './capMatrixParser';

export type ExtractType = 'cap_matrix' | 'prose' | 'empty';

export const PARSER_VERSION = '1';

export interface ParsedCategoryLine {
  category: string;
  subcategory: string | null;
  seats: number | null;
  rawLine: string;
}

/** Parse a category distribution line like "State Level OPEN G 12" or "SC L 3". */
export function parseCategoryLine(line: string): ParsedCategoryLine | null {
  const rawLine = line.trim();
  if (!rawLine) return null;

  const gl = rawLine.match(/^(?:state\s*level\s+)?(.+?)\s+(G|L)\s+(\d+)\s*$/i);
  if (gl) {
    return {
      category: gl[1].trim(),
      subcategory: gl[2].toUpperCase(),
      seats: parseInt(gl[3], 10),
      rawLine,
    };
  }

  const plain = rawLine.match(/^(?:state\s*level\s+)?([A-Z0-9+/\- ]+?)\s+(\d+)\s*$/i);
  if (plain && !/^(si|ms|cap|total)\b/i.test(plain[1])) {
    return {
      category: plain[1].trim(),
      subcategory: null,
      seats: parseInt(plain[2], 10),
      rawLine,
    };
  }

  return { category: rawLine, subcategory: null, seats: null, rawLine };
}

export function deleteStructuredData(documentId: string): void {
  db.prepare('DELETE FROM kb_cap_category_seats WHERE record_id IN (SELECT id FROM kb_cap_matrix_records WHERE document_id = ?)').run(
    documentId,
  );
  db.prepare('DELETE FROM kb_cap_matrix_records WHERE document_id = ?').run(documentId);
  db.prepare('DELETE FROM kb_document_extracts WHERE document_id = ?').run(documentId);
}

export function saveDocumentExtract(
  documentId: string,
  params: { extractType: ExtractType; rawText: string; recordCount: number },
): void {
  const ts = now();
  db.prepare(
    `INSERT INTO kb_document_extracts
       (document_id, extract_type, raw_text, parser_version, record_count, char_count, extracted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(document_id) DO UPDATE SET
       extract_type=excluded.extract_type,
       raw_text=excluded.raw_text,
       parser_version=excluded.parser_version,
       record_count=excluded.record_count,
       char_count=excluded.char_count,
       extracted_at=excluded.extracted_at`,
  ).run(
    documentId,
    params.extractType,
    params.rawText,
    PARSER_VERSION,
    params.recordCount,
    params.rawText.length,
    ts,
  );

  db.prepare(
    `UPDATE kb_documents SET extract_type=?, structured_record_count=?, updated_at=? WHERE id=?`,
  ).run(params.extractType, params.recordCount, ts, documentId);
}

/** Persist normalized CAP matrix rows. Returns map key → saved record id. */
export function saveCapMatrixRecords(
  documentId: string,
  records: CapMatrixRecord[],
): Map<string, string> {
  const deduped = dedupeRecords(records);
  const ts = now();
  const idByKey = new Map<string, string>();

  const insertRecord = db.prepare(
    `INSERT INTO kb_cap_matrix_records
       (id, document_id, institute_code, institute_name, institute_status, choice_code, course_name,
        si, ms_seats, minority_seats, all_india_seats, institute_seats, orphan_seats, ews_seats,
        cap_seats, tfws_detail, source_page, source_locator, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertCategory = db.prepare(
    `INSERT INTO kb_cap_category_seats (id, record_id, category, subcategory, seats, raw_line)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const writeAll = db.transaction(() => {
    for (const r of deduped) {
      const recordId = newId();
      const key = `${r.instituteCode}|${r.choiceCode ?? ''}|${r.courseName ?? ''}`;
      idByKey.set(key, recordId);

      insertRecord.run(
        recordId,
        documentId,
        r.instituteCode,
        r.instituteName,
        r.instituteStatus,
        r.choiceCode,
        r.courseName,
        r.si,
        r.msSeats,
        r.minoritySeats,
        r.allIndiaSeats,
        r.instituteSeats,
        r.orphanSeats,
        r.ewsSeats,
        r.capSeats,
        r.tfwsDetail,
        r.page,
        recordSourceLocator(r),
        ts,
      );

      for (const line of r.categoryLines) {
        const parsed = parseCategoryLine(line);
        insertCategory.run(
          newId(),
          recordId,
          parsed?.category ?? line,
          parsed?.subcategory ?? null,
          parsed?.seats ?? null,
          parsed?.rawLine ?? line,
        );
      }
    }
  });
  writeAll();

  return idByKey;
}

interface CapRecordRow {
  id: string;
  documentId: string;
  title: string;
  instituteCode: string;
  instituteName: string;
  instituteStatus: string | null;
  choiceCode: string | null;
  courseName: string | null;
  si: number | null;
  msSeats: number | null;
  minoritySeats: number | null;
  allIndiaSeats: number | null;
  instituteSeats: number | null;
  orphanSeats: number | null;
  ewsSeats: number | null;
  capSeats: number | null;
  tfwsDetail: string | null;
  sourcePage: number | null;
  sourceLocator: string | null;
}

function loadCategoryLines(recordIds: string[]): Map<string, string[]> {
  if (!recordIds.length) return new Map();
  const placeholders = recordIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT record_id AS recordId, raw_line AS rawLine
         FROM kb_cap_category_seats
        WHERE record_id IN (${placeholders})
        ORDER BY rowid ASC`,
    )
    .all(...recordIds) as Array<{ recordId: string; rawLine: string }>;

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.recordId) ?? [];
    list.push(row.rawLine);
    map.set(row.recordId, list);
  }
  return map;
}

function rowToCapMatrixRecord(row: CapRecordRow, categoryLines: string[]): CapMatrixRecord {
  return {
    instituteCode: row.instituteCode,
    instituteName: row.instituteName,
    instituteStatus: row.instituteStatus,
    capSeats: row.capSeats,
    choiceCode: row.choiceCode,
    courseName: row.courseName,
    si: row.si,
    msSeats: row.msSeats,
    minoritySeats: row.minoritySeats,
    allIndiaSeats: row.allIndiaSeats,
    instituteSeats: row.instituteSeats,
    orphanSeats: row.orphanSeats,
    categoryLines,
    ewsSeats: row.ewsSeats,
    tfwsDetail: row.tfwsDetail,
    page: row.sourcePage,
    extraLines: [],
  };
}

/** Load saved CAP matrix rows for institute code(s) from structured tables. */
export function fetchCapMatrixRecordsFromDb(codes: string[]): Array<{
  record: CapMatrixRecord;
  recordId: string;
  documentId: string;
  title: string;
  sourceLocator: string | null;
}> {
  if (!codes.length) return [];

  const placeholders = codes.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT r.id AS id, r.document_id AS documentId, d.title AS title,
              r.institute_code AS instituteCode, r.institute_name AS instituteName,
              r.institute_status AS instituteStatus, r.choice_code AS choiceCode,
              r.course_name AS courseName, r.si AS si, r.ms_seats AS msSeats,
              r.minority_seats AS minoritySeats, r.all_india_seats AS allIndiaSeats,
              r.institute_seats AS instituteSeats, r.orphan_seats AS orphanSeats,
              r.ews_seats AS ewsSeats, r.cap_seats AS capSeats, r.tfws_detail AS tfwsDetail,
              r.source_page AS sourcePage, r.source_locator AS sourceLocator
         FROM kb_cap_matrix_records r
         JOIN kb_documents d ON d.id = r.document_id
        WHERE d.is_active = 1 AND d.deleted_at IS NULL
          AND r.institute_code IN (${placeholders})
        ORDER BY r.institute_code, r.choice_code, r.course_name`,
    )
    .all(...codes) as CapRecordRow[];

  const categoryMap = loadCategoryLines(rows.map((r) => r.id));
  return rows.map((row) => ({
    recordId: row.id,
    documentId: row.documentId,
    title: row.title,
    sourceLocator: row.sourceLocator,
    record: rowToCapMatrixRecord(row, categoryMap.get(row.id) ?? []),
  }));
}

export function countStructuredRecords(documentId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM kb_cap_matrix_records WHERE document_id = ?')
    .get(documentId) as { n: number };
  return row.n;
}

export function getDocumentExtractSummary(documentId: string): {
  extractType: ExtractType | null;
  recordCount: number;
  charCount: number;
  extractedAt: number | null;
} | null {
  const row = db
    .prepare(
      `SELECT extract_type AS extractType, record_count AS recordCount,
              char_count AS charCount, extracted_at AS extractedAt
         FROM kb_document_extracts WHERE document_id = ?`,
    )
    .get(documentId) as
    | { extractType: ExtractType; recordCount: number; charCount: number; extractedAt: number }
    | undefined;
  if (!row) return null;
  return row;
}
