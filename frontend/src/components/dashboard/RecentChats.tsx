'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { MessageSquare, ChevronRight, Mic } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card, CardBody, CardTitle, Skeleton, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import type { ChatSession, Locale } from '@/lib/types';

export function RecentChats({ limit = 4 }: { limit?: number }) {
  const locale = useLocale() as Locale;
  const [sessions, setSessions] = useState<ChatSession[] | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<ChatSession[]>('/chat/sessions', { query: { limit } })
      .then((list) => active && setSessions(list))
      .catch(() => active && setSessions([]));
    return () => {
      active = false;
    };
  }, [limit]);

  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex items-center justify-between">
          <CardTitle>Recent chats</CardTitle>
          <Link href="/app/chat" className="text-sm font-medium text-primary-600 hover:underline">
            View all
          </Link>
        </div>

        {sessions === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No chats yet"
            description="Start a conversation with the bot to see it here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {sessions.slice(0, limit).map((s) => {
              const Icon = s.channel === 'voice' ? Mic : MessageSquare;
              return (
                <li key={s.id}>
                  <Link
                    href={`/app/chat?session=${s.id}`}
                    className="group flex items-center gap-3 py-3 transition hover:opacity-90"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-sunk text-primary-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {s.title ?? 'Untitled conversation'}
                      </span>
                      <span className="block text-xs text-ink-3">
                        {s.messageCount} messages · {formatRelative(s.lastMessageAt ?? s.createdAt)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-3 transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
