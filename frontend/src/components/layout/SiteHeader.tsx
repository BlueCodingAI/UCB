'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export function SiteHeader() {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { href: '/', label: t('home') },
    { href: '/features', label: t('features') },
    { href: '/pricing', label: t('pricing') },
    { href: '/faq', label: t('faq') },
    { href: '/about', label: t('about') },
  ] as const;

  return (
    <header className="sticky top-0 z-40">
      <div
        className={cn(
          'transition-all duration-300',
          scrolled ? 'glass border-b border-border shadow-sm' : 'border-b border-transparent bg-transparent',
        )}
      >
        <div className="container-page flex h-[68px] items-center justify-between gap-4">
          <Link href="/" aria-label="Disha home" className="transition hover:opacity-80">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-pill px-3.5 py-2 text-sm font-medium text-ink-2 transition hover:bg-surface-sunk hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <LanguageSwitcher />
            <ThemeToggle />
            <span className="mx-1 h-5 w-px bg-border" />
            {user ? (
              <Link href="/app" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                Open app
              </Link>
            ) : (
              <>
                <Link href="/auth/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                  {tc('login')}
                </Link>
                <Link href="/auth/signup" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                  {tc('getStarted')}
                </Link>
              </>
            )}
          </div>

          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-2 hover:bg-surface-sunk md:hidden"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="glass border-b border-border md:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-base font-medium text-ink-2 hover:bg-surface-sunk"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {user ? (
                <Link href="/app" className={cn(buttonVariants({ variant: 'primary' }), 'w-full')}>
                  Open app
                </Link>
              ) : (
                <>
                  <Link href="/auth/login" className={cn(buttonVariants({ variant: 'secondary' }), 'w-full')}>
                    {tc('login')}
                  </Link>
                  <Link href="/auth/signup" className={cn(buttonVariants({ variant: 'primary' }), 'w-full')}>
                    {tc('getStarted')}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
