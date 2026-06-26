import { FileText } from 'lucide-react';
import type { Citation } from '@/lib/types';

/** A single clean source pill — document name only (no chunk locators). */
export function CitationChip({ title }: { title: string }) {
  return (
    <span className="inline-flex max-w-[15rem] items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1 text-[0.72rem] text-ink-2 shadow-xs ring-1 ring-border transition hover:ring-border-strong">
      <FileText className="h-3 w-3 shrink-0 text-primary-600" aria-hidden />
      <span className="truncate">{title}</span>
    </span>
  );
}

/**
 * Source strip beneath a grounded answer. Shows each source DOCUMENT once
 * (deduped by document, name only) — the transparency signal, kept clean.
 */
export function CitationStrip({ citations, sourceLabel }: { citations: Citation[]; sourceLabel?: string }) {
  if (!citations.length) return null;

  const seen = new Set<string>();
  const docs: { id: string; title: string }[] = [];
  for (const c of citations) {
    if (!c.title || seen.has(c.documentId)) continue;
    seen.add(c.documentId);
    docs.push({ id: c.documentId, title: c.title });
  }
  if (!docs.length) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {sourceLabel && (
        <span className="font-mono text-[0.64rem] uppercase tracking-wider text-ink-3">{sourceLabel}</span>
      )}
      {docs.map((d) => (
        <CitationChip key={d.id} title={d.title} />
      ))}
    </div>
  );
}
