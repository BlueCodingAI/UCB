import { db } from '../db/connection';
import { ANSWER_INTRO } from './groundingPrompt';
import { parseCapMatrixFromText, type CapMatrixRecord, dedupeRecords } from './capMatrixParser';
import type { QueryAnalysis } from './queryAnalysis';
import type { CitationDTO, Locale } from '../types';

export interface StructuredAnswerResult {
  content: string;
  language: Locale;
  citations: CitationDTO[];
  isFallback: false;
  retrievalScore: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  sourceChunks: { chunkId: string; documentId: string; score: number }[];
}

interface ChunkRow {
  chunkId: string;
  documentId: string;
  title: string;
  content: string;
  sourceLocator: string | null;
}

/** Reverse-parse a indexed CAP Seat Matrix Record chunk back into a record. */
export function parseRecordFromChunk(content: string, docTitle?: string): CapMatrixRecord | null {
  if (!content.includes('CAP Seat Matrix Record')) return null;

  const line = (re: RegExp): string | null => {
    const m = content.match(re);
    return m?.[1]?.trim() ?? null;
  };
  const numFrom = (re: RegExp): number | null => {
    const v = line(re);
    if (!v) return null;
    const n = parseInt(v.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  };

  const instituteCode = line(/^Institute Code\s*:?\s*(\d{5})/im)?.replace(/\D/g, '') ?? '';
  if (!/^0\d{4}$/.test(instituteCode)) return null;

  const categoryLines: string[] = [];
  const extraLines: string[] = [];
  let section: 'none' | 'cat' | 'extra' = 'none';
  for (const raw of content.split('\n')) {
    const t = raw.trim();
    if (t === 'Category-wise seat distribution:') {
      section = 'cat';
      continue;
    }
    if (t === 'Additional allocations:') {
      section = 'extra';
      continue;
    }
    if (section === 'cat' && t.startsWith('  ')) categoryLines.push(t.trim());
    if (section === 'extra' && t.startsWith('  ')) extraLines.push(t.trim());
  }

  const pageM = content.match(/^Source Page:\s*(\d+)/im);

  return {
    instituteCode,
    instituteName: line(/^Institute Name\s*:?\s*(.+)$/im) ?? `Institute ${instituteCode}`,
    instituteStatus: line(/^Status\s*:?\s*(.+)$/im),
    capSeats: numFrom(/^CAP Seats(?: \(institute total\))?\s*:?\s*(\d+)/im),
    choiceCode: line(/^Choice Code\s*:?\s*(\S+)/im),
    courseName: line(/^Course \/ Branch\s*:?\s*(.+)$/im),
    si: numFrom(/^Sanctioned Intake \(SI\)\s*:?\s*(\d+)/im) ?? numFrom(/^Sanctioned Intake\s*:?\s*(\d+)/im),
    msSeats:
      numFrom(/^MS Seats \(Maharashtra State\)\s*:?\s*(\d+)/im) ??
      numFrom(/^MS Seats\s*:?\s*(\d+)/im),
    minoritySeats: numFrom(/^Minority Seats\s*:?\s*(\d+)/im),
    allIndiaSeats: numFrom(/^All India Seats\s*:?\s*(\d+)/im),
    instituteSeats: numFrom(/^Institute Level Seats\s*:?\s*(\d+)/im),
    orphanSeats: numFrom(/^Orphan Seats\s*:?\s*(\d+)/im),
    categoryLines,
    ewsSeats: numFrom(/^EWS Seats\s*:?\s*(\d+)/im),
    tfwsDetail: line(/^TFWS\s*:?\s*(.+)$/im),
    page: pageM ? parseInt(pageM[1], 10) : null,
    extraLines,
  };
}

/** Load every indexed chunk for the given institute code(s) from SQLite. */
export function fetchInstituteChunksFromDb(codes: string[]): ChunkRow[] {
  if (!codes.length) return [];

  const clauses: string[] = [];
  const params: string[] = [];
  for (const code of codes) {
    clauses.push(`(c.content LIKE ? OR c.content LIKE ?)`);
    params.push(`%Institute Code: ${code}%`, `%=== Institute ${code} ===%`);
  }

  const sql = `
    SELECT c.id AS chunkId, c.document_id AS documentId, c.content, c.source_locator AS sourceLocator,
           d.title AS title
      FROM kb_chunks c
      JOIN kb_documents d ON d.id = c.document_id
     WHERE c.is_active = 1 AND d.is_active = 1 AND d.deleted_at IS NULL
       AND (${clauses.join(' OR ')})
     ORDER BY
       CASE WHEN c.content LIKE 'CAP Seat Matrix Record%' THEN 0 ELSE 1 END,
       c.chunk_index ASC`;

  return db.prepare(sql).all(...params) as ChunkRow[];
}

export function recordsForInstitute(codes: string[]): CapMatrixRecord[] {
  const chunks = fetchInstituteChunksFromDb(codes);
  const records: CapMatrixRecord[] = [];

  for (const ch of chunks) {
    const rec = parseRecordFromChunk(ch.content, ch.title);
    if (rec && codes.includes(rec.instituteCode)) {
      records.push(rec);
      continue;
    }
    // Fallback: parse raw chunk text if not structured record format.
    if (codes.some((c) => ch.content.includes(c))) {
      for (const r of parseCapMatrixFromText(ch.content)) {
        if (codes.includes(r.instituteCode)) records.push(r);
      }
    }
  }

  return dedupeRecords(records);
}

function wantsCourseList(q: string): boolean {
  return /course|branch|program|available|offered|list|what.*at|which.*at/i.test(q);
}

function wantsTotalIntake(q: string): boolean {
  return /sanctioned|intake|itake|inake|total\s*seat|how many seat/i.test(q);
}

function wantsCategoryDetail(q: string, analysis: QueryAnalysis): boolean {
  return !!analysis.categoryHint || /category|sc\b|st\b|obc|ews|open|all india|g\/l|ladies|general seat/i.test(q);
}

function formatCategoryBlock(r: CapMatrixRecord): string {
  const lines: string[] = [];
  if (r.msSeats != null) lines.push(`MS Seats (Maharashtra CAP): **${r.msSeats}**`);
  if (r.allIndiaSeats != null) lines.push(`All India Seats: **${r.allIndiaSeats}**`);
  if (r.minoritySeats != null) lines.push(`Minority Seats: **${r.minoritySeats}**`);
  if (r.instituteSeats != null) lines.push(`Institute Level Seats: **${r.instituteSeats}**`);
  if (r.orphanSeats != null) lines.push(`Orphan Seats: **${r.orphanSeats}**`);
  if (r.ewsSeats != null) lines.push(`EWS Seats: **${r.ewsSeats}**`);
  if (r.tfwsDetail) lines.push(`TFWS: **${r.tfwsDetail}**`);
  for (const cl of r.categoryLines.slice(0, 12)) lines.push(cl);
  return lines.join('\n   ');
}

function buildCourseBullet(r: CapMatrixRecord, includeCategories: boolean): string {
  const parts = [`**${r.courseName ?? 'Course'}**`];
  if (r.choiceCode) parts.push(`Choice Code: ${r.choiceCode}`);
  if (r.si != null) parts.push(`SI (Sanctioned Intake): **${r.si}**`);
  if (r.msSeats != null) parts.push(`MS Seats: **${r.msSeats}**`);
  if (r.allIndiaSeats != null) parts.push(`All India: **${r.allIndiaSeats}**`);
  const page = r.page != null ? ` · Page ${r.page}` : '';
  let bullet = `• ${parts.join(' · ')}${page}`;
  if (includeCategories && (r.categoryLines.length || r.ewsSeats != null)) {
    bullet += `\n   ${formatCategoryBlock(r)}`;
  }
  return bullet;
}

/** Deterministic, KB-grounded answer for institute seat-matrix questions. */
export function buildInstituteMatrixAnswer(params: {
  question: string;
  language: Locale;
  analysis: QueryAnalysis;
  records: CapMatrixRecord[];
  chunks: ChunkRow[];
}): string {
  const { question, language, analysis, records } = params;
  const code = analysis.instituteCodes[0] ?? records[0]?.instituteCode ?? '';
  const institute = records[0];
  const instituteName = institute?.instituteName ?? `Institute ${code}`;
  const docTitle = params.chunks[0]?.title ?? 'Seat Matrix';

  const totalSi = records.reduce((s, r) => s + (r.si ?? 0), 0);
  const includeCategories = wantsCategoryDetail(question, analysis);
  const listCourses = wantsCourseList(question) || records.length > 1 || !wantsTotalIntake(question);

  const intro = ANSWER_INTRO[language];

  let directAnswer: string;
  if (listCourses) {
    directAnswer = `**Institute ${code}** (${instituteName}) offers **${records.length} course(s)** in the CAP seat matrix with a combined Sanctioned Intake (SI) of **${totalSi || 'see course-wise breakdown below'}** seats.`;
  } else {
    directAnswer = `The **Sanctioned Intake (SI)** at institute **${code}** (${instituteName}) is **${totalSi}** seats across **${records.length}** course(s) listed in the seat matrix.`;
  }

  const glossary = `**What the numbers mean:**
• **SI (Sanctioned Intake)** — total approved seats for that course branch at the institute.
• **MS Seats** — Maharashtra State quota seats filled through CAP counselling.
• **All India Seats** — seats for All India category candidates (not the same as OPEN/State Level).
• **G / L** — General / Ladies sub-columns within each reservation category at State Level.
• **EWS** — Economically Weaker Section seats (separate row in matrix).
• **TFWS** — Tuition Fee Waiver Scheme (usually a separate choice code ending in T).`;

  const details: string[] = [];
  if (analysis.categoryHint) {
    details.push(
      `• **Category requested:** ${analysis.categoryHint} — figures below are from the seat matrix; use the ${analysis.categoryHint} column (G/L) for counselling, not All India unless you are an All India candidate.`,
    );
  }

  details.push(`• **Institute Code:** ${code}`);
  details.push(`• **Institute Name:** ${instituteName}`);
  if (institute?.instituteStatus) details.push(`• **Status:** ${institute.instituteStatus}`);
  if (institute?.capSeats != null) details.push(`• **Institute CAP Seats (total):** ${institute.capSeats}`);

  details.push('', '**Course-wise breakdown:**');
  for (const r of records) {
    details.push(buildCourseBullet(r, includeCategories));
  }

  if (totalSi > 0) {
    details.push('', `• **Combined Sanctioned Intake (all courses):** **${totalSi}** seats`);
  }

  const pages = [...new Set(records.map((r) => r.page).filter((p): p is number => p != null))];
  const pageRef = pages.length ? ` · Pages ${pages.join(', ')}` : '';

  return [
    intro,
    '',
    directAnswer,
    '',
    glossary,
    '',
    '**Details**',
    ...details,
    '',
    `Sources: ${docTitle}${pageRef}`,
  ].join('\n');
}

export function tryStructuredInstituteAnswer(params: {
  question: string;
  language: Locale;
  analysis: QueryAnalysis;
}): StructuredAnswerResult | null {
  if (!params.analysis.instituteCodes.length) return null;

  const chunks = fetchInstituteChunksFromDb(params.analysis.instituteCodes);
  const records = recordsForInstitute(params.analysis.instituteCodes);
  if (!records.length) return null;

  const content = buildInstituteMatrixAnswer({
    question: params.question,
    language: params.language,
    analysis: params.analysis,
    records,
    chunks,
  });

  const citations: CitationDTO[] = chunks.slice(0, 8).map((c) => ({
    documentId: c.documentId,
    chunkId: c.chunkId,
    title: c.title,
    sourceLocator: c.sourceLocator,
    score: 1,
  }));

  return {
    content,
    language: params.language,
    citations,
    isFallback: false,
    retrievalScore: 1,
    model: 'cap-matrix-lookup',
    promptTokens: 0,
    completionTokens: 0,
    sourceChunks: chunks.slice(0, 8).map((c) => ({
      chunkId: c.chunkId,
      documentId: c.documentId,
      score: 1,
    })),
  };
}

/** Re-export for tests — parse chunk bodies back to records. */
export function recordsFromChunkContents(contents: string[]): CapMatrixRecord[] {
  return dedupeRecords(
    contents.map((c) => parseRecordFromChunk(c)).filter((r): r is CapMatrixRecord => r != null),
  );
}
