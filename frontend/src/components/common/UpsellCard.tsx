'use client';

import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/Card';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/** Premium-gating upsell shown to freemium users on locked features. */
export function UpsellCard({ title, body, className }: { title?: string; body?: string; className?: string }) {
  const t = useTranslations('plan');
  const tc = useTranslations('common');
  return (
    <Card className={cn('relative overflow-hidden p-6 ring-1 ring-accent/10', className)}>
      <div className="glow-brand absolute -right-10 -top-12 -z-0 h-36 w-36 opacity-60 blur-2xl" aria-hidden />
      <div className="relative flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/15">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-primary">{title ?? t('upsellTitle')}</h3>
          <p className="mt-1 text-sm text-ink-2">{body ?? t('upsellBody')}</p>
          <Link href="/app/billing/upgrade" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'mt-4')}>
            {tc('upgrade')}
          </Link>
        </div>
      </div>
    </Card>
  );
}
