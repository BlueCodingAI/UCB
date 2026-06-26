'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import type { Session } from '@/lib/types';
import { Logo } from '@/components/layout/Logo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';

export default function AdminLoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await api.post<Session>('/admin/auth/login', { email, password }, { realm: 'admin' });
      setSession(session, 'admin');
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-10">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="mb-4" />
          <span className="eyebrow text-ink-3">Control panel</span>
        </div>

        <Card className="p-7 shadow-md sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-600/12 text-primary-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-primary">Admin sign in</h1>
              <p className="text-sm text-ink-3">Staff access only.</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field label="Email" htmlFor="admin-email" required>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@disha.in"
                required
              />
            </Field>
            <Field label="Password" htmlFor="admin-password" required>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="rounded-sm border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
              >
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Sign in
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-ink-3">
          Disha is guidance, not the official CAP portal.
        </p>
      </div>
    </main>
  );
}
