'use client';

import { useEffect, useState } from 'react';
import { Activity, Search, AlertTriangle, FlaskConical, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardBody, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Field, Input, Select } from '@/components/ui/Input';
import { TableWrap, Th, Td, Tr } from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface IndexJob {
  id: string;
  type: string;
  documentTitle: string | null;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}
interface FallbackLog {
  id: string;
  query: string;
  language: string;
  createdAt: number;
}
interface SearchHit {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  text: string;
  score: number;
  sourceLocator: string | null;
}

function jobTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (s === 'done' || s === 'completed' || s === 'succeeded') return 'success';
  if (s === 'failed' || s === 'error') return 'danger';
  if (s === 'running' || s === 'processing') return 'primary';
  return 'neutral';
}

export default function AdminKbIndexStatusPage() {
  const [jobs, setJobs] = useState<IndexJob[] | null>(null);
  const [jobsErr, setJobsErr] = useState<string | null>(null);
  const [fallbacks, setFallbacks] = useState<FallbackLog[] | null>(null);
  const [fallbacksErr, setFallbacksErr] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);

  async function loadJobs() {
    try {
      const d = await api.get<IndexJob[]>('/admin/kb/jobs', { realm: 'admin' });
      setJobs(d);
    } catch (err) {
      setJobsErr(err instanceof ApiError ? err.message : 'Failed to load jobs.');
    }
  }

  async function reindexAll() {
    if (!window.confirm('Re-index the entire knowledge base? This re-embeds every document and may take a few minutes.')) {
      return;
    }
    setReindexing(true);
    setReindexMsg(null);
    try {
      const res = await api.post<{ documents: number; jobs: number }>(
        '/admin/kb/documents/reindex-all',
        {},
        { realm: 'admin' },
      );
      setReindexMsg(`Queued re-indexing for ${res.documents} document(s).`);
      await loadJobs();
    } catch (err) {
      setReindexMsg(err instanceof ApiError ? err.message : 'Re-index request failed.');
    } finally {
      setReindexing(false);
    }
  }

  useEffect(() => {
    loadJobs();
    (async () => {
      try {
        const d = await api.get<FallbackLog[]>('/admin/chat-logs', {
          realm: 'admin',
          query: { 'filter[isFallback]': 'true', limit: 25 },
        });
        setFallbacks(d);
      } catch (err) {
        setFallbacksErr(err instanceof ApiError ? err.message : 'Failed to load chat logs.');
      }
    })();
  }, []);

  return (
    <>
      <AdminPageHeader
        title="Indexing & RAG"
        description="Monitor index jobs, find knowledge gaps, and test retrieval."
        actions={
          <Button variant="secondary" onClick={reindexAll} loading={reindexing}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Re-index all
          </Button>
        }
      />

      {reindexMsg && (
        <div role="status" className="mb-4 rounded-sm border border-primary-600/30 bg-primary-50 px-3.5 py-2.5 text-sm text-primary-700">
          {reindexMsg}
        </div>
      )}

      <SearchTest />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Index jobs */}
        <Card>
          <CardBody>
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary-600" />
              <CardTitle>Recent indexing jobs</CardTitle>
            </div>
            {jobsErr ? (
              <EmptyState title="Could not load jobs" description={jobsErr} />
            ) : !jobs ? (
              <Skeleton className="h-56 rounded-md" />
            ) : jobs.length === 0 ? (
              <p className="text-sm text-ink-3">No indexing jobs yet.</p>
            ) : (
              <TableWrap className="min-w-0">
                <thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Job</Th>
                    <Th>Status</Th>
                    <Th>When</Th>
                  </Tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <Tr key={j.id}>
                      <Td>
                        <div className="font-medium text-ink">{j.documentTitle ?? j.type}</div>
                        <div className="text-xs text-ink-3">
                          {j.type}
                          {j.attempts > 1 ? ` · attempt ${j.attempts}` : ''}
                          {j.error ? ` · ${j.error}` : ''}
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={jobTone(j.status)}>{j.status}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-ink-3">
                        {formatRelative(j.finishedAt ?? j.createdAt)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </CardBody>
        </Card>

        {/* Fallback / KB-gap analysis */}
        <Card>
          <CardBody>
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-accent" />
              <CardTitle>Knowledge gaps</CardTitle>
            </div>
            <p className="mb-4 text-sm text-ink-3">
              Questions that returned the fallback — candidates for new sources.
            </p>
            {fallbacksErr ? (
              <EmptyState title="Could not load chat logs" description={fallbacksErr} />
            ) : !fallbacks ? (
              <Skeleton className="h-56 rounded-md" />
            ) : fallbacks.length === 0 ? (
              <EmptyState title="No gaps found" description="The bot answered every recent question from the KB." />
            ) : (
              <ul className="divide-y divide-border">
                {fallbacks.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3 py-2.5">
                    <p className="min-w-0 flex-1 text-sm text-ink-2">{f.query}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone="neutral">{f.language.toUpperCase()}</Badge>
                      <span className="text-xs text-ink-3">{formatRelative(f.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function SearchTest() {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('en');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ hits: SearchHit[] }>(
        '/admin/kb/search-test',
        { query: query.trim(), language },
        { realm: 'admin' },
      );
      setHits(res.hits ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search test failed.');
      setHits(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary-600" />
          <CardTitle>Retrieval test</CardTitle>
        </div>
        <form onSubmit={run} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Query" htmlFor="rag-query">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <Input
                  id="rag-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What would a user ask?"
                  className="pl-10"
                />
              </div>
            </Field>
          </div>
          <Field label="Language" htmlFor="rag-lang">
            <Select id="rag-lang" value={language} onChange={(e) => setLanguage(e.target.value)} className="sm:w-36">
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
              <option value="mr">मराठी</option>
            </Select>
          </Field>
          <Button type="submit" loading={loading} className="sm:mb-0">
            Run test
          </Button>
        </form>

        {error && (
          <div role="alert" className="mt-4 rounded-sm border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}

        {hits != null && (
          <div className="mt-5">
            {hits.length === 0 ? (
              <div className="rounded-md border border-accent/30 bg-accent-soft/50 px-4 py-3 text-sm text-[#9a5a07]">
                No chunks passed the score floor — this query would return the fallback message. Consider adding a
                source.
              </div>
            ) : (
              <ul className="space-y-3">
                {hits.map((h, i) => (
                  <li key={h.chunkId} className="rounded-md border border-border bg-surface-sunk/40 p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {i + 1}. {h.documentTitle}
                        {h.sourceLocator ? ` · ${h.sourceLocator}` : ''}
                      </span>
                      <Badge tone={h.score >= 0.4 ? 'success' : h.score >= 0.2 ? 'neutral' : 'danger'}>
                        {h.score.toFixed(3)}
                      </Badge>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm text-ink-2">{h.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
