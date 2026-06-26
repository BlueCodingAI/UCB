'use client';

import { useEffect, useState } from 'react';
import { ImageIcon, Plus, ChevronRight, ImageOff } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import {
  Card,
  Badge,
  Switch,
  Button,
  Skeleton,
  EmptyState,
  TableWrap,
  Th,
  Td,
  Tr,
  buttonVariants,
  useToast,
} from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api, ApiError, uploadUrl } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface AdminBanner {
  id: string;
  name: string;
  imagePath?: string | null;
  imageUrl?: string | null;
  placement: string;
  startsAt: number | null;
  endsAt: number | null;
  isActive: boolean;
  impressions?: number | null;
  clicks?: number | null;
}

const label = (v: string) => v.replace(/_/g, ' ');

function ctr(impr?: number | null, clk?: number | null): string {
  if (!impr || impr <= 0) return '0%';
  return `${(((clk ?? 0) / impr) * 100).toFixed(1)}%`;
}

function imgSrc(b: AdminBanner): string | null {
  if (b.imageUrl) return b.imageUrl;
  if (b.imagePath) return uploadUrl(b.imagePath);
  return null;
}

export default function AdminBannersPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminBanner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.get<{ banners: AdminBanner[] } | AdminBanner[]>('/admin/banners', { realm: 'admin' });
      setRows(Array.isArray(res) ? res : res.banners ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load banners.');
      setRows([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleActive(b: AdminBanner, next: boolean) {
    setToggling(b.id);
    setRows((prev) => prev?.map((r) => (r.id === b.id ? { ...r, isActive: next } : r)) ?? null);
    try {
      await api.patch(`/admin/banners/${b.id}/active`, { isActive: next }, { realm: 'admin' });
      toast(next ? 'Banner activated.' : 'Banner paused.', 'success');
    } catch (e) {
      setRows((prev) => prev?.map((r) => (r.id === b.id ? { ...r, isActive: !next } : r)) ?? null);
      toast(e instanceof ApiError ? e.message : 'Could not update banner.', 'error');
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="animate-fade-up">
      <AdminPageHeader
        title="Banners"
        description="Manage promotional banners across the app. Track impressions, clicks and click-through rate."
        actions={
          <Link href="/admin/banners/new" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            <Plus className="h-4 w-4" /> Add banner
          </Link>
        }
      />

      {rows === null ? (
        <Skeleton className="h-80 w-full rounded-md" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No banners yet"
          description={error ?? 'Create your first banner to start promoting across the app.'}
          action={
            <Link href="/admin/banners/new" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Plus className="h-4 w-4" /> Add banner
            </Link>
          }
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Banner</Th>
              <Th>Placement</Th>
              <Th>Schedule</Th>
              <Th className="text-right">Impressions</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">CTR</Th>
              <Th>Active</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const src = imgSrc(b);
              return (
                <Tr key={b.id} className="group">
                  <Td>
                    <Link href={`/admin/banners/${b.id}`} className="flex items-center gap-3">
                      <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-sunk">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={b.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-4 w-4 text-ink-3" />
                        )}
                      </span>
                      <span className="font-medium text-ink">{b.name}</span>
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone="neutral" className="capitalize">
                      {label(b.placement)}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-ink-3">
                    {formatDate(b.startsAt)} – {formatDate(b.endsAt)}
                  </Td>
                  <Td className="text-right tabular-nums">{(b.impressions ?? 0).toLocaleString('en-IN')}</Td>
                  <Td className="text-right tabular-nums">{(b.clicks ?? 0).toLocaleString('en-IN')}</Td>
                  <Td className="text-right font-medium tabular-nums text-ink">{ctr(b.impressions, b.clicks)}</Td>
                  <Td>
                    <Switch
                      checked={b.isActive}
                      label={`Toggle ${b.name}`}
                      disabled={toggling === b.id}
                      onChange={(v) => void toggleActive(b, v)}
                    />
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/banners/${b.id}`}
                      aria-label="Open banner"
                      className="text-ink-3 group-hover:text-primary-600"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
