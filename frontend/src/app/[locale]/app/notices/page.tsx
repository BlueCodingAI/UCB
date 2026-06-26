'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import { Card, CardBody, Badge, Tabs, Skeleton, EmptyState, type TabItem } from '@/components/ui';
import { PageHeading } from '@/components/common/PageHeading';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';
import type { Locale } from '@/lib/types';

interface Notice {
  id: string;
  title: string;
  description: string | null;
  sourceType: string;
  language: string;
  topic: string | null;
  capYear: number | null;
  updatedAt: number;
}

const TYPE_LABEL: Record<string, string> = {
  notice: 'Notice',
  circular: 'Circular',
  schedule: 'Schedule',
};

export default function NoticesPage() {
  const locale = useLocale() as Locale;
  const td = useTranslations('disclaimer');
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let active = true;
    api
      .get<Notice[]>('/meta/notices', { query: { lang: locale }, anonymous: true })
      .then((list) => active && setNotices(list))
      .catch(() => active && setNotices([]));
    return () => {
      active = false;
    };
  }, [locale]);

  const tabs = useMemo<TabItem[]>(() => {
    const present = new Set((notices ?? []).map((n) => n.sourceType));
    const base: TabItem[] = [{ key: 'all', label: 'All' }];
    for (const key of ['notice', 'circular', 'schedule']) {
      if (present.has(key)) base.push({ key, label: TYPE_LABEL[key] ?? key });
    }
    return base;
  }, [notices]);

  const filtered = (notices ?? []).filter((n) => filter === 'all' || n.sourceType === filter);

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Knowledge base"
        title="Notices and circulars"
        subtitle="A curated, searchable copy of CAP notices. Always verify dates and details on the official portal."
      />

      {/* Disclaimer banner card */}
      <Card className="border-accent/30 bg-accent-soft/40">
        <CardBody className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{td('short')}</p>
            <p className="mt-1 text-sm text-ink-2">{td('full')}</p>
            <a
              href={OFFICIAL_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
            >
              {td('visitOfficial')} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </CardBody>
      </Card>

      {notices === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : notices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No notices available"
          description="Once the team publishes notices for this CAP season, they will appear here."
        />
      ) : (
        <>
          {tabs.length > 2 && <Tabs items={tabs} value={filter} onChange={setFilter} />}
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((n) => (
              <Card key={n.id} interactive>
                <CardBody>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone="primary">{TYPE_LABEL[n.sourceType] ?? n.sourceType}</Badge>
                    {n.topic && <Badge tone="neutral">{n.topic}</Badge>}
                    {n.capYear && (
                      <span className="font-mono text-[0.66rem] uppercase tracking-wider text-ink-3">
                        CAP {n.capYear}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-ink">{n.title}</h3>
                  {n.description && <p className="mt-1.5 text-sm text-ink-2 line-clamp-3">{n.description}</p>}
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-xs text-ink-3">Updated {formatDate(n.updatedAt, locale)}</span>
                    <a
                      href={OFFICIAL_SOURCE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                    >
                      Verify on official site <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
