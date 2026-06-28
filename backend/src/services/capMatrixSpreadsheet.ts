import * as XLSX from 'xlsx';
import {
  type CapMatrixRecord,
  dedupeRecords,
} from './capMatrixParser';

/** Normalize spreadsheet header to a canonical key. */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const HEADER_MAP: Array<[RegExp, keyof CapMatrixRecord | 'skip']> = [
  [/inst(itute)?\s*code|^code$/, 'instituteCode'],
  [/inst(itute)?\s*name|college\s*name/, 'instituteName'],
  [/choice\s*code/, 'choiceCode'],
  [/course|branch|programme?|program/, 'courseName'],
  [/^si$|sanctioned\s*intake/, 'si'],
  [/ms\s*seats?/, 'msSeats'],
  [/minority/, 'minoritySeats'],
  [/all\s*india/, 'allIndiaSeats'],
  [/institute\s*level|institute\s*seats/, 'instituteSeats'],
  [/orphan/, 'orphanSeats'],
  [/ews/, 'ewsSeats'],
  [/status|type/, 'instituteStatus'],
  [/cap\s*seats?/, 'capSeats'],
];

function mapHeaders(headers: string[]): Map<number, string> {
  const out = new Map<number, string>();
  for (let i = 0; i < headers.length; i++) {
    const norm = normalizeHeader(headers[i]);
    for (const [re, field] of HEADER_MAP) {
      if (field === 'skip') continue;
      if (re.test(norm)) {
        out.set(i, field);
        break;
      }
    }
  }
  return out;
}

function cellNum(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function cellStr(v: unknown): string {
  return String(v ?? '').trim();
}

/** Parse an Excel/CSV seat matrix export into structured records. */
export function parseCapMatrixSpreadsheet(filePath: string): CapMatrixRecord[] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const records: CapMatrixRecord[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
    if (rows.length < 2) continue;

    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i].map((c) => cellStr(c));
      const joined = row.join(' ').toLowerCase();
      if (/choice\s*code|institute\s*code|sanctioned|course|branch/.test(joined)) {
        headerRowIdx = i;
        break;
      }
    }

    const headers = rows[headerRowIdx].map((c) => cellStr(c));
    const colMap = mapHeaders(headers);
    if (colMap.size < 2) continue;

    let lastInstituteCode = '';
    let lastInstituteName = '';

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => !cellStr(c))) continue;

      const rec: Partial<CapMatrixRecord> = {
        instituteCode: '',
        instituteName: '',
        instituteStatus: null,
        capSeats: null,
        choiceCode: null,
        courseName: null,
        si: null,
        msSeats: null,
        minoritySeats: null,
        allIndiaSeats: null,
        instituteSeats: null,
        orphanSeats: null,
        categoryLines: [],
        ewsSeats: null,
        tfwsDetail: null,
        page: null,
        extraLines: [],
      };

      const numericFields = new Set([
        'si',
        'msSeats',
        'minoritySeats',
        'allIndiaSeats',
        'instituteSeats',
        'orphanSeats',
        'capSeats',
        'ewsSeats',
      ]);

      for (const [colIdx, field] of colMap) {
        const val = row[colIdx];
        if (numericFields.has(field)) {
          (rec as Record<string, unknown>)[field] = cellNum(val);
        } else {
          (rec as Record<string, unknown>)[field] = cellStr(val) || null;
        }
      }

      // Carry-forward institute code/name for multi-course rows.
      let code = cellStr(rec.instituteCode).replace(/\D/g, '');
      if (/^0\d{4}$/.test(code)) {
        lastInstituteCode = code;
        if (rec.instituteName) lastInstituteName = String(rec.instituteName);
      } else if (lastInstituteCode) {
        code = lastInstituteCode;
        rec.instituteCode = lastInstituteCode;
        if (!rec.instituteName) rec.instituteName = lastInstituteName;
      }

      const choice = cellStr(rec.choiceCode);
      const course = cellStr(rec.courseName);
      if (!/^0\d{4}$/.test(code) && !choice && !course) continue;
      if (!code && choice.length >= 10) code = choice.slice(0, 5);

      if (!/^0\d{4}$/.test(code)) continue;

      rec.instituteCode = code;
      if (!rec.instituteName) rec.instituteName = lastInstituteName || `Institute ${code}`;

      // Capture unmapped columns as category detail.
      const mappedCols = new Set(colMap.keys());
      const extras: string[] = [];
      for (let c = 0; c < row.length; c++) {
        if (mappedCols.has(c)) continue;
        const h = headers[c];
        const v = cellStr(row[c]);
        if (h && v && /\d/.test(v)) extras.push(`${h}: ${v}`);
      }
      if (extras.length) rec.categoryLines = extras;

      records.push(rec as CapMatrixRecord);
    }
  }

  return dedupeRecords(records);
}
