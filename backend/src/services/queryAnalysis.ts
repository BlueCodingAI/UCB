/** 5-digit Maharashtra CAP institute codes (e.g. 06217). */
const INSTITUTE_CODE = /\b(0\d{4})\b/g;

const SEAT_MATRIX =
  /seat\s*matrix|sanctioned\s*intake|\bintake\b|institute\s*code|cut[\s-]?off|cap\s*round|all\s*india\s*seat|category.*percentile|percentile.*category|engineering\s*cap\s*sheet/i;

const INSTITUTE_QUERY =
  /institute|college|sanctioned|intake|seats?|course|branch|artificial intelligence|computer science|data science|machine learning/i;

export interface QueryAnalysis {
  instituteCodes: string[];
  isSeatMatrix: boolean;
  isInstituteLookup: boolean;
  categoryHint: string | null;
  districtHint: string | null;
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

export function analyzeQuery(text: string): QueryAnalysis {
  const instituteCodes = extractInstituteCodes(text);
  const isSeatMatrix = SEAT_MATRIX.test(text);
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

  return {
    instituteCodes,
    isSeatMatrix,
    isInstituteLookup,
    categoryHint,
    districtHint,
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

/** Filter doc-engine sources to seat-matrix / cut-off docs when the question is matrix-related. */
export function filterDocSources<T extends { title: string }>(sources: T[], question: string): T[] {
  const q = question.toLowerCase();
  if (!/intake|seat|matrix|cut.?off|institute|sanctioned|percentile|round/.test(q)) {
    return sources;
  }
  const filtered = sources.filter((s) =>
    /seat|matrix|cut.?off|brochure|information|engineering|cap/i.test(s.title),
  );
  return filtered.length ? filtered : sources;
}
