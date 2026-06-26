'use client';

import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { PlanCode } from '@/lib/types';

const TONE: Record<PlanCode, BadgeTone> = {
  freemium: 'neutral',
  premium: 'accent',
  super_premium: 'primary',
};

export function PlanBadge({ plan }: { plan: PlanCode }) {
  const t = useTranslations('plan');
  return <Badge tone={TONE[plan]}>{t(plan)}</Badge>;
}
