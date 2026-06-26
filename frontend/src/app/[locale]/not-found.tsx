import { useTranslations } from 'next-intl';
import { Compass, Home, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export default function NotFound() {
  const t = useTranslations('notFound');

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 py-20">
      <div className="mx-auto max-w-md text-center">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent shadow-accent">
          <Compass className="h-9 w-9" />
        </span>
        <p className="font-display mt-8 text-6xl text-primary">{t('code')}</p>
        <h1 className="font-display mt-3 text-2xl text-primary sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-ink-2">{t('body')}</p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/" className={buttonVariants({ variant: 'primary', size: 'md' })}>
            <Home className="h-4 w-4" />
            {t('home')}
          </Link>
          <Link href="/features" className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}>
            <Sparkles className="h-4 w-4" />
            {t('explore')}
          </Link>
        </div>
      </div>
    </div>
  );
}
