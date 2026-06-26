'use client';

import { useEffect, useState } from 'react';
import { Headphones, ChevronRight } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Pagination } from '@/components/admin/Pagination';
import {
  Card,
  Select,
  Badge,
  Skeleton,
  EmptyState,
  TableWrap,
  Th,
  Td,
  Tr,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import type { Pagination as Pg } from '@/lib/types';

interface AdminLead {
  id: string;
  type: string;
  topic: string | null;
  preferredMode: string | null;
  preferredLanguage: string;
  status: string;
  priority: string;
  createdAt: number;
  userName?: string | null;
  userEmail?: string | null;
  user?: { fullName?: string | null; email?: string | null } | null;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  new: 'accent',
  open: 'accent',
  pending: 'warning',
  in_progress: 'primary',
  assigned: 'primary',
  scheduled: 'primary',
  resolved: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
};

const PRIORITY_TONE: Record<string, BadgeTone> = {
  urgent: 'danger',
  high: 'danger',
  medium: 'warning',
  normal: 'neutral',
  low: 'neutral',
};

function label(v: string): string {
  return v.replace(/_/g, ' ');
}

const PAGE_SIZE = 25;

export default function AdminLeadsPage() {
  const [rows, setRows] = useState<AdminLead[] | null>(null);
  const [pg, setPg] = useState<Pg | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const res = await api.getFull<{ requests: AdminLead[] } | AdminLead[]>(
          '/admin/counselling/requests',
          {
            realm: 'admin',
            query: {
              page,
              pageSize: PAGE_SIZE,
              'filter[status]': status || undefined,
              'filter[priority]': priority || undefined,
            },
          },
        );
        if (!active) return;
        const list = Array.isArray(res.data) ? res.data : res.data.requests;
        setRows(list ?? []);
        setPg(res.meta?.pagination ?? null);
      } catch (e) {
        if (!active) return;
        setError(e instanceof ApiError ? e.message : 'Could not load leads.');
        setRows([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [page, status, priority]);

  const totalPages = pg?.totalPages ?? 1;

  return (
    <div className="animate-fade-up">
      <AdminPageHeader
        title="Counselling leads"
        description="Triage incoming guidance requests, assign owners, and schedule appointments."
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-ink-2">Status</label>
            <Select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="in_progress">In progress</option>
              <option value="scheduled">Scheduled</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-ink-2">Priority</label>
            <Select
              value={priority}
              onChange={(e) => {
                setPage(1);
                setPriority(e.target.value);
              }}
            >
              <option value="">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </div>
        </div>
      </Card>

      {rows === null ? (
        <Skeleton className="h-80 w-full rounded-md" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Headphones}
          title="No leads to show"
          description={error ?? 'No counselling requests match these filters yet.'}
        />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Topic</Th>
                <Th>Type</Th>
                <Th>Mode</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th>Created</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const name = r.userName ?? r.user?.fullName ?? '—';
                const email = r.userEmail ?? r.user?.email ?? '';
                return (
                  <Tr key={r.id} className="group cursor-pointer">
                    <Td>
                      <Link href={`/admin/counselling/leads/${r.id}`} className="block">
                        <span className="font-medium text-ink">{name}</span>
                        {email && <span className="block text-xs text-ink-3">{email}</span>}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/admin/counselling/leads/${r.id}`} className="block max-w-[14rem] truncate">
                        {r.topic ?? '—'}
                      </Link>
                    </Td>
                    <Td className="capitalize">{label(r.type)}</Td>
                    <Td className="capitalize">{r.preferredMode ? label(r.preferredMode) : '—'}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[r.status] ?? 'neutral'} className="capitalize">
                        {label(r.status)}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={PRIORITY_TONE[r.priority] ?? 'neutral'} className="capitalize">
                        {label(r.priority)}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-3">{formatRelative(r.createdAt)}</Td>
                    <Td>
                      <Link
                        href={`/admin/counselling/leads/${r.id}`}
                        aria-label="Open lead"
                        className="text-ink-3 group-hover:text-primary-600"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
