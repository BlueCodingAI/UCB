import { cn } from '@/lib/utils';

/** Calm loading placeholder (skeletons over spinners). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-surface-sunk', className)} />;
}
