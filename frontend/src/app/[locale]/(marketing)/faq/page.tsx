import { useTranslations } from 'next-intl';
import { MessageCircleQuestion } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/Button';
import { FaqAccordion, type FaqItem } from '@/components/marketing/FaqAccordion';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';

const FAQ_COUNT = 6;

export default function FaqPage() {
  const t = useTranslations('faq');
  const td = useTranslations('disclaimer');

  const items: FaqItem[] = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    q: t(`items.${i}.q`),
    a: t(`items.${i}.a`),
  }));

  return (
    <div className="container-page py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 className="font-display mt-4 text-4xl tracking-tight text-primary sm:text-5xl">{t('title')}</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{t('subtitle')}</p>
        </div>

        <div className="mt-12">
          <FaqAccordion items={items} />
        </div>

        {/* Reassurance: guidance, not the official portal. */}
        <p className="mt-6 text-center text-sm text-ink-3">
          {td('short')}{' '}
          <a href={OFFICIAL_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="font-medium">
            {td('visitOfficial')}
          </a>
        </p>

        <div className="mt-14 flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <MessageCircleQuestion className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-primary">{t('stillStuck')}</h2>
            <p className="mt-1 text-sm text-ink-2">{t('stillStuckBody')}</p>
          </div>
          <Link href="/contact" className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}>
            {t('contactUs')}
          </Link>
        </div>
      </div>
    </div>
  );
}
