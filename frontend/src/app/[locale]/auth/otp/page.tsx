'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button, useToast } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Session } from '@/lib/types';

const LENGTH = 6;
const RESEND_SECONDS = 60;

function OtpInner() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const params = useSearchParams();
  const router = useRouter();
  const { setSession } = useAuth();
  const { toast } = useToast();

  const initialOtpId = params.get('otpId') ?? '';
  const to = params.get('to') ?? '';
  const channel = (params.get('channel') as 'sms' | 'email') ?? 'sms';

  const [otpId, setOtpId] = useState(initialOtpId);
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const code = useMemo(() => digits.join(''), [digits]);
  const complete = code.length === LENGTH && digits.every((d) => d !== '');

  function setDigit(index: number, value: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleChange(index: number, raw: string) {
    const value = raw.replace(/\D/g, '');
    if (!value) {
      setDigit(index, '');
      return;
    }
    // Multiple chars (e.g. mobile autofill into one box) → distribute.
    if (value.length > 1) {
      fill(value, index);
      return;
    }
    setDigit(index, value);
    setError(null);
    if (index < LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function fill(value: string, from = 0) {
    const chars = value.slice(0, LENGTH - from).split('');
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => {
        next[from + i] = c;
      });
      return next;
    });
    const lastIndex = Math.min(from + chars.length, LENGTH - 1);
    inputs.current[lastIndex]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      setDigit(index - 1, '');
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '');
    if (text) {
      e.preventDefault();
      fill(text, 0);
      setError(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setError(null);
    setBusy(true);
    try {
      const session = await api.post<Session>('/auth/otp/verify', { otpId, code }, { anonymous: true });
      setSession(session);
      router.replace('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That code did not work. Please try again.');
      setDigits(Array(LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (cooldown > 0 || resending || !to) return;
    setResending(true);
    setError(null);
    try {
      const res = await api.post<{ otpId: string }>(
        '/auth/otp/request',
        channel === 'email' ? { email: to, channel } : { mobile: to, channel },
        { anonymous: true },
      );
      setOtpId(res.otpId);
      setCooldown(RESEND_SECONDS);
      toast(t('resend'), 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend. Please try again.');
    } finally {
      setResending(false);
    }
  }

  if (!otpId) {
    return (
      <AuthCard title={t('otp')} subtitle="This verification link is missing or expired.">
        <Link href="/auth/login" className="font-semibold text-primary-600 hover:underline">
          {tc('back')}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Disha"
      title={t('otp')}
      subtitle={to ? `Enter the 6-digit code we sent to ${to}.` : 'Enter the 6-digit code we sent you.'}
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

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <fieldset>
          <legend className="sr-only">{t('otp')}</legend>
          <div className="flex justify-between gap-2">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                aria-label={`Digit ${i + 1} of ${LENGTH}`}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                onFocus={(e) => e.target.select()}
                className={cn(
                  'h-14 w-full max-w-[3.25rem] rounded-md border bg-surface text-center font-mono text-xl font-semibold text-ink shadow-xs',
                  'transition focus:border-primary-600 focus:outline-none focus:shadow-[var(--ring)]',
                  d ? 'border-primary-600 bg-primary-600/[0.04]' : 'border-border hover:border-border-strong',
                )}
              />
            ))}
          </div>
        </fieldset>

        <Button type="submit" size="lg" loading={busy} disabled={!complete} className="w-full">
          {t('verifyOtp')}
        </Button>
      </form>

      <div className="mt-5 text-center text-sm text-ink-2">
        {cooldown > 0 ? (
          <span>
            {t('resend')} in <span className="font-mono font-medium text-ink">{cooldown}s</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={resending}
            className="font-semibold text-primary-600 hover:underline disabled:opacity-50"
          >
            {t('resend')}
          </button>
        )}
      </div>
    </AuthCard>
  );
}

export default function OtpPage() {
  return (
    <Suspense fallback={<AuthCard title="…">{null}</AuthCard>}>
      <OtpInner />
    </Suspense>
  );
}
