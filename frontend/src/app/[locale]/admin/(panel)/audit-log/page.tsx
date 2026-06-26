'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Search, ScrollText, ChevronRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Pagination as Pag } from '@/lib/types';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Pagination } from '@/components/admin/Pagination';
import { TableWrap, Th, Td, Tr } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

interface AuditEntry {
  id: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: number;
}

const PAGE_SIZE = 25;

export default function AdminAuditLogPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

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
      const res = await api.getFull<AuditEntry[]>('/admin/audit-logs', {
        realm: 'admin',
        query: { page, pageSize: PAGE_SIZE, q: debouncedQ || undefined },
      });
      setRows(res.data);
      setPagination(res.meta?.pagination ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load audit log.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = pagination?.totalPages ?? 1;

  return (
    <>
      <AdminPageHeader title="Audit log" description="Every administrative change, recorded." />

      <div className="mb-5 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by actor, action or entity"
            className="pl-10"
            aria-label="Search audit log"
          />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-80 rounded-md" />
      ) : error ? (
        <EmptyState title="Could not load audit log" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries" description="Administrative actions will appear here." />
      ) : (
        <>
          <TableWrap className="min-w-[720px]">
            <thead>
              <Tr className="hover:bg-transparent">
                <Th className="w-8" />
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Time</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = expanded === r.id;
                const hasDetail = r.before != null || r.after != null;
                return (
                  <Fragment key={r.id}>
                    <Tr
                      className={cn(hasDetail && 'cursor-pointer')}
                      onClick={() => hasDetail && setExpanded(open ? null : r.id)}
                    >
                      <Td className="text-ink-3">
                        {hasDetail && (
                          <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
                        )}
                      </Td>
                      <Td>
                        <div className="font-medium text-ink">{r.actorName ?? 'System'}</div>
                        {r.actorEmail && <div className="text-xs text-ink-3">{r.actorEmail}</div>}
                      </Td>
                      <Td>
                        <Badge tone="primary">{r.action}</Badge>
                      </Td>
                      <Td className="text-ink-2">
                        {r.entityType ? (
                          <>
                            <span>{r.entityType}</span>
                            {r.entityId && <span className="block font-mono text-xs text-ink-3">{r.entityId}</span>}
                          </>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-ink-3">{formatDateTime(r.createdAt)}</Td>
                    </Tr>
                    {open && hasDetail && (
                      <tr className="bg-surface-sunk/40">
                        <td colSpan={5} className="border-t border-border px-3.5 py-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <JsonBlock label="Before" value={r.before} />
                            <JsonBlock label="After" value={r.after} />
                          </div>
                          {r.ipAddress && (
                            <p className="mt-3 font-mono text-xs text-ink-3">IP: {r.ipAddress}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableWrap>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-ink-3">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-surface p-3 text-xs text-ink-2">
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
