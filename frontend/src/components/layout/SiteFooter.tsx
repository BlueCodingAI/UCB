import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Logo } from './Logo';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';

export function SiteFooter() {
  const t = useTranslations('footer');
  const tn = useTranslations('nav');

  return (
    <footer className="mt-24 bg-surface">
      <div className="container-page">
        <div className="rule" />
      </div>

      <div className="container-page grid gap-12 py-14 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-ink-3">{t('disclaimer')}</p>
          <a
            href={OFFICIAL_SOURCE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 text-sm font-medium text-primary-600 shadow-xs transition hover:border-border-strong hover:shadow-sm"
          >
            cetcell.mahacet.org <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div>
          <p className="eyebrow">{t('product')}</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/features" className="text-ink-2 transition hover:text-primary-600">{tn('features')}</Link></li>
            <li><Link href="/pricing" className="text-ink-2 transition hover:text-primary-600">{tn('pricing')}</Link></li>
            <li><Link href="/faq" className="text-ink-2 transition hover:text-primary-600">{tn('faq')}</Link></li>
          </ul>
        </div>

        <div>
          <p className="eyebrow">{t('company')}</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/about" className="text-ink-2 transition hover:text-primary-600">{tn('about')}</Link></li>
            <li><Link href="/contact" className="text-ink-2 transition hover:text-primary-600">{t('contact')}</Link></li>
          </ul>
        </div>

        <div>
          <p className="eyebrow">{t('legal')}</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/legal/terms" className="text-ink-2 transition hover:text-primary-600">{t('terms')}</Link></li>
            <li><Link href="/legal/privacy" className="text-ink-2 transition hover:text-primary-600">{t('privacy')}</Link></li>
            <li><Link href="/legal/refund" className="text-ink-2 transition hover:text-primary-600">{t('refund')}</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-sm text-ink-3 sm:flex-row">
          <p>© {new Date().getFullYear()} Disha. {t('rights')}</p>
          <p className="font-mono text-[0.72rem] uppercase tracking-wider">Maharashtra CAP · EN · हिं · मरा</p>
        </div>
      </div>
    </footer>
  );
}
