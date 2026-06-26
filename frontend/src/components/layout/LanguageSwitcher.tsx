'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, LOCALE_LABELS } from '@/lib/constants';
import type { Locale } from '@/lib/types';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;
    startTransition(() => {
      // pathname here is already locale-stripped & resolved — re-navigate under the new locale.
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn('inline-flex items-center gap-0.5 rounded-pill bg-surface-sunk p-0.5', pending && 'opacity-70', className)}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          aria-pressed={l === locale}
          className={cn(
            'rounded-pill px-2.5 py-1 text-sm font-medium transition',
            l === locale ? 'bg-primary-600 text-white shadow-sm' : 'text-ink-2 hover:text-ink',
          )}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
