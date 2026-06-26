'use client';

import { Check } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useLocale } from 'next-intl';
import type { Locale } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface TimelineEntry {
  status: string;
  label: string;
  at: number | null;
  note?: string | null;
  done: boolean;
  current?: boolean;
}

/** Canonical request status flow → human labels. */
const STATUS_FLOW: { status: string; label: string }[] = [
  { status: 'submitted', label: 'Submitted' },
  { status: 'in_review', label: 'In review' },
  { status: 'assigned', label: 'Counsellor assigned' },
  { status: 'scheduled', label: 'Appointment scheduled' },
  { status: 'completed', label: 'Completed' },
];

const STATUS_TONE: Record<string, BadgeTone> = {
  submitted: 'neutral',
  in_review: 'warning',
  assigned: 'primary',
  scheduled: 'accent',
  completed: 'success',
  cancelled: 'danger',
  closed: 'neutral',
};

export function statusTone(status: string): BadgeTone {
  return STATUS_TONE[status] ?? 'neutral';
}

export function statusLabel(status: string): string {
  const found = STATUS_FLOW.find((s) => s.status === status);
  if (found) return found.label;
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Vertical status timeline for a counselling request. */
export function StatusTimeline({ currentStatus, createdAt }: { currentStatus: string; createdAt: number }) {
  const locale = useLocale() as Locale;

  // If terminal/cancelled, surface it as its own node.
  const terminal = currentStatus === 'cancelled' || currentStatus === 'closed';
  const currentIndex = STATUS_FLOW.findIndex((s) => s.status === currentStatus);

  const steps = STATUS_FLOW.map((s, i) => ({
    ...s,
    done: !terminal && currentIndex >= 0 && i < currentIndex,
    current: !terminal && i === currentIndex,
  }));

  return (
    <ol className="relative space-y-0">
      {steps.map((step, i) => {
        const reached = step.done || step.current;
        return (
          <li key={step.status} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5',
                  step.done ? 'bg-primary-600' : 'bg-border',
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                'relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                step.done && 'border-primary-600 bg-primary-600 text-white',
                step.current && 'border-accent bg-accent-soft text-accent animate-node-pulse',
                !reached && 'border-border bg-surface text-ink-3',
              )}
            >
              {step.done ? <Check className="h-4 w-4" /> : <span className="text-xs font-semibold">{i + 1}</span>}
            </span>
            <div className="flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn('text-sm font-semibold', reached ? 'text-ink' : 'text-ink-3')}>{step.label}</p>
                {step.current && <Badge tone={statusTone(step.status)}>{statusLabel(step.status)}</Badge>}
              </div>
              {i === 0 && <p className="mt-0.5 text-xs text-ink-3">{formatDateTime(createdAt, locale)}</p>}
            </div>
          </li>
        );
      })}
      {terminal && (
        <li className="relative flex gap-4">
          <span
            aria-hidden
            className="relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-danger bg-danger/10 text-danger"
          >
            <span className="text-xs font-semibold">!</span>
          </span>
          <div className="flex-1 pt-1">
            <Badge tone={statusTone(currentStatus)}>{statusLabel(currentStatus)}</Badge>
          </div>
        </li>
      )}
    </ol>
  );
}
