'use client';

import { use, useEffect, useState } from 'react';
import { ArrowLeft, Eye, MousePointerClick, Percent, Trash2, Save, ImageOff } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { KpiCard } from '@/components/admin/KpiCard';
import {
  AdminOpsBannerFields,
  BANNER_PLACEMENTS,
  type BannerConfig,
} from '@/components/admin/AdminOpsBannerFields';
import {
  Card,
  CardBody,
  CardTitle,
  Button,
  Modal,
  Skeleton,
  EmptyState,
  useToast,
} from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { api, ApiError, uploadUrl } from '@/lib/api';

interface BannerAnalytics {
  id: string;
  name: string;
  imagePath?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  targetUrl?: string | null;
  placement: string;
  targetLanguage?: string | null;
  startsAt: number | null;
  endsAt: number | null;
  priority?: number | null;
  isActive: boolean;
  impressions?: number | null;
  clicks?: number | null;
  daily?: { date: string; impressions: number; clicks: number }[] | null;
}

const toDateInput = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

export default function BannerDetailPage({ params }: { params: Promise<{ bannerId: string }> }) {
  const { bannerId } = use(params);
  const { toast } = useToast();
  const router = useRouter();

  const [banner, setBanner] = useState<BannerAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<BannerConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await api.get<{ banner?: BannerAnalytics } & BannerAnalytics>(
        `/admin/banners/${bannerId}/analytics`,
        { realm: 'admin' },
      );
      const b = (data.banner ?? data) as BannerAnalytics;
      setBanner(b);
      setCfg({
        name: b.name ?? '',
        imageAlt: b.imageAlt ?? '',
        targetUrl: b.targetUrl ?? '',
        placement: b.placement ?? BANNER_PLACEMENTS[0].value,
        targetLanguage: b.targetLanguage ?? '',
        startsAt: toDateInput(b.startsAt),
        endsAt: toDateInput(b.endsAt),
        priority: String(b.priority ?? 0),
        isActive: b.isActive,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this banner.');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerId]);

  function update(patch: Partial<BannerConfig>) {
    setCfg((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      await api.put(
        `/admin/banners/${bannerId}`,
        {
          name: cfg.name.trim(),
          imageAlt: cfg.imageAlt.trim() || null,
          targetUrl: cfg.targetUrl.trim() || null,
          placement: cfg.placement,
          targetLanguage: cfg.targetLanguage || null,
          startsAt: cfg.startsAt ? new Date(`${cfg.startsAt}T00:00:00Z`).getTime() : null,
          endsAt: cfg.endsAt ? new Date(`${cfg.endsAt}T23:59:59Z`).getTime() : null,
          priority: Number(cfg.priority) || 0,
          isActive: cfg.isActive,
        },
        { realm: 'admin' },
      );
      toast('Banner updated.', 'success');
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save banner.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    setDeleting(true);
    try {
      await api.del(`/admin/banners/${bannerId}`, { realm: 'admin' });
      toast('Banner deleted.', 'success');
      router.push('/admin/banners');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not delete banner.', 'error');
      setDeleting(false);
    }
  }

  const src = banner ? banner.imageUrl ?? (banner.imagePath ? uploadUrl(banner.imagePath) : null) : null;
  const impr = banner?.impressions ?? 0;
  const clk = banner?.clicks ?? 0;
  const ctr = impr > 0 ? `${((clk / impr) * 100).toFixed(1)}%` : '0%';

  return (
    <div className="animate-fade-up">
      <Link href="/admin/banners" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Back to banners
      </Link>

      {!banner || !cfg ? (
        error ? (
          <EmptyState
            icon={ImageOff}
            title="Banner not found"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => router.push('/admin/banners')}>
                Back to banners
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            <Skeleton className="h-24 w-full rounded-lg" />
            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          </div>
        )
      ) : (
        <>
          <AdminPageHeader
            title={banner.name}
            description="Review performance and update this banner's configuration."
            actions={
              <Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            }
          />

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <KpiCard label="Impressions" value={impr.toLocaleString('en-IN')} icon={Eye} />
            <KpiCard label="Clicks" value={clk.toLocaleString('en-IN')} icon={MousePointerClick} />
            <KpiCard label="Click-through rate" value={ctr} icon={Percent} tone="accent" />
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-6">
              <Card>
                <CardBody>
                  <CardTitle className="mb-3 text-base">Preview</CardTitle>
                  <div className="overflow-hidden rounded-md border border-border bg-surface-sunk">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={banner.imageAlt ?? banner.name} className="w-full object-contain" />
                    ) : (
                      <div className="flex h-40 items-center justify-center text-ink-3">
                        <ImageOff className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  {banner.targetUrl && (
                    <p className="mt-3 truncate text-xs text-ink-3">
                      Links to:{' '}
                      <a href={banner.targetUrl} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                        {banner.targetUrl}
                      </a>
                    </p>
                  )}
                </CardBody>
              </Card>

              {banner.daily && banner.daily.length > 0 && (
                <Card>
                  <CardBody>
                    <CardTitle className="mb-3 text-base">Daily breakdown</CardTitle>
                    <div className="space-y-1.5">
                      {banner.daily.map((d) => {
                        const max = Math.max(...banner.daily!.map((x) => x.impressions), 1);
                        return (
                          <div key={d.date} className="flex items-center gap-3 text-xs">
                            <span className="w-20 shrink-0 text-ink-3">{d.date.slice(5)}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-sunk">
                              <div
                                className="h-full rounded-pill bg-primary-600"
                                style={{ width: `${(d.impressions / max) * 100}%` }}
                              />
                            </div>
                            <span className="w-24 shrink-0 text-right tabular-nums text-ink-2">
                              {d.impressions} · {d.clicks} clk
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>

            <Card>
              <CardBody>
                <CardTitle className="mb-4 text-base">Configuration</CardTitle>
                <p className="mb-4 text-xs text-ink-3">
                  To change the artwork, create a new banner. The image cannot be edited here.
                </p>
                <AdminOpsBannerFields cfg={cfg} onChange={update} />
                <div className="mt-6 flex justify-end">
                  <Button variant="primary" loading={saving} onClick={() => void save()}>
                    <Save className="h-4 w-4" /> Save changes
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Delete banner?"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={() => void del()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          This permanently removes the banner and its recorded analytics. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
