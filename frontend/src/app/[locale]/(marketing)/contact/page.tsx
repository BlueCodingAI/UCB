'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, Send, ExternalLink } from 'lucide-react';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';

export default function ContactPage() {
  const t = useTranslations('contact');
  const td = useTranslations('disclaimer');
  const { toast } = useToast();

  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // No backend endpoint — acknowledge and reset.
    setSubmitting(true);
    setTimeout(() => {
      toast(t('sent'), 'success');
      setForm({ name: '', email: '', message: '' });
      setSubmitting(false);
    }, 300);
  }

  return (
    <div className="container-page py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h1 className="font-display mt-4 text-4xl tracking-tight text-primary sm:text-5xl">{t('title')}</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{t('subtitle')}</p>
      </div>

      <div className="mx-auto mt-14 grid max-w-4xl gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8"
        >
          <Field label={t('name')} htmlFor="contact-name" required>
            <Input
              id="contact-name"
              name="name"
              autoComplete="name"
              required
              value={form.name}
              onChange={update('name')}
            />
          </Field>
          <Field label={t('email')} htmlFor="contact-email" required>
            <Input
              id="contact-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={update('email')}
            />
          </Field>
          <Field label={t('message')} htmlFor="contact-message" required>
            <Textarea
              id="contact-message"
              name="message"
              required
              rows={5}
              placeholder={t('messagePlaceholder')}
              value={form.message}
              onChange={update('message')}
            />
          </Field>
          <Button type="submit" loading={submitting} className="w-full sm:w-auto sm:self-start">
            <Send className="h-4 w-4" />
            {t('send')}
          </Button>
        </form>

        {/* Side panel */}
        <aside className="flex flex-col gap-5">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Mail className="h-5 w-5" />
            </span>
            <h2 className="mt-5 text-lg font-semibold tracking-tight text-primary">{t('supportTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{t('supportBody')}</p>
            <a
              href={`mailto:${t('supportEmail')}`}
              className="mt-3 inline-block break-all font-mono text-sm font-medium text-primary-600"
            >
              {t('supportEmail')}
            </a>
          </div>

          <div className="rounded-2xl border border-border bg-surface-sunk/60 p-6">
            <h2 className="text-base font-semibold tracking-tight text-primary">{t('officialTitle')}</h2>
            <p className="mt-1.5 text-sm text-ink-2">{t('officialBody')}</p>
            <a
              href={OFFICIAL_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600"
            >
              {td('visitOfficial')}
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
