'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle } from 'lucide-react';
import { AuthCard } from '@/components/auth/AuthCard';
import { Spinner, buttonVariants } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';

type State = 'verifying' | 'success' | 'error';

function VerifyEmailInner() {
  const tc = useTranslations('common');
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [state, setState] = useState<State>('verifying');
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) {
      setState('error');
      setError('This verification link is missing or invalid.');
      return;
    }

    (async () => {
      try {
        await api.post('/auth/email/verify', { token }, { anonymous: true });
        setState('success');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'We could not verify your email. The link may have expired.');
        setState('error');
      }
    })();
  }, [token]);

  if (state === 'verifying') {
    return (
      <AuthCard>
        <div className="flex flex-col items-center py-4 text-center">
          <Spinner className="h-8 w-8" />
          <p className="mt-4 text-base text-ink-2">Verifying your email…</p>
        </div>
      </AuthCard>
    );
  }

  if (state === 'success') {
    return (
      <AuthCard>
        <div className="text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="font-display text-2xl font-semibold text-primary">Email verified</h1>
          <p className="mt-2 text-base text-ink-2">
            Your email is confirmed. Log in to start your CAP guidance with Disha.
          </p>
          <Link href="/auth/login" className={buttonVariants({ size: 'lg', className: 'mt-6 w-full' })}>
            {tc('login')}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
          <XCircle className="h-7 w-7" />
        </span>
        <h1 className="font-display text-2xl font-semibold text-primary">Verification failed</h1>
        <p className="mt-2 text-base text-ink-2">{error}</p>
        <Link href="/auth/login" className="mt-6 inline-block font-semibold text-primary-600 hover:underline">
          {tc('back')}
        </Link>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthCard title="…">{null}</AuthCard>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
