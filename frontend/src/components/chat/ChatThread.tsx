'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { ChatMessage } from '@/lib/types';
import { MessageBubble } from './MessageBubble';
import { FallbackNotice } from './FallbackNotice';
import { SuggestedPrompts } from './SuggestedPrompts';

export interface ThreadMessage
  extends Pick<ChatMessage, 'id' | 'role' | 'content' | 'citations' | 'isGrounded' | 'isFallback'> {
  /** True while a streamed/optimistic assistant message is still arriving. */
  pending?: boolean;
}

/** Three-dot typing indicator shown while the bot is composing. */
function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 animate-bubble-in" aria-live="polite">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-surface-sunk px-4 py-3.5 shadow-xs ring-1 ring-border">
        <span className="h-2 w-2 animate-node-pulse rounded-full bg-ink-3 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-node-pulse rounded-full bg-ink-3 [animation-delay:200ms]" />
        <span className="h-2 w-2 animate-node-pulse rounded-full bg-ink-3 [animation-delay:400ms]" />
      </div>
      <span className="text-xs text-ink-3">{label}</span>
    </div>
  );
}

export function ChatThread({
  messages,
  thinking,
  onPickPrompt,
}: {
  messages: ThreadMessage[];
  thinking?: boolean;
  onPickPrompt: (prompt: string) => void;
}) {
  const t = useTranslations('chat');
  const tc = useTranslations('common');
  const officialLabel = tc('officialSource');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking]);

  const isEmpty = messages.length === 0 && !thinking;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3.5 px-3 py-5 sm:px-4">
      {isEmpty ? (
        <div className="py-6">
          <SuggestedPrompts title={t('suggestedTitle')} onPick={onPickPrompt} />
        </div>
      ) : (
        messages.map((m) =>
          m.role === 'assistant' && m.isFallback ? (
            <FallbackNotice
              key={m.id}
              text={m.content}
              badgeLabel={t('fallbackBadge')}
              officialLabel={officialLabel}
            />
          ) : (
            <MessageBubble key={m.id} message={m} sourceLabel={t('source')} pending={m.pending} />
          ),
        )
      )}
      {thinking && <TypingIndicator label={t('thinking')} />}
      <div ref={endRef} />
    </div>
  );
}
