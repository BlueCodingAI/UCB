export interface StructuredChunk {
  content: string;
  sourceLocator: string;
}

const DEFAULT_TARGET = 1800;
const DEFAULT_MAX = 2200;
const OVERLAP_RATIO = 0.2;

/** Rough token estimate (~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitOversizedParagraph(para: string, maxChars: number): string[] {
  const out: string[] = [];
  const sentences = splitSentences(para);
  let buf = '';
  for (const s of sentences) {
    if (s.length > maxChars) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars));
      continue;
    }
    if (buf && buf.length + 1 + s.length > maxChars) {
      out.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** True when the block is a Markdown pipe table. */
function isMarkdownTable(block: string): boolean {
  const lines = block.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return false;
  const pipeRows = lines.filter((l) => (l.match(/\|/g) ?? []).length >= 2).length;
  return pipeRows >= 2 && lines.some((l) => /^\|?\s*:?-{3,}/.test(l));
}

/** Split a large table by institute code groups (seat matrix: all courses per institute in one chunk). */
function chunkTableByInstitute(rows: string[], header: string[], maxChars: number): StructuredChunk[] {
  const codeIdx = header.findIndex((h) => /institute|code|college\s*code|inst\.?\s*code/i.test(h));
  const courseIdx = header.findIndex((h) => /course|branch|programme|program/i.test(h));

  if (codeIdx < 0) return [];

  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const fmtRow = (cells: string[]) => `| ${cells.map(esc).join(' | ')} |`;
  const headerRow = fmtRow(header);
  const sepRow = fmtRow(header.map(() => '---'));

  const groups = new Map<string, string[][]>();
  let lastCode = '';

  for (const row of rows) {
    const cells = parseTableRow(row);
    if (cells.length < header.length) {
      while (cells.length < header.length) cells.push('');
    }
    let code = (cells[codeIdx] ?? '').replace(/\D/g, '');
    if (/^0\d{4}$/.test(code)) {
      lastCode = code;
    } else if (lastCode && !code) {
      code = lastCode;
      cells[codeIdx] = lastCode;
    } else if (!code) continue;

    const existing = groups.get(code) ?? [];
    existing.push(cells);
    groups.set(code, existing);
  }

  const out: StructuredChunk[] = [];
  for (const [code, groupRows] of groups) {
    const bodyRows = groupRows.map((cells) => fmtRow(cells));
    let text = [headerRow, sepRow, ...bodyRows].join('\n');
    const courses = groupRows
      .map((r) => r[courseIdx >= 0 ? courseIdx : 1])
      .filter(Boolean)
      .join(', ');

    if (text.length > maxChars) {
      // Split large institutes but keep header; still better than arbitrary row splits.
      const partial = chunkTable(text, maxChars);
      partial.forEach((part, idx) => {
        out.push({
          content: part,
          sourceLocator: `Institute ${code}${courses ? ` · ${courses.slice(0, 80)}` : ''} · part ${idx + 1}`,
        });
      });
    } else {
      out.push({
        content: text,
        sourceLocator: `Institute ${code}${courses ? ` · courses: ${courses.slice(0, 120)}` : ''}`,
      });
    }
  }

  return out;
}

/** Parse markdown table into header + body row strings. */
function parseMarkdownTable(block: string): { header: string[]; rows: string[] } | null {
  const lines = block.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return null;
  const header = parseTableRow(lines[0]);
  const rows = lines.slice(2).filter((l) => !/^\|?\s*:?-{3,}/.test(l.trim()));
  return { header, rows };
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim().replace(/\\(.)/g, '$1'));
}

/** Split a large table by row groups, repeating the header in each chunk. */
function chunkTable(block: string, maxChars: number): string[] {
  const lines = block.split('\n');
  if (lines.length <= 3) return [block.trim()].filter(Boolean);

  const header = lines.slice(0, 2); // header + separator
  const rows = lines.slice(2);
  const headerText = header.join('\n');
  const chunks: string[] = [];
  let buf = headerText;

  for (const row of rows) {
    const candidate = buf ? `${buf}\n${row}` : row;
    if (candidate.length > maxChars && buf !== headerText) {
      chunks.push(buf.trim());
      buf = `${headerText}\n${row}`;
    } else if (candidate.length > maxChars) {
      // Single row too wide — keep whole table row as its own chunk.
      chunks.push(row.trim());
      buf = headerText;
    } else {
      buf = candidate;
    }
  }
  if (buf.trim() && buf.trim() !== headerText.trim()) chunks.push(buf.trim());
  return chunks.filter(Boolean);
}

/** Split prose (non-table) with paragraph/sentence boundaries and overlap. */
function chunkProse(text: string, targetChars: number, maxChars: number): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];
  const overlap = Math.round(targetChars * OVERLAP_RATIO);

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const units: string[] = [];
  for (const p of paragraphs) {
    if (p.length > maxChars) units.push(...splitOversizedParagraph(p, maxChars));
    else units.push(p);
  }

  const chunks: string[] = [];
  let buf = '';
  for (const u of units) {
    if (buf && buf.length + 2 + u.length > maxChars) {
      chunks.push(buf);
      const tail = buf.slice(Math.max(0, buf.length - overlap));
      buf = `${tail}\n\n${u}`.slice(0, maxChars);
      if (buf.length >= maxChars) {
        chunks.push(buf);
        buf = u.length > maxChars ? u.slice(0, maxChars) : u;
      }
    } else {
      buf = buf ? `${buf}\n\n${u}` : u;
    }
  }
  if (buf.trim()) chunks.push(buf);
  return chunks.map((c) => c.trim()).filter(Boolean);
}

function extractPageMarker(block: string): string | null {
  const m = block.match(/^\[Page (\d+)\]/);
  return m ? `Page ${m[1]}` : null;
}

/**
 * Structure-aware chunking: keeps Markdown tables intact, respects page markers,
 * and produces source locators for citations.
 */
export function chunkStructuredText(
  text: string,
  opts?: { targetChars?: number; maxChars?: number },
): StructuredChunk[] {
  const targetChars = opts?.targetChars ?? DEFAULT_TARGET;
  const maxChars = opts?.maxChars ?? DEFAULT_MAX;
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  // Split on explicit page separators inserted by pdfExtract / spreadsheets.
  const pageSections = normalized.split(/\n---\n/).map((s) => s.trim()).filter(Boolean);
  const out: StructuredChunk[] = [];

  for (const section of pageSections) {
    const pageLoc = extractPageMarker(section) ?? undefined;
    const body = section.replace(/^\[Page \d+\]\s*/m, '').trim();
    if (!body) continue;

    // Further split on double newlines but keep tables as atomic units when possible.
    const blocks: string[] = [];
    let current = '';
    for (const para of body.split(/\n{2,}/)) {
      const p = para.trim();
      if (!p) continue;
      if (isMarkdownTable(p)) {
        if (current.trim()) {
          blocks.push(current.trim());
          current = '';
        }
        blocks.push(p);
      } else {
        current = current ? `${current}\n\n${p}` : p;
      }
    }
    if (current.trim()) blocks.push(current.trim());

    for (const block of blocks) {
      const locator = pageLoc ?? 'document';
      if (isMarkdownTable(block)) {
        const parsed = parseMarkdownTable(block);
        const instituteChunks =
          parsed && parsed.rows.length >= 2
            ? chunkTableByInstitute(parsed.rows, parsed.header, maxChars)
            : [];

        if (instituteChunks.length > 0) {
          out.push(...instituteChunks);
        } else {
          const tableChunks = block.length <= maxChars ? [block] : chunkTable(block, maxChars);
          tableChunks.forEach((tc, idx) => {
            out.push({
              content: tc,
              sourceLocator: tableChunks.length > 1 ? `${locator} · table part ${idx + 1}` : `${locator} · table`,
            });
          });
        }
      } else {
        const proseChunks = chunkProse(block, targetChars, maxChars);
        proseChunks.forEach((pc, idx) => {
          out.push({
            content: pc,
            sourceLocator: proseChunks.length > 1 ? `${locator} · part ${idx + 1}` : locator,
          });
        });
      }
    }
  }

  return out;
}

/** Build the text we embed — lightweight doc context that also helps retrieval match. */
export function buildEmbeddingText(params: {
  title: string;
  topic?: string | null;
  course?: string | null;
  capYear?: number | null;
  body: string;
}): string {
  const meta: string[] = [];
  if (params.topic) meta.push(params.topic.replace(/_/g, ' '));
  if (params.course) meta.push(params.course);
  if (params.capYear) meta.push(`CAP ${params.capYear}`);
  const header = meta.length ? `${params.title} · ${meta.join(' · ')}` : params.title;
  return `${header}\n\n${params.body}`.trim();
}

/** Prefix applied to user queries at embed time (symmetric domain hint). */
export function buildQueryEmbeddingText(englishQuery: string): string {
  const q = englishQuery.trim();
  if (!q) return q;
  return `Maharashtra CAP centralised admission process: ${q}`;
}
