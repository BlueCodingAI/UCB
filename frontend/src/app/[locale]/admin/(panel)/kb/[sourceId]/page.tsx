'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Trash2, UploadCloud, AlertTriangle, FileText } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { KbDocument } from '@/lib/types';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardBody, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

interface ChunkPreview {
  id: string;
  ordinal: number;
  text: string;
  tokenCount: number | null;
  sourceLocator: string | null;
}
interface KbDocumentDetail extends KbDocument {
  chunks: ChunkPreview[];
}

function indexTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (s === 'indexed') return 'success';
  if (s === 'failed') return 'danger';
  return 'neutral';
}

export default function AdminKbDetailPage({ params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [doc, setDoc] = useState<KbDocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Editable metadata.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('en');
  const [course, setCourse] = useState('');
  const [capYear, setCapYear] = useState('');
  const [topic, setTopic] = useState('');

  const hydrate = useCallback((d: KbDocumentDetail) => {
    setDoc(d);
    setTitle(d.title);
    setDescription(d.description ?? '');
    setLanguage(d.language);
    setCourse(d.course ?? '');
    setCapYear(d.capYear != null ? String(d.capYear) : '');
    setTopic(d.topic ?? '');
  }, []);

  const load = useCallback(async () => {
    setError(null);
    if (!sourceId || sourceId === 'undefined') {
      setError('Invalid document reference.');
      return;
    }
    try {
      const d = await api.get<KbDocumentDetail>(`/admin/kb/documents/${sourceId}`, { realm: 'admin' });
      hydrate(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load source.');
    }
  }, [sourceId, hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMeta() {
    if (!doc) return;
    setBusy(true);
    try {
      const updated = await api.put<KbDocumentDetail>(
        `/admin/kb/documents/${doc.id}`,
        {
          title: title.trim(),
          description: description.trim() || null,
          language,
          course: course.trim() || null,
          capYear: capYear.trim() ? Number(capYear) : null,
          topic: topic.trim() || null,
        },
        { realm: 'admin' },
      );
      hydrate(updated);
      toast('Metadata saved.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save metadata.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!doc) return;
    setBusy(true);
    try {
      await api.patch(`/admin/kb/documents/${doc.id}/active`, { isActive: !doc.isActive }, { realm: 'admin' });
      setDoc({ ...doc, isActive: !doc.isActive });
      toast(!doc.isActive ? 'Source activated.' : 'Source deactivated.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    if (!doc) return;
    setBusy(true);
    try {
      await api.post(`/admin/kb/documents/${doc.id}/reindex`, {}, { realm: 'admin' });
      toast('Reindexing started.', 'success');
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not reindex.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function replaceFile(file: File) {
    if (!doc) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const updated = await api.put<KbDocumentDetail>(`/admin/kb/documents/${doc.id}/file`, fd, { realm: 'admin' });
      hydrate(updated);
      toast('File replaced — reindexing started.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not replace file.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!doc) return;
    setBusy(true);
    try {
      await api.del(`/admin/kb/documents/${doc.id}`, { realm: 'admin' });
      toast('Source deleted.', 'success');
      router.replace('/admin/kb');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete.', 'error');
      setBusy(false);
    }
  }

  if (error) {
    return (
      <>
        <BackLink />
        <EmptyState icon={AlertTriangle} title="Could not load source" description={error} />
      </>
    );
  }
  if (!doc) {
    return (
      <>
        <BackLink />
        <Skeleton className="mb-6 h-20 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </>
    );
  }

  const isFile = doc.sourceType === 'pdf';

  return (
    <>
      <BackLink />
      <AdminPageHeader
        title={doc.title}
        description={`${(doc.sourceType ?? 'document').replace(/_/g, ' ')} · ${doc.chunkCount ?? 0} chunks`}
        actions={
          <>
            <Badge tone={indexTone(doc.indexStatus)}>{doc.indexStatus}</Badge>
            <Button variant="secondary" size="sm" onClick={reindex} loading={busy}>
              <RefreshCw className="h-4 w-4" /> Reindex
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Metadata editor */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardBody className="space-y-4">
              <CardTitle>Metadata</CardTitle>
              <Field label="Title" htmlFor="d-title" required>
                <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Description" htmlFor="d-desc">
                <Textarea id="d-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[80px]" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Language" htmlFor="d-lang">
                  <Select id="d-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="en">English</option>
                    <option value="hi">हिन्दी</option>
                    <option value="mr">मराठी</option>
                    <option value="mixed">Mixed</option>
                  </Select>
                </Field>
                <Field label="Topic" htmlFor="d-topic">
                  <Input id="d-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
                </Field>
                <Field label="Course" htmlFor="d-course">
                  <Input id="d-course" value={course} onChange={(e) => setCourse(e.target.value)} />
                </Field>
                <Field label="CAP year" htmlFor="d-year">
                  <Input id="d-year" type="number" inputMode="numeric" value={capYear} onChange={(e) => setCapYear(e.target.value)} />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={saveMeta} loading={busy}>
                  Save changes
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Chunk preview */}
          <Card>
            <CardBody>
              <div className="mb-4 flex items-center justify-between">
                <CardTitle>Chunk preview</CardTitle>
                <span className="font-mono text-[0.7rem] uppercase tracking-wider text-ink-3">
                  {doc.chunks.length} shown
                </span>
              </div>
              {doc.chunks.length === 0 ? (
                <p className="text-sm text-ink-3">
                  No chunks yet. They appear after indexing completes.
                </p>
              ) : (
                <ul className="space-y-3">
                  {doc.chunks.map((c) => (
                    <li key={c.id} className="rounded-md border border-border bg-surface-sunk/40 p-3">
                      <div className="mb-1.5 flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-wider text-ink-3">
                        <span>Chunk #{c.ordinal}{c.sourceLocator ? ` · ${c.sourceLocator}` : ''}</span>
                        {c.tokenCount != null && <span>{c.tokenCount} tokens</span>}
                      </div>
                      <p className="line-clamp-4 whitespace-pre-wrap text-sm text-ink-2">{c.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Side actions */}
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <CardTitle>Status</CardTitle>
              <dl className="space-y-2.5 text-sm">
                <Row label="Index status" value={<Badge tone={indexTone(doc.indexStatus)}>{doc.indexStatus}</Badge>} />
                <Row label="Type" value={<span className="text-ink">{doc.sourceType.replace(/_/g, ' ')}</span>} />
                <Row label="Chunks" value={<span className="font-mono text-ink">{doc.chunkCount}</span>} />
                <Row label="Updated" value={<span className="text-ink">{formatDateTime(doc.updatedAt)}</span>} />
              </dl>
              <div className="flex items-center justify-between rounded-sm bg-surface-sunk/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{doc.isActive ? 'Active' : 'Inactive'}</p>
                  <p className="text-xs text-ink-3">Used in retrieval when active.</p>
                </div>
                <Switch checked={doc.isActive} onChange={toggleActive} disabled={busy} label="Active" />
              </div>
            </CardBody>
          </Card>

          {isFile && (
            <Card>
              <CardBody className="space-y-3">
                <CardTitle>Replace file</CardTitle>
                <label
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-sunk/40 px-4 py-6 text-center hover:border-primary-600"
                >
                  <UploadCloud className="h-6 w-6 text-primary-600" />
                  <span className="text-sm font-medium text-ink">Upload a new PDF</span>
                  <span className="text-xs text-ink-3">Replaces content and reindexes</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void replaceFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </CardBody>
            </Card>
          )}

          <Card className="border-danger/30">
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-danger" />
                <CardTitle className="text-danger">Danger zone</CardTitle>
              </div>
              <p className="text-sm text-ink-3">
                Deleting removes this source and all its chunks from the knowledge base.
              </p>
              <Button variant="danger" size="sm" className="w-full" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete source
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete source"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={doDelete} loading={busy}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Delete <span className="font-medium text-ink">{doc.title}</span> and its {doc.chunkCount} chunks? This
          cannot be undone.
        </p>
      </Modal>
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/kb"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" /> Back to library
    </Link>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
