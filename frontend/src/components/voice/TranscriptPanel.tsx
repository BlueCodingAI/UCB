'use client';

import { useTranslations } from 'next-intl';
import { User as UserIcon, Bot } from 'lucide-react';
import type { Citation } from '@/lib/types';
import { FallbackNotice } from '@/components/chat/FallbackNotice';
import { CitationStrip } from '@/components/chat/CitationChip';

/**
 * Shows the recognised user transcript and the bot's answer (or a fallback
 * notice when ungrounded), with clean source chips (document names).
 */
export function TranscriptPanel({
  transcript,
  answer,
  citations,
  isFallback,
}: {
  transcript: string;
  answer: string;
  citations?: Citation[];
  isFallback: boolean;
}) {
  const t = useTranslations('voice');
  const tChat = useTranslations('chat');
  const tc = useTranslations('common');

  return (
    <div className="flex flex-col gap-4">
      {/* User transcript */}
      <div className="animate-fade-up">
        <div className="mb-1.5 flex items-center gap-1.5 text-ink-3">
          <UserIcon className="h-3.5 w-3.5" aria-hidden />
          <span className="eyebrow">{t('yourQuestion')}</span>
        </div>
        <p className="rounded-2xl rounded-tl-md bg-surface-sunk px-4 py-3 text-[0.95rem] leading-relaxed text-ink">
          {transcript}
        </p>
      </div>

      {/* Bot answer */}
      <div className="animate-fade-up">
        <div className="mb-1.5 flex items-center gap-1.5 text-primary-700">
          <Bot className="h-3.5 w-3.5" aria-hidden />
          <span className="eyebrow text-primary-700">{tc('appName')}</span>
        </div>
        {isFallback ? (
          <FallbackNotice
            text={answer}
            badgeLabel={tChat('fallbackBadge')}
            officialLabel={tc('officialSource')}
          />
        ) : (
          <>
            <p className="rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3 text-[0.95rem] leading-relaxed text-ink shadow-xs">
              {answer}
            </p>
            <CitationStrip citations={citations ?? []} sourceLabel={tChat('source')} />
          </>
        )}
      </div>
    </div>
  );
}
