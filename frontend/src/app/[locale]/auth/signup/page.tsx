'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button, buttonVariants, Field, Input, Select } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { LOCALE_NAMES, LOCALES } from '@/lib/constants';
import type { Locale } from '@/lib/types';

export default function SignupPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [language, setLanguage] = useState<Locale>(locale);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post(
        '/auth/register',
        {
          fullName: name.trim(),
          email: email.trim(),
          password,
          mobile: mobile.trim() || undefined,
          preferredLanguage: language,
        },
        { anonymous: true },
      );
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard>
        <div className="text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="font-display text-2xl font-semibold text-primary">Check your inbox</h1>
          <p className="mt-2 text-base text-ink-2">
            We sent a verification link to <span className="font-medium text-ink">{email}</span>. Open it to activate
            your account, then log in to start your CAP guidance.
          </p>
          <Link href="/auth/login" className={buttonVariants({ size: 'lg', className: 'mt-6 w-full' })}>
            {tc('login')}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Disha"
      title={t('signupTitle')}
      subtitle={t('signupSubtitle')}
      footer={
        <>
          {t('haveAccount')}{' '}
          <Link href="/auth/login" className="font-semibold text-primary-600 hover:underline">
            {tc('login')}
          </Link>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-4 rounded-sm border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('name')} htmlFor="signup-name" required>
          <Input
            id="signup-name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label={t('email')} htmlFor="signup-email" required>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label={t('mobile')} htmlFor="signup-mobile" hint="Optional — used for OTP login and reminders.">
          <Input
            id="signup-mobile"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="9876543210"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </Field>
        <Field label={t('password')} htmlFor="signup-password" hint="At least 8 characters." required>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Preferred language" htmlFor="signup-language" required>
          <Select
            id="signup-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Locale)}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" size="lg" loading={busy} className="w-full">
          {tc('signup')}
        </Button>
      </form>
    </AuthCard>
  );
}
