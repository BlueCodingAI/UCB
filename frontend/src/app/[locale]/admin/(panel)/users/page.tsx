'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Users as UsersIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { User, PlanCode, Pagination as Pag } from '@/lib/types';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Pagination } from '@/components/admin/Pagination';
import { TableWrap, Th, Td, Tr } from '@/components/ui/Table';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

const PAGE_SIZE = 25;

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

export default function AdminUsersPage() {
  const [rows, setRows] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [language, setLanguage] = useState('');

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getFull<User[]>('/admin/users', {
        realm: 'admin',
        query: {
          page,
          pageSize: PAGE_SIZE,
          q: debouncedQ || undefined,
          'filter[plan]': plan || undefined,
          'filter[status]': status || undefined,
          'filter[language]': language || undefined,
        },
      });
      setRows(res.data);
      setPagination(res.meta?.pagination ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, plan, status, language]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = pagination?.totalPages ?? 1;

  return (
    <>
      <AdminPageHeader
        title="User management"
        description={pagination?.total != null ? `${pagination.total.toLocaleString('en-IN')} users` : 'Search and manage user accounts.'}
      />

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email or mobile"
            className="pl-10"
            aria-label="Search users"
          />
        </div>
        <Select
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by plan"
          className="sm:w-44"
        >
          <option value="">All plans</option>
          <option value="freemium">Freemium</option>
          <option value="premium">Premium</option>
          <option value="super_premium">Super premium</option>
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="sm:w-40"
        >
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </Select>
        <Select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by language"
          className="sm:w-36"
        >
          <option value="">All langs</option>
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
          <option value="mr">मराठी</option>
        </Select>
      </div>

      {loading ? (
        <Skeleton className="h-80 rounded-md" />
      ) : error ? (
        <EmptyState title="Could not load users" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users found" description="Try adjusting your search or filters." />
      ) : (
        <>
          <TableWrap>
            <thead>
              <Tr className="hover:bg-transparent">
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Plan</Th>
                <Th>Validity</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <Tr key={u.id} className="cursor-pointer">
                  <Td className="font-medium text-ink">
                    <Link href={`/admin/users/${u.id}`} className="hover:text-primary-700 hover:underline">
                      {u.fullName ?? '—'}
                    </Link>
                  </Td>
                  <Td>
                    <div className="text-ink-2">{u.email ?? '—'}</div>
                    <div className="text-xs text-ink-3">{u.mobile ?? '—'}</div>
                  </Td>
                  <Td>
                    <Badge tone={PLAN_TONE[u.currentPlanCode]}>{PLAN_LABEL[u.currentPlanCode]}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(u.planValidUntil)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(u.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </>
  );
}
