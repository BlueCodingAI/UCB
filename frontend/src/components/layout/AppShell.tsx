'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  MessageSquare,
  Mic,
  ListChecks,
  Users,
  Bell,
  FileText,
  Lock,
  LogOut,
  Settings,
  CreditCard,
  User as UserIcon,
} from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/app', key: 'dashboard', icon: LayoutDashboard, exact: true },
  { href: '/app/chat', key: 'chat', icon: MessageSquare },
  { href: '/app/voice', key: 'voice', icon: Mic },
  { href: '/app/next-steps', key: 'nextSteps', icon: ListChecks, premium: true },
  { href: '/app/counselling', key: 'counselling', icon: Users, premium: true },
  { href: '/app/notices', key: 'notices', icon: FileText },
] as const;

const MOBILE_TABS = [
  { href: '/app', key: 'dashboard', icon: LayoutDashboard, exact: true },
  { href: '/app/chat', key: 'chat', icon: MessageSquare },
  { href: '/app/voice', key: 'voice', icon: Mic },
  { href: '/app/counselling', key: 'counselling', icon: Users },
  { href: '/app/profile', key: 'profile', icon: UserIcon },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('appNav');
  const tc = useTranslations('common');
  const tp = useTranslations('plan');
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/auth/login');
  }, [loading, user, router]);

  if (loading) return <FullPageSpinner />;
  if (!user) return <FullPageSpinner />;

  const isFreemium = user.currentPlanCode === 'freemium';
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  async function onLogout() {
    await logout();
    router.replace('/');
  }

  return (
    <div className="min-h-screen bg-ground">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link href="/app" aria-label="Disha" className="transition hover:opacity-80">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, 'exact' in item ? item.exact : false);
            const locked = 'premium' in item && item.premium && isFreemium;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition',
                  active
                    ? 'bg-primary-600/10 text-primary-700'
                    : 'text-ink-2 hover:bg-surface-sunk hover:text-ink',
                )}
              >
                {/* Left accent indicator on the active item. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-pill bg-primary-600 transition-opacity',
                    active ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary-600' : 'text-ink-3 group-hover:text-ink-2')} />
                <span className="flex-1">{t(item.key)}</span>
                {locked && <Lock className="h-3.5 w-3.5 text-ink-3" />}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          {isFreemium ? (
            <Link href="/app/billing/upgrade" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'w-full')}>
              {tc('upgrade')}
            </Link>
          ) : (
            <Badge tone="primary" className="w-full justify-center py-2">
              {tp(user.currentPlanCode)}
            </Badge>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
          <div className="lg:hidden">
            <Link href="/app" aria-label="Disha" className="transition hover:opacity-80">
              <Logo />
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle />
            <Link
              href="/app/notifications"
              aria-label={t('notifications')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-sunk hover:text-ink"
            >
              <Bell className="h-5 w-5" />
            </Link>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-pill p-0.5 ring-1 ring-transparent transition hover:bg-surface-sunk hover:ring-border"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Avatar name={user.fullName ?? user.email} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-56 origin-top-right animate-fade-up overflow-hidden rounded-xl border border-border bg-surface shadow-xl [animation-duration:0.18s]">
                    <div className="border-b border-border bg-surface-sunk/40 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-ink">{user.fullName ?? tc('appName')}</p>
                      <p className="truncate text-xs text-ink-3">{user.email ?? user.mobile}</p>
                    </div>
                    <MenuLink href="/app/profile" icon={UserIcon} label={t('profile')} onClick={() => setMenuOpen(false)} />
                    <MenuLink href="/app/settings" icon={Settings} label={t('settings')} onClick={() => setMenuOpen(false)} />
                    <MenuLink href="/app/billing" icon={CreditCard} label={t('billing')} onClick={() => setMenuOpen(false)} />
                    <div className="my-1 h-px bg-border" aria-hidden />
                    <button
                      onClick={onLogout}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-danger transition hover:bg-danger/5"
                    >
                      <LogOut className="h-4 w-4" /> {tc('logout')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="container-page py-6 pb-24 lg:pb-10">{children}</main>
      </div>

      {/* Bottom tabs (mobile) */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_TABS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, 'exact' in item ? item.exact : false);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[0.68rem] font-medium transition',
                active ? 'text-primary-700' : 'text-ink-3 hover:text-ink-2',
              )}
            >
              {active && (
                <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-b-pill bg-primary-600" />
              )}
              <Icon className={cn('h-5 w-5', active && 'text-primary-600')} />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: typeof UserIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink-2 hover:bg-surface-sunk">
      <Icon className="h-4 w-4" /> {label}
    </Link>
  );
}
