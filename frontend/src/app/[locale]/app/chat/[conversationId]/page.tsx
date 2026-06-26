'use client';

import { use, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { MessageSquareOff } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast, FullPageSpinner, EmptyState } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui';
import { ChatView } from '@/components/chat/ChatView';
import type { ChatMessage, ChatSession, Locale } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Continue an existing chat session. Loads its messages and hands them to the
 * shared ChatView, which appends new turns using the same send logic.
 */
export default function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = use(params);
  const locale = useLocale() as Locale;
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        // Messages are the source of truth; session metadata is best-effort.
        const [msgs, sessions] = await Promise.all([
          api.get<ChatMessage[]>(`/chat/sessions/${conversationId}/messages`),
          api.get<ChatSession[]>('/chat/sessions').catch(() => [] as ChatSession[]),
        ]);
        if (!active) return;
        setMessages(msgs);
        setSession(sessions.find((s) => s.id === conversationId) ?? null);
      } catch (err) {
        if (!active) return;
        setFailed(true);
        const msg = err instanceof ApiError ? err.message : 'Could not load this conversation.';
        toast(msg, 'error');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [conversationId, toast]);

  if (loading) return <FullPageSpinner />;

  if (failed || messages == null) {
    return (
      <EmptyState
        icon={MessageSquareOff}
        title="Conversation not found"
        description="This chat may have been removed. Start a fresh one to keep going."
        action={
          <Link href="/app/chat" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }))}>
            Start a new chat
          </Link>
        }
      />
    );
  }

  return (
    <ChatView
      sessionId={conversationId}
      initialLanguage={session?.language ?? locale}
      initialMessages={messages}
    />
  );
}
