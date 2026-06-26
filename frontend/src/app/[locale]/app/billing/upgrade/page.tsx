'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ArrowLeft } from 'lucide-react';
import { Card, CardBody, Badge, Skeleton } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { PageHeading } from '@/components/common/PageHeading';
import { OrderSummary } from '@/components/billing/OrderSummary';
import { RazorpayCheckout } from '@/components/billing/RazorpayCheckout';
import { useAuth } from '@/components/providers/AuthProvider';
import { api } from '@/lib/api';
import { formatPaise } from '@/lib/format';
import type { Locale, Plan, PlanCode } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAID: PlanCode[] = ['premium', 'super_premium'];

export default function UpgradePage() {
  const locale = useLocale() as Locale;
  const tp = useTranslations('plan');
  const { user } = useAuth();

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [selected, setSelected] = useState<PlanCode>('premium');

  useEffect(() => {
    let active = true;
    api
      .get<Plan[]>('/plans', { anonymous: true })
      .then((list) => {
        if (!active) return;
        setPlans(list);
        const firstPaid = list.find((p) => PAID.includes(p.code) && p.code !== user?.currentPlanCode);
        if (firstPaid) setSelected(firstPaid.code);
      })
      .catch(() => active && setPlans([]));
    return () => {
      active = false;
    };
  }, [user?.currentPlanCode]);

  const paidPlans = useMemo(
    () => (plans ?? []).filter((p) => PAID.includes(p.code)).sort((a, b) => a.pricePaise - b.pricePaise),
    [plans],
  );
  const selectedPlan = paidPlans.find((p) => p.code === selected) ?? null;

  return (
    <div className="space-y-6">
      <Link href="/app/billing" className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to billing
      </Link>
      <PageHeading eyebrow="Upgrade" title="Choose your plan" subtitle="Unlock personalised guidance, counselling and more. Pay securely — cancel anytime before renewal." />

      {plans === null ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-72 w-full rounded-lg lg:col-span-2" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {paidPlans.map((plan) => {
              const isCurrent = plan.code === user?.currentPlanCode;
              const active = plan.code === selected;
              return (
                <button
                  key={plan.code}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => setSelected(plan.code)}
                  className={cn(
                    'w-full rounded-lg border bg-surface p-5 text-left transition focus-visible:outline-none focus-visible:shadow-[var(--ring)]',
                    active ? 'border-primary-600 shadow-md' : 'border-border hover:border-border-strong',
                    isCurrent && 'opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full border-2',
                          active ? 'border-primary-600 bg-primary-600 text-white' : 'border-border-strong text-transparent',
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <div>
                        <p className="text-base font-semibold text-primary">{tp(plan.code)}</p>
                        {plan.description && <p className="text-sm text-ink-3">{plan.description}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-ink">{formatPaise(plan.pricePaise)}</p>
                      <p className="text-xs text-ink-3">per year</p>
                    </div>
                  </div>
                  {isCurrent && (
                    <Badge tone="primary" className="mt-3">
                      Current plan
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            {selectedPlan ? (
              <>
                <OrderSummary plan={selectedPlan} locale={locale} />
                <RazorpayCheckout plan={selectedPlan} />
                <p className="text-center text-xs text-ink-3">Payments are processed securely by Razorpay.</p>
              </>
            ) : (
              <Card>
                <CardBody>
                  <p className="text-sm text-ink-3">Select a plan to continue.</p>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
