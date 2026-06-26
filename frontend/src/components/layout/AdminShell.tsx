'use client';

import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  PlusCircle,
  Activity,
  Headphones,
  CalendarClock,
  Megaphone,
  ImageIcon,
  Tag,
  Receipt,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

type Item = { href: string; label: string; icon: typeof Users; exact?: boolean };
const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'Overview', items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true }] },
  { title: 'Users', items: [{ href: '/admin/users', label: 'User Management', icon: Users }] },
  {
    title: 'Knowledge Base',
    items: [
      { href: '/admin/kb', label: 'Library', icon: BookOpen, exact: true },
      { href: '/admin/kb/new', label: 'Add Source', icon: PlusCircle },
      { href: '/admin/kb/index-status', label: 'Indexing & RAG', icon: Activity },
    ],
  },
  {
    title: 'Counselling',
    items: [
      { href: '/admin/counselling/leads', label: 'Leads', icon: Headphones },
      { href: '/admin/counselling/appointments', label: 'Appointments', icon: CalendarClock },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { href: '/admin/notifications', label: 'Broadcasts', icon: Megaphone },
      { href: '/admin/banners', label: 'Banners', icon: ImageIcon },
    ],
  },
  {
    title: 'Commerce',
    items: [
      { href: '/admin/plans', label: 'Plans & Pricing', icon: Tag },
      { href: '/admin/payments', label: 'Payments', icon: Receipt },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/admin/settings', label: 'Settings & Roles', icon: Settings },
      { href: '/admin/audit-log', label: 'Audit Log', icon: ScrollText },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [loading, user, router]);

  if (loading || !user) return <FullPageSpinner />;

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  async function onLogout() {
    await logout();
    router.replace('/admin/login');
  }

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-border px-5">
        <Logo />
        <Badge tone="accent">Admin</Badge>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1.5 font-mono text-[0.66rem] uppercase tracking-wider text-ink-3">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
                      active
                        ? 'bg-primary-600/10 text-primary-700'
                        : 'text-ink-2 hover:bg-surface-sunk hover:text-ink',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-pill bg-primary-600 transition-opacity',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-primary-600' : 'text-ink-3 group-hover:text-ink-2')} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/5"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ground">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-surface lg:block">{Sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-lg">{Sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border px-4">
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-2 transition hover:bg-surface-sunk lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-pill border border-border bg-surface px-2 py-1 shadow-xs">
              <Avatar name={user.fullName ?? user.email} className="h-7 w-7 text-xs" />
              <span className="hidden text-sm font-medium text-ink-2 sm:inline">{user.fullName}</span>
            </div>
          </div>
        </header>
        <main className="container-page py-6">{children}</main>
      </div>
    </div>
  );
}
