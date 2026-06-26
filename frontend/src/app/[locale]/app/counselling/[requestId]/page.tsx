'use client';

import { use, useEffect, useState } from 'react';
import {
  ArrowLeft,
  UserRound,
  StickyNote,
  CalendarPlus,
  MessageCircle,
  Users,
  MapPin,
  HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocale } from 'next-intl';
import { PageHeading } from '@/components/common/PageHeading';
import { Card, CardBody, CardHeader, CardTitle, Badge, Skeleton, EmptyState, Avatar } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { LOCALE_NAMES } from '@/lib/constants';
import type { CounsellingAppointment, CounsellingRequest, Locale } from '@/lib/types';
import { StatusTimeline, statusTone, statusLabel } from '@/components/counselling/StatusTimeline';
import { AppointmentCard } from '@/components/counselling/AppointmentCard';
import { SlotPicker } from '@/components/counselling/SlotPicker';

interface CounsellingNote {
  id: string;
  body: string;
  authorName?: string | null;
  createdAt: number;
}

interface CounsellingRequestDetail extends CounsellingRequest {
  counsellorName?: string | null;
  appointment?: CounsellingAppointment | null;
  notes?: CounsellingNote[];
}

const TYPE_META: Record<CounsellingRequest['type'], { icon: LucideIcon; label: string }> = {
  assist: { icon: MessageCircle, label: 'Counselling assist' },
  one_to_one: { icon: Users, label: 'One-to-one session' },
  in_person: { icon: MapPin, label: 'In-person meeting' },
  general_query: { icon: HelpCircle, label: 'General query' },
};

const BOOKABLE = new Set(['assigned', 'scheduled', 'in_review']);

export default function CounsellingRequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = use(params);
  const locale = useLocale() as Locale;

  const [data, setData] = useState<CounsellingRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const detail = await api.get<CounsellingRequestDetail>(`/counselling/requests/${requestId}`);
      setData(detail);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this request.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <EmptyState
          title="Request not found"
          description={error ?? 'This counselling request may have been removed.'}
          action={
            <Link href="/app/counselling" className="text-sm font-semibold text-primary-600 hover:underline">
              Back to counselling
            </Link>
          }
        />
      </div>
    );
  }

  const meta = TYPE_META[data.type] ?? TYPE_META.general_query;
  const TypeIcon = meta.icon;
  const appointment = data.appointment ?? null;
  const hasActiveAppointment = !!appointment && appointment.status !== 'cancelled';
  const canBook = !hasActiveAppointment && BOOKABLE.has(data.status);

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink />

      <PageHeading
        eyebrow={meta.label}
        title={data.topic || meta.label}
        actions={<Badge tone={statusTone(data.status)}>{statusLabel(data.status)}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Left column: request detail + appointment / slot picker + notes */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TypeIcon className="h-5 w-5 text-primary-600" />
                Your request
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-4 pt-4">
              {data.message && <p className="whitespace-pre-wrap text-sm text-ink-2">{data.message}</p>}
              <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
                <div>
                  <dt className="text-ink-3">Preferred language</dt>
                  <dd className="font-medium text-ink">{LOCALE_NAMES[data.preferredLanguage]}</dd>
                </div>
                {data.preferredMode && (
                  <div>
                    <dt className="text-ink-3">Preferred mode</dt>
                    <dd className="font-medium capitalize text-ink">{data.preferredMode.replace('_', ' ')}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-ink-3">Raised</dt>
                  <dd className="font-medium text-ink">{formatDateTime(data.createdAt, locale)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {hasActiveAppointment && appointment && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">Your appointment</h2>
              <AppointmentCard
                appointment={appointment}
                onCancelled={(next) => setData((prev) => (prev ? { ...prev, appointment: next } : prev))}
              />
            </div>
          )}

          {canBook && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarPlus className="h-5 w-5 text-primary-600" />
                  Book a session
                </CardTitle>
              </CardHeader>
              <CardBody className="pt-4">
                <SlotPicker requestId={requestId} onBooked={load} />
              </CardBody>
            </Card>
          )}

          {data.notes && data.notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <StickyNote className="h-5 w-5 text-primary-600" />
                  Notes from your counsellor
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-4 pt-4">
                {data.notes.map((note) => (
                  <div key={note.id} className="rounded-md border border-border bg-surface-sunk/40 p-4">
                    <p className="whitespace-pre-wrap text-sm text-ink-2">{note.body}</p>
                    <p className="mt-2 text-xs text-ink-3">
                      {note.authorName ? `${note.authorName} · ` : ''}
                      {formatDateTime(note.createdAt, locale)}
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right column: status timeline + counsellor */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardBody className="pt-4">
              <StatusTimeline currentStatus={data.status} createdAt={data.createdAt} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-5 w-5 text-primary-600" />
                Counsellor
              </CardTitle>
            </CardHeader>
            <CardBody className="pt-4">
              {data.counsellorName ? (
                <div className="flex items-center gap-3">
                  <Avatar name={data.counsellorName} />
                  <div>
                    <p className="text-sm font-semibold text-ink">{data.counsellorName}</p>
                    <p className="text-xs text-ink-3">Assigned to your request</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-3">
                  Not assigned yet — we&apos;ll let you know as soon as a counsellor picks up your request.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/app/counselling"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-primary-600"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to counselling
    </Link>
  );
}
