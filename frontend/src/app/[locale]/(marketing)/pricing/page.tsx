import { useTranslations } from 'next-intl';
import { CreditCard, CalendarClock, ShieldCheck } from 'lucide-react';
import { AdBannerSlot } from '@/components/banner/AdBannerSlot';
import { PlanCards } from '@/components/marketing/PlanCards';
import { FaqAccordion, type FaqItem } from '@/components/marketing/FaqAccordion';

const FAQ_COUNT = 4;

export default function PricingPage() {
  const t = useTranslations('pricing');

  const faqItems: FaqItem[] = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    q: t(`faq.items.${i}.q`),
    a: t(`faq.items.${i}.a`),
  }));

  return (
    <div className="relative overflow-hidden">
      {/* Soft brand glow + dot grid fading out behind the header. */}
      <div className="glow-brand pointer-events-none absolute inset-0 -z-10 opacity-70" aria-hidden />
      <div
        className="bg-dots pointer-events-none absolute inset-x-0 top-0 -z-10 h-[380px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        aria-hidden
      />

      <div className="container-page section-pad">
        {/* Header */}
        <header className="mx-auto max-w-2xl text-center animate-fade-up">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className="font-display mt-3 text-[clamp(2.25rem,5vw,3.5rem)] font-bold leading-[1.05] tracking-tight text-primary">
            {t('title')}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{t('subtitle')}</p>
        </header>

        {/* Plans */}
        <div className="mt-14 animate-fade-up [animation-delay:80ms]">
          <PlanCards variant="full" />
        </div>

        {/* Payment + validity notes */}
        <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
          <Note icon={<CalendarClock className="h-5 w-5" />} text={t('validityNote')} />
          <Note icon={<CreditCard className="h-5 w-5" />} text={t('paymentNote')} />
          <Note
            icon={<ShieldCheck className="h-5 w-5" />}
            text="Cancel anytime. Your guidance and saved profile carry over across plans."
          />
        </div>

        <div className="mx-auto mt-16 max-w-3xl">
          <AdBannerSlot placement="home_mid" />
        </div>

        {/* Hairline divider into the FAQ. */}
        <div className="rule mx-auto mt-16 max-w-3xl" aria-hidden />

        {/* Pricing FAQ */}
        <section className="mx-auto mt-16 max-w-3xl">
          <div className="mb-8 text-center">
            <p className="eyebrow">FAQ</p>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-primary sm:text-4xl">
              {t('faqTitle')}
            </h2>
          </div>
          <FaqAccordion items={faqItems} />
        </section>
      </div>
    </div>
  );
}

function Note({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3.5 rounded-xl border border-border bg-surface p-5 shadow-sm transition duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        {icon}
      </span>
      <p className="text-sm leading-relaxed text-ink-2">{text}</p>
    </div>
  );
}
