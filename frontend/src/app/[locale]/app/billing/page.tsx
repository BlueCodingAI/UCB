'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Receipt, ArrowUpRight } from 'lucide-react';
import { Button, Card, CardBody, CardTitle, Badge, Skeleton, EmptyState, TableWrap, Th, Td, Tr, type BadgeTone } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { PageHeading } from '@/components/common/PageHeading';
import { PlanBadge } from '@/components/common/PlanBadge';
import { useAuth } from '@/components/providers/AuthProvider';
import { api } from '@/lib/api';
import { formatPaise, formatDate } from '@/lib/format';
import type { Locale, PlanCode } from '@/lib/types';

interface Subscription {
  planCode: PlanCode;
  status: string;
  startedAt: number | null;
  validUntil: number | null;
}

interface Payment {
  id: string;
  amountPaise: number;
  currency: string;
  status: string;
  planCode: PlanCode | null;
  method: string | null;
  createdAt: number;
}

const PAY_TONE: Record<string, BadgeTone> = {
  captured: 'success',
  paid: 'success',
  success: 'success',
  created: 'neutral',
  pending: 'warning',
  failed: 'danger',
  refunded: 'neutral',
};

export default function BillingPage() {
  const locale = useLocale() as Locale;
  const tp = useTranslations('plan');
  const { user } = useAuth();

  const [sub, setSub] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<Subscription>('/subscription')
      .then((s) => active && setSub(s))
      .catch(() => {});
    api
      .get<Payment[]>('/payments')
      .then((p) => active && setPayments(p))
      .catch(() => active && setPayments([]));
    return () => {
      active = false;
    };
  }, []);

  const planCode = sub?.planCode ?? user?.currentPlanCode ?? 'freemium';
  const validUntil = sub?.validUntil ?? user?.planValidUntil ?? null;
  const isFreemium = planCode === 'freemium';

  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Billing" title="Plan and payments" subtitle="Manage your subscription and review your payment history." />

      {/* Current plan */}
      <Card className="overflow-hidden">
        <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[0.66rem] uppercase tracking-wider text-ink-3">Current plan</p>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="text-2xl font-bold text-primary">{tp(planCode)}</h2>
              <PlanBadge plan={planCode} />
            </div>
            {!isFreemium && validUntil ? (
              <p className="mt-2 text-sm text-ink-2">Valid until {formatDate(validUntil, locale)}</p>
            ) : (
              <p className="mt-2 text-sm text-ink-2">
                {isFreemium ? 'You are on the free plan.' : 'Active subscription.'}
              </p>
            )}
          </div>
          <Link href="/app/billing/upgrade" className="self-start">
            <Button variant="primary">
              {isFreemium ? 'Upgrade plan' : 'Change plan'} <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardBody>
      </Card>

      {/* Payment history */}
      <Card>
        <CardBody>
          <CardTitle className="mb-4">Payment history</CardTitle>
          {payments === null ? (
            <Skeleton className="h-40 w-full rounded-md" />
          ) : payments.length === 0 ? (
            <EmptyState icon={Receipt} title="No payments yet" description="Your invoices will appear here after your first upgrade." />
          ) : (
            <TableWrap>
              <thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Plan</Th>
                  <Th>Amount</Th>
                  <Th>Method</Th>
                  <Th>Status</Th>
                </Tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <Tr key={p.id}>
                    <Td className="whitespace-nowrap text-ink">{formatDate(p.createdAt, locale)}</Td>
                    <Td>{p.planCode ? tp(p.planCode) : '—'}</Td>
                    <Td className="font-medium text-ink">{formatPaise(p.amountPaise, { withDecimals: true })}</Td>
                    <Td className="capitalize">{p.method ?? '—'}</Td>
                    <Td>
                      <Badge tone={PAY_TONE[p.status] ?? 'neutral'}>{p.status}</Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
