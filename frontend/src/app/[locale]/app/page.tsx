'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Bell, ListChecks, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card, CardBody, CardTitle, Skeleton, EmptyState } from '@/components/ui';
import { PlanBadge } from '@/components/common/PlanBadge';
import { UpsellCard } from '@/components/common/UpsellCard';
import { AdBannerSlot } from '@/components/banner/AdBannerSlot';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RecentChats } from '@/components/dashboard/RecentChats';
import { StageTracker } from '@/components/journey/StageTracker';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import type { CapStage, Locale, Notification, Recommendation } from '@/lib/types';

interface CapProfile {
  currentStage?: CapStage | null;
}

export default function DashboardPage() {
  const t = useTranslations('appNav');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const { user } = useAuth();
  const isPremium = user ? user.currentPlanCode !== 'freemium' : false;

  const [stage, setStage] = useState<CapStage | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<Notification[]>('/notifications', { query: { limit: 4 } })
      .then((list) => active && setNotifications(list))
      .catch(() => active && setNotifications([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isPremium) return;
    let active = true;
    api
      .get<CapProfile>('/profile/cap')
      .then((p) => active && setStage(p.currentStage ?? null))
      .catch(() => {});
    api
      .get<Recommendation[]>('/recommendations', { query: { limit: 3 } })
      .then((list) => active && setRecs(list))
      .catch((e) => {
        if (!(e instanceof ApiError)) return;
        active && setRecs([]);
      });
    return () => {
      active = false;
    };
  }, [isPremium]);

  const firstName = user?.fullName?.split(' ')[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow mb-1">{tc('appName')}</p>
          <h1 className="font-display text-2xl font-bold text-primary sm:text-3xl">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          </h1>
          <p className="mt-1 text-ink-3">Here is where you are on your CAP journey today.</p>
        </div>
        {user && <PlanBadge plan={user.currentPlanCode} />}
      </div>

      {/* Journey rail */}
      <Card>
        <CardBody>
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>Your CAP journey</CardTitle>
            {isPremium ? (
              <Link href="/app/next-steps" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline">
                {t('nextSteps')} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="font-mono text-[0.62rem] uppercase tracking-wider text-ink-3">Overview</span>
            )}
          </div>
          <StageTracker current={isPremium ? stage : null} />
          {!isPremium && (
            <p className="mt-4 text-xs text-ink-3">
              Upgrade to track your exact stage and get steps tailored to your merit and preferences.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-2">Quick actions</h2>
        <QuickActions />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <RecentChats limit={4} />

          {/* Premium next steps preview / freemium upsell */}
          {isPremium ? (
            <Card>
              <CardBody>
                <div className="mb-4 flex items-center justify-between">
                  <CardTitle>Next steps for you</CardTitle>
                  <Link href="/app/next-steps" className="text-sm font-medium text-primary-600 hover:underline">
                    {tc('viewAll')}
                  </Link>
                </div>
                {recs === null ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-md" />
                    ))}
                  </div>
                ) : recs.length === 0 ? (
                  <EmptyState
                    icon={ListChecks}
                    title="No steps yet"
                    description="Complete your CAP profile to get personalised suggestions."
                    action={
                      <Link href="/app/profile" className="text-sm font-medium text-primary-600 hover:underline">
                        Update profile
                      </Link>
                    }
                  />
                ) : (
                  <ul className="space-y-2">
                    {recs.map((r) => (
                      <li key={r.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                          <Sparkles className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">{r.title}</p>
                          {r.description && <p className="truncate text-xs text-ink-3">{r.description}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : (
            <UpsellCard />
          )}
        </div>

        <div className="space-y-6">
          {/* Notifications snapshot */}
          <Card>
            <CardBody>
              <div className="mb-4 flex items-center justify-between">
                <CardTitle>{t('notifications')}</CardTitle>
                <Link href="/app/notifications" className="text-sm font-medium text-primary-600 hover:underline">
                  {tc('viewAll')}
                </Link>
              </div>
              {notifications === null ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-md" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <EmptyState icon={Bell} title="You're all caught up" />
              ) : (
                <ul className="space-y-3">
                  {notifications.map((n) => (
                    <li key={n.id} className="flex items-start gap-2.5">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-border-strong' : 'bg-accent'}`}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{n.title}</p>
                        <p className="text-xs text-ink-3">{formatRelative(n.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <AdBannerSlot placement="dashboard" />
        </div>
      </div>
    </div>
  );
}
