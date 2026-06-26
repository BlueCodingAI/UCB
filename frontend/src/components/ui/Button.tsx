import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'onDark' | 'glass' | 'danger' | 'link';
export type ButtonSize = 'md' | 'sm' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  // The single "do this next" action — warm marigold with a soft glow on hover.
  primary:
    'bg-accent text-accent-ink shadow-sm hover:-translate-y-0.5 hover:shadow-[var(--shadow-accent)] active:translate-y-0 ' +
    'after:absolute after:inset-x-0 after:top-0 after:h-1/2 after:rounded-t-[inherit] after:bg-white/15',
  // Quiet, crisp secondary.
  secondary:
    'bg-surface text-primary border border-border shadow-xs hover:border-border-strong hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-sunk',
  // On dark hero backgrounds.
  onDark: 'bg-white/10 text-on-dark border border-white/20 backdrop-blur hover:bg-white/20',
  glass:
    'glass text-primary border border-border shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10',
  link: 'bg-transparent text-primary-600 hover:text-primary-700 hover:underline px-0 py-0 shadow-none h-auto min-h-0',
};

const SIZES: Record<ButtonSize, string> = {
  lg: 'px-7 py-3.5 text-[0.98rem] min-h-[54px] rounded-md',
  md: 'px-5 py-3 text-[0.95rem] min-h-[46px] rounded-md',
  sm: 'px-4 py-2.5 text-sm min-h-[40px] rounded-sm',
  icon: 'h-11 w-11 rounded-md',
};

/** Class string for the button look — apply to <Link> for link-as-button. */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(
    'relative isolate inline-flex items-center justify-center gap-2 overflow-hidden font-semibold',
    'transition-[transform,background-color,box-shadow,border-color] duration-200 ease-out',
    'disabled:opacity-50 disabled:pointer-events-none disabled:translate-y-0 select-none whitespace-nowrap',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={buttonVariants({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="relative z-10 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  ),
);
Button.displayName = 'Button';
