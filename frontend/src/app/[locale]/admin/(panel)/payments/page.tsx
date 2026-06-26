'use client';

import { useEffect, useState } from 'react';
import { Receipt, IndianRupee, TrendingUp, Info } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { KpiCard } from '@/components/admin/KpiCard';
import {
  Badge,
  Skeleton,
  EmptyState,
  TableWrap,
  Th,
  Td,
  Tr,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatPaise, formatDateTime } from '@/lib/format';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';

interface PaymentRow {
  id: string;
  userName?: string | null;
  userEmail?: string | null;
  planCode?: string | null;
  planName?: string | null;
  amountPaise: number;
  currency?: string;
  status: string;
  razorpayPaymentId?: string | null;
  razorpayOrderId?: string | null;
  createdAt: number;
}
interface DashboardData {
  recentPayments?: PaymentRow[];
  payments?: PaymentRow[];
  kpis?: { revenuePaise?: number; paidCount?: number };
  revenuePaise?: number;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  captured: 'success',
  paid: 'success',
  success: 'success',
  created: 'warning',
  pending: 'warning',
  failed: 'danger',
  refunded: 'neutral',
};
const label = (v: string) => v.replace(/_/g, ' ');

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<DashboardData>('/admin/dashboard', { realm: 'admin' });
        const list = data.recentPayments ?? data.payments ?? [];
        setRows(list);
        setRevenue(data.kpis?.revenuePaise ?? data.revenuePaise ?? null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not load payments.');
        setRows([]);
      }
    })();
  }, []);

  const captured = (rows ?? []).filter((r) => ['captured', 'paid', 'success'].includes(r.status));
  const computedRevenue = revenue ?? captured.reduce((s, r) => s + r.amountPaise, 0);

  return (
    <div className="animate-fade-up">
      <AdminPageHeader
        title="Payments"
        description="Recent subscription transactions captured through Razorpay."
      />

      <div className="mb-5 rounded-md border border-border bg-surface-sunk/50 px-4 py-3">
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
          <span>
            This view shows the most recent payments from the admin dashboard. For full reconciliation and refunds, use
            your{' '}
            <a
              href="https://dashboard.razorpay.com"
              target="_blank"
              rel="noreferrer"
              className="text-primary-600 hover:underline"
            >
              Razorpay dashboard
            </a>
            . Disha is a guidance platform, not the official{' '}
            <a href={OFFICIAL_SOURCE_URL} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
              CET Cell / CAP portal
            </a>
            .
          </span>
        </p>
      </div>

      {rows === null ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
          <Skeleton className="h-72 w-full rounded-md" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <KpiCard label="Captured revenue" value={formatPaise(computedRevenue)} icon={IndianRupee} tone="accent" />
            <KpiCard label="Successful payments" value={captured.length} icon={TrendingUp} />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No payments yet"
              description={error ?? 'Recent transactions will appear here once users subscribe.'}
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Plan</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Razorpay ID</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <span className="font-medium text-ink">{r.userName ?? '—'}</span>
                      {r.userEmail && <span className="block text-xs text-ink-3">{r.userEmail}</span>}
                    </Td>
                    <Td className="capitalize">{r.planName ?? (r.planCode ? label(r.planCode) : '—')}</Td>
                    <Td className="text-right font-medium tabular-nums text-ink">{formatPaise(r.amountPaise)}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[r.status] ?? 'neutral'} className="capitalize">
                        {label(r.status)}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs text-ink-3">
                        {r.razorpayPaymentId ?? r.razorpayOrderId ?? '—'}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-3">{formatDateTime(r.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      )}
    </div>
  );
}
