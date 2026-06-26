'use client';

import { use, useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  CreditCard,
  Brain,
  Activity,
  Headphones,
  AlertTriangle,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDateTime, formatPaise, initials } from '@/lib/format';
import type { User, PlanCode } from '@/lib/types';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardBody, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

interface CapProfileMemory {
  category: string;
  domicile: string | null;
  preferredCourses: string[];
  cetScore: number | null;
  notes: string | null;
}
interface UsageStats {
  totalChats: number;
  chatsThisMonth: number;
  voiceMinutes: number;
  lastActiveAt: number | null;
  fallbacks: number;
}
interface CounsellingLink {
  id: string;
  type: string;
  topic: string | null;
  status: string;
  createdAt: number;
}
interface PaymentRow {
  id: string;
  planCode: PlanCode;
  amountPaise: number;
  status: string;
  method: string | null;
  createdAt: number;
}
interface UserDetail {
  user: User;
  capProfile: CapProfileMemory | null;
  usage: UsageStats;
  counselling: CounsellingLink[];
  payments: PaymentRow[];
}

const PLAN_TONE: Record<PlanCode, BadgeTone> = {
  freemium: 'neutral',
  premium: 'accent',
  super_premium: 'primary',
};
const PLAN_LABEL: Record<PlanCode, string> = {
  freemium: 'Freemium',
  premium: 'Premium',
  super_premium: 'Super premium',
};
const STATUS_TONE: Record<User['status'], BadgeTone> = {
  active: 'success',
  suspended: 'warning',
  deleted: 'danger',
};

function payStatusTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (s === 'captured' || s === 'paid' || s === 'success') return 'success';
  if (s === 'failed') return 'danger';
  return 'neutral';
}

export default function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [data, setData] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [statusModal, setStatusModal] = useState(false);
  const [planModal, setPlanModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<UserDetail>(`/admin/users/${userId}`, { realm: 'admin' });
      setData(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load user.');
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <>
        <BackLink />
        <EmptyState icon={AlertTriangle} title="Could not load user" description={error} />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <BackLink />
        <Skeleton className="mb-6 h-28 rounded-lg" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-lg lg:col-span-2" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </>
    );
  }

  const u = data.user;

  return (
    <>
      <BackLink />
      <AdminPageHeader
        title={u.fullName ?? u.email ?? 'User'}
        description="360° account view"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setStatusModal(true)}>
              Change status
            </Button>
            <Button size="sm" onClick={() => setPlanModal(true)}>
              Manage plan
            </Button>
          </>
        }
      />

      {/* Profile header */}
      <Card className="mb-6">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={u.fullName ?? u.email} className="h-14 w-14 text-base" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{u.fullName ?? '—'}</h2>
              <Badge tone={PLAN_TONE[u.currentPlanCode]}>{PLAN_LABEL[u.currentPlanCode]}</Badge>
              <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-ink-3" />
                {u.email ?? '—'}
                {u.emailVerified && <ShieldCheck className="h-3.5 w-3.5 text-success" />}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-ink-3" />
                {u.mobile ?? '—'}
                {u.mobileVerified && <ShieldCheck className="h-3.5 w-3.5 text-success" />}
              </span>
              {(u.locationCity || u.locationDistrict) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-ink-3" />
                  {[u.locationCity, u.locationDistrict].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-right">
            <div>
              <dt className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-3">Language</dt>
              <dd className="text-ink">{u.preferredLanguage.toUpperCase()}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-3">Validity</dt>
              <dd className="text-ink">{formatDate(u.planValidUntil)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-3">Joined</dt>
              <dd className="text-ink">{formatDate(u.createdAt)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* CAP profile memory */}
        <Card>
          <CardBody>
            <div className="mb-4 flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary-600" />
              <CardTitle>CAP profile memory</CardTitle>
            </div>
            {data.capProfile ? (
              <dl className="space-y-3 text-sm">
                <DetailRow label="Category" value={data.capProfile.category} />
                <DetailRow label="Domicile" value={data.capProfile.domicile ?? '—'} />
                <DetailRow label="CET score" value={data.capProfile.cetScore != null ? String(data.capProfile.cetScore) : '—'} />
                <div>
                  <dt className="mb-1 font-mono text-[0.65rem] uppercase tracking-wider text-ink-3">Preferred courses</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {data.capProfile.preferredCourses.length > 0 ? (
                      data.capProfile.preferredCourses.map((c) => (
                        <Badge key={c} tone="neutral">
                          {c}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </dd>
                </div>
                {data.capProfile.notes && (
                  <div>
                    <dt className="mb-1 font-mono text-[0.65rem] uppercase tracking-wider text-ink-3">Notes</dt>
                    <dd className="rounded-sm bg-surface-sunk p-3 text-ink-2">{data.capProfile.notes}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-ink-3">This user has not saved a CAP profile.</p>
            )}
          </CardBody>
        </Card>

        {/* Usage stats */}
        <Card>
          <CardBody>
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary-600" />
              <CardTitle>Usage</CardTitle>
            </div>
            <dl className="space-y-3 text-sm">
              <DetailRow label="Total chats" value={data.usage.totalChats.toLocaleString('en-IN')} />
              <DetailRow label="This month" value={data.usage.chatsThisMonth.toLocaleString('en-IN')} />
              <DetailRow label="Voice minutes" value={data.usage.voiceMinutes.toLocaleString('en-IN')} />
              <DetailRow label="Fallbacks" value={data.usage.fallbacks.toLocaleString('en-IN')} />
              <DetailRow label="Last active" value={formatDateTime(data.usage.lastActiveAt)} />
            </dl>
          </CardBody>
        </Card>

        {/* Counselling */}
        <Card>
          <CardBody>
            <div className="mb-4 flex items-center gap-2">
              <Headphones className="h-4 w-4 text-primary-600" />
              <CardTitle>Counselling</CardTitle>
            </div>
            {data.counselling.length === 0 ? (
              <p className="text-sm text-ink-3">No counselling requests.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.counselling.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{c.topic ?? c.type}</p>
                      <p className="text-xs text-ink-3">
                        {c.type} · {formatDate(c.createdAt)}
                      </p>
                    </div>
                    <Badge tone="neutral">{c.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/admin/counselling/leads"
              className="mt-4 inline-block text-sm font-medium text-primary-600 hover:underline"
            >
              View all leads →
            </Link>
          </CardBody>
        </Card>
      </div>

      {/* Payment history */}
      <Card className="mt-6">
        <CardBody>
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary-600" />
            <CardTitle>Payment history</CardTitle>
          </div>
          {data.payments.length === 0 ? (
            <p className="text-sm text-ink-3">No payments recorded.</p>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-2 py-2 font-mono text-[0.7rem] uppercase tracking-wide text-ink-3">Date</th>
                    <th className="px-2 py-2 font-mono text-[0.7rem] uppercase tracking-wide text-ink-3">Plan</th>
                    <th className="px-2 py-2 font-mono text-[0.7rem] uppercase tracking-wide text-ink-3">Method</th>
                    <th className="px-2 py-2 text-right font-mono text-[0.7rem] uppercase tracking-wide text-ink-3">Amount</th>
                    <th className="px-2 py-2 font-mono text-[0.7rem] uppercase tracking-wide text-ink-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-2 py-2.5 text-ink-2">{formatDate(p.createdAt)}</td>
                      <td className="px-2 py-2.5 text-ink-2">{PLAN_LABEL[p.planCode]}</td>
                      <td className="px-2 py-2.5 text-ink-2">{p.method ?? '—'}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-ink">{formatPaise(p.amountPaise)}</td>
                      <td className="px-2 py-2.5">
                        <Badge tone={payStatusTone(p.status)}>{p.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {statusModal && (
        <StatusModal
          user={u}
          onClose={() => setStatusModal(false)}
          onDone={() => {
            setStatusModal(false);
            toast('Account status updated.', 'success');
            void load();
          }}
        />
      )}
      {planModal && (
        <PlanModal
          user={u}
          onClose={() => setPlanModal(false)}
          onDone={() => {
            setPlanModal(false);
            toast('Plan updated.', 'success');
            void load();
          }}
        />
      )}
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/users"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" /> Back to users
    </Link>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}

function StatusModal({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<User['status']>(user.status);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/admin/users/${user.id}`, { status }, { realm: 'admin' });
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update status.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Change account status"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} loading={saving}>
            Save status
          </Button>
        </>
      }
    >
      <Field label="Status" htmlFor="status-select">
        <Select id="status-select" value={status} onChange={(e) => setStatus(e.target.value as User['status'])}>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </Select>
      </Field>
      <p className="mt-3 text-sm text-ink-3">
        Suspended users cannot sign in. Deleting soft-removes the account.
      </p>
    </Modal>
  );
}

function PlanModal({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [planCode, setPlanCode] = useState<PlanCode>(user.currentPlanCode);
  const [validUntil, setValidUntil] = useState(() =>
    user.planValidUntil ? new Date(user.planValidUntil).toISOString().slice(0, 10) : '',
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.post(
        `/admin/users/${user.id}/plan`,
        {
          planCode,
          validUntil: validUntil ? new Date(`${validUntil}T23:59:59`).getTime() : null,
        },
        { realm: 'admin' },
      );
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not grant plan.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Grant plan"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} loading={saving}>
            Grant plan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Plan" htmlFor="plan-select">
          <Select id="plan-select" value={planCode} onChange={(e) => setPlanCode(e.target.value as PlanCode)}>
            <option value="freemium">Freemium</option>
            <option value="premium">Premium</option>
            <option value="super_premium">Super premium</option>
          </Select>
        </Field>
        <Field
          label="Valid until"
          htmlFor="valid-until"
          hint="Leave blank to use the plan's default validity."
        >
          <Input
            id="valid-until"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
