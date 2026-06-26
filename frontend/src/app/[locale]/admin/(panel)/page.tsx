'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  MessageSquare,
  AlertTriangle,
  IndianRupee,
  Headphones,
  Database,
  CreditCard,
  ImageIcon,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { formatPaise, formatRelative } from '@/lib/format';
import type { PlanCode } from '@/lib/types';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { KpiCard } from '@/components/admin/KpiCard';
import { Card, CardBody, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface UsagePoint {
  date: string;
  chats: number;
}
interface RecentPayment {
  id: string;
  userName: string | null;
  planCode: PlanCode;
  amountPaise: number;
  status: string;
  createdAt: number;
}
interface KbStatusSummary {
  indexed: number;
  pending: number;
  processing: number;
  failed: number;
  totalDocuments: number;
  totalChunks: number;
}
interface DashboardData {
  totalUsers: number;
  usersByPlan: Record<PlanCode, number>;
  chatsToday: number;
  fallbackRate: number; // 0..1
  revenuePaise: number;
  openLeads: number;
  usageSeries: UsagePoint[];
  kbStatus: KbStatusSummary;
  recentPayments: RecentPayment[];
  bannerTotals: { impressions: number; clicks: number; activeBanners: number };
}

const PLAN_LABEL: Record<PlanCode, string> = {
  freemium: 'Freemium',
  premium: 'Premium',
  super_premium: 'Super premium',
};

function payStatusTone(status: string) {
  const s = status.toLowerCase();
  if (s === 'captured' || s === 'paid' || s === 'success') return 'success' as const;
  if (s === 'failed') return 'danger' as const;
  return 'neutral' as const;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api.get<DashboardData>('/admin/dashboard', { realm: 'admin' });
        if (alive) setData(d);
      } catch (err) {
        if (alive) setError(err instanceof ApiError ? err.message : 'Failed to load dashboard.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <>
        <AdminPageHeader title="Dashboard" />
        <EmptyState icon={AlertTriangle} title="Could not load the dashboard" description={error} />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AdminPageHeader title="Dashboard" description="Live overview of Disha." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64 rounded-lg" />
      </>
    );
  }

  // Normalize with safe defaults so a partial payload can never crash the page.
  const usageSeries: UsagePoint[] = data.usageSeries ?? [];
  const usersByPlan = data.usersByPlan ?? { freemium: 0, premium: 0, super_premium: 0 };
  const bannerTotals = data.bannerTotals ?? { impressions: 0, clicks: 0, activeBanners: 0 };
  const kbStatus =
    data.kbStatus ?? { indexed: 0, pending: 0, processing: 0, failed: 0, totalDocuments: 0, totalChunks: 0 };
  const recentPayments: RecentPayment[] = data.recentPayments ?? [];
  const maxChats = Math.max(1, ...usageSeries.map((p) => p.chats));
  const totalPlanUsers = Math.max(
    1,
    (usersByPlan.freemium ?? 0) + (usersByPlan.premium ?? 0) + (usersByPlan.super_premium ?? 0),
  );

  return (
    <>
      <AdminPageHeader title="Dashboard" description="Live overview of Disha." />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total users" value={data.totalUsers.toLocaleString('en-IN')} icon={Users} />
        <KpiCard label="Chats today" value={data.chatsToday.toLocaleString('en-IN')} icon={MessageSquare} />
        <KpiCard
          label="Fallback rate"
          value={`${Math.round(data.fallbackRate * 100)}%`}
          icon={AlertTriangle}
          tone={data.fallbackRate >= 0.25 ? 'danger' : 'default'}
          hint="KB-miss share of answers"
        />
        <KpiCard label="Revenue" value={formatPaise(data.revenuePaise)} icon={IndianRupee} tone="accent" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open leads" value={data.openLeads.toLocaleString('en-IN')} icon={Headphones} />
        <KpiCard label="Premium users" value={(usersByPlan.premium ?? 0).toLocaleString('en-IN')} icon={Users} />
        <KpiCard
          label="Super premium"
          value={(usersByPlan.super_premium ?? 0).toLocaleString('en-IN')}
          icon={Users}
        />
        <KpiCard label="Active banners" value={bannerTotals.activeBanners} icon={ImageIcon} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Usage chart */}
        <Card className="lg:col-span-2">
          <CardBody>
            <div className="mb-1 flex items-baseline justify-between">
              <CardTitle>Chat volume</CardTitle>
              <span className="font-mono text-[0.7rem] uppercase tracking-wider text-ink-3">
                Last {usageSeries.length} days
              </span>
            </div>
            <p className="mb-5 text-sm text-ink-3">Daily answered chats across all users.</p>

            {usageSeries.length === 0 ? (
              <EmptyState title="No usage yet" description="Chat activity will appear here." />
            ) : (
              <div className="flex h-48 items-end gap-1.5" role="img" aria-label="Daily chat volume bar chart">
                {usageSeries.map((p) => {
                  const h = Math.max(4, Math.round((p.chats / maxChats) * 100));
                  return (
                    <div key={p.date} className="group flex flex-1 flex-col items-center justify-end gap-2">
                      <div className="relative flex w-full justify-center">
                        <div
                          className="w-full max-w-[28px] rounded-t-sm bg-primary-600/80 transition-all group-hover:bg-primary-600"
                          style={{ height: `${h * 1.6}px` }}
                          title={`${p.chats} chats`}
                        />
                      </div>
                      <span className="font-mono text-[0.6rem] text-ink-3">
                        {new Date(p.date).getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Users by plan */}
        <Card>
          <CardBody>
            <CardTitle>Users by plan</CardTitle>
            <p className="mb-5 mt-1 text-sm text-ink-3">Distribution across subscription tiers.</p>
            <div className="space-y-4">
              {(['freemium', 'premium', 'super_premium'] as PlanCode[]).map((code) => {
                const count = usersByPlan[code] ?? 0;
                const pct = Math.round((count / totalPlanUsers) * 100);
                const barColor =
                  code === 'super_premium'
                    ? 'bg-primary-600'
                    : code === 'premium'
                      ? 'bg-accent'
                      : 'bg-border-strong';
                return (
                  <div key={code}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-ink-2">{PLAN_LABEL[code]}</span>
                      <span className="font-mono text-ink-3">
                        {count.toLocaleString('en-IN')} · {pct}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-pill bg-surface-sunk">
                      <div className={`h-full rounded-pill ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* KB index status */}
        <Card>
          <CardBody>
            <div className="mb-4 flex items-center gap-2">
              <Database className="h-4 w-4 text-primary-600" />
              <CardTitle>Knowledge base</CardTitle>
            </div>
            <dl className="space-y-3 text-sm">
              <Row label="Documents" value={kbStatus.totalDocuments.toLocaleString('en-IN')} />
              <Row label="Chunks indexed" value={kbStatus.totalChunks.toLocaleString('en-IN')} />
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge tone="success">Indexed {kbStatus.indexed}</Badge>
                <Badge tone="neutral">Pending {kbStatus.pending}</Badge>
                <Badge tone="neutral">Processing {kbStatus.processing}</Badge>
                {kbStatus.failed > 0 && <Badge tone="danger">Failed {kbStatus.failed}</Badge>}
              </div>
            </dl>
            <Link
              href="/admin/kb/index-status"
              className="mt-4 inline-block text-sm font-medium text-primary-600 hover:underline"
            >
              View indexing &amp; RAG →
            </Link>
          </CardBody>
        </Card>

        {/* Banner totals */}
        <Card>
          <CardBody>
            <div className="mb-4 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary-600" />
              <CardTitle>Banners</CardTitle>
            </div>
            <dl className="space-y-3 text-sm">
              <Row label="Impressions" value={bannerTotals.impressions.toLocaleString('en-IN')} />
              <Row label="Clicks" value={bannerTotals.clicks.toLocaleString('en-IN')} />
              <Row
                label="CTR"
                value={`${
                  bannerTotals.impressions > 0
                    ? ((bannerTotals.clicks / bannerTotals.impressions) * 100).toFixed(1)
                    : '0.0'
                }%`}
              />
              <Row label="Active" value={String(bannerTotals.activeBanners)} />
            </dl>
          </CardBody>
        </Card>

        {/* Recent payments */}
        <Card>
          <CardBody>
            <div className="mb-4 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary-600" />
              <CardTitle>Recent payments</CardTitle>
            </div>
            {recentPayments.length === 0 ? (
              <p className="text-sm text-ink-3">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentPayments.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{p.userName ?? 'Unknown user'}</p>
                      <p className="text-xs text-ink-3">
                        {PLAN_LABEL[p.planCode]} · {formatRelative(p.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-sm text-ink">{formatPaise(p.amountPaise)}</span>
                      <Badge tone={payStatusTone(p.status)}>{p.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>
  );
}
