import { useTranslations } from 'next-intl';
import { ShieldCheck, Languages, FileText, Compass, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/Button';
import { AdBannerSlot } from '@/components/banner/AdBannerSlot';
import { Hero } from '@/components/marketing/Hero';
import { FeatureSection } from '@/components/marketing/FeatureSection';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { JourneyShowcase } from '@/components/marketing/JourneyShowcase';
import { PlanCards } from '@/components/marketing/PlanCards';
import { TestimonialCarousel } from '@/components/marketing/TestimonialCarousel';
import { cn } from '@/lib/utils';

export default function LandingPage() {
  return (
    <>
      <Hero />

      <div className="container-page pt-8">
        <AdBannerSlot placement="home_top" />
      </div>

      <TrustStrip />
      <FeatureSection />
      <HowItWorks />
      <JourneyShowcase />

      <div className="container-page py-10">
        <AdBannerSlot placement="home_mid" />
      </div>

      <PlansTeaserSection />

      <div className="container-page">
        <div className="rule" />
      </div>

      <TestimonialCarousel />
      <FinalCta />
    </>
  );
}

const TRUST_ITEMS = [
  { key: 'kbOnly', icon: ShieldCheck },
  { key: 'languages', icon: Languages },
  { key: 'sources', icon: FileText },
  { key: 'official', icon: Compass },
] as const;

function TrustStrip() {
  const t = useTranslations('landing.trust');
  return (
    <section className="border-y border-border bg-surface">
      <div className="container-page grid gap-x-8 gap-y-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_ITEMS.map(({ key, icon: Icon }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-ink-2">{t(key)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlansTeaserSection() {
  const t = useTranslations('landing.plansTeaser');
  return (
    <section className="container-page section-pad">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="font-display mt-4 text-3xl tracking-tight text-primary sm:text-4xl lg:text-5xl">{t('title')}</h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">{t('subtitle')}</p>
      </div>
      <PlanCards variant="teaser" />
      <div className="mt-12 flex justify-center">
        <Link
          href="/pricing"
          className={cn(buttonVariants({ variant: 'link', size: 'md' }), 'group gap-1.5')}
        >
          Compare all plans
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}

function FinalCta() {
  const t = useTranslations('landing.cta');
  const tn = useTranslations('landing');
  return (
    <section className="container-page pb-24">
      <div className="relative isolate overflow-hidden rounded-2xl bg-[image:var(--gradient-ink)] px-6 py-16 text-center text-on-dark shadow-xl sm:px-12 sm:py-20">
        {/* glow + dot backdrop */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          aria-hidden
          style={{
            background:
              'radial-gradient(60% 70% at 50% 0%, rgba(56,192,168,0.22) 0%, transparent 70%), radial-gradient(40% 60% at 85% 30%, rgba(232,136,26,0.18) 0%, transparent 70%)',
          }}
        />
        <div
          className="bg-dots pointer-events-none absolute inset-0 -z-10 opacity-[0.1] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]"
          aria-hidden
        />
        <h2 className="font-display mx-auto max-w-2xl text-3xl tracking-tight text-on-dark sm:text-4xl lg:text-5xl">
          {t('title')}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-on-dark/80">{t('subtitle')}</p>
        <div className="mt-9 flex justify-center">
          <Link href="/auth/signup" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'group')}>
            {t('button')}
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <p className="mt-5 text-sm text-on-dark/65">{tn('ctaSecondaryNote')}</p>
      </div>
    </section>
  );
}
