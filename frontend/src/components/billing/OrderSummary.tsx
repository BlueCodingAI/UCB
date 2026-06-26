'use client';

import { Check } from 'lucide-react';
import { Card, CardBody } from '@/components/ui';
import { formatPaise, formatDate } from '@/lib/format';
import type { Locale, Plan } from '@/lib/types';

export function OrderSummary({ plan, locale }: { plan: Plan; locale: Locale }) {
  const feats = featureList(plan);
  return (
    <Card>
      <CardBody>
        <p className="font-mono text-[0.66rem] uppercase tracking-wider text-ink-3">Order summary</p>
        <div className="mt-3 flex items-baseline justify-between">
          <h3 className="text-lg font-semibold text-primary">{plan.name}</h3>
          <p className="text-2xl font-bold text-ink">{formatPaise(plan.pricePaise)}</p>
        </div>

        {feats.length > 0 && (
          <ul className="mt-4 space-y-2">
            {feats.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-ink-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                {f}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-sm">
          <div className="flex justify-between text-ink-2">
            <span>Validity</span>
            <span className="font-medium text-ink">{plan.validityDays} days</span>
          </div>
          {plan.cutoffDate && (
            <div className="flex justify-between text-ink-2">
              <span>Valid until cut-off</span>
              <span className="font-medium text-ink">{formatDate(plan.cutoffDate, locale)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-border pt-3 text-base font-semibold text-ink">
            <span>Total</span>
            <span>{formatPaise(plan.pricePaise)}</span>
          </div>
        </div>

        <p className="mt-3 text-xs text-ink-3">
          Taxes, if applicable, are included. Validity is capped at the admission cut-off date.
        </p>
      </CardBody>
    </Card>
  );
}

function featureList(plan: Plan): string[] {
  const f = plan.features;
  const out: string[] = [];
  if (f.nextSteps) out.push('Personalised next steps for your CAP journey');
  if (f.profileMemory) out.push('Saved profile and memory for tailored answers');
  if (f.counsellingAssist) out.push('Counselling assistance');
  if (f.oneToOne) out.push('One-to-one counselling sessions');
  if (f.inPerson) out.push('In-person counselling');
  if (f.voice) out.push('Voice bot in English, Hindi and Marathi');
  if (plan.dailyChatLimit === null) out.push('Unlimited daily questions');
  else out.push(`Up to ${plan.dailyChatLimit} questions per day`);
  return out;
}
