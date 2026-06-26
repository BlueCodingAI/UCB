'use client';

import { Check } from 'lucide-react';
import { useLocale } from 'next-intl';
import { CAP_STAGES } from '@/lib/constants';
import type { CapStage, Locale } from '@/lib/types';
import { cn } from '@/lib/utils';

type NodeState = 'done' | 'active' | 'upcoming';

function stateFor(index: number, currentIndex: number): NodeState {
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'active';
  return 'upcoming';
}

/**
 * Signature CAP journey rail. Numbered nodes (01..06) with a gradient
 * connector running primary → border to mark progress. Falls back to a
 * generic (stage 0 active) view when no current stage is known.
 */
export function StageTracker({
  current,
  className,
  orientation = 'horizontal',
}: {
  current?: CapStage | null;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}) {
  const locale = useLocale() as Locale;
  const currentIndex = current ? CAP_STAGES.findIndex((s) => s.key === current) : 0;
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;

  if (orientation === 'vertical') {
    return (
      <ol className={cn('relative space-y-0', className)}>
        {CAP_STAGES.map((stage, i) => {
          const state = stateFor(i, safeIndex);
          const last = i === CAP_STAGES.length - 1;
          return (
            <li key={stage.key} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-[18px] top-9 h-[calc(100%-1.5rem)] w-0.5',
                    state === 'done' ? 'bg-primary-600' : 'bg-border',
                  )}
                />
              )}
              <Node state={state} index={i} />
              <div className="pt-1.5">
                <p className="font-mono text-[0.66rem] uppercase tracking-wider text-ink-3">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <p
                  className={cn(
                    'text-sm font-semibold',
                    state === 'upcoming' ? 'text-ink-3' : 'text-ink',
                    state === 'active' && 'text-primary',
                  )}
                >
                  {stage[locale]}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <ol className="flex min-w-[560px] items-start">
        {CAP_STAGES.map((stage, i) => {
          const state = stateFor(i, safeIndex);
          const last = i === CAP_STAGES.length - 1;
          return (
            <li key={stage.key} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <span aria-hidden className="h-0.5 flex-1">
                  {i > 0 && (
                    <span
                      className={cn(
                        'block h-0.5 w-full',
                        i <= safeIndex
                          ? 'bg-gradient-to-r from-primary-600 to-primary-600'
                          : 'bg-gradient-to-r from-primary-600/40 to-border',
                      )}
                    />
                  )}
                </span>
                <Node state={state} index={i} />
                <span aria-hidden className="h-0.5 flex-1">
                  {!last && (
                    <span
                      className={cn(
                        'block h-0.5 w-full',
                        i < safeIndex
                          ? 'bg-gradient-to-r from-primary-600 to-primary-600'
                          : 'bg-gradient-to-r from-primary-600/40 to-border',
                      )}
                    />
                  )}
                </span>
              </div>
              <p className="mt-2 font-mono text-[0.62rem] uppercase tracking-wider text-ink-3">
                {String(i + 1).padStart(2, '0')}
              </p>
              <p
                className={cn(
                  'mt-0.5 max-w-[7rem] text-xs font-semibold leading-tight',
                  state === 'upcoming' ? 'text-ink-3' : 'text-ink',
                  state === 'active' && 'text-primary',
                )}
              >
                {stage[locale]}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Node({ state, index }: { state: NodeState; index: number }) {
  return (
    <span
      className={cn(
        'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold transition',
        state === 'done' && 'border-primary-600 bg-primary-600 text-white',
        state === 'active' && 'border-accent bg-accent-soft text-accent-ink animate-node-pulse',
        state === 'upcoming' && 'border-border bg-surface text-ink-3',
      )}
    >
      {state === 'done' ? <Check className="h-4 w-4" /> : String(index + 1).padStart(2, '0')}
    </span>
  );
}
