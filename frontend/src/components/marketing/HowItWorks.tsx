import { useTranslations } from 'next-intl';
import { MessageSquareText, ShieldCheck, Compass } from 'lucide-react';

const STEPS = [
  { key: 'step1', icon: MessageSquareText },
  { key: 'step2', icon: ShieldCheck },
  { key: 'step3', icon: Compass },
] as const;

/** Three numbered steps explaining the flow. Anchored for the hero's secondary CTA (#how). */
export function HowItWorks() {
  const t = useTranslations('landing.how');

  return (
    <section id="how" className="relative scroll-mt-24 overflow-hidden bg-surface-sunk/60 section-pad">
      <div className="bg-dots pointer-events-none absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]" aria-hidden />
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="font-display mt-4 text-3xl tracking-tight text-primary sm:text-4xl lg:text-5xl">
            {t('title')}
          </h2>
        </div>

        <ol className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-6">
          {/* connecting line behind the nodes (desktop) */}
          <span
            aria-hidden
            className="absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent md:block"
          />
          {STEPS.map(({ key, icon: Icon }, i) => (
            <li key={key} className="relative flex flex-col items-center text-center">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface shadow-md">
                <Icon className="h-7 w-7 text-primary-600" />
                <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-accent px-1.5 font-mono text-xs font-semibold text-accent-ink shadow-[var(--shadow-accent)]">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold tracking-tight text-primary">{t(`${key}.title`)}</h3>
              <p className="mt-2.5 max-w-xs text-[0.95rem] leading-relaxed text-ink-2">{t(`${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
