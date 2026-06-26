'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Card, CardBody } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui';
import { useAuth } from '@/components/providers/AuthProvider';
import { cn } from '@/lib/utils';

type Status = 'verifying' | 'success' | 'failure';

function Callback() {
  const params = useSearchParams();
  const { refreshUser } = useAuth();
  const initial = (params.get('status') as Status | null) ?? 'verifying';
  const [status, setStatus] = useState<Status>(initial);

  useEffect(() => {
    if (initial === 'verifying') {
      // Give the webhook/verify a moment, then refresh the user's plan.
      const id = setTimeout(() => {
        void refreshUser();
        setStatus('success');
      }, 1800);
      return () => clearTimeout(id);
    }
    if (initial === 'success') void refreshUser();
    return undefined;
  }, [initial, refreshUser]);

  const VIEW: Record<Status, { icon: typeof CheckCircle2; title: string; body: string; spin?: boolean }> = {
    verifying: {
      icon: Loader2,
      title: 'Verifying your payment',
      body: 'Hang tight — we are confirming your payment. This usually takes a few seconds.',
      spin: true,
    },
    success: {
      icon: CheckCircle2,
      title: 'Payment successful',
      body: 'Your plan is now active. Enjoy personalised guidance for your CAP journey.',
    },
    failure: {
      icon: XCircle,
      title: 'Payment could not be completed',
      body: 'No money was deducted, or it will be refunded automatically. You can try again anytime.',
    },
  };

  const v = VIEW[status];
  const Icon = v.icon;

  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        <CardBody className="flex flex-col items-center text-center">
          <span
            className={cn(
              'mb-4 flex h-16 w-16 items-center justify-center rounded-full',
              status === 'success' && 'bg-success/12 text-primary-700',
              status === 'failure' && 'bg-danger/10 text-danger',
              status === 'verifying' && 'bg-surface-sunk text-primary-600',
            )}
          >
            <Icon className={cn('h-8 w-8', v.spin && 'animate-spin')} />
          </span>
          <h1 className="text-xl font-bold text-primary">{v.title}</h1>
          <p className="mt-2 text-sm text-ink-2">{v.body}</p>

          {status !== 'verifying' && (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {status === 'success' ? (
                <>
                  <Link href="/app" className={buttonVariants({ variant: 'primary' })}>
                    Go to dashboard
                  </Link>
                  <Link href="/app/billing" className={buttonVariants({ variant: 'secondary' })}>
                    View billing
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/app/billing/upgrade" className={buttonVariants({ variant: 'primary' })}>
                    Try again
                  </Link>
                  <Link href="/app/billing" className={buttonVariants({ variant: 'secondary' })}>
                    Back to billing
                  </Link>
                </>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-ink-3">Loading…</div>}>
      <Callback />
    </Suspense>
  );
}
