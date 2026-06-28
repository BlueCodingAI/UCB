import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { logger } from '../lib/logger';

// pdfjs worker is required even in Node; point at the package copy.
const workerSrc = path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'legacy',
  'build',
  'pdf.worker.mjs',
);
GlobalWorkerOptions.workerSrc = pathToFileURL(workerSrc).href;

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const LINE_Y_TOLERANCE = 3;
const COLUMN_GAP_MIN = 14;
const TABLE_MIN_COLUMNS = 3;
const TABLE_MIN_ROWS = 2;

/** Collapse repeated whitespace while preserving single spaces. */
function cleanToken(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Group positioned glyphs into reading-order lines. */
function clusterLines(items: TextItem[]): TextItem[][] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines.find((l) => Math.abs(l[0].y - item.y) <= LINE_Y_TOLERANCE);
    if (line) line.push(item);
    else lines.push([item]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

/** Merge adjacent text items on the same line into column cells. */
function lineToCells(line: TextItem[]): string[] {
  if (!line.length) return [];
  const cells: string[] = [];
  let buf = line[0].str;
  let prevEnd = line[0].x + line[0].width;
  for (let i = 1; i < line.length; i++) {
    const gap = line[i].x - prevEnd;
    if (gap >= COLUMN_GAP_MIN) {
      cells.push(cleanToken(buf));
      buf = line[i].str;
    } else {
      buf += line[i].str;
    }
    prevEnd = line[i].x + line[i].width;
  }
  cells.push(cleanToken(buf));
  return cells.filter(Boolean);
}

function lineText(line: TextItem[]): string {
  return cleanToken(line.map((i) => i.str).join(' '));
}

/** True when consecutive lines share a similar column layout (tabular data). */
function looksLikeTable(lines: TextItem[][]): boolean {
  if (lines.length < TABLE_MIN_ROWS) return false;
  const cellCounts = lines.map((l) => lineToCells(l).length);
  const maxCols = Math.max(...cellCounts);
  if (maxCols < TABLE_MIN_COLUMNS) return false;
  const multiColRows = cellCounts.filter((n) => n >= TABLE_MIN_COLUMNS).length;
  return multiColRows >= TABLE_MIN_ROWS;
}

/** Render a detected table block as a Markdown table. */
function formatTableBlock(lines: TextItem[][]): string {
  const rows = lines.map((l) => lineToCells(l)).filter((r) => r.some(Boolean));
  if (!rows.length) return '';
  const colCount = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    const copy = [...r];
    while (copy.length < colCount) copy.push('');
    return copy;
  });
  const header = padded[0];
  const sep = header.map(() => '---');
  const body = padded.slice(1);
  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const fmtRow = (r: string[]) => `| ${r.map(esc).join(' | ')} |`;
  return [fmtRow(header), fmtRow(sep), ...body.map(fmtRow)].join('\n');
}

interface PageBlock {
  kind: 'text' | 'table';
  lines?: TextItem[][];
  text?: string;
}

/** Split page lines into prose paragraphs vs table blocks. */
function segmentPage(lines: TextItem[][]): PageBlock[] {
  const blocks: PageBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    // Try to grow a table starting at i.
    let j = i + TABLE_MIN_ROWS;
    let bestEnd = i;
    while (j <= lines.length) {
      const slice = lines.slice(i, j);
      if (looksLikeTable(slice)) bestEnd = j;
      j += 1;
    }
    if (bestEnd > i) {
      blocks.push({ kind: 'table', lines: lines.slice(i, bestEnd) });
      i = bestEnd;
      continue;
    }
    // Prose: absorb until next table candidate or blank-ish break.
    const prose: string[] = [];
    while (i < lines.length) {
      const probe = lines.slice(i, Math.min(lines.length, i + TABLE_MIN_ROWS));
      if (probe.length >= TABLE_MIN_ROWS && looksLikeTable(probe)) break;
      const t = lineText(lines[i]);
      if (t) prose.push(t);
      i += 1;
    }
    if (prose.length) blocks.push({ kind: 'text', text: prose.join('\n') });
  }
  return blocks;
}

function renderPage(pageNum: number, blocks: PageBlock[]): string {
  const parts: string[] = [`[Page ${pageNum}]`];
  for (const b of blocks) {
    if (b.kind === 'table' && b.lines) {
      const table = formatTableBlock(b.lines);
      if (table) parts.push(table);
    } else if (b.text?.trim()) {
      parts.push(b.text.trim());
    }
  }
  return parts.join('\n\n');
}

/**
 * Extract structured text from a PDF using pdf.js layout positions.
 * Preserves page markers and converts detected tabular regions to Markdown tables.
 */
export async function extractPdfText(filePath: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  const data = new Uint8Array(buf);
  const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;

  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    try {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const raw of content.items) {
        if (!('str' in raw) || typeof raw.str !== 'string') continue;
        const t = cleanToken(raw.str);
        if (!t) continue;
        const tr = raw.transform;
        items.push({
          str: t,
          x: tr[4],
          y: tr[5],
          width: raw.width ?? Math.max(1, t.length * 4),
          height: raw.height ?? 10,
        });
      }
      const lines = clusterLines(items);
      const blocks = segmentPage(lines);
      const rendered = renderPage(p, blocks);
      if (rendered.replace(/\[Page \d+\]/, '').trim()) pages.push(rendered);
    } catch (err) {
      logger.warn({ err, page: p, filePath }, 'pdf page extraction failed');
    }
  }

  await doc.destroy();
  const out = pages.join('\n\n---\n\n').trim();
  if (out) return out;

  // Last resort: legacy pdf-parse for scanned/image-only PDFs (often empty here too).
  logger.warn({ filePath }, 'pdfjs returned no text; falling back to pdf-parse');
  const pdfParse = (await import('pdf-parse')).default;
  const parsed = await pdfParse(buf);
  const legacy = (parsed.text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!legacy) return '';
  return legacy
    .split(/\n{2,}/)
    .map((p, i) => `[Page ${i + 1}]\n${p.trim()}`)
    .join('\n\n---\n\n');
}
