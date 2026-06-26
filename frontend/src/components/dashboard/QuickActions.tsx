'use client';

import { MessageSquare, Mic, Users, FileText, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

interface Action {
  href: string;
  icon: LucideIcon;
  labelKey: string;
  desc: string;
  tone: 'primary' | 'accent';
}

const ACTIONS: Action[] = [
  { href: '/app/chat', icon: MessageSquare, labelKey: 'chat', desc: 'Ask anything about CAP', tone: 'primary' },
  { href: '/app/voice', icon: Mic, labelKey: 'voice', desc: 'Speak in your language', tone: 'primary' },
  { href: '/app/counselling', icon: Users, labelKey: 'counselling', desc: 'Talk to a counsellor', tone: 'primary' },
  { href: '/app/notices', icon: FileText, labelKey: 'notices', desc: 'Latest circulars', tone: 'primary' },
];

export function QuickActions() {
  const t = useTranslations('appNav');
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.href}
            href={a.href}
            className={cn(
              'group flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-xs transition',
              'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:shadow-[var(--ring)]',
            )}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-600/12 text-primary-700 transition group-hover:bg-primary-600 group-hover:text-white">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-ink">{t(a.labelKey)}</span>
            <span className="text-xs leading-snug text-ink-3">{a.desc}</span>
          </Link>
        );
      })}
    </div>
  );
}
