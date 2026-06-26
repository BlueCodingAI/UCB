import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white',
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
