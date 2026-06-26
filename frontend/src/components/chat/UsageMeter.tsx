'use client';

import { useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useTranslations } from 'next-intl';
import { Infinity as InfinityIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ChatUsage {
  used: number;
  limit: number | null;
  remaining?: number | null;
}

export interface UsageMeterHandle {
  refresh: () => void;
}

/**
 * Freemium daily-usage bar. Fetches GET /chat/usage. Unlimited plans show an
 * "unlimited" pill instead of a bar. Expose a `refresh()` so the chat page can
 * re-pull after sending a message.
 */
export const UsageMeter = forwardRef<UsageMeterHandle, { className?: string }>(function UsageMeter(
  { className },
  ref,
) {
  const t = useTranslations('chat');
  const [usage, setUsage] = useState<ChatUsage | null>(null);

  const load = useCallback(() => {
    api
      .get<ChatUsage>('/chat/usage')
      .then(setUsage)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  if (!usage) return null;

  // Unlimited plan.
  if (usage.limit == null) {
    return (
      <div className={cn('flex items-center gap-1.5 text-xs text-ink-3', className)}>
        <InfinityIcon className="h-3.5 w-3.5" aria-hidden />
        <span className="font-mono uppercase tracking-wide">unlimited</span>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((usage.used / Math.max(1, usage.limit)) * 100));
  const nearLimit = pct >= 80;

  return (
    <div className={cn('w-full max-w-xs', className)}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[0.66rem] uppercase tracking-wider text-ink-3">
          {t('usage', { used: usage.used, limit: usage.limit })}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunk"
        role="progressbar"
        aria-valuenow={usage.used}
        aria-valuemin={0}
        aria-valuemax={usage.limit}
      >
        <div
          className={cn('h-full rounded-pill transition-[width] duration-[360ms]', nearLimit ? 'bg-accent' : 'bg-primary-600')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
});
