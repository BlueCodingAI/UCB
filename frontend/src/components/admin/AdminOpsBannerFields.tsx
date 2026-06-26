'use client';

import { Field, Input, Select, Switch } from '@/components/ui';
import { LOCALE_NAMES } from '@/lib/constants';

export const BANNER_PLACEMENTS = [
  { value: 'home_top', label: 'Home — top' },
  { value: 'home_mid', label: 'Home — middle' },
  { value: 'sidebar', label: 'Sidebar' },
  { value: 'chat_footer', label: 'Chat footer' },
  { value: 'pricing', label: 'Pricing page' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'popup', label: 'Popup' },
];

export interface BannerConfig {
  name: string;
  imageAlt: string;
  targetUrl: string;
  placement: string;
  targetLanguage: string;
  startsAt: string;
  endsAt: string;
  priority: string;
  isActive: boolean;
}

/** Shared config fields used by both the create and edit banner pages. */
export function AdminOpsBannerFields({
  cfg,
  onChange,
}: {
  cfg: BannerConfig;
  onChange: (patch: Partial<BannerConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Name" htmlFor="b-name" required hint="Internal label for this banner">
        <Input id="b-name" value={cfg.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>

      <Field label="Image alt text" htmlFor="b-alt" hint="Describes the image for screen readers">
        <Input id="b-alt" value={cfg.imageAlt} onChange={(e) => onChange({ imageAlt: e.target.value })} />
      </Field>

      <Field label="Target URL" htmlFor="b-url" hint="Where the banner links on click">
        <Input
          id="b-url"
          type="url"
          placeholder="https://"
          value={cfg.targetUrl}
          onChange={(e) => onChange({ targetUrl: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Placement" htmlFor="b-placement" required>
          <Select id="b-placement" value={cfg.placement} onChange={(e) => onChange({ placement: e.target.value })}>
            {BANNER_PLACEMENTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Target language" htmlFor="b-lang" hint="Show only to this language">
          <Select id="b-lang" value={cfg.targetLanguage} onChange={(e) => onChange({ targetLanguage: e.target.value })}>
            <option value="">All languages</option>
            <option value="en">{LOCALE_NAMES.en}</option>
            <option value="hi">{LOCALE_NAMES.hi}</option>
            <option value="mr">{LOCALE_NAMES.mr}</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts at" htmlFor="b-start">
          <Input id="b-start" type="date" value={cfg.startsAt} onChange={(e) => onChange({ startsAt: e.target.value })} />
        </Field>
        <Field label="Ends at" htmlFor="b-end">
          <Input id="b-end" type="date" value={cfg.endsAt} onChange={(e) => onChange({ endsAt: e.target.value })} />
        </Field>
      </div>

      <Field label="Priority" htmlFor="b-priority" hint="Higher numbers show first">
        <Input
          id="b-priority"
          type="number"
          min={0}
          value={cfg.priority}
          onChange={(e) => onChange({ priority: e.target.value })}
        />
      </Field>

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-ink">Active</p>
          <p className="text-xs text-ink-3">Inactive banners are never shown</p>
        </div>
        <Switch checked={cfg.isActive} label="Active" onChange={(v) => onChange({ isActive: v })} />
      </div>
    </div>
  );
}
