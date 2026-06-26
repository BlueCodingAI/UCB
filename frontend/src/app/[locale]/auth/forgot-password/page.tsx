'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MailCheck } from 'lucide-react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button, Field, Input } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/password/forgot', { email: email.trim() }, { anonymous: true });
    } catch (err) {
      // Always show success to avoid leaking which emails exist.
      if (err instanceof ApiError && err.status >= 500) {
        // a true server error is still worth surfacing, but we keep the privacy guarantee otherwise
      }
    } finally {
      setBusy(false);
      setDone(true);
    }
  }

  if (done) {
    return (
      <AuthCard>
        <div className="text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <MailCheck className="h-7 w-7" />
          </span>
          <h1 className="font-display text-2xl font-semibold text-primary">Check your email</h1>
          <p className="mt-2 text-base text-ink-2">
            If an account exists for <span className="font-medium text-ink">{email}</span>, we&apos;ve sent a link to
            reset your password. The link expires shortly, so use it soon.
          </p>
          <Link href="/auth/login" className="mt-6 inline-block font-semibold text-primary-600 hover:underline">
            {tc('back')}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Disha"
      title={t('forgot')}
      subtitle="Enter your email and we'll send you a link to reset your password."
      footer={
        <Link href="/auth/login" className="font-semibold text-primary-600 hover:underline">
          {tc('back')}
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('email')} htmlFor="forgot-email" required>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" size="lg" loading={busy} className="w-full">
          {tc('continue')}
        </Button>
      </form>
    </AuthCard>
  );
}
