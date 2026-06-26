'use client';

import { useState, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FaqItem {
  q: string;
  a: string;
}

/** Accessible disclosure accordion — one open at a time, full keyboard support. */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {items.map((item, i) => {
        const isOpen = open === i;
        const btnId = `${baseId}-btn-${i}`;
        const panelId = `${baseId}-panel-${i}`;
        return (
          <div key={i}>
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-surface-sunk/50"
              >
                <span className="text-base font-semibold text-ink">{item.q}</span>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200',
                    isOpen && 'rotate-180 text-primary-600',
                  )}
                  aria-hidden
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              hidden={!isOpen}
              className="px-5 pb-5 text-[0.95rem] leading-relaxed text-ink-2"
            >
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
