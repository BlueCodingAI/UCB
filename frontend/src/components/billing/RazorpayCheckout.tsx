'use client';

import { useState } from 'react';
import { Button, useToast } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { RAZORPAY_KEY_ID } from '@/lib/constants';
import type { Plan } from '@/lib/types';

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface OrderResponse {
  orderId: string;
  amountPaise: number;
  currency?: string;
  keyId: string | null;
  mock?: boolean;
}

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (resp: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, cb: (resp: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function RazorpayCheckout({ plan }: { plan: Plan }) {
  const { toast } = useToast();
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);

  async function verifyAndFinish(payload: Record<string, string>) {
    await api.post('/payments/verify', payload);
    await refreshUser();
    toast('Payment successful — your plan is now active.', 'success');
    router.push(`/app/billing/payment/callback?status=success&plan=${plan.code}`);
  }

  async function pay() {
    if (busy) return;
    setBusy(true);
    try {
      const order = await api.post<OrderResponse>('/payments/order', { planCode: plan.code });

      const scriptReady = await loadScript();
      const key = order.keyId ?? RAZORPAY_KEY_ID;

      // Mock / disabled path: simulate a captured payment via verify.
      if (order.mock || !key || !scriptReady || !window.Razorpay) {
        await verifyAndFinish({
          razorpayOrderId: order.orderId,
          razorpayPaymentId: `pay_mock_${Date.now()}`,
          razorpaySignature: 'mock_signature',
        });
        return;
      }

      const rzp = new window.Razorpay({
        key,
        amount: order.amountPaise,
        currency: order.currency ?? 'INR',
        name: 'Disha',
        description: `${plan.name} plan`,
        order_id: order.orderId,
        prefill: {
          name: user?.fullName ?? undefined,
          email: user?.email ?? undefined,
          contact: user?.mobile ?? undefined,
        },
        theme: { color: '#143C46' },
        handler: (resp) => {
          void (async () => {
            try {
              await verifyAndFinish({
                razorpayOrderId: resp.razorpay_order_id,
                razorpayPaymentId: resp.razorpay_payment_id,
                razorpaySignature: resp.razorpay_signature,
              });
            } catch (err) {
              const msg = err instanceof ApiError ? err.message : 'We could not verify your payment.';
              toast(msg, 'error');
              router.push('/app/billing/payment/callback?status=failure');
            } finally {
              setBusy(false);
            }
          })();
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });
      rzp.open();
      return; // keep busy until handler/dismiss resolves
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not start the payment. Please try again.';
      toast(msg, 'error');
      setBusy(false);
    }
  }

  return (
    <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={pay}>
      Pay securely
    </Button>
  );
}
