'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Button, Card, CardBody, CardTitle, Field, Input, Select, Skeleton, useToast } from '@/components/ui';
import { PageHeading } from '@/components/common/PageHeading';
import { UpsellCard } from '@/components/common/UpsellCard';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { CAP_STAGES, LOCALE_NAMES } from '@/lib/constants';
import type { CapStage, Locale, User } from '@/lib/types';

interface CapProfile {
  category: string | null;
  cetExam: string | null;
  cetScore: number | null;
  cetPercentile: number | null;
  meritNumber: number | null;
  courseInterest: string | null;
  currentStage: CapStage | null;
  preferredDistricts: string | null;
  preferredColleges: string | null;
}

export default function ProfilePage() {
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const isPremium = user ? user.currentPlanCode !== 'freemium' : false;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Account"
        title="Your profile"
        subtitle="Keep your details up to date so your guidance stays accurate."
      />
      <AccountSection
        user={user}
        locale={locale}
        onSaved={() => {
          void refreshUser();
          toast('Profile updated.', 'success');
        }}
      />
      <CapSection isPremium={isPremium} locale={locale} onToast={(m, t) => toast(m, t)} />
    </div>
  );
}

function AccountSection({
  user,
  locale,
  onSaved,
}: {
  user: User | null;
  locale: Locale;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    fullName: '',
    preferredLanguage: 'en' as Locale,
    locationCity: '',
    locationDistrict: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      fullName: user.fullName ?? '',
      preferredLanguage: user.preferredLanguage,
      locationCity: user.locationCity ?? '',
      locationDistrict: user.locationDistrict ?? '',
    });
  }, [user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/profile', {
        fullName: form.fullName.trim() || null,
        preferredLanguage: form.preferredLanguage,
        locationCity: form.locationCity.trim() || null,
        locationDistrict: form.locationDistrict.trim() || null,
      });
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your profile.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return <Skeleton className="h-72 w-full rounded-lg" />;
  }

  return (
    <Card>
      <CardBody>
        <CardTitle className="mb-4">Account details</CardTitle>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Full name" htmlFor="fullName">
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Your name"
              />
            </Field>
          </div>
          <Field label="Preferred language" htmlFor="lang">
            <Select
              id="lang"
              value={form.preferredLanguage}
              onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value as Locale })}
            >
              {(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="hidden sm:block" aria-hidden />
          <Field label="City" htmlFor="city">
            <Input
              id="city"
              value={form.locationCity}
              onChange={(e) => setForm({ ...form, locationCity: e.target.value })}
              placeholder="e.g. Pune"
            />
          </Field>
          <Field label="District" htmlFor="district">
            <Input
              id="district"
              value={form.locationDistrict}
              onChange={(e) => setForm({ ...form, locationDistrict: e.target.value })}
              placeholder="e.g. Pune"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Email">
              <Input value={user.email ?? '—'} disabled />
            </Field>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="primary" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

const EMPTY_CAP: CapProfile = {
  category: null,
  cetExam: null,
  cetScore: null,
  cetPercentile: null,
  meritNumber: null,
  courseInterest: null,
  currentStage: null,
  preferredDistricts: null,
  preferredColleges: null,
};

function CapSection({
  isPremium,
  locale,
  onToast,
}: {
  isPremium: boolean;
  locale: Locale;
  onToast: (m: string, t: 'success' | 'error') => void;
}) {
  const [form, setForm] = useState<CapProfile>(EMPTY_CAP);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isPremium) {
      setLocked(true);
      setLoading(false);
      return;
    }
    let active = true;
    api
      .get<CapProfile>('/profile/cap')
      .then((p) => active && setForm({ ...EMPTY_CAP, ...p }))
      .catch((e) => {
        if (e instanceof ApiError && (e.code === 'plan_required' || e.status === 403)) setLocked(true);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [isPremium]);

  function num(v: string): number | null {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/profile/cap', {
        category: form.category?.trim() || null,
        cetExam: form.cetExam?.trim() || null,
        cetScore: form.cetScore,
        cetPercentile: form.cetPercentile,
        meritNumber: form.meritNumber,
        courseInterest: form.courseInterest?.trim() || null,
        currentStage: form.currentStage,
        preferredDistricts: form.preferredDistricts?.trim() || null,
        preferredColleges: form.preferredColleges?.trim() || null,
      });
      onToast('CAP profile saved.', 'success');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not save your CAP profile.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (locked) {
    return (
      <UpsellCard
        title="Save your CAP profile with premium"
        body="Upgrade to store your CET scores, merit number and preferences so the bot and your next steps stay personalised."
      />
    );
  }

  if (loading) return <Skeleton className="h-96 w-full rounded-lg" />;

  return (
    <Card>
      <CardBody>
        <CardTitle className="mb-1">CAP profile</CardTitle>
        <p className="mb-4 text-sm text-ink-3">Used to personalise your answers and next steps. Nothing is shared with the official portal.</p>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <Input
              id="category"
              value={form.category ?? ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="e.g. OPEN, OBC, SC"
            />
          </Field>
          <Field label="CET exam" htmlFor="cetExam">
            <Input
              id="cetExam"
              value={form.cetExam ?? ''}
              onChange={(e) => setForm({ ...form, cetExam: e.target.value })}
              placeholder="e.g. MHT-CET"
            />
          </Field>
          <Field label="CET score" htmlFor="cetScore">
            <Input
              id="cetScore"
              type="number"
              inputMode="decimal"
              value={form.cetScore ?? ''}
              onChange={(e) => setForm({ ...form, cetScore: num(e.target.value) })}
            />
          </Field>
          <Field label="CET percentile" htmlFor="cetPercentile">
            <Input
              id="cetPercentile"
              type="number"
              inputMode="decimal"
              value={form.cetPercentile ?? ''}
              onChange={(e) => setForm({ ...form, cetPercentile: num(e.target.value) })}
            />
          </Field>
          <Field label="Merit number" htmlFor="meritNumber">
            <Input
              id="meritNumber"
              type="number"
              inputMode="numeric"
              value={form.meritNumber ?? ''}
              onChange={(e) => setForm({ ...form, meritNumber: num(e.target.value) })}
            />
          </Field>
          <Field label="Current stage" htmlFor="currentStage">
            <Select
              id="currentStage"
              value={form.currentStage ?? ''}
              onChange={(e) => setForm({ ...form, currentStage: (e.target.value || null) as CapStage | null })}
            >
              <option value="">Not started</option>
              {CAP_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s[locale]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Course interest" htmlFor="courseInterest">
              <Input
                id="courseInterest"
                value={form.courseInterest ?? ''}
                onChange={(e) => setForm({ ...form, courseInterest: e.target.value })}
                placeholder="e.g. Computer Engineering"
              />
            </Field>
          </div>
          <Field label="Preferred districts" htmlFor="preferredDistricts" hint="Comma-separated">
            <Input
              id="preferredDistricts"
              value={form.preferredDistricts ?? ''}
              onChange={(e) => setForm({ ...form, preferredDistricts: e.target.value })}
              placeholder="e.g. Pune, Mumbai"
            />
          </Field>
          <Field label="Preferred colleges" htmlFor="preferredColleges" hint="Comma-separated">
            <Input
              id="preferredColleges"
              value={form.preferredColleges ?? ''}
              onChange={(e) => setForm({ ...form, preferredColleges: e.target.value })}
              placeholder="College names"
            />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="primary" loading={saving}>
              Save CAP profile
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
