import {
  extractCapMatrixRecords,
  type KbDocMeta,
} from './kbExtract';
import { isCapMatrixContent } from './capMatrixParser';
import type { CapMatrixRecord } from './capMatrixParser';
import {
  deleteStructuredData,
  saveCapMatrixRecords,
  saveDocumentExtract,
  type ExtractType,
} from './kbStructuredStore';

export interface PersistExtractResult {
  extractType: ExtractType;
  recordCount: number;
  recordIdByKey: Map<string, string>;
}

function classifyExtract(
  doc: KbDocMeta,
  rawText: string,
  records: CapMatrixRecord[],
): ExtractType {
  const isSpreadsheet =
    doc.file_path != null && /\.(xlsx|xls|csv)$/i.test(doc.file_path);
  const minRecords = isSpreadsheet ? 1 : 2;
  if (records.length >= minRecords) return 'cap_matrix';
  if (isCapMatrixContent(rawText, doc.title) && records.length > 0) return 'cap_matrix';
  if (rawText.trim()) return 'prose';
  return 'empty';
}

/**
 * Extract structured CAP matrix rows from raw text and persist to SQLite.
 * Called at index time — query time reads from saved rows, not re-parsed PDF text.
 */
export function persistStructuredExtract(
  documentId: string,
  doc: KbDocMeta,
  rawText: string,
): PersistExtractResult {
  const records = extractCapMatrixRecords(doc, rawText);
  const extractType = classifyExtract(doc, rawText, records);

  deleteStructuredData(documentId);
  saveDocumentExtract(documentId, {
    extractType,
    rawText,
    recordCount: records.length,
  });

  const recordIdByKey =
    extractType === 'cap_matrix' && records.length
      ? saveCapMatrixRecords(documentId, records)
      : new Map<string, string>();

  return {
    extractType,
    recordCount: records.length,
    recordIdByKey,
  };
}
