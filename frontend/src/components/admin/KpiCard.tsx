import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  tone?: 'default' | 'accent' | 'danger';
}) {
  return (
    <Card interactive className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-wider text-ink-3">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-primary">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
        </div>
        {Icon && (
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              tone === 'accent'
                ? 'bg-accent-soft text-accent ring-1 ring-accent/15'
                : tone === 'danger'
                  ? 'bg-danger/10 text-danger ring-1 ring-danger/15'
                  : 'bg-primary-600/10 text-primary-600 ring-1 ring-primary-600/15',
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </Card>
  );
}
