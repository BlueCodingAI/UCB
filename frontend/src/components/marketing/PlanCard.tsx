'use client';

import { useTranslations } from 'next-intl';
import { Check, Lock, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/Button';
import { formatPaise } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Plan } from '@/lib/types';

/** Feature flags shown on the pricing comparison, in display order. */
const FEATURE_ROWS: { key: keyof Plan['features']; label: string }[] = [
  { key: 'voice', label: 'generalQueries' },
  { key: 'profileMemory', label: 'profileMemory' },
  { key: 'nextSteps', label: 'nextSteps' },
  { key: 'counsellingAssist', label: 'counsellingAssist' },
  { key: 'oneToOne', label: 'oneToOne' },
  { key: 'inPerson', label: 'inPerson' },
];

export function PlanCard({
  plan,
  featured = false,
  showFeatures = true,
}: {
  plan: Plan;
  featured?: boolean;
  showFeatures?: boolean;
}) {
  const t = useTranslations('pricing');
  const tp = useTranslations('plan');
  const tc = useTranslations('common');

  const isFree = plan.pricePaise === 0;
  const ctaLabel = isFree ? t('startFree') : t('choose');

  const body = (
    <div
      className={cn(
        'group/card relative flex h-full flex-col overflow-hidden p-7',
        featured
          ? // Inner surface of the gradient-ring wrapper.
            'rounded-[calc(var(--radius-2xl)-2px)] bg-surface sm:p-8'
          : // Standalone clean card.
            'rounded-2xl border border-border bg-surface shadow-sm transition duration-300 ease-out hover:-translate-y-1 hover:border-border-strong hover:shadow-lg',
      )}
    >
      {/* Featured card gets a faint brand wash in the corner. */}
      {featured && (
        <div
          className="pointer-events-none absolute -right-12 -top-12 -z-10 h-44 w-44 rounded-full bg-[image:var(--gradient-brand)] opacity-[0.08] blur-2xl"
          aria-hidden
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-xl font-bold tracking-tight text-primary">{tp(plan.code)}</h3>
        {featured && (
          <span className="pill border-accent/30 bg-accent-soft/70 text-[0.72rem] font-semibold text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {t('mostChosen')}
          </span>
        )}
      </div>

      {plan.description && <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{plan.description}</p>}

      <div className="mt-6 flex items-end gap-2">
        {isFree ? (
          <span className="font-display text-5xl font-bold leading-none tracking-tight text-primary">
            {tc('free')}
          </span>
        ) : (
          <>
            <span className="font-display text-5xl font-bold leading-none tracking-tight text-primary">
              {formatPaise(plan.pricePaise)}
            </span>
            <span className="pb-0.5 text-sm leading-tight text-ink-3">{t('perYear')}</span>
          </>
        )}
      </div>

      <p className="mt-3 text-sm font-medium text-ink-2">
        {plan.dailyChatLimit == null
          ? t('dailyUnlimited')
          : t('dailyLimit', { limit: plan.dailyChatLimit })}
      </p>

      <Link
        href={{ pathname: '/auth/signup', query: { plan: plan.code } }}
        className={cn(
          buttonVariants({ variant: featured ? 'primary' : 'secondary', size: 'md' }),
          'group/cta mt-7 w-full',
        )}
      >
        {ctaLabel}
        <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover/cta:translate-x-0.5" />
      </Link>

      {showFeatures && (
        <>
          <div className="mt-7 flex items-center gap-3">
            <span className="eyebrow">{t('featuresHeading')}</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <ul className="mt-4 space-y-3">
            <FeatureRow on label={t('feature.threeLanguages')} />
            {FEATURE_ROWS.map((row) => (
              <FeatureRow
                key={row.key}
                on={plan.features[row.key]}
                label={t(`feature.${row.label}`)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );

  if (featured) {
    // Gradient-ring wrapper: a thin brand-gradient border around the inner surface.
    return (
      <div className="relative lg:-my-2 lg:scale-[1.025]">
        <div className="rounded-2xl bg-[image:var(--gradient-brand)] p-[2px] shadow-lg shadow-primary-600/10">
          {body}
        </div>
      </div>
    );
  }

  return body;
}

function FeatureRow({ on, label }: { on: boolean; label: string }) {
  return (
    <li className={cn('flex items-start gap-3 text-sm', on ? 'text-ink' : 'text-ink-3')}>
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
          on ? 'bg-primary-600/10 text-primary-600' : 'bg-surface-sunk text-ink-3',
        )}
        aria-hidden
      >
        {on ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Lock className="h-3 w-3" />}
      </span>
      <span className={cn('leading-snug', !on && 'text-ink-3')}>{label}</span>
    </li>
  );
}
