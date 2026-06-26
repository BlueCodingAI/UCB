'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Card, CardBody, Field, Input, Textarea, Select, Button, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useRouter } from '@/i18n/navigation';
import { LOCALE_NAMES } from '@/lib/constants';
import type { CounsellingRequest, Locale, PlanFeatures } from '@/lib/types';

type RequestType = CounsellingRequest['type'];

const TYPE_OPTIONS: { value: RequestType; label: string; needs: keyof PlanFeatures | null }[] = [
  { value: 'general_query', label: 'General query — quick written guidance', needs: null },
  { value: 'assist', label: 'Counselling assist — guided help over chat or call', needs: 'counsellingAssist' },
  { value: 'one_to_one', label: 'One-to-one session — a dedicated counsellor', needs: 'oneToOne' },
  { value: 'in_person', label: 'In-person meeting — meet at a centre', needs: 'inPerson' },
];

const MODE_OPTIONS = [
  { value: 'chat', label: 'Chat' },
  { value: 'call', label: 'Phone call' },
  { value: 'video', label: 'Video call' },
  { value: 'in_person', label: 'In person' },
];

function isAllowed(opt: (typeof TYPE_OPTIONS)[number], features: PlanFeatures | null): boolean {
  if (!opt.needs) return true; // general_query is always allowed
  return !!features?.[opt.needs];
}

/** Form to raise a new counselling request. */
export function RequestForm({ features }: { features: PlanFeatures | null }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();

  const firstAllowed = TYPE_OPTIONS.find((o) => isAllowed(o, features))?.value ?? 'general_query';
  const [type, setType] = useState<RequestType>(firstAllowed);
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<Locale>(locale);
  const [preferredMode, setPreferredMode] = useState('chat');
  const [preferredTimes, setPreferredTimes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const selectedOpt = TYPE_OPTIONS.find((o) => o.value === type)!;
  const selectedLocked = !isAllowed(selectedOpt, features);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!topic.trim()) e.topic = 'Add a short topic so we can route your request.';
    if (!message.trim() || message.trim().length < 10) e.message = 'Tell us a bit more (at least 10 characters).';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (selectedLocked) {
      toast('Your plan does not include this counselling tier.', 'error');
      return;
    }
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        type,
        topic: topic.trim(),
        message: message.trim(),
        preferredLanguage,
        preferredMode,
        ...(preferredTimes.trim() ? { preferredTimes: preferredTimes.trim() } : {}),
      };
      const created = await api.post<CounsellingRequest>('/counselling/requests', payload);
      toast('Request submitted', 'success');
      router.push(`/app/counselling/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          const fieldErrs: Record<string, string> = {};
          for (const d of err.details) fieldErrs[d.field] = d.issue;
          setErrors(fieldErrs);
        }
        toast(err.message, 'error');
      } else {
        toast('Something went wrong. Please try again.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field
            label="What kind of help do you need?"
            htmlFor="type"
            hint={selectedLocked ? 'This tier is not in your current plan — upgrade to unlock it.' : undefined}
            error={selectedLocked ? 'Locked on your plan' : undefined}
          >
            <Select id="type" value={type} onChange={(e) => setType(e.target.value as RequestType)}>
              {TYPE_OPTIONS.map((opt) => {
                const allowed = isAllowed(opt, features);
                return (
                  <option key={opt.value} value={opt.value} disabled={!allowed}>
                    {opt.label}
                    {!allowed ? ' (upgrade to unlock)' : ''}
                  </option>
                );
              })}
            </Select>
          </Field>

          <Field label="Topic" htmlFor="topic" required error={errors.topic}>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              invalid={!!errors.topic}
              placeholder="e.g. Choosing branches in the option form"
              maxLength={120}
            />
          </Field>

          <Field
            label="Your question or situation"
            htmlFor="message"
            required
            error={errors.message}
            hint="Share your CET score, category, preferred colleges or anything relevant — it helps your counsellor prepare."
          >
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              invalid={!!errors.message}
              placeholder="Describe what you'd like guidance on…"
              maxLength={2000}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Preferred language" htmlFor="lang">
              <Select
                id="lang"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as Locale)}
              >
                {(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Preferred mode" htmlFor="mode">
              <Select id="mode" value={preferredMode} onChange={(e) => setPreferredMode(e.target.value)}>
                {MODE_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Preferred times (optional)"
            htmlFor="times"
            hint="Let us know when you're usually free, e.g. weekday evenings after 6pm."
          >
            <Input
              id="times"
              value={preferredTimes}
              onChange={(e) => setPreferredTimes(e.target.value)}
              placeholder="Weekday evenings, weekend mornings…"
              maxLength={200}
            />
          </Field>

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting} disabled={selectedLocked}>
              Submit request
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
