'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import { useLocale } from 'next-intl';
import { Button, Skeleton, EmptyState, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/lib/types';
import { cn } from '@/lib/utils';

/** A bookable counselling slot. */
export interface CounsellingSlot {
  id: string;
  mode: string;
  startsAt: number;
  endsAt: number | null;
  counsellorName?: string | null;
  location?: string | null;
  capacity?: number | null;
  booked?: number | null;
}

function timeLabel(ms: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-IN' : `${locale}-IN`, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

/** Loads open slots and lets the user pick one to book against a request. */
export function SlotPicker({
  requestId,
  onBooked,
}: {
  requestId: string;
  onBooked: () => void;
}) {
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [slots, setSlots] = useState<CounsellingSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.get<CounsellingSlot[]>('/counselling/slots');
        if (alive) setSlots(data);
      } catch (err) {
        if (alive) setError(err instanceof ApiError ? err.message : 'Could not load available slots.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Group slots by calendar day.
  const grouped = useMemo(() => {
    if (!slots) return [];
    const map = new Map<string, CounsellingSlot[]>();
    for (const s of [...slots].sort((a, b) => a.startsAt - b.startsAt)) {
      const key = formatDate(s.startsAt, locale);
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [slots, locale]);

  async function book() {
    if (!selected) return;
    setBooking(true);
    try {
      await api.post(`/counselling/requests/${requestId}/book`, { slotId: selected });
      toast('Appointment booked', 'success');
      onBooked();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not book this slot. It may have just filled up.';
      toast(msg, 'error');
      // Refresh slots so a taken slot disappears.
      try {
        setSlots(await api.get<CounsellingSlot[]>('/counselling/slots'));
        setSelected(null);
      } catch {
        /* ignore */
      }
    } finally {
      setBooking(false);
    }
  }

  if (error) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Slots unavailable"
        description={error}
      />
    );
  }

  if (!slots) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-28 rounded-sm" />
          ))}
        </div>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No open slots right now"
        description="Your counsellor will publish times soon. We'll notify you when slots open up."
      />
    );
  }

  return (
    <div className="space-y-5">
      {grouped.map(([day, daySlots]) => (
        <div key={day}>
          <p className="eyebrow mb-2 text-ink-3">{day}</p>
          <div className="flex flex-wrap gap-2">
            {daySlots.map((slot) => {
              const full = slot.capacity != null && slot.booked != null && slot.booked >= slot.capacity;
              const active = selected === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  disabled={full}
                  aria-pressed={active}
                  onClick={() => setSelected(slot.id)}
                  className={cn(
                    'inline-flex min-h-[44px] items-center gap-2 rounded-sm border px-4 py-2 text-sm font-semibold transition',
                    'focus-visible:outline-none focus-visible:shadow-[var(--ring)]',
                    active
                      ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                      : 'border-border bg-surface text-ink hover:border-primary-600 hover:bg-surface-sunk',
                    full && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {active && <Check className="h-4 w-4" />}
                  {timeLabel(slot.startsAt, locale)}
                  {slot.endsAt && <span className="font-normal opacity-80">– {timeLabel(slot.endsAt, locale)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-3">
          {selected ? 'You can reschedule later if plans change.' : 'Pick a time that works for you.'}
        </p>
        <Button variant="primary" size="md" disabled={!selected} loading={booking} onClick={book}>
          Confirm booking
        </Button>
      </div>
    </div>
  );
}
