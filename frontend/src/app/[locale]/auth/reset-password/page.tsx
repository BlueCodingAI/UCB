'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button, buttonVariants, Field, Input } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';

function ResetInner() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/password/reset', { token, newPassword }, { anonymous: true });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password. The link may have expired.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title={t('resetTitle')} subtitle="This reset link is missing or invalid.">
        <Link href="/auth/forgot-password" className="font-semibold text-primary-600 hover:underline">
          {t('forgot')}
        </Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard>
        <div className="text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="font-display text-2xl font-semibold text-primary">Password updated</h1>
          <p className="mt-2 text-base text-ink-2">
            Your password has been reset. You can now log in with your new password.
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
      title={t('resetTitle')}
      subtitle="Choose a new password for your account."
      footer={
        <Link href="/auth/login" className="font-semibold text-primary-600 hover:underline">
          {tc('back')}
        </Link>
      }
    >
      {error && (
        <div role="alert" className="mb-4 rounded-sm border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('newPassword')} htmlFor="reset-password" hint="At least 8 characters." required>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Confirm new password" htmlFor="reset-confirm" required>
          <Input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" size="lg" loading={busy} className="w-full">
          {tc('submit')}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthCard title="…">{null}</AuthCard>}>
      <ResetInner />
    </Suspense>
  );
}
