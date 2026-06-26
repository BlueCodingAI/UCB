'use client';

import { useEffect, useState } from 'react';
import {
  Bot,
  Mic,
  CreditCard,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  MessageSquareWarning,
  Globe,
  Info,
} from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  Skeleton,
  Avatar,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { OFFICIAL_SOURCE_URL, LOCALE_NAMES } from '@/lib/constants';
import type { MetaConfig, Locale } from '@/lib/types';

function IntegrationRow({
  icon: Icon,
  name,
  detail,
  ok,
}: {
  icon: typeof Bot;
  name: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-sunk text-primary-600">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink">{name}</p>
          <p className="text-xs text-ink-3">{detail}</p>
        </div>
      </div>
      <Badge tone={ok ? 'success' : 'neutral'}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {ok ? 'Connected' : 'Not configured'}
      </Badge>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<MetaConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<MetaConfig>('/meta/config', { anonymous: true });
        setConfig(data);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not load configuration.');
      }
    })();
  }, []);

  const ff = config?.featureFlags;
  const defaultLang = (user?.preferredLanguage ?? 'en') as Locale;
  const roleTone: BadgeTone = 'accent';

  return (
    <div className="animate-fade-up">
      <AdminPageHeader
        title="Settings & roles"
        description="Integration status, defaults and your admin profile. Most values are configured server-side via environment."
      />

      {!config ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* Integrations */}
          <Card>
            <CardBody>
              <CardTitle className="mb-1 text-base">Integrations</CardTitle>
              <p className="mb-3 text-sm text-ink-3">Live status derived from server configuration.</p>
              <div className="divide-y divide-border">
                <IntegrationRow
                  icon={Bot}
                  name="OpenAI"
                  detail="Chat answers & embeddings (RAG)"
                  ok={!!ff?.aiEnabled}
                />
                <IntegrationRow
                  icon={Mic}
                  name="Sarvam"
                  detail="Speech-to-text & text-to-speech"
                  ok={!!ff?.voiceEnabled}
                />
                <IntegrationRow
                  icon={CreditCard}
                  name="Razorpay"
                  detail={config.razorpayKeyId ? `Key ${config.razorpayKeyId}` : 'Subscription payments'}
                  ok={!!ff?.paymentsEnabled && !!config.razorpayKeyId}
                />
              </div>
              {error && <p className="mt-3 text-xs text-danger">{error}</p>}
            </CardBody>
          </Card>

          {/* Defaults */}
          <Card>
            <CardBody>
              <CardTitle className="mb-1 text-base">Defaults</CardTitle>
              <p className="mb-4 text-sm text-ink-3">These are managed in server settings; shown here for reference.</p>

              <dl className="space-y-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-ink-2">
                    <Globe className="h-4 w-4 text-ink-3" /> Default language
                  </dt>
                  <dd className="font-medium text-ink">{LOCALE_NAMES[defaultLang]}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-2">Current CAP year</dt>
                  <dd className="font-medium text-ink">{config.currentCapYear}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-2">Season mode</dt>
                  <dd>
                    <Badge tone={config.seasonMode ? 'success' : 'neutral'}>
                      {config.seasonMode ? 'On' : 'Off'}
                    </Badge>
                  </dd>
                </div>
              </dl>

              <div className="mt-5 rounded-md border border-border bg-surface-sunk/50 p-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                  <MessageSquareWarning className="h-4 w-4 text-accent" /> KB-miss fallback
                </p>
                <p className="text-sm text-ink-2">{config.fallbackStrings.kbMiss}</p>
                <p className="mt-2 text-xs text-ink-3">
                  Sent verbatim when no knowledge-base answer is found. Edit the fallback strings in server settings.
                </p>
              </div>
            </CardBody>
          </Card>

          {/* Admin profile */}
          <Card>
            <CardBody>
              <CardTitle className="mb-3 text-base">Your admin account</CardTitle>
              {user ? (
                <div className="flex items-center gap-3">
                  <Avatar name={user.fullName ?? user.email} className="h-12 w-12" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{user.fullName ?? 'Admin'}</p>
                    {user.email && <p className="truncate text-sm text-ink-3">{user.email}</p>}
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge tone={roleTone}>
                        <ShieldCheck className="h-3.5 w-3.5" /> Administrator
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                <Skeleton className="h-16 w-full rounded-md" />
              )}
            </CardBody>
          </Card>

          {/* Reassurance */}
          <Card>
            <CardBody>
              <CardTitle className="mb-2 text-base">About this platform</CardTitle>
              <p className="flex items-start gap-2 text-sm text-ink-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                <span>
                  Disha provides guidance for the Maharashtra CAP process. It is not the official portal — the
                  authoritative source remains the{' '}
                  <a
                    href={OFFICIAL_SOURCE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-600 hover:underline"
                  >
                    CET Cell / CAP website
                  </a>
                  . The assistant answers strictly from the admin-curated knowledge base.
                </span>
              </p>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
