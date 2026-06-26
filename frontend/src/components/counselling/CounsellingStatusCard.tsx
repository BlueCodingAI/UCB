'use client';

import { MessageCircle, Users, MapPin, HelpCircle, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { formatRelative } from '@/lib/format';
import type { CounsellingRequest } from '@/lib/types';
import { statusTone, statusLabel } from './StatusTimeline';

const TYPE_META: Record<CounsellingRequest['type'], { icon: LucideIcon; label: string }> = {
  assist: { icon: MessageCircle, label: 'Counselling assist' },
  one_to_one: { icon: Users, label: 'One-to-one session' },
  in_person: { icon: MapPin, label: 'In-person meeting' },
  general_query: { icon: HelpCircle, label: 'General query' },
};

/** Summary row for a counselling request in the overview list. */
export function CounsellingStatusCard({ request }: { request: CounsellingRequest }) {
  const meta = TYPE_META[request.type] ?? TYPE_META.general_query;
  const Icon = meta.icon;

  return (
    <Link href={`/app/counselling/${request.id}`} className="group block focus-visible:outline-none">
      <Card interactive className="p-4 group-focus-visible:shadow-[var(--ring)]">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-sunk text-primary-600">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-ink">{request.topic || meta.label}</p>
              <Badge tone={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-3">
              {meta.label} · {formatRelative(request.createdAt)}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-primary-600" />
        </div>
      </Card>
    </Link>
  );
}
