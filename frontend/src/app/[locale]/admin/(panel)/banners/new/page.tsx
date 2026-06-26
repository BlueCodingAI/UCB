'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, UploadCloud, ImageOff } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import {
  AdminOpsBannerFields,
  BANNER_PLACEMENTS,
  type BannerConfig,
} from '@/components/admin/AdminOpsBannerFields';
import { Card, CardBody, Field, Button, useToast } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';

const EMPTY: BannerConfig = {
  name: '',
  imageAlt: '',
  targetUrl: '',
  placement: BANNER_PLACEMENTS[0].value,
  targetLanguage: '',
  startsAt: '',
  endsAt: '',
  priority: '0',
  isActive: true,
};

export default function NewBannerPage() {
  const { toast } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState<BannerConfig>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(patch: Partial<BannerConfig>) {
    setCfg((prev) => ({ ...prev, ...patch }));
  }

  function onFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg.name.trim()) {
      toast('Give the banner a name.', 'error');
      return;
    }
    if (!file) {
      toast('Upload a banner image.', 'error');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('name', cfg.name.trim());
      if (cfg.imageAlt.trim()) fd.append('imageAlt', cfg.imageAlt.trim());
      if (cfg.targetUrl.trim()) fd.append('targetUrl', cfg.targetUrl.trim());
      fd.append('placement', cfg.placement);
      if (cfg.targetLanguage) fd.append('targetLanguage', cfg.targetLanguage);
      if (cfg.startsAt) fd.append('startsAt', String(new Date(`${cfg.startsAt}T00:00:00Z`).getTime()));
      if (cfg.endsAt) fd.append('endsAt', String(new Date(`${cfg.endsAt}T23:59:59Z`).getTime()));
      fd.append('priority', String(Number(cfg.priority) || 0));
      fd.append('isActive', String(cfg.isActive));

      const created = await api.post<{ id: string }>('/admin/banners', fd, { realm: 'admin' });
      toast('Banner created.', 'success');
      router.push(created?.id ? `/admin/banners/${created.id}` : '/admin/banners');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not create banner.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <Link
        href="/admin/banners"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to banners
      </Link>

      <AdminPageHeader title="New banner" description="Upload artwork and set where and when it appears." />

      <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardBody>
            <Field label="Banner image" required hint="JPG or PNG. Recommended wide aspect ratio.">
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
                className="flex min-h-[12rem] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-md border-2 border-dashed border-border bg-surface-sunk/40 p-4 text-center transition hover:border-primary-600"
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Banner preview" className="max-h-56 w-full rounded-sm object-contain" />
                ) : (
                  <>
                    <UploadCloud className="h-8 w-8 text-ink-3" />
                    <p className="text-sm font-medium text-ink">Click to upload</p>
                    <p className="text-xs text-ink-3">or drop an image here</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              {file && <p className="mt-2 text-xs text-ink-3">{file.name}</p>}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <AdminOpsBannerFields cfg={cfg} onChange={update} />
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/admin/banners')}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                Create banner
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>

      {!preview && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-3">
          <ImageOff className="h-3.5 w-3.5" /> An image is required before the banner can be created.
        </p>
      )}
    </div>
  );
}
