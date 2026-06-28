/** 5-digit Maharashtra CAP institute codes (e.g. 06217). */
const INSTITUTE_CODE = /\b(0\d{4})\b/g;

const SEAT_MATRIX =
  /seat\s*matrix|sanctioned\s*intak?e?|sanctioned\s*itake|\bitake\b|\binake\b|\bintke\b|institute\s*code|cut[\s-]?off|cap\s*round|all\s*india\s*seat|category.*percentile|percentile.*category|engineering\s*cap\s*sheet|ms\s*seats?|choice\s*code/i;

const INSTITUTE_QUERY =
  /institute|college|sanctioned|intak?e?|itake|inake|seats?|course|branch|artificial intelligence|computer science|data science|machine learning|available at|offered at/i;

export type QueryIntent = 'seat_matrix' | 'cutoff' | 'general';

export interface QueryAnalysis {
  instituteCodes: string[];
  isSeatMatrix: boolean;
  isInstituteLookup: boolean;
  categoryHint: string | null;
  districtHint: string | null;
  intent: QueryIntent;
}

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/\bsc\b|\bscheduled caste\b|\bgscs\b/i, 'SC'],
  [/\bst\b|\bscheduled tribe\b|\bgsts\b/i, 'ST'],
  [/\bobc\b|\bsebc\b|\bvj\b|\bnt\b|\bdt\b/i, 'OBC/SEBC'],
  [/\bews\b|\beconomically weaker\b/i, 'EWS'],
  [/\bopen\b|\ball india\b|\bgeneral\b|\bgopen\b/i, 'Open/All India'],
];

export function extractInstituteCodes(text: string): string[] {
  const found = text.match(INSTITUTE_CODE) ?? [];
  return [...new Set(found)];
}

export function detectQueryIntent(text: string, analysis: Pick<QueryAnalysis, 'instituteCodes' | 'categoryHint'>): QueryIntent {
  const q = text.toLowerCase();
  const intakeLike =
    /sanctioned|intak?e?|itake|inake|seat\s*matrix|ms\s*seat|choice\s*code|course|branch|available|offered|how many seat/.test(
      q,
    );
  const cutoffLike = /cut[\s-]?off|percentile|merit|cap\s*round|admission chance|allotment/.test(q);

  if (analysis.instituteCodes.length && intakeLike && !cutoffLike) return 'seat_matrix';
  if (cutoffLike) return 'cutoff';
  if (analysis.instituteCodes.length && intakeLike) return 'seat_matrix';
  return 'general';
}

export function analyzeQuery(text: string): QueryAnalysis {
  const instituteCodes = extractInstituteCodes(text);
  const isSeatMatrix =
    SEAT_MATRIX.test(text) ||
    (instituteCodes.length > 0 &&
      /sanctioned|intak?e?|itake|inake|seat|course|branch|matrix|available|offered/i.test(text));
  const isInstituteLookup =
    instituteCodes.length > 0 || (INSTITUTE_QUERY.test(text) && isSeatMatrix);

  let categoryHint: string | null = null;
  for (const [re, label] of CATEGORY_PATTERNS) {
    if (re.test(text)) {
      categoryHint = label;
      break;
    }
  }

  const districtMatch = text.match(
    /\b(?:in|at|for)\s+([A-Za-z][A-Za-z\s]{2,30}?)\s+district\b/i,
  );
  const districtHint = districtMatch?.[1]?.trim() ?? null;

  const intent = detectQueryIntent(text, { instituteCodes, categoryHint });

  return {
    instituteCodes,
    isSeatMatrix,
    isInstituteLookup,
    categoryHint,
    districtHint,
    intent,
  };
}

/** Expand retrieval query with institute codes and matrix keywords. */
export function expandRetrievalQuery(englishQuery: string, analysis: QueryAnalysis): string {
  const parts = [englishQuery];
  if (analysis.instituteCodes.length) {
    parts.push(`institute code ${analysis.instituteCodes.join(' ')} all courses sanctioned intake`);
  }
  if (analysis.isSeatMatrix) {
    parts.push('seat matrix CAP engineering table all branches');
  }
  if (analysis.categoryHint) {
    parts.push(`${analysis.categoryHint} category reservation cut-off`);
  }
  if (analysis.districtHint) {
    parts.push(`${analysis.districtHint} district institutes`);
  }
  return parts.join('. ');
}

/** Route doc-engine to the right KB documents (seat matrix vs cut-off vs general). */
export function filterDocSources<T extends { title: string }>(
  sources: T[],
  question: string,
  intent?: QueryIntent,
): T[] {
  const q = question.toLowerCase();
  if (!/intake|itake|inake|seat|matrix|cut.?off|institute|sanctioned|percentile|round|course|branch/.test(q)) {
    return sources;
  }

  if (intent === 'seat_matrix') {
    const matrix = sources.filter((s) =>
      /seat\s*matrix|sanctioned|engineering\s*cap|cap\s*seat|institute.?wise|intake\s*matrix/i.test(s.title),
    );
    if (matrix.length) return matrix;
  }

  if (intent === 'cutoff') {
    const cutoff = sources.filter((s) =>
      /cut.?off|cap\s*round|percentile|merit|ai\s*seat/i.test(s.title),
    );
    if (cutoff.length) return cutoff;
  }

  const filtered = sources.filter((s) =>
    /seat|matrix|cut.?off|brochure|information|engineering|cap|sanctioned|intake/i.test(s.title),
  );
  return filtered.length ? filtered : sources;
}
