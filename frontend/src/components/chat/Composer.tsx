'use client';

import { useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Send, Mic } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/lib/types';
import { cn } from '@/lib/utils';

export function Composer({
  onSend,
  disabled,
  placeholder,
}: {
  /** Kept optional for API compatibility; language is auto-detected server-side. */
  language?: Locale;
  onLanguageChange?: (l: Locale) => void;
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const t = useTranslations('chat');
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a few rows.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="glass border-t border-border px-3 py-3 sm:px-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="flex flex-1 items-end rounded-2xl border border-border bg-surface shadow-sm transition focus-within:border-primary-600 focus-within:shadow-[var(--ring)]">
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder ?? t('placeholder')}
            aria-label={t('placeholder')}
            disabled={disabled}
            className="max-h-40 min-h-[48px] w-full resize-none bg-transparent px-4 py-3.5 text-[0.95rem] text-ink placeholder:text-ink-3 focus:outline-none disabled:opacity-60"
          />
          <Link
            href="/app/voice"
            aria-label={t('voiceMode')}
            title={t('voiceMode')}
            className="mb-2 mr-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-surface-sunk hover:text-primary-700"
          >
            <Mic className="h-5 w-5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label={t('send')}
          className={cn(
            'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition duration-200',
            canSend
              ? 'bg-accent text-accent-ink shadow-[var(--shadow-accent)] hover:-translate-y-0.5 active:translate-y-0'
              : 'cursor-not-allowed bg-surface-sunk text-ink-3',
          )}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
      <p className="mx-auto mt-2 max-w-3xl px-1 text-center text-[0.72rem] text-ink-3">
        Ask in English, हिंदी or मराठी — Disha replies in the language you write in.
      </p>
    </div>
  );
}
