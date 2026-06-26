import { useTranslations } from 'next-intl';
import {
  Languages,
  ShieldCheck,
  FileText,
  ListChecks,
  UserCircle,
  Users,
  Check,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/Button';
import { AdBannerSlot } from '@/components/banner/AdBannerSlot';
import { JourneyShowcase } from '@/components/marketing/JourneyShowcase';
import { cn } from '@/lib/utils';

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: 'multilingual', icon: Languages },
  { key: 'grounded', icon: ShieldCheck },
  { key: 'sources', icon: FileText },
  { key: 'nextSteps', icon: ListChecks },
  { key: 'profile', icon: UserCircle },
  { key: 'counselling', icon: Users },
];

const POINT_COUNT = 3;

export default function FeaturesPage() {
  const t = useTranslations('features');

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="glow-brand pointer-events-none absolute inset-0 -z-10 opacity-70" aria-hidden />
        <div className="container-page py-16 text-center sm:py-20">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className="font-display mx-auto mt-4 max-w-3xl text-balance text-4xl tracking-tight text-primary sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">{t('subtitle')}</p>
        </div>
      </section>

      <div className="container-page space-y-6 pb-4">
        {FEATURES.map(({ key, icon: Icon }, i) => (
          <article
            key={key}
            className="grid items-center gap-8 rounded-2xl border border-border bg-surface p-7 shadow-sm transition duration-300 hover:border-border-strong hover:shadow-md sm:p-10 lg:grid-cols-2"
          >
            <div className={cn(i % 2 === 1 && 'lg:order-2')}>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600">
                <Icon className="h-6 w-6" />
              </span>
              <h2 className="mt-6 text-2xl font-semibold tracking-tight text-primary">{t(`items.${key}.title`)}</h2>
              <p className="mt-3 text-[1.05rem] leading-relaxed text-ink-2">{t(`items.${key}.body`)}</p>
            </div>
            <ul className={cn('space-y-3 rounded-xl bg-surface-sunk/60 p-6 sm:p-7', i % 2 === 1 && 'lg:order-1')}>
              {Array.from({ length: POINT_COUNT }, (_, p) => (
                <li key={p} className="flex items-start gap-3 text-[0.95rem] text-ink">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-primary-700">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {t(`items.${key}.points.${p}`)}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="container-page py-10">
        <AdBannerSlot placement="home_mid" />
      </div>

      <JourneyShowcase />

      <section className="container-page section-pad text-center">
        <h2 className="font-display text-3xl tracking-tight text-primary sm:text-4xl lg:text-5xl">{t('cta.title')}</h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{t('cta.subtitle')}</p>
        <div className="mt-8 flex justify-center">
          <Link href="/auth/signup" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'group')}>
            {t('cta.button')}
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    </>
  );
}
