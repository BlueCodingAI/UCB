'use client';

import { use, useEffect, useState } from 'react';
import {
  ArrowLeft,
  User as UserIcon,
  Mail,
  Languages,
  MessageSquare,
  CalendarPlus,
  StickyNote,
  Save,
  Clock,
  Headphones,
} from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import {
  Card,
  CardBody,
  CardTitle,
  Field,
  Input,
  Select,
  Textarea,
  Button,
  Badge,
  Modal,
  Skeleton,
  EmptyState,
  Avatar,
  useToast,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { LOCALE_NAMES } from '@/lib/constants';
import type { Locale } from '@/lib/types';

interface LeadNote {
  id: string;
  body: string;
  authorName?: string | null;
  createdAt: number;
}
interface LeadAppointment {
  id: string;
  mode: string;
  scheduledStart: number;
  scheduledEnd: number | null;
  location: string | null;
  meetingLink: string | null;
  status: string;
}
interface LeadDetail {
  id: string;
  type: string;
  topic: string | null;
  message: string | null;
  preferredLanguage: Locale;
  preferredMode: string | null;
  status: string;
  priority: string;
  assignedTo: string | null;
  resolutionNotes: string | null;
  createdAt: number;
  userName?: string | null;
  userEmail?: string | null;
  user?: { fullName?: string | null; email?: string | null } | null;
  notes?: LeadNote[];
  appointments?: LeadAppointment[];
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
  new: 'accent',
  in_progress: 'primary',
  scheduled: 'primary',
  resolved: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
};
const label = (v: string) => v.replace(/_/g, ' ');

export default function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = use(params);
  const { toast } = useToast();
  const router = useRouter();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // editable lead controls
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [savingLead, setSavingLead] = useState(false);

  // notes
  const [noteBody, setNoteBody] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // appointment modal
  const [apptOpen, setApptOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotId, setSlotId] = useState('');
  const [apptMode, setApptMode] = useState('one_to_one');
  const [apptStart, setApptStart] = useState('');
  const [apptEnd, setApptEnd] = useState('');
  const [apptLocation, setApptLocation] = useState('');
  const [apptLink, setApptLink] = useState('');
  const [savingAppt, setSavingAppt] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await api.get<{ request: LeadDetail } | LeadDetail>(
        `/admin/counselling/requests/${leadId}`,
        { realm: 'admin' },
      );
      const l = (data as { request?: LeadDetail }).request ?? (data as LeadDetail);
      setLead(l);
      setStatus(l.status);
      setPriority(l.priority);
      setAssignedTo(l.assignedTo ?? '');
      setResolutionNotes(l.resolutionNotes ?? '');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this lead.');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function saveLead() {
    setSavingLead(true);
    try {
      await api.patch(
        `/admin/counselling/requests/${leadId}`,
        {
          status,
          priority,
          assignedTo: assignedTo.trim() || null,
          resolutionNotes: resolutionNotes.trim() || null,
        },
        { realm: 'admin' },
      );
      toast('Lead updated.', 'success');
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Update failed.', 'error');
    } finally {
      setSavingLead(false);
    }
  }

  async function addNote() {
    if (!noteBody.trim()) return;
    setAddingNote(true);
    try {
      await api.post(`/admin/counselling/requests/${leadId}/notes`, { body: noteBody.trim() }, { realm: 'admin' });
      setNoteBody('');
      toast('Note added.', 'success');
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not add note.', 'error');
    } finally {
      setAddingNote(false);
    }
  }

  async function openAppt() {
    setApptOpen(true);
    if (slots === null) {
      try {
        const data = await api.get<{ slots: Slot[] } | Slot[]>('/admin/counselling/slots', { realm: 'admin' });
        setSlots(Array.isArray(data) ? data : data.slots ?? []);
      } catch {
        setSlots([]);
      }
    }
  }

  function pickSlot(id: string) {
    setSlotId(id);
    const s = slots?.find((x) => x.id === id);
    if (s) {
      setApptMode(s.mode);
      setApptStart(new Date(s.startAt).toISOString().slice(0, 16));
      setApptEnd(s.endAt ? new Date(s.endAt).toISOString().slice(0, 16) : '');
      setApptLocation(s.location ?? '');
      setApptLink(s.meetingLink ?? '');
    }
  }

  async function createAppt() {
    if (!slotId && !apptStart) {
      toast('Pick a slot or set a start time.', 'error');
      return;
    }
    setSavingAppt(true);
    try {
      await api.post(
        `/admin/counselling/requests/${leadId}/book`,
        slotId
          ? { slotId }
          : {
              mode: apptMode,
              scheduledStart: new Date(apptStart).getTime(),
              scheduledEnd: apptEnd ? new Date(apptEnd).getTime() : null,
              location: apptLocation.trim() || null,
              meetingLink: apptLink.trim() || null,
            },
        { realm: 'admin' },
      );
      toast('Appointment created.', 'success');
      setApptOpen(false);
      setSlotId('');
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not create appointment.', 'error');
    } finally {
      setSavingAppt(false);
    }
  }

  const name = lead?.userName ?? lead?.user?.fullName ?? null;
  const email = lead?.userEmail ?? lead?.user?.email ?? null;

  return (
    <div className="animate-fade-up">
      <Link
        href="/admin/counselling/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      {!lead ? (
        error ? (
          <EmptyState
            icon={Headphones}
            title="Lead not found"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => router.push('/admin/counselling/leads')}>
                Back to leads
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-lg" />
            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <Skeleton className="h-96 rounded-lg" />
              <Skeleton className="h-96 rounded-lg" />
            </div>
          </div>
        )
      ) : (
        <>
          <AdminPageHeader
            title={lead.topic ?? 'Counselling lead'}
            description={`${label(lead.type)} · created ${formatRelative(lead.createdAt)}`}
            actions={
              <>
                <Badge tone={STATUS_TONE[lead.status] ?? 'neutral'} className="capitalize">
                  {label(lead.status)}
                </Badge>
                <Button variant="primary" size="sm" onClick={() => void openAppt()}>
                  <CalendarPlus className="h-4 w-4" /> Schedule appointment
                </Button>
              </>
            }
          />

          <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-6">
              {/* Context */}
              <Card>
                <CardBody className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={name ?? email} />
                    <div>
                      <p className="font-semibold text-ink">{name ?? 'Unknown user'}</p>
                      {email && (
                        <p className="flex items-center gap-1.5 text-sm text-ink-3">
                          <Mail className="h-3.5 w-3.5" /> {email}
                        </p>
                      )}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="eyebrow text-ink-3">Type</dt>
                      <dd className="mt-0.5 capitalize text-ink">{label(lead.type)}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow text-ink-3">Preferred mode</dt>
                      <dd className="mt-0.5 capitalize text-ink">
                        {lead.preferredMode ? label(lead.preferredMode) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="eyebrow text-ink-3">Language</dt>
                      <dd className="mt-0.5 flex items-center gap-1.5 text-ink">
                        <Languages className="h-3.5 w-3.5 text-ink-3" />
                        {LOCALE_NAMES[lead.preferredLanguage] ?? lead.preferredLanguage}
                      </dd>
                    </div>
                  </dl>
                  {lead.message && (
                    <div className="rounded-md border border-border bg-surface-sunk/50 p-4">
                      <p className="mb-1 flex items-center gap-1.5 eyebrow text-ink-3">
                        <MessageSquare className="h-3.5 w-3.5" /> Message
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-ink-2">{lead.message}</p>
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Appointments */}
              <Card>
                <CardBody>
                  <CardTitle className="mb-3 text-base">Appointments</CardTitle>
                  {lead.appointments && lead.appointments.length > 0 ? (
                    <div className="space-y-2">
                      {lead.appointments.map((a) => (
                        <div
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                        >
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-primary-600" />
                            <span className="font-medium text-ink">{formatDateTime(a.scheduledStart)}</span>
                            <span className="capitalize text-ink-3">· {label(a.mode)}</span>
                          </div>
                          <Badge tone={STATUS_TONE[a.status] ?? 'neutral'} className="capitalize">
                            {label(a.status)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-3">No appointments yet. Schedule one above.</p>
                  )}
                </CardBody>
              </Card>

              {/* Notes */}
              <Card>
                <CardBody>
                  <CardTitle className="mb-3 flex items-center gap-2 text-base">
                    <StickyNote className="h-4 w-4 text-accent" /> Internal notes
                  </CardTitle>
                  <div className="space-y-3">
                    {lead.notes && lead.notes.length > 0 ? (
                      lead.notes.map((n) => (
                        <div key={n.id} className="rounded-md border border-border bg-surface-sunk/40 p-3">
                          <p className="whitespace-pre-wrap text-sm text-ink-2">{n.body}</p>
                          <p className="mt-1.5 text-xs text-ink-3">
                            {n.authorName ?? 'Admin'} · {formatRelative(n.createdAt)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-ink-3">No notes yet.</p>
                    )}
                  </div>
                  <div className="mt-4 space-y-2">
                    <Textarea
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="Add an internal note (not visible to the user)…"
                      className="min-h-[80px]"
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={addingNote}
                        disabled={!noteBody.trim()}
                        onClick={() => void addNote()}
                      >
                        Add note
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Controls */}
            <Card className="lg:sticky lg:top-20">
              <CardBody className="space-y-4">
                <CardTitle className="text-base">Triage</CardTitle>
                <Field label="Status" htmlFor="status">
                  <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="new">New</option>
                    <option value="in_progress">In progress</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                    <option value="cancelled">Cancelled</option>
                  </Select>
                </Field>
                <Field label="Priority" htmlFor="priority">
                  <Select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </Select>
                </Field>
                <Field label="Assigned to" htmlFor="assigned" hint="Counsellor name or ID">
                  <div className="relative">
                    <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                    <Input
                      id="assigned"
                      className="pl-9"
                      value={assignedTo}
                      placeholder="Unassigned"
                      onChange={(e) => setAssignedTo(e.target.value)}
                    />
                  </div>
                </Field>
                <Field label="Resolution notes" htmlFor="resnotes">
                  <Textarea
                    id="resnotes"
                    value={resolutionNotes}
                    placeholder="How was this resolved?"
                    onChange={(e) => setResolutionNotes(e.target.value)}
                  />
                </Field>
                <Button
                  variant="primary"
                  className="w-full"
                  loading={savingLead}
                  onClick={() => void saveLead()}
                >
                  <Save className="h-4 w-4" /> Save changes
                </Button>
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <Modal
        open={apptOpen}
        onClose={() => setApptOpen(false)}
        title="Schedule appointment"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setApptOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={savingAppt} onClick={() => void createAppt()}>
              Confirm
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Assign an existing slot" htmlFor="slot" hint="Or leave blank and schedule manually below">
            <Select id="slot" value={slotId} onChange={(e) => pickSlot(e.target.value)}>
              <option value="">— Schedule manually —</option>
              {(slots ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDateTime(s.startAt)} · {label(s.mode)}
                  {s.capacity != null ? ` (${s.bookedCount ?? 0}/${s.capacity})` : ''}
                </option>
              ))}
            </Select>
          </Field>

          {!slotId && (
            <>
              <Field label="Mode" htmlFor="appt-mode">
                <Select id="appt-mode" value={apptMode} onChange={(e) => setApptMode(e.target.value)}>
                  <option value="one_to_one">One-to-one (video)</option>
                  <option value="in_person">In-person</option>
                  <option value="phone">Phone</option>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts at" htmlFor="appt-start">
                  <Input
                    id="appt-start"
                    type="datetime-local"
                    value={apptStart}
                    onChange={(e) => setApptStart(e.target.value)}
                  />
                </Field>
                <Field label="Ends at" htmlFor="appt-end">
                  <Input
                    id="appt-end"
                    type="datetime-local"
                    value={apptEnd}
                    onChange={(e) => setApptEnd(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Location" htmlFor="appt-loc" hint="For in-person sessions">
                <Input id="appt-loc" value={apptLocation} onChange={(e) => setApptLocation(e.target.value)} />
              </Field>
              <Field label="Meeting link" htmlFor="appt-link" hint="For video sessions">
                <Input id="appt-link" value={apptLink} onChange={(e) => setApptLink(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
