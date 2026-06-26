'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { RefreshCw, ListChecks } from 'lucide-react';
import { Button, Card, CardBody, Skeleton, EmptyState, useToast } from '@/components/ui';
import { PageHeading } from '@/components/common/PageHeading';
import { UpsellCard } from '@/components/common/UpsellCard';
import { StageTimeline } from '@/components/journey/StageTimeline';
import { StepChecklist } from '@/components/journey/StepChecklist';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import type { CapStage, Locale, Recommendation } from '@/lib/types';

interface CapProfile {
  currentStage?: CapStage | null;
}

export default function NextStepsPage() {
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const { refreshUser } = useAuth();

  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [stage, setStage] = useState<CapStage | null>(null);
  const [locked, setLocked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.get<Recommendation[]>('/recommendations');
      setRecs(list);
      setLocked(false);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'plan_required' || e.status === 403)) {
        setLocked(true);
        setRecs([]);
      } else {
        setRecs([]);
        toast(e instanceof ApiError ? e.message : 'Could not load your next steps.', 'error');
      }
    }
    try {
      const p = await api.get<CapProfile>('/profile/cap');
      setStage(p.currentStage ?? null);
    } catch {
      /* stage is optional */
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await api.post('/recommendations/refresh', {});
      await load();
      void refreshUser();
      toast('Suggestions refreshed.', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not refresh suggestions.', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function setStatus(id: string, status: Recommendation['status']) {
    // Optimistic update.
    setRecs((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, status } : r)) : prev));
    try {
      await api.post(`/recommendations/steps/${id}/status`, { status });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not update the step.', 'error');
      void load();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Personalised"
        title="Your next steps"
        subtitle="Guidance based on your profile and the current CAP schedule. Always confirm dates on the official portal."
        actions={
          !locked && recs !== null ? (
            <Button variant="secondary" size="sm" loading={refreshing} onClick={refresh}>
              <RefreshCw className="h-4 w-4" /> Refresh suggestions
            </Button>
          ) : undefined
        }
      />

      {locked ? (
        <UpsellCard
          title="Next steps is a premium feature"
          body="Upgrade to get a personalised checklist for each stage of your CAP journey, based on your merit and preferences."
        />
      ) : recs === null ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 w-full rounded-lg lg:col-span-1" />
          <div className="space-y-3 lg:col-span-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        </div>
      ) : recs.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No suggestions yet"
          description="Complete your CAP profile and refresh to generate your personalised steps."
          action={
            <Button variant="primary" size="sm" loading={refreshing} onClick={refresh}>
              Generate suggestions
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardBody>
              <p className="mb-4 font-mono text-[0.66rem] uppercase tracking-wider text-ink-3">Timeline</p>
              <StageTimeline current={stage} recommendations={recs} />
            </CardBody>
          </Card>
          <div className="space-y-3 lg:col-span-2">
            {recs.map((step) => (
              <StepChecklist key={step.id} step={step} locale={locale} onSetStatus={setStatus} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
