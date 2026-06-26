'use client';

import { cn } from '@/lib/utils';

export interface TabItem {
  key: string;
  label: React.ReactNode;
}

/** Simple controlled segmented tabs. */
export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('inline-flex flex-wrap gap-1 rounded-pill bg-surface-sunk p-1', className)}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cn(
              'rounded-pill px-3.5 py-1.5 text-sm font-medium transition',
              active ? 'bg-primary-600 text-white shadow-sm' : 'text-ink-2 hover:text-ink',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
