'use client';

import { useEffect, useState } from 'react';
import { Tag, Save, RotateCcw, Sparkles } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import {
  Card,
  CardBody,
  Field,
  Input,
  Switch,
  Button,
  Badge,
  Skeleton,
  EmptyState,
  useToast,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatPaise } from '@/lib/format';
import type { Plan, PlanFeatures } from '@/lib/types';

/** Editable per-plan draft kept in component state. */
interface PlanDraft {
  name: string;
  description: string;
  /** Rupees as a string for the ₹ input; converted to paise on save. */
  priceRupees: string;
  validityDays: string;
  /** yyyy-mm-dd for the date input; converted to epoch ms on save. */
  cutoffDate: string;
  dailyChatLimit: string;
  features: PlanFeatures;
  isActive: boolean;
}

const FEATURE_LABELS: { key: keyof PlanFeatures; label: string; hint: string }[] = [
  { key: 'profileMemory', label: 'Profile memory', hint: 'Remembers CAP profile across chats' },
  { key: 'nextSteps', label: 'Next steps', hint: 'Personalised journey recommendations' },
  { key: 'counsellingAssist', label: 'Counselling assist', hint: 'Submit guidance requests' },
  { key: 'oneToOne', label: 'One-to-one', hint: 'Book a 1:1 video session' },
  { key: 'inPerson', label: 'In-person', hint: 'Book an in-person appointment' },
  { key: 'voice', label: 'Voice bot', hint: 'Ask by voice in any language' },
];

function toDraft(plan: Plan): PlanDraft {
  return {
    name: plan.name,
    description: plan.description ?? '',
    priceRupees: String(plan.pricePaise / 100),
    validityDays: String(plan.validityDays),
    cutoffDate: plan.cutoffDate ? new Date(plan.cutoffDate).toISOString().slice(0, 10) : '',
    dailyChatLimit: plan.dailyChatLimit == null ? '' : String(plan.dailyChatLimit),
    features: { ...plan.features },
    isActive: plan.isActive,
  };
}

export default function AdminPlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await api.get<{ plans: Plan[] }>('/admin/plans', { realm: 'admin' });
      const list = data.plans ?? (data as unknown as Plan[]);
      setPlans(list);
      setDrafts(Object.fromEntries(list.map((p) => [p.code, toDraft(p)])));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load plans.');
      setPlans([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function update(code: string, patch: Partial<PlanDraft>) {
    setDrafts((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  }

  function reset(plan: Plan) {
    setDrafts((prev) => ({ ...prev, [plan.code]: toDraft(plan) }));
  }

  async function save(plan: Plan) {
    const d = drafts[plan.code];
    if (!d) return;
    const priceNum = Number(d.priceRupees);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast('Enter a valid price in rupees.', 'error');
      return;
    }
    setSaving(plan.code);
    try {
      const payload = {
        name: d.name.trim(),
        description: d.description.trim() || null,
        pricePaise: Math.round(priceNum * 100),
        validityDays: Number(d.validityDays) || 0,
        cutoffDate: d.cutoffDate ? new Date(`${d.cutoffDate}T00:00:00Z`).getTime() : null,
        dailyChatLimit: d.dailyChatLimit.trim() === '' ? null : Number(d.dailyChatLimit),
        features: d.features,
        isActive: d.isActive,
      };
      const updated = await api.put<Plan>(`/admin/plans/${plan.code}`, payload, { realm: 'admin' });
      const merged = updated?.code ? updated : { ...plan, ...payload };
      setPlans((prev) => prev?.map((p) => (p.code === plan.code ? (merged as Plan) : p)) ?? null);
      setDrafts((prev) => ({ ...prev, [plan.code]: toDraft(merged as Plan) }));
      toast(`${merged.name ?? plan.name} saved.`, 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Save failed.', 'error');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="animate-fade-up">
      <AdminPageHeader
        title="Plans & pricing"
        description="Edit pricing, validity, daily limits and feature access for each plan. Prices are stored in paise."
      />

      {plans === null ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[34rem] w-full rounded-lg" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No plans found"
          description={error ?? 'There are no plans configured yet.'}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const d = drafts[plan.code];
            if (!d) return null;
            const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(plan));
            return (
              <Card key={plan.code} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-surface-sunk/60 px-6 py-4">
                  <div>
                    <p className="eyebrow text-ink-3">{plan.code}</p>
                    <p className="mt-0.5 text-lg font-semibold text-primary">{d.name || plan.code}</p>
                  </div>
                  {d.isActive ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Hidden</Badge>
                  )}
                </div>

                <CardBody className="space-y-5">
                  <Field label="Display name" htmlFor={`name-${plan.code}`}>
                    <Input
                      id={`name-${plan.code}`}
                      value={d.name}
                      onChange={(e) => update(plan.code, { name: e.target.value })}
                    />
                  </Field>

                  <Field label="Description" htmlFor={`desc-${plan.code}`}>
                    <Input
                      id={`desc-${plan.code}`}
                      value={d.description}
                      placeholder="Short tagline shown on pricing"
                      onChange={(e) => update(plan.code, { description: e.target.value })}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field
                      label="Price (₹)"
                      htmlFor={`price-${plan.code}`}
                      hint={`= ${formatPaise(Math.round((Number(d.priceRupees) || 0) * 100))}`}
                    >
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
                          ₹
                        </span>
                        <Input
                          id={`price-${plan.code}`}
                          type="number"
                          min={0}
                          step="1"
                          className="pl-7"
                          value={d.priceRupees}
                          onChange={(e) => update(plan.code, { priceRupees: e.target.value })}
                        />
                      </div>
                    </Field>

                    <Field label="Validity (days)" htmlFor={`valid-${plan.code}`}>
                      <Input
                        id={`valid-${plan.code}`}
                        type="number"
                        min={0}
                        value={d.validityDays}
                        onChange={(e) => update(plan.code, { validityDays: e.target.value })}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Cutoff date" htmlFor={`cutoff-${plan.code}`} hint="Validity never exceeds this">
                      <Input
                        id={`cutoff-${plan.code}`}
                        type="date"
                        value={d.cutoffDate}
                        onChange={(e) => update(plan.code, { cutoffDate: e.target.value })}
                      />
                    </Field>

                    <Field label="Daily chat limit" htmlFor={`limit-${plan.code}`} hint="Blank = unlimited">
                      <Input
                        id={`limit-${plan.code}`}
                        type="number"
                        min={0}
                        placeholder="∞"
                        value={d.dailyChatLimit}
                        onChange={(e) => update(plan.code, { dailyChatLimit: e.target.value })}
                      />
                    </Field>
                  </div>

                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-2">
                      <Sparkles className="h-4 w-4 text-accent" /> Features
                    </p>
                    <div className="divide-y divide-border rounded-md border border-border">
                      {FEATURE_LABELS.map((f) => (
                        <div key={f.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">{f.label}</p>
                            <p className="truncate text-xs text-ink-3">{f.hint}</p>
                          </div>
                          <Switch
                            checked={d.features[f.key]}
                            label={f.label}
                            onChange={(v) =>
                              update(plan.code, { features: { ...d.features, [f.key]: v } })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-ink">Plan is active</p>
                      <p className="text-xs text-ink-3">Hidden plans are not offered to users</p>
                    </div>
                    <Switch
                      checked={d.isActive}
                      label="Plan active"
                      onChange={(v) => update(plan.code, { isActive: v })}
                    />
                  </div>
                </CardBody>

                <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => reset(plan)}
                    disabled={!dirty || saving === plan.code}
                  >
                    <RotateCcw className="h-4 w-4" /> Reset
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={saving === plan.code}
                    disabled={!dirty}
                    onClick={() => void save(plan)}
                  >
                    <Save className="h-4 w-4" /> Save changes
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
