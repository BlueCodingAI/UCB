import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { extractPdfText } from './pdfExtract';
import { downloadGoogleSheetToFile } from './googleSheet';
import {
  isCapMatrixContent,
  parseCapMatrixFromText,
  formatCapMatrixRecord,
  recordSourceLocator,
  type CapMatrixRecord,
} from './capMatrixParser';
import { parseCapMatrixSpreadsheet } from './capMatrixSpreadsheet';
import {
  chunkStructuredText,
  buildEmbeddingText,
  estimateTokens,
  type StructuredChunk,
} from './textChunker';

export interface KbDocMeta {
  id: string;
  title: string;
  description: string | null;
  source_type: string;
  file_path: string | null;
  file_mime: string | null;
  source_url: string | null;
  course: string | null;
  cap_year: number | null;
  language: string;
  topic: string | null;
  openai_file_id: string | null;
}

/** Spreadsheet → Markdown tables (one per sheet) for better RAG retrieval. */
export function extractSpreadsheetText(filePath: string): string {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sections: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (!rows.length) continue;

    const headers = Object.keys(rows[0]);
    if (!headers.length) continue;

    const esc = (s: string) => s.replace(/\|/g, '\\|');
    const fmtRow = (cells: string[]) => `| ${cells.map(esc).join(' | ')} |`;
    const headerRow = fmtRow(headers);
    const sepRow = fmtRow(headers.map(() => '---'));

    const bodyRows = rows.map((row) =>
      fmtRow(headers.map((h) => String(row[h] ?? '').trim())),
    );

    sections.push(
      `[Sheet: ${sheetName}]\n\n${[headerRow, sepRow, ...bodyRows].join('\n')}`,
    );
  }

  return sections.join('\n\n---\n\n');
}

/** Read plain text / FAQ / notice bodies from disk or description fallback. */
export function extractPlainText(doc: KbDocMeta): string {
  if (doc.file_path && fs.existsSync(doc.file_path) && /\.txt$/i.test(doc.file_path)) {
    return fs.readFileSync(doc.file_path, 'utf8');
  }
  return doc.description ?? '';
}

/** Full async text extraction for any KB document type. */
export async function extractDocumentText(doc: KbDocMeta): Promise<string> {
  const type = doc.source_type;

  if (type === 'pdf') {
    if (!doc.file_path) throw new Error('pdf document has no file_path');
    return extractPdfText(doc.file_path);
  }

  if (
    type === 'google_sheet' ||
    (doc.file_mime && /sheet|excel|csv/i.test(doc.file_mime))
  ) {
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      return extractSpreadsheetText(doc.file_path);
    }
    if (doc.source_url) {
      const dl = await downloadGoogleSheetToFile(doc.source_url);
      return extractSpreadsheetText(dl.filePath);
    }
    throw new Error('spreadsheet document has no file_path or source_url');
  }

  return extractPlainText(doc);
}

/** Extract structured CAP seat-matrix records from raw document text. */
export function extractCapMatrixRecords(doc: KbDocMeta, raw: string): CapMatrixRecord[] {
  const isSpreadsheet =
    doc.file_path != null &&
    /\.(xlsx|xls|csv)$/i.test(doc.file_path);

  let capRecords =
    isSpreadsheet && doc.file_path ? parseCapMatrixSpreadsheet(doc.file_path) : [];

  if (!capRecords.length && isCapMatrixContent(raw, doc.title)) {
    capRecords = parseCapMatrixFromText(raw);
  }

  return capRecords;
}

export interface PreparedChunk {
  body: string;
  embedText: string;
  sourceLocator: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

/** Chunk + attach embedding payloads, source locators, and structured metadata for indexing. */
export function prepareIndexChunks(raw: string, doc: KbDocMeta, recordIdByKey?: Map<string, string>): PreparedChunk[] {
  const isSpreadsheet =
    doc.file_path != null &&
    fs.existsSync(doc.file_path) &&
    /\.(xlsx|xls|csv)$/i.test(doc.file_path);

  const capRecords = extractCapMatrixRecords(doc, raw);
  const useCapRecords = capRecords.length >= (isSpreadsheet ? 1 : 2);

  if (useCapRecords) {
    return capRecords.map((r) => {
      const body = formatCapMatrixRecord(r, doc.title);
      const key = `${r.instituteCode}|${r.choiceCode ?? ''}|${r.courseName ?? ''}`;
      const recordId = recordIdByKey?.get(key);
      return {
        body,
        embedText: buildEmbeddingText({
          title: doc.title,
          topic: doc.topic,
          course: doc.course,
          capYear: doc.cap_year,
          body,
        }),
        sourceLocator: recordSourceLocator(r),
        tokenCount: estimateTokens(body),
        metadata: {
          recordType: 'cap_matrix',
          recordId: recordId ?? null,
          instituteCode: r.instituteCode,
          choiceCode: r.choiceCode,
        },
      };
    });
  }

  const structured: StructuredChunk[] = chunkStructuredText(raw);
  if (!structured.length && raw.trim()) {
    structured.push({ content: raw.trim(), sourceLocator: 'document' });
  }

  return structured.map((c) => ({
    body: c.content,
    embedText: buildEmbeddingText({
      title: doc.title,
      topic: doc.topic,
      course: doc.course,
      capYear: doc.cap_year,
      body: c.content,
    }),
    sourceLocator: c.sourceLocator,
    tokenCount: estimateTokens(c.content),
    metadata: { recordType: 'prose' },
  }));
}
