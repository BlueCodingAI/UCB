'use client';

import { useEffect, useState } from 'react';
import {
  CalendarClock,
  Plus,
  Video,
  MapPin,
  Phone,
  Trash2,
  CalendarDays,
} from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import {
  Card,
  CardBody,
  CardTitle,
  Field,
  Input,
  Select,
  Button,
  Badge,
  Skeleton,
  EmptyState,
  useToast,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';

interface Appt {
  id: string;
  requestId: string | null;
  mode: string;
  scheduledStart: number;
  scheduledEnd: number | null;
  location: string | null;
  meetingLink: string | null;
  status: string;
  counsellorName?: string | null;
  userName?: string | null;
}
interface Slot {
  id: string;
  mode: string;
  startAt: number;
  endAt: number | null;
  location: string | null;
  meetingLink: string | null;
  capacity: number | null;
  bookedCount?: number | null;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  scheduled: 'primary',
  confirmed: 'primary',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
};
const label = (v: string) => v.replace(/_/g, ' ');

function ModeIcon({ mode, className }: { mode: string; className?: string }) {
  if (mode.includes('person')) return <MapPin className={className} />;
  if (mode.includes('phone')) return <Phone className={className} />;
  return <Video className={className} />;
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export default function AdminAppointmentsPage() {
  const { toast } = useToast();
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [counsellor, setCounsellor] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  // add-slot form
  const [mode, setMode] = useState('one_to_one');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [location, setLocation] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [savingSlot, setSavingSlot] = useState(false);

  async function loadAppts() {
    setError(null);
    try {
      const res = await api.get<{ appointments: Appt[] } | Appt[]>('/admin/counselling/appointments', {
        realm: 'admin',
        query: {
          'filter[status]': status || undefined,
          'filter[counsellor]': counsellor || undefined,
        },
      });
      setAppts(Array.isArray(res) ? res : res.appointments ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load appointments.');
      setAppts([]);
    }
  }

  async function loadSlots() {
    try {
      const res = await api.get<{ slots: Slot[] } | Slot[]>('/admin/counselling/slots', { realm: 'admin' });
      setSlots(Array.isArray(res) ? res : res.slots ?? []);
    } catch {
      setSlots([]);
    }
  }

  useEffect(() => {
    void loadAppts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, counsellor]);

  useEffect(() => {
    void loadSlots();
  }, []);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!startAt) {
      toast('Set a start time for the slot.', 'error');
      return;
    }
    setSavingSlot(true);
    try {
      await api.post(
        '/admin/counselling/slots',
        {
          mode,
          startAt: new Date(startAt).getTime(),
          endAt: endAt ? new Date(endAt).getTime() : null,
          location: location.trim() || null,
          meetingLink: meetingLink.trim() || null,
          capacity: capacity.trim() === '' ? null : Number(capacity),
        },
        { realm: 'admin' },
      );
      toast('Slot added.', 'success');
      setStartAt('');
      setEndAt('');
      setLocation('');
      setMeetingLink('');
      void loadSlots();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not add slot.', 'error');
    } finally {
      setSavingSlot(false);
    }
  }

  async function deleteSlot(id: string) {
    try {
      await api.del(`/admin/counselling/slots/${id}`, { realm: 'admin' });
      setSlots((prev) => prev?.filter((s) => s.id !== id) ?? null);
      toast('Slot removed.', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not remove slot.', 'error');
    }
  }

  // group appointments by date
  const grouped = (appts ?? []).reduce<Record<string, Appt[]>>((acc, a) => {
    const k = dayKey(a.scheduledStart);
    (acc[k] ??= []).push(a);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort();

  return (
    <div className="animate-fade-up">
      <AdminPageHeader
        title="Appointments & slots"
        description="See scheduled counselling sessions grouped by day, and publish availability slots users can book."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
        {/* Appointments grouped by date */}
        <div className="space-y-5">
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-44">
                <label className="mb-1 block text-xs font-medium text-ink-2">Status</label>
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No show</option>
                </Select>
              </div>
              <div className="flex-1 min-w-[10rem]">
                <label className="mb-1 block text-xs font-medium text-ink-2">Counsellor</label>
                <Input
                  value={counsellor}
                  placeholder="Filter by counsellor"
                  onChange={(e) => setCounsellor(e.target.value)}
                />
              </div>
            </div>
          </Card>

          {appts === null ? (
            <Skeleton className="h-72 w-full rounded-lg" />
          ) : days.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No appointments"
              description={error ?? 'No counselling appointments match these filters.'}
            />
          ) : (
            days.map((d) => (
              <div key={d}>
                <div className="mb-2 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary-600" />
                  <h2 className="text-sm font-semibold text-primary">{formatDate(new Date(`${d}T00:00:00Z`).getTime())}</h2>
                  <span className="text-xs text-ink-3">
                    {grouped[d].length} session{grouped[d].length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  {grouped[d]
                    .sort((a, b) => a.scheduledStart - b.scheduledStart)
                    .map((a) => (
                      <Card key={a.id} className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-sunk text-primary-600">
                              <ModeIcon mode={a.mode} className="h-5 w-5" />
                            </span>
                            <div>
                              <p className="font-medium text-ink">
                                {formatDateTime(a.scheduledStart)}
                                {a.scheduledEnd ? ` – ${new Date(a.scheduledEnd).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                              </p>
                              <p className="text-xs capitalize text-ink-3">
                                {label(a.mode)}
                                {a.userName ? ` · ${a.userName}` : ''}
                                {a.counsellorName ? ` · ${a.counsellorName}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {a.meetingLink && (
                              <a
                                href={a.meetingLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-primary-600 hover:underline"
                              >
                                Join link
                              </a>
                            )}
                            <Badge tone={STATUS_TONE[a.status] ?? 'neutral'} className="capitalize">
                              {label(a.status)}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Slots management */}
        <div className="space-y-5 lg:sticky lg:top-20">
          <Card>
            <CardBody>
              <CardTitle className="mb-3 flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-accent" /> Add availability slot
              </CardTitle>
              <form onSubmit={addSlot} className="space-y-3">
                <Field label="Mode" htmlFor="slot-mode">
                  <Select id="slot-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="one_to_one">One-to-one (video)</option>
                    <option value="in_person">In-person</option>
                    <option value="phone">Phone</option>
                  </Select>
                </Field>
                <Field label="Starts at" htmlFor="slot-start" required>
                  <Input
                    id="slot-start"
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                  />
                </Field>
                <Field label="Ends at" htmlFor="slot-end">
                  <Input id="slot-end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </Field>
                <Field label="Location" htmlFor="slot-loc" hint="For in-person slots">
                  <Input id="slot-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
                </Field>
                <Field label="Meeting link" htmlFor="slot-link" hint="For video slots">
                  <Input id="slot-link" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} />
                </Field>
                <Field label="Capacity" htmlFor="slot-cap" hint="How many can book this slot">
                  <Input
                    id="slot-cap"
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="primary" className="w-full" loading={savingSlot}>
                  Add slot
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CardTitle className="mb-3 text-base">Open slots</CardTitle>
              {slots === null ? (
                <Skeleton className="h-24 w-full rounded-md" />
              ) : slots.length === 0 ? (
                <p className="text-sm text-ink-3">No open slots. Add one above.</p>
              ) : (
                <div className="space-y-2">
                  {slots
                    .slice()
                    .sort((a, b) => a.startAt - b.startAt)
                    .map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
                      >
                        <div className="flex items-center gap-2.5">
                          <ModeIcon mode={s.mode} className="h-4 w-4 text-primary-600" />
                          <div>
                            <p className="text-sm font-medium text-ink">{formatDateTime(s.startAt)}</p>
                            <p className="text-xs capitalize text-ink-3">
                              {label(s.mode)}
                              {s.capacity != null ? ` · ${s.bookedCount ?? 0}/${s.capacity} booked` : ''}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => void deleteSlot(s.id)}
                          aria-label="Delete slot"
                          className="rounded-sm p-1.5 text-ink-3 hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
