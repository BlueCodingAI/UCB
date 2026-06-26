'use client';

import { useState } from 'react';
import { Check, Circle, Clock, X } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { Locale, Recommendation } from '@/lib/types';
import { cn } from '@/lib/utils';

type Status = Recommendation['status'];

const STATUS_TONE: Record<Status, BadgeTone> = {
  pending: 'neutral',
  in_progress: 'accent',
  done: 'success',
  dismissed: 'neutral',
  expired: 'danger',
};

const STATUS_LABEL: Record<Status, string> = {
  pending: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  dismissed: 'Dismissed',
  expired: 'Expired',
};

/** A single recommendation step with inline status controls. */
export function StepChecklist({
  step,
  locale,
  onSetStatus,
}: {
  step: Recommendation;
  locale: Locale;
  onSetStatus: (id: string, status: Status) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const done = step.status === 'done';

  async function set(status: Status) {
    if (busy) return;
    setBusy(true);
    try {
      await onSetStatus(step.id, status);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-md border border-border bg-surface p-4 transition sm:flex-row sm:items-start',
        done && 'bg-surface-sunk/40',
        busy && 'opacity-60',
      )}
    >
      <button
        type="button"
        aria-label={done ? 'Mark as to do' : 'Mark as done'}
        disabled={busy}
        onClick={() => set(done ? 'pending' : 'done')}
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
          done ? 'border-primary-600 bg-primary-600 text-white' : 'border-border-strong text-transparent hover:border-primary-600',
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-sm font-semibold text-ink', done && 'text-ink-3 line-through')}>{step.title}</p>
          <Badge tone={STATUS_TONE[step.status]}>{STATUS_LABEL[step.status]}</Badge>
        </div>
        {step.description && <p className="mt-1 text-sm text-ink-2">{step.description}</p>}
        {step.dueAt && (
          <p className="mt-1.5 inline-flex items-center gap-1 font-mono text-[0.7rem] uppercase tracking-wide text-ink-3">
            <Clock className="h-3 w-3" /> Due {formatDate(step.dueAt, locale)}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <StatusButton
          active={step.status === 'in_progress'}
          disabled={busy}
          onClick={() => set('in_progress')}
          icon={Circle}
          label="Start"
        />
        <StatusButton
          active={step.status === 'dismissed'}
          disabled={busy}
          onClick={() => set('dismissed')}
          icon={X}
          label="Dismiss"
        />
      </div>
    </div>
  );
}

function StatusButton({
  active,
  disabled,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: typeof Circle;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-sm border px-2.5 text-xs font-medium transition disabled:opacity-50',
        active ? 'border-primary-600 bg-primary-600/10 text-primary-700' : 'border-border text-ink-2 hover:bg-surface-sunk',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
