import { cn } from '@/lib/utils';

/**
 * Simple animated equalizer bars. Purely decorative — driven by CSS, so it
 * honors prefers-reduced-motion (the global reset pauses animations).
 */
export function WaveformVisualizer({ active, className }: { active: boolean; className?: string }) {
  const bars = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className={cn('flex h-8 items-center justify-center gap-1', className)} aria-hidden>
      {bars.map((i) => (
        <span
          key={i}
          className={cn(
            'w-1 rounded-pill bg-primary-600 transition-all',
            active ? 'animate-node-pulse' : 'opacity-40',
          )}
          style={{
            height: active ? `${10 + ((i * 7) % 18)}px` : '6px',
            animationDelay: `${i * 110}ms`,
            animationDuration: '0.9s',
          }}
        />
      ))}
    </div>
  );
}
