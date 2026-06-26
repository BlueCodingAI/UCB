import { cn } from '@/lib/utils';

/** Disha wordmark with a small marigold "direction" compass glyph. */
export function Logo({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden role="img">
        <circle cx="16" cy="16" r="15" fill={onDark ? 'rgba(255,255,255,0.08)' : 'var(--color-surface-sunk)'} />
        <circle cx="16" cy="16" r="15" fill="none" stroke="var(--color-primary-600)" strokeWidth="1.5" />
        {/* compass needle pointing the way */}
        <path d="M16 5 L20 18 L16 15 L12 18 Z" fill="var(--color-accent)" />
        <path d="M16 27 L12 14 L16 17 L20 14 Z" fill="var(--color-primary)" opacity="0.5" />
        <circle cx="16" cy="16" r="2" fill="var(--color-primary)" />
      </svg>
      <span
        className={cn('font-display text-xl font-bold tracking-tight', onDark ? 'text-on-dark' : 'text-primary')}
      >
        Disha
      </span>
    </span>
  );
}
