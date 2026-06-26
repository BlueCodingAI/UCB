import { cn } from '@/lib/utils';

/**
 * Centered card shell used by every auth page. The auth layout already supplies
 * the page chrome (header, language switcher, disclaimer) and a max-w-md column,
 * so this component focuses on the card surface + optional eyebrow/title/subtitle.
 */
export function AuthCard({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative animate-fade-up">
      {/* Soft brand glow behind the card for premium depth. */}
      <div
        className="glow-brand pointer-events-none absolute -inset-x-8 -top-16 -z-10 h-56 opacity-70 blur-2xl"
        aria-hidden
      />
      <div
        className={cn(
          'overflow-hidden rounded-2xl border border-border bg-surface shadow-lg',
          className,
        )}
      >
        <div className="p-7 sm:p-9">
          {(eyebrow || title || subtitle) && (
            <header className="mb-7">
              {eyebrow && <p className="eyebrow mb-2.5">{eyebrow}</p>}
              {title && (
                <h1 className="font-display text-[1.7rem] font-bold leading-tight tracking-tight text-primary sm:text-[1.9rem]">
                  {title}
                </h1>
              )}
              {subtitle && <p className="mt-2.5 text-base leading-relaxed text-ink-2">{subtitle}</p>}
            </header>
          )}
          {children}
        </div>
        {footer && (
          <div className="border-t border-border bg-surface-sunk/40 px-7 py-4 text-center text-sm text-ink-2 sm:px-9">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
