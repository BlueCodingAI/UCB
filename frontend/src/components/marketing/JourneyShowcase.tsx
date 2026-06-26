'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { CAP_STAGES } from '@/lib/constants';
import type { Locale } from '@/lib/types';

/**
 * The signature CAP "journey rail" — numbered stages connected along a path.
 * Horizontal on desktop, vertical on mobile. Stage labels come from CAP_STAGES
 * (localized inline). This is the visual heartbeat of the brand.
 */
export function JourneyShowcase() {
  const locale = useLocale() as Locale;
  const t = useTranslations('landing.journey');

  return (
    <section className="relative overflow-hidden bg-[image:var(--gradient-ink)] text-on-dark section-pad">
      {/* soft brand glow + dot grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        aria-hidden
        style={{
          background:
            'radial-gradient(50% 50% at 50% 0%, rgba(56,192,168,0.20) 0%, transparent 70%), radial-gradient(40% 40% at 85% 30%, rgba(232,136,26,0.16) 0%, transparent 70%)',
        }}
      />
      <div
        className="bg-dots pointer-events-none absolute inset-0 -z-10 opacity-[0.12] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        aria-hidden
      />

      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-accent-400">CAP</p>
          <h2 className="font-display mt-4 text-3xl tracking-tight text-on-dark sm:text-4xl lg:text-5xl">
            {t('title')}
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-on-dark/80">{t('subtitle')}</p>
        </div>

        {/* Desktop: horizontal rail */}
        <ol className="relative mt-20 hidden items-start justify-between gap-2 md:flex">
          {/* full-width gradient rail behind the nodes */}
          <span
            aria-hidden
            className="absolute left-0 right-0 top-7 h-0.5 bg-gradient-to-r from-accent/60 via-on-dark/30 to-on-dark/10"
          />
          {CAP_STAGES.map((stage, i) => (
            <li key={stage.key} className="relative flex flex-1 flex-col items-center text-center">
              <span
                className={
                  'relative z-10 flex h-14 w-14 items-center justify-center rounded-full border-2 font-mono text-base font-semibold transition ' +
                  (i === 0
                    ? 'border-accent bg-accent text-accent-ink shadow-[var(--shadow-accent)] animate-node-pulse'
                    : 'border-on-dark/25 bg-primary-700 text-on-dark')
                }
              >
                {i === 0 ? <Check className="h-5 w-5" /> : String(i + 1).padStart(2, '0')}
              </span>
              <span className="mt-5 max-w-[8rem] text-sm font-medium leading-snug text-on-dark/90">
                {stage[locale]}
              </span>
            </li>
          ))}
        </ol>

        {/* Mobile: vertical rail */}
        <ol className="mt-14 space-y-0 md:hidden">
          {CAP_STAGES.map((stage, i) => (
            <li key={stage.key} className="relative flex gap-4 pb-9 last:pb-0">
              {i < CAP_STAGES.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-7 top-14 h-full w-0.5 bg-gradient-to-b from-on-dark/30 to-on-dark/10"
                />
              )}
              <span
                className={
                  'relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 font-mono text-base font-semibold ' +
                  (i === 0
                    ? 'border-accent bg-accent text-accent-ink shadow-[var(--shadow-accent)] animate-node-pulse'
                    : 'border-on-dark/25 bg-primary-700 text-on-dark')
                }
              >
                {i === 0 ? <Check className="h-5 w-5" /> : String(i + 1).padStart(2, '0')}
              </span>
              <span className="pt-4 text-base font-medium text-on-dark/90">{stage[locale]}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
