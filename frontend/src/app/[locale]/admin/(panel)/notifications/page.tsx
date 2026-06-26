'use client';

import { useEffect, useState } from 'react';
import { Megaphone, CheckCircle2, XCircle, Clock, Ban } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminOpsBroadcastForm } from '@/components/admin/AdminOpsBroadcastForm';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  Button,
  Skeleton,
  EmptyState,
  useToast,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatRelative } from '@/lib/format';

interface Broadcast {
  id: string;
  title: string;
  bodyEn?: string | null;
  audienceType: string;
  status: string;
  channels?: string[] | null;
  sentCount?: number | null;
  failedCount?: number | null;
  recipientCount?: number | null;
  scheduledAt?: number | null;
  createdAt: number;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  scheduled: 'warning',
  sending: 'primary',
  sent: 'success',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};
const label = (v: string) => v.replace(/_/g, ' ');

export default function AdminBroadcastsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Broadcast[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.get<{ broadcasts: Broadcast[] } | Broadcast[]>('/admin/broadcasts', { realm: 'admin' });
      setItems(Array.isArray(res) ? res : res.broadcasts ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load broadcasts.');
      setItems([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function cancel(id: string) {
    setCancelling(id);
    try {
      await api.post(`/admin/broadcasts/${id}/cancel`, {}, { realm: 'admin' });
      toast('Broadcast cancelled.', 'success');
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not cancel.', 'error');
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="animate-fade-up">
      <AdminPageHeader
        title="Broadcasts"
        description="Send announcements to users across in-app and email, then track delivery."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <AdminOpsBroadcastForm onSent={load} />

        <Card>
          <CardBody>
            <CardTitle className="mb-3 text-base">Past broadcasts</CardTitle>
            {items === null ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-md" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="No broadcasts yet"
                description={error ?? 'Your sent and scheduled broadcasts will appear here.'}
              />
            ) : (
              <div className="space-y-3">
                {items.map((b) => {
                  const canCancel = b.status === 'scheduled' || b.status === 'draft';
                  return (
                    <div key={b.id} className="rounded-md border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{b.title}</p>
                          <p className="mt-0.5 text-xs capitalize text-ink-3">
                            {label(b.audienceType)} ·{' '}
                            {b.scheduledAt && b.status === 'scheduled'
                              ? `scheduled ${formatRelative(b.scheduledAt)}`
                              : formatRelative(b.createdAt)}
                          </p>
                        </div>
                        <Badge tone={STATUS_TONE[b.status] ?? 'neutral'} className="capitalize">
                          {label(b.status)}
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                        {b.scheduledAt && b.status === 'scheduled' && (
                          <span className="inline-flex items-center gap-1 text-ink-3">
                            <Clock className="h-3.5 w-3.5" /> {formatRelative(b.scheduledAt)}
                          </span>
                        )}
                        {b.sentCount != null && (
                          <span className="inline-flex items-center gap-1 text-primary-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {b.sentCount} sent
                          </span>
                        )}
                        {b.failedCount != null && b.failedCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-danger">
                            <XCircle className="h-3.5 w-3.5" /> {b.failedCount} failed
                          </span>
                        )}
                        {b.channels && b.channels.length > 0 && (
                          <span className="text-ink-3">via {b.channels.map((c) => label(c)).join(', ')}</span>
                        )}
                      </div>

                      {canCancel && (
                        <div className="mt-3 flex justify-end">
                          <Button
                            variant="danger"
                            size="sm"
                            loading={cancelling === b.id}
                            onClick={() => void cancel(b.id)}
                          >
                            <Ban className="h-4 w-4" /> Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
