'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Info, ShieldCheck } from 'lucide-react';
import { PageHeading } from '@/components/common/PageHeading';
import { Card, CardBody } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';
import type { Plan, PlanFeatures } from '@/lib/types';
import { RequestForm } from '@/components/counselling/RequestForm';

export default function NewCounsellingRequestPage() {
  const { user } = useAuth();
  const [features, setFeatures] = useState<PlanFeatures | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const plans = await api.get<Plan[]>('/plans', { anonymous: true });
        const mine = plans.find((p) => p.code === user?.currentPlanCode);
        if (alive && mine) setFeatures(mine.features);
      } catch {
        /* non-fatal — form falls back to allowing only general queries */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.currentPlanCode]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/app/counselling"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-primary-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to counselling
      </Link>

      <PageHeading
        eyebrow="Counselling"
        title="Request counselling"
        subtitle="Tell us what you need and how to reach you. A counsellor will pick it up and follow up with next steps."
      />

      <Card className="mb-5 border-accent/30 bg-accent-soft/40">
        <CardBody className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <p className="text-sm text-ink-2">
            The tiers your plan does not include are disabled below. You can always upgrade for one-to-one or in-person
            help.
          </p>
        </CardBody>
      </Card>

      <RequestForm features={features} />

      <Card className="mt-5 border-dashed bg-surface/60">
        <CardBody className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
          <p className="text-sm text-ink-2">
            Our counsellors share guidance to help you decide — they don&apos;t submit anything on the official portal
            for you. Final registration, option-filling and confirmation always happen on the{' '}
            <a
              href={OFFICIAL_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary-600 hover:underline"
            >
              official CET Cell website
            </a>
            . Please don&apos;t share passwords or OTPs.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
