import { useTranslations } from 'next-intl';
import { Info, ExternalLink } from 'lucide-react';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';

/** The "guidance, not the official portal" trust banner. */
export function DisclaimerBanner({ variant = 'bar', className }: { variant?: 'bar' | 'card'; className?: string }) {
  const t = useTranslations('disclaimer');
  if (variant === 'card') {
    return (
      <div className={cn('rounded-md border border-accent/30 bg-accent-soft/60 p-4 text-sm text-ink-2', className)}>
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <p>{t('full')}</p>
            <a
              href={OFFICIAL_SOURCE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1.5 inline-flex items-center gap-1 font-medium text-primary-600"
            >
              {t('visitOfficial')} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={cn('w-full border-b border-border bg-surface-sunk/70 text-ink-2', className)}>
      <div className="container-page flex items-center justify-center gap-2 py-1.5 text-center text-[0.8rem]">
        <Info className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span>{t('short')}</span>
        <a
          href={OFFICIAL_SOURCE_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="hidden items-center gap-1 font-medium text-primary-600 sm:inline-flex"
        >
          {t('visitOfficial')} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
