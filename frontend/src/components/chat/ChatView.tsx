'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { api, apiStream, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui';
import { PageHeading } from '@/components/common/PageHeading';
import { AdBannerSlot } from '@/components/banner/AdBannerSlot';
import type { ChatMessage, ChatSession, Citation, Locale } from '@/lib/types';
import { ChatThread, type ThreadMessage } from './ChatThread';
import { Composer } from './Composer';
import { UsageMeter, type UsageMeterHandle } from './UsageMeter';

interface StreamDelta {
  delta?: string;
  done?: boolean;
  message?: ChatMessage;
}
interface NonStreamResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

let tempCounter = 0;
const tempId = () => `tmp-${Date.now()}-${tempCounter++}`;

/**
 * Shared chat experience used by both /app/chat (auto-session) and
 * /app/chat/[conversationId] (existing session). Handles optimistic sends,
 * SSE streaming with a non-stream fallback, citations, fallback notices,
 * and the freemium usage meter.
 */
export function ChatView({
  sessionId,
  initialLanguage,
  initialMessages = [],
}: {
  sessionId: string;
  initialLanguage: Locale;
  initialMessages?: ChatMessage[];
}) {
  const t = useTranslations('chat');
  const { toast } = useToast();
  const router = useRouter();

  const [messages, setMessages] = useState<ThreadMessage[]>(() =>
    initialMessages.map((m) => ({ ...m })),
  );
  const [thinking, setThinking] = useState(false);
  const [sending, setSending] = useState(false);
  const usageRef = useRef<UsageMeterHandle>(null);

  const updateMessage = useCallback((id: string, patch: Partial<ThreadMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (sending) return;
      setSending(true);

      const userMsg: ThreadMessage = {
        id: tempId(),
        role: 'user',
        content,
        citations: [],
        isGrounded: false,
        isFallback: false,
      };
      const assistantTempId = tempId();
      setMessages((prev) => [...prev, userMsg]);
      setThinking(true);

      // --- Try SSE streaming first ---
      let streamed = false;
      try {
        const res = await apiStream(`/chat/sessions/${sessionId}/messages/stream`, {
          content,
        });
        if (res.ok && res.body) {
          streamed = true;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let acc = '';
          let started = false;
          let finalCitations: Citation[] = [];
          let finalGrounded = false;
          let finalFallback = false;

          const ensureBubble = () => {
            if (started) return;
            started = true;
            setThinking(false);
            setMessages((prev) => [
              ...prev,
              {
                id: assistantTempId,
                role: 'assistant',
                content: '',
                citations: [],
                isGrounded: false,
                isFallback: false,
                pending: true,
              },
            ]);
          };

          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const raw of lines) {
              const line = raw.trim();
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              let evt: StreamDelta;
              try {
                evt = JSON.parse(payload) as StreamDelta;
              } catch {
                continue;
              }
              if (typeof evt.delta === 'string') {
                ensureBubble();
                acc += evt.delta;
                updateMessage(assistantTempId, { content: acc });
              }
              if (evt.done && evt.message) {
                const fin = evt.message;
                acc = fin.content || acc;
                finalCitations = fin.citations ?? [];
                finalGrounded = fin.isGrounded;
                finalFallback = fin.isFallback;
              }
            }
          }

          ensureBubble();
          // Finalize: if it was a fallback, swap the bubble for the fallback notice.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantTempId
                ? {
                    ...m,
                    content: acc,
                    citations: finalCitations,
                    isGrounded: finalGrounded,
                    isFallback: finalFallback,
                    pending: false,
                  }
                : m,
            ),
          );
        }
      } catch {
        streamed = false;
      }

      // --- Fallback to non-stream POST ---
      if (!streamed) {
        try {
          const result = await api.post<NonStreamResult>(`/chat/sessions/${sessionId}/messages`, {
            content,
            inputMode: 'text',
          });
          setThinking(false);
          const a = result.assistantMessage;
          setMessages((prev) => [
            ...prev,
            {
              id: a.id,
              role: 'assistant',
              content: a.content,
              citations: a.citations ?? [],
              isGrounded: a.isGrounded,
              isFallback: a.isFallback,
            },
          ]);
        } catch (err) {
          setThinking(false);
          const msg = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
          toast(msg, 'error');
          // Roll back the optimistic user bubble so the user can retry.
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        }
      }

      setSending(false);
      usageRef.current?.refresh();
    },
    [sending, sessionId, updateMessage, toast],
  );

  async function newChat() {
    try {
      const session = await api.post<ChatSession>('/chat/sessions', { language: initialLanguage });
      router.push(`/app/chat/${session.id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not start a new chat.';
      toast(msg, 'error');
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col">
      <PageHeading
        eyebrow="CAP guidance"
        title={t('title')}
        actions={
          <div className="flex items-center gap-3">
            <UsageMeter ref={usageRef} className="hidden sm:block" />
            <button
              type="button"
              onClick={newChat}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-sm border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-surface-sunk"
            >
              <Plus className="h-4 w-4" /> {t('newChat')}
            </button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-ground shadow-xs">
        <div className="flex-1 overflow-y-auto">
          <ChatThread messages={messages} thinking={thinking} onPickPrompt={send} />
        </div>
        <Composer onSend={send} disabled={sending} />
      </div>

      <p className="mt-3 text-center text-xs text-ink-3">
        Disha gives guidance, not the official portal.
      </p>

      <AdBannerSlot placement="chat_footer" className="mx-auto mt-4 w-full max-w-3xl" />
    </div>
  );
}
