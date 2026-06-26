import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'success' | 'accent' | 'danger' | 'primary' | 'warning';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunk text-ink-2 ring-1 ring-border',
  success: 'bg-success/10 text-success ring-1 ring-success/20',
  accent: 'bg-accent-soft text-[#9a5a07] ring-1 ring-accent/25 dark:text-accent',
  warning: 'bg-accent-soft text-[#9a5a07] ring-1 ring-accent/25 dark:text-accent',
  danger: 'bg-danger/10 text-danger ring-1 ring-danger/25',
  primary: 'bg-primary-600/10 text-primary-700 ring-1 ring-primary-600/20',
};

/** Status pill — always pair color with a word (accessibility). */
export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-[0.72rem] font-semibold',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
