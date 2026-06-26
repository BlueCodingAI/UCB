import { useTranslations } from 'next-intl';
import { ArrowRight, ShieldCheck, Languages, Quote, Sparkles, Mic } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export function Hero() {
  const t = useTranslations('landing.hero');
  const tt = useTranslations('landing.trust');

  return (
    <section className="relative overflow-hidden">
      {/* Backdrop: soft brand glow + dot grid fading out. */}
      <div className="glow-brand pointer-events-none absolute inset-0 -z-10" aria-hidden />
      <div
        className="bg-dots pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        aria-hidden
      />

      <div className="container-page grid items-center gap-12 pb-16 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-24 lg:pt-20">
        {/* Left: copy */}
        <div className="animate-fade-up">
          <span className="pill">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            {t('eyebrow')}
          </span>

          <h1 className="font-display mt-6 text-[clamp(2.5rem,6vw,4.25rem)] font-bold leading-[1.02] tracking-tight text-primary">
            {t('title')}
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{t('subtitle')}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/auth/signup" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
              {t('ctaPrimary')} <ArrowRight className="h-[18px] w-[18px]" />
            </Link>
            <Link href="#how" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
              {t('ctaSecondary')}
            </Link>
          </div>

          {/* Trust row */}
          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-ink-3">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary-600" /> {tt('kbOnly')}
            </span>
            <span className="inline-flex items-center gap-2">
              <Languages className="h-4 w-4 text-primary-600" /> {tt('languages')}
            </span>
            <span className="inline-flex items-center gap-2">
              <Quote className="h-4 w-4 text-primary-600" /> {tt('sources')}
            </span>
          </div>
        </div>

        {/* Right: floating product preview (a grounded chat exchange). */}
        <div className="relative animate-fade-up [animation-delay:120ms]">
          <div
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-[image:var(--gradient-brand)] opacity-[0.12] blur-2xl"
            aria-hidden
          />
          <HeroChatPreview />
        </div>
      </div>
    </section>
  );
}

function HeroChatPreview() {
  return (
    <div className="mx-auto w-full max-w-md animate-float rounded-2xl border border-border bg-surface/95 p-4 shadow-xl backdrop-blur">
      {/* window chrome */}
      <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        <span className="ml-2 font-mono text-[0.68rem] uppercase tracking-wider text-ink-3">Disha · CAP chat</span>
        <span className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-600/10 text-primary-600">
          <Mic className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* user bubble */}
      <div className="mb-3 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary-600 px-3.5 py-2 text-sm leading-relaxed text-white shadow-sm">
          When is the option form deadline?
        </div>
      </div>

      {/* bot bubble + citation */}
      <div className="flex flex-col items-start gap-2">
        <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-surface-sunk px-3.5 py-2.5 text-sm leading-relaxed text-ink">
          Fill and <strong className="font-semibold">lock your option form by 5 Aug, 5:00 PM</strong>. Allotment in each round is based on merit, category and your locked preferences.
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1 font-mono text-[0.66rem] text-primary-600 ring-1 ring-border">
          <Quote className="h-3 w-3" />
          CAP 2026 Brochure · p.12
        </div>
      </div>

      {/* composer */}
      <div className="mt-4 flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-2">
        <span className="flex-1 text-sm text-ink-3">Ask in English, हिंदी or मराठी…</span>
        <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink')}>
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}
