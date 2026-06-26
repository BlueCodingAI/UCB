'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, Phone } from 'lucide-react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button, Field, Input, Tabs, useToast } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import type { Session } from '@/lib/types';

type Mode = 'password' | 'otp';

export default function LoginPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const { setSession } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>('password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // password mode
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // otp mode
  const [identifier, setIdentifier] = useState('');

  function isEmail(v: string) {
    return v.includes('@');
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await api.post<Session>('/auth/login', { email: email.trim(), password }, { anonymous: true });
      setSession(session);
      router.replace('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const value = identifier.trim();
    const channel = isEmail(value) ? 'email' : 'sms';
    try {
      const res = await api.post<{ otpId: string }>(
        '/auth/otp/request',
        channel === 'email' ? { email: value, channel } : { mobile: value, channel },
        { anonymous: true },
      );
      toast(t('sendOtp'), 'success');
      router.push(`/auth/otp?otpId=${encodeURIComponent(res.otpId)}&to=${encodeURIComponent(value)}&channel=${channel}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      eyebrow="Disha"
      title={t('loginTitle')}
      subtitle={t('loginSubtitle')}
      footer={
        <>
          {t('noAccount')}{' '}
          <Link href="/auth/signup" className="font-semibold text-primary-600 hover:underline">
            {tc('signup')}
          </Link>
        </>
      }
    >
      <div className="mb-6">
        <Tabs
          className="w-full"
          value={mode}
          onChange={(k) => {
            setMode(k as Mode);
            setError(null);
          }}
          items={[
            { key: 'password', label: t('password') },
            { key: 'otp', label: 'OTP' },
          ]}
        />
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-sm border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {mode === 'password' ? (
        <form onSubmit={onPasswordSubmit} className="space-y-4" noValidate>
          <Field label={t('email')} htmlFor="login-email" required>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label={t('password')} htmlFor="login-password" required>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <div className="flex justify-end">
            <Link href="/auth/forgot-password" className="text-sm font-medium text-primary-600 hover:underline">
              {t('forgot')}
            </Link>
          </div>
          <Button type="submit" size="lg" loading={busy} className="w-full">
            {tc('login')}
          </Button>
        </form>
      ) : (
        <form onSubmit={onOtpSubmit} className="space-y-4" noValidate>
          <Field
            label={`${t('email')} / ${t('mobile')}`}
            htmlFor="login-identifier"
            hint="We'll send a one-time code to verify it's you."
            required
          >
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">
                {isEmail(identifier) ? <Mail className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              </span>
              <Input
                id="login-identifier"
                type="text"
                autoComplete="username"
                placeholder="you@example.com or 9876543210"
                className="pl-11"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>
          </Field>
          <Button type="submit" size="lg" loading={busy} className="w-full">
            {t('sendOtp')}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
