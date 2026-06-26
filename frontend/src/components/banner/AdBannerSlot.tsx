'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { X } from 'lucide-react';
import { api, uploadUrl } from '@/lib/api';
import type { Banner, Locale } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Placement-aware advertisement slot. Fires impression/click tracking. */
export function AdBannerSlot({ placement, className }: { placement: string; className?: string }) {
  const locale = useLocale() as Locale;
  const [banner, setBanner] = useState<Banner | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const seen = useRef(false);

  useEffect(() => {
    let active = true;
    api
      .get<Banner[]>('/banners', { query: { placement, lang: locale }, anonymous: true })
      .then((list) => {
        if (active && list.length) setBanner(list[0]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [placement, locale]);

  useEffect(() => {
    if (banner && !seen.current) {
      seen.current = true;
      api.post(`/banners/${banner.id}/impression`, { placement }, { anonymous: true }).catch(() => {});
    }
  }, [banner, placement]);

  if (!banner || dismissed) return null;

  function handleClick() {
    if (!banner) return;
    api.post(`/banners/${banner.id}/click`, { placement }, { anonymous: true }).catch(() => {});
    if (banner.targetUrl) window.open(banner.targetUrl, '_blank', 'noopener');
  }

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-border bg-surface', className)}>
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="font-mono text-[0.66rem] uppercase tracking-wider text-ink-3">Sponsored</span>
        <button
          aria-label="Dismiss ad"
          onClick={() => setDismissed(true)}
          className="rounded-sm p-0.5 text-ink-3 hover:bg-surface-sunk hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <button onClick={handleClick} className="block w-full p-3 pt-2 text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={uploadUrl(banner.imageUrl)}
          alt={banner.imageAlt ?? banner.name}
          className="w-full rounded-md"
          loading="lazy"
        />
      </button>
    </div>
  );
}
