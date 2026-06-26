'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Bell, BellRing, CalendarClock, CreditCard, Megaphone, CheckCheck } from 'lucide-react';
import { Button, Card, CardBody, Tabs, Skeleton, EmptyState, type TabItem } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { PageHeading } from '@/components/common/PageHeading';
import { api, ApiError } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import type { Locale, Notification } from '@/lib/types';
import { cn } from '@/lib/utils';

const TABS: TabItem[] = [
  { key: 'all', label: 'All' },
  { key: 'reminder', label: 'Reminders' },
  { key: 'counselling', label: 'Counselling' },
  { key: 'payment', label: 'Payment' },
  { key: 'broadcast', label: 'Updates' },
];

const ICONS: Record<string, typeof Bell> = {
  reminder: CalendarClock,
  counselling: BellRing,
  payment: CreditCard,
  broadcast: Megaphone,
};

export default function NotificationsPage() {
  const locale = useLocale() as Locale;
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await api.getFull<Notification[]>('/notifications', {
          query: { limit: 20, cursor: reset ? undefined : cursor ?? undefined },
        });
        setItems((prev) => (reset ? res.data : [...prev, ...res.data]));
        setCursor(res.meta?.pagination?.nextCursor ?? null);
        setHasMore(Boolean(res.meta?.pagination?.hasMore));
      } catch {
        if (reset) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor],
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? Date.now() } : n)));
    try {
      await api.post(`/notifications/${id}/read`, {});
    } catch {
      /* optimistic; ignore */
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })));
    try {
      await api.post('/notifications/read-all', {});
    } catch (e) {
      if (e instanceof ApiError) void load(true);
    }
  }

  const filtered = items.filter((n) => filter === 'all' || n.type === filter);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Inbox"
        title="Notifications"
        subtitle={unread > 0 ? `You have ${unread} unread notification${unread === 1 ? '' : 's'}.` : 'You are all caught up.'}
        actions={
          unread > 0 ? (
            <Button variant="secondary" size="sm" onClick={markAll}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      <Tabs items={TABS} value={filter} onChange={setFilter} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Bell} title="Nothing here yet" description="Reminders and updates will show up here." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            const isUnread = !n.readAt;
            return (
              <li key={n.id}>
                <Card className={cn('transition', isUnread && 'border-l-4 border-l-accent')}>
                  <CardBody className="flex items-start gap-3 py-4">
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
                        isUnread ? 'bg-accent-soft text-accent' : 'bg-surface-sunk text-ink-3',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-sm', isUnread ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>
                          {n.title}
                        </p>
                        <span className="shrink-0 text-xs text-ink-3">{formatRelative(n.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-ink-2">{n.body}</p>
                      <div className="mt-2 flex items-center gap-3">
                        {n.actionUrl && (
                          <Link href={n.actionUrl} className="text-xs font-medium text-primary-600 hover:underline">
                            View
                          </Link>
                        )}
                        {isUnread && (
                          <button
                            onClick={() => markRead(n.id)}
                            className="text-xs font-medium text-ink-3 hover:text-ink"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => load(false)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
