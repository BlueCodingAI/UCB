'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mic, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'answering' | 'speaking';

/**
 * Mic capture via MediaRecorder. Tap the big circular button to start/stop.
 * On stop it hands the recorded Blob to the parent, which runs the
 * STT → RAG → TTS round-trip and feeds back the resulting state.
 */
export function VoiceRecorder({
  state,
  onState,
  onRecorded,
  onUnsupported,
}: {
  state: VoiceState;
  onState: (s: VoiceState) => void;
  onRecorded: (blob: Blob) => void;
  onUnsupported?: () => void;
}) {
  const t = useTranslations('voice');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const start = useCallback(async () => {
    if (!supported) {
      onUnsupported?.();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        cleanupStream();
        if (blob.size > 0) onRecorded(blob);
        else onState('idle');
      };
      recorderRef.current = rec;
      rec.start();
      onState('listening');
    } catch {
      setError(t('notSupported'));
      onUnsupported?.();
      onState('idle');
    }
  }, [supported, onUnsupported, onRecorded, onState, cleanupStream, t]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      onState('transcribing');
      rec.stop();
    }
  }, [onState]);

  const busy = state === 'transcribing' || state === 'answering' || state === 'speaking';
  const listening = state === 'listening';

  function onClick() {
    if (busy) return;
    if (listening) stop();
    else void start();
  }

  const statusLabel =
    state === 'listening'
      ? t('listening')
      : state === 'transcribing'
        ? t('transcribing')
        : state === 'answering'
          ? t('answering')
          : state === 'speaking'
            ? t('speaking')
            : t('tapToSpeak');

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center justify-center">
        {listening && (
          <span
            className="absolute h-[88px] w-[88px] animate-node-pulse rounded-full bg-primary-600/25"
            aria-hidden
          />
        )}
        <button
          type="button"
          onClick={onClick}
          disabled={busy || !supported}
          aria-label={listening ? t('listening') : t('tapToSpeak')}
          aria-pressed={listening}
          className={cn(
            'relative flex h-[56px] w-[56px] items-center justify-center rounded-full text-white shadow-md transition focus-visible:outline-none focus-visible:shadow-[var(--ring)]',
            listening
              ? 'animate-node-pulse bg-danger'
              : busy
                ? 'cursor-wait bg-primary-700'
                : 'bg-primary-600 hover:-translate-y-px hover:bg-primary-700',
            !supported && 'cursor-not-allowed opacity-50',
          )}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : listening ? (
            <Square className="h-5 w-5 fill-current" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </button>
      </div>
      <p
        className={cn('text-sm font-medium', listening ? 'text-danger' : busy ? 'text-primary-700' : 'text-ink-2')}
        aria-live="polite"
      >
        {statusLabel}
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
