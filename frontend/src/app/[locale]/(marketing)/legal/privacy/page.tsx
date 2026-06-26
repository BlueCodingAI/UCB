import { useTranslations } from 'next-intl';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';

const SECTION_COUNT = 7;

export default function PrivacyPage() {
  const t = useTranslations('legal.privacy');
  const tl = useTranslations('legal');
  const td = useTranslations('disclaimer');

  return (
    <div className="container-page max-w-3xl py-16 sm:py-20">
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className="font-display mt-4 text-4xl tracking-tight text-primary sm:text-5xl">{t('title')}</h1>
      <p className="mt-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        {tl('lastUpdated')}: {tl('lastUpdatedValue')}
      </p>
      <p className="mt-7 text-[1.1rem] leading-relaxed text-ink-2">{t('intro')}</p>

      <div className="rule mt-10" />

      <div className="mt-10 space-y-10">
        {Array.from({ length: SECTION_COUNT }, (_, i) => (
          <section key={i}>
            <h2 className="font-display text-xl tracking-tight text-primary">{t(`sections.${i}.h`)}</h2>
            <p className="mt-3 text-[1.02rem] leading-[1.8] text-ink-2">{t(`sections.${i}.p`)}</p>
          </section>
        ))}
      </div>

      <p className="mt-14 rounded-xl border border-border bg-surface-sunk/60 p-6 text-sm leading-relaxed text-ink-3 shadow-xs">
        {td('full')}{' '}
        <a href={OFFICIAL_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="font-medium">
          {td('visitOfficial')}
        </a>
      </p>
    </div>
  );
}
