import { useTranslations } from 'next-intl';
import { Languages, ShieldCheck, ListChecks, Users, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: 'multilingual', icon: Languages },
  { key: 'grounded', icon: ShieldCheck },
  { key: 'nextSteps', icon: ListChecks },
  { key: 'counselling', icon: Users },
];

/** Landing feature grid — four pillars pulled from landing.features.*. */
export function FeatureSection() {
  const t = useTranslations('landing.features');

  return (
    <section className="container-page section-pad">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Disha</p>
        <h2 className="font-display mt-4 text-3xl tracking-tight text-primary sm:text-4xl lg:text-5xl">
          {t('title')}
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">{t('subtitle')}</p>
      </div>

      <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ key, icon: Icon }) => (
          <Card key={key} interactive className="group flex flex-col p-7">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 transition-colors duration-300 group-hover:bg-accent-soft group-hover:text-accent">
              <Icon className="h-6 w-6" />
            </span>
            <h3 className="mt-6 text-lg font-semibold tracking-tight text-primary">{t(`${key}.title`)}</h3>
            <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-2">{t(`${key}.body`)}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
