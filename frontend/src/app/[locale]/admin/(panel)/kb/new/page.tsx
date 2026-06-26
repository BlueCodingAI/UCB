'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, UploadCloud } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import type { KbDocument } from '@/lib/types';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

const SOURCE_TYPES = [
  { value: 'pdf', label: 'PDF file', input: 'file' },
  { value: 'google_sheet', label: 'Google Sheet', input: 'url' },
  { value: 'url', label: 'Web page (URL)', input: 'url' },
  { value: 'faq', label: 'FAQ', input: 'text' },
  { value: 'notice', label: 'Notice', input: 'text' },
  { value: 'circular', label: 'Circular', input: 'text' },
  { value: 'schedule', label: 'Schedule', input: 'text' },
  { value: 'counselling_note', label: 'Counselling note', input: 'text' },
  { value: 'manual_text', label: 'Manual text', input: 'text' },
] as const;

type InputKind = 'file' | 'url' | 'text';

export default function AdminKbNewPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [sourceType, setSourceType] = useState<string>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('en');
  const [course, setCourse] = useState('');
  const [capYear, setCapYear] = useState('');
  const [topic, setTopic] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputKind: InputKind = useMemo(
    () => SOURCE_TYPES.find((s) => s.value === sourceType)?.input ?? 'text',
    [sourceType],
  );

  function validate(): string | null {
    if (!title.trim()) return 'Please enter a title.';
    if (inputKind === 'file' && !file) return 'Please choose a PDF file to upload.';
    if (inputKind === 'url' && !url.trim()) return 'Please enter a URL.';
    if (inputKind === 'text' && !content.trim()) return 'Please enter the source content.';
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      let body: FormData | Record<string, unknown>;
      if (inputKind === 'file' && file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('sourceType', sourceType);
        fd.append('title', title.trim());
        if (description.trim()) fd.append('description', description.trim());
        fd.append('language', language);
        if (course.trim()) fd.append('course', course.trim());
        if (capYear.trim()) fd.append('capYear', capYear.trim());
        if (topic.trim()) fd.append('topic', topic.trim());
        fd.append('isActive', String(isActive));
        body = fd;
      } else {
        body = {
          sourceType,
          title: title.trim(),
          description: description.trim() || null,
          language,
          course: course.trim() || null,
          capYear: capYear.trim() ? Number(capYear) : null,
          topic: topic.trim() || null,
          isActive,
          ...(inputKind === 'url' ? { url: url.trim() } : { content: content.trim() }),
        };
      }
      const doc = await api.post<KbDocument>('/admin/kb/documents', body, { realm: 'admin' });
      toast('Source added — indexing started.', 'success');
      router.replace(`/admin/kb/${doc.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the source.');
      setSaving(false);
    }
  }

  return (
    <>
      <Link
        href="/admin/kb"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to library
      </Link>
      <AdminPageHeader title="Add source" description="Add knowledge the bot is allowed to answer from." />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3" noValidate>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardBody className="space-y-4">
              <Field label="Source type" htmlFor="source-type" required>
                <Select
                  id="source-type"
                  value={sourceType}
                  onChange={(e) => {
                    setSourceType(e.target.value);
                    setError(null);
                  }}
                >
                  {SOURCE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {inputKind === 'file' && (
                <Field label="PDF file" htmlFor="kb-file" required hint="Max one PDF per source.">
                  <label
                    htmlFor="kb-file"
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-sunk/40 px-4 py-8 text-center hover:border-primary-600"
                  >
                    <UploadCloud className="h-7 w-7 text-primary-600" />
                    <span className="text-sm font-medium text-ink">
                      {file ? file.name : 'Click to choose a PDF'}
                    </span>
                    <span className="text-xs text-ink-3">PDF only</span>
                    <input
                      id="kb-file"
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </Field>
              )}

              {inputKind === 'url' && (
                <Field
                  label={sourceType === 'google_sheet' ? 'Google Sheet URL' : 'URL'}
                  htmlFor="kb-url"
                  required
                  hint="We fetch and index the content from this link."
                >
                  <Input
                    id="kb-url"
                    type="url"
                    inputMode="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </Field>
              )}

              {inputKind === 'text' && (
                <Field label="Content" htmlFor="kb-content" required hint="Devanagari is fully supported.">
                  <Textarea
                    id="kb-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste the text the bot should answer from…"
                    className="min-h-[200px]"
                  />
                </Field>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-4">
              <h3 className="text-sm font-semibold text-primary">Metadata</h3>
              <Field label="Title" htmlFor="kb-title" required>
                <Input id="kb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CAP 2025 round 1 schedule" />
              </Field>
              <Field label="Description" htmlFor="kb-desc">
                <Textarea
                  id="kb-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[80px]"
                  placeholder="Short summary for admins (optional)"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Language" htmlFor="kb-lang" required>
                  <Select id="kb-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="en">English</option>
                    <option value="hi">हिन्दी</option>
                    <option value="mr">मराठी</option>
                    <option value="mixed">Mixed</option>
                  </Select>
                </Field>
                <Field label="Topic" htmlFor="kb-topic">
                  <Input id="kb-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. option form" />
                </Field>
                <Field label="Course" htmlFor="kb-course">
                  <Input id="kb-course" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="e.g. Engineering" />
                </Field>
                <Field label="CAP year" htmlFor="kb-year">
                  <Input
                    id="kb-year"
                    type="number"
                    inputMode="numeric"
                    value={capYear}
                    onChange={(e) => setCapYear(e.target.value)}
                    placeholder="2025"
                  />
                </Field>
              </div>
              <div className="flex items-center justify-between rounded-sm bg-surface-sunk/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">Active</p>
                  <p className="text-xs text-ink-3">Inactive sources are excluded from retrieval.</p>
                </div>
                <Switch checked={isActive} onChange={setIsActive} label="Active" />
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <p className="text-sm text-ink-2">
                After you save, indexing runs in the background. The source becomes answerable once its status
                turns <span className="font-medium text-primary-700">indexed</span>.
              </p>
              {error && (
                <div role="alert" className="rounded-sm border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                  {error}
                </div>
              )}
              <Button type="submit" loading={saving} className="w-full" size="lg">
                Add source
              </Button>
              <Link href="/admin/kb" className="block text-center text-sm text-ink-3 hover:text-ink">
                Cancel
              </Link>
            </CardBody>
          </Card>
        </div>
      </form>
    </>
  );
}
