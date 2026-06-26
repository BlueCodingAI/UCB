'use client';

import { useLocale } from 'next-intl';
import { Check } from 'lucide-react';
import { CAP_STAGES } from '@/lib/constants';
import type { CapStage, Locale, Recommendation } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Detailed vertical CAP timeline. Each stage shows its number, name, and any
 * recommendation steps that belong to it (grouped by stepType when it maps to
 * a stage; otherwise rendered under "Other steps").
 */
export function StageTimeline({
  current,
  recommendations = [],
  className,
}: {
  current?: CapStage | null;
  recommendations?: Recommendation[];
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const currentIndex = current ? CAP_STAGES.findIndex((s) => s.key === current) : 0;
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;

  return (
    <ol className={cn('relative', className)}>
      {CAP_STAGES.map((stage, i) => {
        const state = i < safeIndex ? 'done' : i === safeIndex ? 'active' : 'upcoming';
        const last = i === CAP_STAGES.length - 1;
        const steps = recommendations.filter((r) => stageOf(r.stepType) === stage.key);
        return (
          <li key={stage.key} className="relative flex gap-4 pb-8 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[19px] top-10 h-[calc(100%-2rem)] w-0.5',
                  state === 'done' ? 'bg-primary-600' : 'bg-border',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold',
                state === 'done' && 'border-primary-600 bg-primary-600 text-white',
                state === 'active' && 'border-accent bg-accent-soft text-accent-ink animate-node-pulse',
                state === 'upcoming' && 'border-border bg-surface text-ink-3',
              )}
            >
              {state === 'done' ? <Check className="h-4 w-4" /> : String(i + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className={cn('text-base font-semibold', state === 'active' ? 'text-primary' : 'text-ink')}>
                  {stage[locale]}
                </h3>
                {state === 'active' && (
                  <span className="font-mono text-[0.62rem] uppercase tracking-wider text-accent">You are here</span>
                )}
              </div>
              {steps.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {steps.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 text-sm text-ink-2">
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          s.status === 'done' ? 'bg-primary-600' : 'bg-border-strong',
                        )}
                      />
                      <span className={cn(s.status === 'done' && 'text-ink-3 line-through')}>{s.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Best-effort map of a recommendation stepType to a CAP stage key. */
function stageOf(stepType: string): CapStage | null {
  const t = stepType.toLowerCase();
  if (t.includes('regist')) return 'registration';
  if (t.includes('document') || t.includes('verif')) return 'document_verification';
  if (t.includes('merit')) return 'merit_list';
  if (t.includes('option') || t.includes('form')) return 'option_form';
  if (t.includes('allot')) return 'allotment';
  if (t.includes('report') || t.includes('admit') || t.includes('confirm')) return 'reporting';
  return null;
}
