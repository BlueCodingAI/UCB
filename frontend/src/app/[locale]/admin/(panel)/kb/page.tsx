'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, BookOpen, RefreshCw, Trash2, Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { KbDocument, Pagination as Pag } from '@/lib/types';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Pagination } from '@/components/admin/Pagination';
import { TableWrap, Th, Td, Tr } from '@/components/ui/Table';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 25;

const SOURCE_TYPES = [
  'pdf',
  'google_sheet',
  'faq',
  'notice',
  'circular',
  'schedule',
  'counselling_note',
  'manual_text',
  'url',
] as const;

function indexTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (s === 'indexed') return 'success';
  if (s === 'failed') return 'danger';
  return 'neutral';
}

function titleCase(s: string) {
  return s.replace(/_/g, ' ');
}

export default function AdminKbPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<KbDocument[]>([]);
  const [pagination, setPagination] = useState<Pag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<KbDocument | null>(null);

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [language, setLanguage] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [isActive, setIsActive] = useState('');
  const [indexStatus, setIndexStatus] = useState('');

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
      const res = await api.getFull<KbDocument[]>('/admin/kb/documents', {
        realm: 'admin',
        query: {
          page,
          pageSize: PAGE_SIZE,
          q: debouncedQ || undefined,
          'filter[language]': language || undefined,
          'filter[sourceType]': sourceType || undefined,
          'filter[isActive]': isActive || undefined,
          'filter[indexStatus]': indexStatus || undefined,
        },
      });
      setRows(res.data);
      setPagination(res.meta?.pagination ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, language, sourceType, isActive, indexStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(doc: KbDocument) {
    setBusyId(doc.id);
    // Optimistic update.
    setRows((prev) => prev.map((d) => (d.id === doc.id ? { ...d, isActive: !d.isActive } : d)));
    try {
      await api.patch(`/admin/kb/documents/${doc.id}/active`, { isActive: !doc.isActive }, { realm: 'admin' });
      toast(!doc.isActive ? 'Source activated.' : 'Source deactivated.', 'success');
    } catch (err) {
      setRows((prev) => prev.map((d) => (d.id === doc.id ? { ...d, isActive: doc.isActive } : d)));
      toast(err instanceof ApiError ? err.message : 'Could not update.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function reindex(doc: KbDocument) {
    setBusyId(doc.id);
    try {
      await api.post(`/admin/kb/documents/${doc.id}/reindex`, {}, { realm: 'admin' });
      toast('Reindexing started.', 'success');
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not reindex.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    const doc = confirmDelete;
    setBusyId(doc.id);
    try {
      await api.del(`/admin/kb/documents/${doc.id}`, { realm: 'admin' });
      toast('Source deleted.', 'success');
      setConfirmDelete(null);
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = pagination?.totalPages ?? 1;

  return (
    <>
      <AdminPageHeader
        title="Knowledge base"
        description="The only source the bot answers from. Keep it accurate."
        actions={
          <Link href="/admin/kb/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="h-4 w-4" /> Add source
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title or topic"
            className="pl-10"
            aria-label="Search documents"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Select value={sourceType} onChange={(e) => { setSourceType(e.target.value); setPage(1); }} aria-label="Source type">
            <option value="">All types</option>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </Select>
          <Select value={language} onChange={(e) => { setLanguage(e.target.value); setPage(1); }} aria-label="Language">
            <option value="">All langs</option>
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
            <option value="mr">मराठी</option>
            <option value="mixed">Mixed</option>
          </Select>
          <Select value={indexStatus} onChange={(e) => { setIndexStatus(e.target.value); setPage(1); }} aria-label="Index status">
            <option value="">All status</option>
            <option value="indexed">Indexed</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </Select>
          <Select value={isActive} onChange={(e) => { setIsActive(e.target.value); setPage(1); }} aria-label="Active state">
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-80 rounded-md" />
      ) : error ? (
        <EmptyState title="Could not load documents" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No sources yet"
          description="Add a PDF, sheet, notice or FAQ so the bot has something to answer from."
          action={
            <Link href="/admin/kb/new" className="text-sm font-medium text-primary-600 hover:underline">
              Add your first source →
            </Link>
          }
        />
      ) : (
        <>
          <TableWrap className="min-w-[760px]">
            <thead>
              <Tr className="hover:bg-transparent">
                <Th>Title</Th>
                <Th>Type</Th>
                <Th>Lang</Th>
                <Th>Topic</Th>
                <Th>Index</Th>
                <Th>Active</Th>
                <Th>Updated</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <Tr key={d.id}>
                  <Td className="max-w-[220px] font-medium text-ink">
                    <Link href={`/admin/kb/${d.id}`} className="hover:text-primary-700 hover:underline">
                      <span className="line-clamp-1">{d.title}</span>
                    </Link>
                    <span className="text-xs text-ink-3">{d.chunkCount} chunks</span>
                  </Td>
                  <Td>
                    <Badge tone="neutral">{titleCase(d.sourceType)}</Badge>
                  </Td>
                  <Td className="uppercase">{d.language}</Td>
                  <Td className="text-ink-3">{d.topic ?? '—'}</Td>
                  <Td>
                    <Badge tone={indexTone(d.indexStatus)}>{d.indexStatus}</Badge>
                  </Td>
                  <Td>
                    <Switch
                      checked={d.isActive}
                      disabled={busyId === d.id}
                      onChange={() => toggleActive(d)}
                      label={`Toggle active for ${d.title}`}
                    />
                  </Td>
                  <Td className="whitespace-nowrap text-ink-3">{formatDate(d.updatedAt)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => reindex(d)}
                        disabled={busyId === d.id}
                        aria-label={`Reindex ${d.title}`}
                        title="Reindex"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-3 hover:bg-surface-sunk hover:text-primary-600 disabled:opacity-40"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(d)}
                        disabled={busyId === d.id}
                        aria-label={`Delete ${d.title}`}
                        title="Delete"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-3 hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete source"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={doDelete} loading={busyId === confirmDelete?.id}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Delete <span className="font-medium text-ink">{confirmDelete?.title}</span> and all its indexed chunks?
          The bot will no longer be able to answer from it. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
