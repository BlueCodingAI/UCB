import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../lib/logger';
import { STORAGE_DIRS } from '../middleware/upload';

/** Extract the spreadsheet id from common Google Sheets share URLs. */
export function parseGoogleSheetId(url: string): string | null {
  const trimmed = url.trim();
  const m =
    trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) ??
    trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  return m?.[1] ?? null;
}

function exportUrl(sheetId: string, format: 'xlsx' | 'csv'): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=${format}`;
}

/**
 * Download a public Google Sheet to local storage (xlsx, falling back to csv).
 * The sheet must be shared as "Anyone with the link can view".
 */
export async function downloadGoogleSheetToFile(sourceUrl: string): Promise<{
  filePath: string;
  fileMime: string;
  fileSize: number;
}> {
  const sheetId = parseGoogleSheetId(sourceUrl);
  if (!sheetId) {
    throw new Error(
      'Invalid Google Sheets URL. Use a link like https://docs.google.com/spreadsheets/d/<id>/edit',
    );
  }

  const name = `gsheet_${sheetId}_${Date.now()}.xlsx`;
  const filePath = path.join(STORAGE_DIRS.uploadsDir, name);

  for (const format of ['xlsx', 'csv'] as const) {
    const url = exportUrl(sheetId, format);
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) {
        logger.warn({ status: res.status, format, sheetId }, 'google sheet export attempt failed');
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 32) continue;
      // Google returns HTML login page when the sheet is private.
      const head = buf.subarray(0, 200).toString('utf8').toLowerCase();
      if (head.includes('<!doctype html') || head.includes('<html')) {
        throw new Error(
          'Google Sheet is not publicly accessible. Share it as "Anyone with the link can view", or upload an exported .xlsx file instead.',
        );
      }
      const ext = format === 'xlsx' ? '.xlsx' : '.csv';
      const finalPath = filePath.replace(/\.xlsx$/, ext);
      fs.writeFileSync(finalPath, buf);
      return {
        filePath: finalPath,
        fileMime:
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv',
        fileSize: buf.length,
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes('not publicly accessible')) throw err;
      logger.warn({ err, format, sheetId }, 'google sheet download failed');
    }
  }

  throw new Error(
    'Could not download the Google Sheet. Ensure it is shared publicly, or upload an exported .xlsx/.csv file.',
  );
}
