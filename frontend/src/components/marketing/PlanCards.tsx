'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Link } from '@/i18n/navigation';
import { Skeleton } from '@/components/ui/Skeleton';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { PLAN_ORDER } from '@/lib/constants';
import type { Plan } from '@/lib/types';
import { PlanCard } from './PlanCard';

/**
 * Fetches public plans anonymously and renders the three tiers.
 * `variant="teaser"` (landing) hides the feature lists and adds a "compare all" link;
 * `variant="full"` (pricing page) shows the full feature comparison.
 */
export function PlanCards({ variant = 'full' }: { variant?: 'teaser' | 'full' }) {
  const t = useTranslations('pricing');
  const tt = useTranslations('landing.plansTeaser');
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<Plan[]>('/plans', { anonymous: true })
      .then((list) => {
        if (!active) return;
        const order = PLAN_ORDER as readonly string[];
        setPlans([...list].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code)));
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    // Fail soft — never block the marketing page on a plans fetch.
    return null;
  }

  if (!plans) {
    return (
      <div className="grid gap-6 lg:grid-cols-3 lg:gap-7">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className={cn('rounded-2xl', i === 1 ? 'h-[28rem] lg:-my-2' : 'h-96')} />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid items-stretch gap-6 lg:grid-cols-3 lg:gap-7">
        {plans.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            featured={plan.code === 'premium'}
            showFeatures={variant === 'full'}
          />
        ))}
      </div>

      {variant === 'teaser' && (
        <div className="mt-8 text-center">
          <Link
            href="/pricing"
            className={cn(buttonVariants({ variant: 'secondary', size: 'md' }), 'group')}
          >
            {tt('seeAll')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}

      {variant === 'full' && (
        <p className="mt-8 text-center text-sm text-ink-3">{t('validityNote')}</p>
      )}
    </>
  );
}
