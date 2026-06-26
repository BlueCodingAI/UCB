'use client';

import { useState } from 'react';
import { Calendar, Video, Phone, MapPin, MessageSquare, ExternalLink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocale } from 'next-intl';
import { Card, Badge, Button, useToast } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { api, ApiError } from '@/lib/api';
import type { CounsellingAppointment, Locale } from '@/lib/types';
import { statusTone, statusLabel } from './StatusTimeline';

const MODE_META: Record<string, { icon: LucideIcon; label: string }> = {
  call: { icon: Phone, label: 'Phone call' },
  video: { icon: Video, label: 'Video call' },
  chat: { icon: MessageSquare, label: 'Chat' },
  in_person: { icon: MapPin, label: 'In person' },
};

function modeMeta(mode: string) {
  return MODE_META[mode] ?? { icon: Calendar, label: mode };
}

/** A scheduled counselling appointment, with an optional cancel action. */
export function AppointmentCard({
  appointment,
  onCancelled,
}: {
  appointment: CounsellingAppointment;
  onCancelled?: (next: CounsellingAppointment) => void;
}) {
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);

  const meta = modeMeta(appointment.mode);
  const Icon = meta.icon;
  const isActive = appointment.status !== 'cancelled' && appointment.status !== 'completed';
  const upcoming = appointment.scheduledStart > Date.now();

  async function cancel() {
    if (!confirm('Cancel this appointment? You can request a new slot afterwards.')) return;
    setCancelling(true);
    try {
      const next = await api.post<CounsellingAppointment>(`/counselling/appointments/${appointment.id}/cancel`, {});
      toast('Appointment cancelled', 'success');
      onCancelled?.(next);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not cancel the appointment.';
      toast(msg, 'error');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-4 p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-ink">{meta.label}</p>
            <Badge tone={statusTone(appointment.status)}>{statusLabel(appointment.status)}</Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-2">
            <Calendar className="h-4 w-4 text-ink-3" />
            {formatDateTime(appointment.scheduledStart, locale)}
            {appointment.scheduledEnd && (
              <span className="text-ink-3">
                {' – '}
                {new Intl.DateTimeFormat(locale === 'en' ? 'en-IN' : `${locale}-IN`, {
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(appointment.scheduledEnd))}
              </span>
            )}
          </p>
          {appointment.location && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-2">
              <MapPin className="h-4 w-4 text-ink-3" />
              {appointment.location}
            </p>
          )}
          {appointment.meetingLink && isActive && (
            <a
              href={appointment.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-sm border border-primary-600/30 bg-primary-600/5 px-4 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-600/10"
            >
              <Video className="h-4 w-4" />
              Join meeting
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
      {isActive && upcoming && (
        <div className="flex justify-end border-t border-border bg-surface-sunk/40 px-5 py-3">
          <Button variant="danger" size="sm" loading={cancelling} onClick={cancel}>
            Cancel appointment
          </Button>
        </div>
      )}
    </Card>
  );
}
