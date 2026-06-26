import { useTranslations } from 'next-intl';
import { ShieldCheck, Languages, Compass, HeartHandshake, Info, ArrowRight, type LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/Button';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';

const VALUES: { key: string; icon: LucideIcon }[] = [
  { key: 'grounded', icon: ShieldCheck },
  { key: 'multilingual', icon: Languages },
  { key: 'honest', icon: Compass },
  { key: 'calm', icon: HeartHandshake },
];

export default function AboutPage() {
  const t = useTranslations('about');
  const td = useTranslations('disclaimer');

  return (
    <>
      {/* Hero band */}
      <section className="relative overflow-hidden bg-[image:var(--gradient-ink)] py-20 text-on-dark sm:py-24">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          aria-hidden
          style={{
            background:
              'radial-gradient(50% 60% at 30% 0%, rgba(56,192,168,0.20) 0%, transparent 70%), radial-gradient(40% 50% at 90% 30%, rgba(232,136,26,0.16) 0%, transparent 70%)',
          }}
        />
        <div className="container-page max-w-3xl">
          <p className="eyebrow text-accent-400">{t('eyebrow')}</p>
          <h1 className="font-display mt-4 text-balance text-4xl tracking-tight text-on-dark sm:text-5xl">{t('title')}</h1>
          <p className="mt-5 text-lg leading-relaxed text-on-dark/85">{t('lead')}</p>
        </div>
      </section>

      {/* Mission */}
      <section className="container-page max-w-3xl section-pad">
        <h2 className="font-display text-2xl tracking-tight text-primary sm:text-3xl">{t('missionTitle')}</h2>
        <p className="mt-5 text-[1.05rem] leading-relaxed text-ink-2">{t('missionBody')}</p>
      </section>

      {/* Values */}
      <section className="bg-surface-sunk/60 section-pad">
        <div className="container-page">
          <h2 className="font-display text-center text-2xl tracking-tight text-primary sm:text-3xl lg:text-4xl">{t('valuesTitle')}</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {VALUES.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="flex gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-lg"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-primary">{t(`values.${key}.title`)}</h3>
                  <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-2">{t(`values.${key}.body`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Disclaimer note */}
      <section className="container-page max-w-3xl section-pad">
        <div className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Info className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-semibold tracking-tight text-primary">{t('disclaimerTitle')}</h2>
          </div>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-ink-2">{td('full')}</p>
          <a
            href={OFFICIAL_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600"
          >
            {td('visitOfficial')}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* CTA band */}
      <section className="container-page pb-24">
        <div className="relative isolate overflow-hidden rounded-2xl bg-[image:var(--gradient-ink)] px-6 py-16 text-center text-on-dark shadow-xl sm:px-12 sm:py-20">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-70"
            aria-hidden
            style={{
              background:
                'radial-gradient(60% 70% at 50% 0%, rgba(56,192,168,0.22) 0%, transparent 70%), radial-gradient(40% 60% at 85% 30%, rgba(232,136,26,0.18) 0%, transparent 70%)',
            }}
          />
          <h2 className="font-display text-3xl tracking-tight text-on-dark sm:text-4xl lg:text-5xl">{t('ctaTitle')}</h2>
          <div className="mt-9 flex justify-center">
            <Link href="/auth/signup" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'group')}>
              {t('ctaButton')}
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
