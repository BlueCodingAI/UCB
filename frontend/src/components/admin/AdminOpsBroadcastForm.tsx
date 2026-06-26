'use client';

import { useState } from 'react';
import { Send, CalendarClock } from 'lucide-react';
import { Card, CardBody, CardTitle, Field, Input, Select, Textarea, Switch, Button, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { LOCALE_NAMES } from '@/lib/constants';

type Audience = 'all' | 'plan' | 'language' | 'location';

const AUDIENCE_FILTER_LABEL: Record<Exclude<Audience, 'all'>, string> = {
  plan: 'Plan',
  language: 'Language',
  location: 'City / district',
};

export function AdminOpsBroadcastForm({ onSent }: { onSent: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [bodyHi, setBodyHi] = useState('');
  const [bodyMr, setBodyMr] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [audienceFilter, setAudienceFilter] = useState('');
  const [inApp, setInApp] = useState(true);
  const [email, setEmail] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [sending, setSending] = useState(false);

  function reset() {
    setTitle('');
    setBodyEn('');
    setBodyHi('');
    setBodyMr('');
    setAudience('all');
    setAudienceFilter('');
    setInApp(true);
    setEmail(false);
    setSchedule(false);
    setScheduledAt('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !bodyEn.trim()) {
      toast('Add a title and an English body.', 'error');
      return;
    }
    const channels = [inApp && 'in_app', email && 'email'].filter(Boolean) as string[];
    if (channels.length === 0) {
      toast('Pick at least one channel.', 'error');
      return;
    }
    if (audience !== 'all' && !audienceFilter.trim()) {
      toast(`Set the ${AUDIENCE_FILTER_LABEL[audience]} filter.`, 'error');
      return;
    }
    setSending(true);
    try {
      await api.post(
        '/admin/broadcasts',
        {
          title: title.trim(),
          bodyEn: bodyEn.trim(),
          bodyHi: bodyHi.trim() || null,
          bodyMr: bodyMr.trim() || null,
          audienceType: audience,
          audienceFilter: audience === 'all' ? null : audienceFilter.trim(),
          channels,
          scheduledAt: schedule && scheduledAt ? new Date(scheduledAt).getTime() : null,
        },
        { realm: 'admin' },
      );
      toast(schedule ? 'Broadcast scheduled.' : 'Broadcast sent.', 'success');
      reset();
      onSent();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send broadcast.', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <CardTitle className="mb-1 text-base">Compose broadcast</CardTitle>
        <p className="mb-4 text-sm text-ink-3">
          Reaches users in their preferred language. Provide Hindi and Marathi where you can.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title" htmlFor="bc-title" required>
            <Input id="bc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </Field>

          <Field label="Body — English" htmlFor="bc-en" required>
            <Textarea id="bc-en" value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Body — ${LOCALE_NAMES.hi}`} htmlFor="bc-hi" hint="Optional">
              <Textarea id="bc-hi" value={bodyHi} onChange={(e) => setBodyHi(e.target.value)} />
            </Field>
            <Field label={`Body — ${LOCALE_NAMES.mr}`} htmlFor="bc-mr" hint="Optional">
              <Textarea id="bc-mr" value={bodyMr} onChange={(e) => setBodyMr(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Audience" htmlFor="bc-aud">
              <Select
                id="bc-aud"
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value as Audience);
                  setAudienceFilter('');
                }}
              >
                <option value="all">Everyone</option>
                <option value="plan">By plan</option>
                <option value="language">By language</option>
                <option value="location">By location</option>
              </Select>
            </Field>
            {audience !== 'all' && (
              <Field label={AUDIENCE_FILTER_LABEL[audience]} htmlFor="bc-filter" required>
                {audience === 'plan' ? (
                  <Select id="bc-filter" value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)}>
                    <option value="">Select plan</option>
                    <option value="freemium">Freemium</option>
                    <option value="premium">Premium</option>
                    <option value="super_premium">Super premium</option>
                  </Select>
                ) : audience === 'language' ? (
                  <Select id="bc-filter" value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)}>
                    <option value="">Select language</option>
                    <option value="en">{LOCALE_NAMES.en}</option>
                    <option value="hi">{LOCALE_NAMES.hi}</option>
                    <option value="mr">{LOCALE_NAMES.mr}</option>
                  </Select>
                ) : (
                  <Input
                    id="bc-filter"
                    value={audienceFilter}
                    placeholder="e.g. Pune"
                    onChange={(e) => setAudienceFilter(e.target.value)}
                  />
                )}
              </Field>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink-2">Channels</p>
            <div className="flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={inApp}
                  onChange={(e) => setInApp(e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-primary-600,#0E7C6B)]"
                />
                In-app
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={email}
                  onChange={(e) => setEmail(e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-primary-600,#0E7C6B)]"
                />
                Email
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-ink-3" />
              <span className="text-sm font-medium text-ink">Schedule for later</span>
            </div>
            <Switch checked={schedule} label="Schedule for later" onChange={setSchedule} />
          </div>
          {schedule && (
            <Field label="Send at" htmlFor="bc-when">
              <Input
                id="bc-when"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </Field>
          )}

          <Button type="submit" variant="primary" className="w-full" loading={sending}>
            <Send className="h-4 w-4" /> {schedule ? 'Schedule broadcast' : 'Send now'}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
