'use client';

import { useEffect, useState } from 'react';
import {
  Plus,
  MessageCircle,
  Users,
  MapPin,
  ShieldCheck,
  Lock,
  Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeading } from '@/components/common/PageHeading';
import { UpsellCard } from '@/components/common/UpsellCard';
import { PlanBadge } from '@/components/common/PlanBadge';
import { Card, CardBody, Button, Skeleton, EmptyState } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { CounsellingRequest, Plan, PlanFeatures } from '@/lib/types';
import { CounsellingStatusCard } from '@/components/counselling/CounsellingStatusCard';

interface Tier {
  type: CounsellingRequest['type'];
  icon: LucideIcon;
  title: string;
  desc: string;
  needs: keyof PlanFeatures | null;
}

const TIERS: Tier[] = [
  {
    type: 'assist',
    icon: MessageCircle,
    title: 'Counselling assist',
    desc: 'Guided, written and call-based help with your CAP questions from our support team.',
    needs: 'counsellingAssist',
  },
  {
    type: 'one_to_one',
    icon: Users,
    title: 'One-to-one session',
    desc: 'A scheduled video or call session with a dedicated counsellor who knows your profile.',
    needs: 'oneToOne',
  },
  {
    type: 'in_person',
    icon: MapPin,
    title: 'In-person meeting',
    desc: 'Sit down face-to-face at a counselling centre for hands-on form-filling help.',
    needs: 'inPerson',
  },
];

export default function CounsellingPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<CounsellingRequest[] | null>(null);
  const [features, setFeatures] = useState<PlanFeatures | null>(null);
  const [planRequired, setPlanRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Plan features (public) — to know which tiers are unlocked.
      try {
        const plans = await api.get<Plan[]>('/plans', { anonymous: true });
        const mine = plans.find((p) => p.code === user?.currentPlanCode);
        if (alive && mine) setFeatures(mine.features);
      } catch {
        /* non-fatal */
      }
      // Authenticated requests list.
      try {
        const data = await api.get<CounsellingRequest[]>('/counselling/requests');
        if (alive) setRequests(data);
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && (err.code === 'plan_required' || err.status === 403)) {
          setPlanRequired(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Could not load your counselling requests.');
        }
        setRequests([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.currentPlanCode]);

  if (planRequired) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeading
          eyebrow="Counselling"
          title="Talk to a real counsellor"
          subtitle="Get human guidance on top of the bot — written help, one-to-one sessions, or in-person meetings."
        />
        <UpsellCard
          title="Counselling is a premium feature"
          body="Upgrade to premium for counselling assist, or to super premium for one-to-one and in-person sessions with a dedicated counsellor."
        />
        <TierExplainer features={null} />
        <Reassurance />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        eyebrow="Counselling"
        title="Your counselling"
        subtitle="Track your requests and sessions, and reach out whenever you need a human in your corner."
        actions={
          <div className="flex items-center gap-2">
            {user && <PlanBadge plan={user.currentPlanCode} />}
            <Link href="/app/counselling/new" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }))}>
              <Plus className="h-4 w-4" />
              Request counselling
            </Link>
          </div>
        }
      />

      <section aria-labelledby="requests-heading" className="mb-8">
        <h2 id="requests-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">
          Your requests
        </h2>
        {requests === null ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title="Couldn't load requests" description={error} />
        ) : requests.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No requests yet"
            description="When you raise a counselling request, you'll be able to track its status and book a session here."
            action={
              <Link href="/app/counselling/new" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }))}>
                <Plus className="h-4 w-4" />
                Request counselling
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <CounsellingStatusCard key={r.id} request={r} />
            ))}
          </div>
        )}
      </section>

      <TierExplainer features={features} />
      <Reassurance />
    </div>
  );
}

function TierExplainer({ features }: { features: PlanFeatures | null }) {
  return (
    <section aria-labelledby="tiers-heading" className="mb-8">
      <h2 id="tiers-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">
        Ways we can help
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {TIERS.map((tier) => {
          const allowed = tier.needs ? !!features?.[tier.needs] : true;
          const Icon = tier.icon;
          return (
            <Card key={tier.type} className={cn('h-full', !allowed && 'opacity-90')}>
              <CardBody className="flex h-full flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-md',
                      allowed ? 'bg-primary-600/10 text-primary-600' : 'bg-surface-sunk text-ink-3',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  {allowed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700">
                      <Check className="h-3.5 w-3.5" /> Included
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3">
                      <Lock className="h-3.5 w-3.5" /> Upgrade
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-ink">{tier.title}</p>
                <p className="mt-1 flex-1 text-sm text-ink-3">{tier.desc}</p>
                {!allowed && (
                  <Link
                    href="/app/billing/upgrade"
                    className="mt-3 text-sm font-semibold text-primary-600 hover:underline"
                  >
                    Unlock this →
                  </Link>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function Reassurance() {
  return (
    <Card className="border-dashed bg-surface/60">
      <CardBody className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
        <p className="text-sm text-ink-2">
          Disha offers friendly guidance, not the official CAP portal. Always confirm dates, rules and your final
          choices on the{' '}
          <a
            href={OFFICIAL_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary-600 hover:underline"
          >
            official CET Cell website
          </a>
          .
        </p>
      </CardBody>
    </Card>
  );
}
