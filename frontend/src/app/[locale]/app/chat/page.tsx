'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui';
import { FullPageSpinner } from '@/components/ui';
import { EmptyState } from '@/components/ui';
import { Button } from '@/components/ui';
import { MessageSquareOff } from 'lucide-react';
import { ChatView } from '@/components/chat/ChatView';
import type { ChatSession, Locale } from '@/lib/types';

/**
 * Chat entry point. Ensures the user has a chat session: reuses the most recent
 * 'chat' session if one exists, otherwise creates one. Then mounts the shared
 * ChatView. Existing sessions are continued at /app/chat/[conversationId].
 */
export default function ChatPage() {
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function ensure() {
      try {
        const sessions = await api.get<ChatSession[]>('/chat/sessions');
        const existing = sessions.find((s) => s.channel === 'chat') ?? sessions[0];
        if (existing) {
          if (active) setSession(existing);
        } else {
          const created = await api.post<ChatSession>('/chat/sessions', { language: locale });
          if (active) setSession(created);
        }
      } catch (err) {
        if (active) {
          setFailed(true);
          const msg = err instanceof ApiError ? err.message : 'Could not load chat.';
          toast(msg, 'error');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void ensure();
    return () => {
      active = false;
    };
    // Only run once on mount; locale is the initial bot language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <FullPageSpinner />;

  if (failed || !session) {
    return (
      <EmptyState
        icon={MessageSquareOff}
        title="Chat is unavailable"
        description="We couldn't start a chat session just now. Please try again in a moment."
        action={<Button onClick={() => window.location.reload()}>Retry</Button>}
      />
    );
  }

  return <ChatView sessionId={session.id} initialLanguage={session.language ?? locale} />;
}
