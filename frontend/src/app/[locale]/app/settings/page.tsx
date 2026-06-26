'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Bell, Mail, MessageCircle, Phone, KeyRound, Languages } from 'lucide-react';
import { Button, Card, CardBody, CardTitle, Switch, Select, Skeleton, useToast } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { PageHeading } from '@/components/common/PageHeading';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { LOCALE_NAMES, OFFICIAL_SOURCE_URL } from '@/lib/constants';
import type { Locale } from '@/lib/types';

interface Prefs {
  inApp: boolean;
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
}

const CHANNELS: { key: keyof Prefs; label: string; desc: string; icon: typeof Bell }[] = [
  { key: 'inApp', label: 'In-app', desc: 'Show notifications inside Disha', icon: Bell },
  { key: 'email', label: 'Email', desc: 'Receive reminders and updates by email', icon: Mail },
  { key: 'whatsapp', label: 'WhatsApp', desc: 'Get timely nudges on WhatsApp', icon: MessageCircle },
  { key: 'sms', label: 'SMS', desc: 'Text-message alerts for key deadlines', icon: Phone },
];

export default function SettingsPage() {
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [lang, setLang] = useState<Locale>('en');
  const [savingLang, setSavingLang] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<Prefs>('/notifications/preferences')
      .then((p) => active && setPrefs(p))
      .catch(() => active && setPrefs({ inApp: true, email: true, whatsapp: false, sms: false }));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user) setLang(user.preferredLanguage);
  }, [user]);

  async function toggle(key: keyof Prefs, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingPrefs(true);
    try {
      await api.put('/notifications/preferences', next);
    } catch (e) {
      setPrefs(prefs); // revert
      toast(e instanceof ApiError ? e.message : 'Could not update preferences.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  }

  async function saveLang() {
    setSavingLang(true);
    try {
      await api.put('/profile', { preferredLanguage: lang });
      void refreshUser();
      toast('Default language updated.', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not update language.', 'error');
    } finally {
      setSavingLang(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Preferences" title="Settings" subtitle="Control how Disha reaches you and your defaults." />

      {/* Notification channels */}
      <Card>
        <CardBody>
          <CardTitle className="mb-1">Notification channels</CardTitle>
          <p className="mb-4 text-sm text-ink-3">Choose where you want to hear from us. Critical account messages may still be sent.</p>
          {prefs === null ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                return (
                  <li key={c.key} className="flex items-center justify-between gap-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-sunk text-primary-600">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-ink">{c.label}</p>
                        <p className="text-xs text-ink-3">{c.desc}</p>
                      </div>
                    </div>
                    <Switch
                      checked={prefs[c.key]}
                      disabled={savingPrefs}
                      label={c.label}
                      onChange={(v) => toggle(c.key, v)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Language default */}
      <Card>
        <CardBody>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-sunk text-primary-600">
              <Languages className="h-4 w-4" />
            </span>
            <div>
              <CardTitle>Default language</CardTitle>
              <p className="text-xs text-ink-3">Used for the bot and your notifications.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:max-w-xs sm:flex-1">
              <Select value={lang} onChange={(e) => setLang(e.target.value as Locale)} aria-label="Default language">
                {(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              loading={savingLang}
              disabled={user?.preferredLanguage === lang}
              onClick={saveLang}
            >
              Save
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Security */}
      <Card>
        <CardBody>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-sunk text-primary-600">
              <KeyRound className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <CardTitle>Security</CardTitle>
              <p className="mt-1 text-sm text-ink-2">
                To change your password, use the secure reset link. We will email you a one-time link.
              </p>
              <Link
                href="/auth/forgot-password"
                className="mt-3 inline-flex text-sm font-medium text-primary-600 hover:underline"
              >
                Reset password
              </Link>
            </div>
          </div>
        </CardBody>
      </Card>

      <p className="text-center text-xs text-ink-3">
        Disha is a guidance platform, not the official admission portal.{' '}
        <a href={OFFICIAL_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
          Visit the official CET Cell site
        </a>
        .
      </p>
    </div>
  );
}
