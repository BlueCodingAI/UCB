'use client';

import { useCallback, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { MessageSquare, RotateCcw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Link } from '@/i18n/navigation';
import { Card, CardBody, Select, useToast } from '@/components/ui';
import { PageHeading } from '@/components/common/PageHeading';
import { AdBannerSlot } from '@/components/banner/AdBannerSlot';
import { VoiceRecorder, type VoiceState } from '@/components/voice/VoiceRecorder';
import { TranscriptPanel } from '@/components/voice/TranscriptPanel';
import { TTSPlayer } from '@/components/voice/TTSPlayer';
import { LOCALE_NAMES, LOCALES, OFFICIAL_SOURCE_URL } from '@/lib/constants';
import type { Citation, Locale } from '@/lib/types';

interface VoiceAskResult {
  transcript: string;
  answer?: string;
  message?: { content: string; isGrounded?: boolean; isFallback?: boolean; citations?: Citation[] };
  citations?: Citation[];
  isFallback?: boolean;
  audioBase64?: string | null;
  audioMimeType?: string;
}

interface VoiceTurn {
  transcript: string;
  answer: string;
  citations: Citation[];
  isFallback: boolean;
  audioBase64: string | null;
  audioMimeType: string;
}

/**
 * Voice mode: record a question, send it to /voice/ask (STT → RAG → TTS), then
 * show the transcript + grounded answer + citations and auto-play the spoken
 * reply. Degrades gracefully when voice upstream is unavailable.
 */
export default function VoicePage() {
  const t = useTranslations('voice');
  const uiLocale = useLocale() as Locale;
  const { toast } = useToast();

  const [language, setLanguage] = useState<Locale>(uiLocale);
  const [state, setState] = useState<VoiceState>('idle');
  const [turn, setTurn] = useState<VoiceTurn | null>(null);

  const onRecorded = useCallback(
    async (blob: Blob) => {
      setState('transcribing');
      const form = new FormData();
      const ext = blob.type.includes('webm') ? 'webm' : 'wav';
      form.append('audio', blob, `question.${ext}`);
      form.append('language', language);

      try {
        // Move to "answering" once the upload is on its way.
        setState('answering');
        const res = await api.post<VoiceAskResult>('/voice/ask', form);

        const answer = res.message?.content ?? res.answer ?? '';
        const citations = res.message?.citations ?? res.citations ?? [];
        const isFallback = res.message?.isFallback ?? res.isFallback ?? false;
        const audioBase64 = res.audioBase64 ?? null;

        setTurn({
          transcript: res.transcript ?? '',
          answer,
          citations,
          isFallback,
          audioBase64,
          audioMimeType: res.audioMimeType ?? 'audio/wav',
        });

        setState(audioBase64 ? 'speaking' : 'idle');
      } catch (err) {
        setState('idle');
        if (err instanceof ApiError && err.code === 'upstream_unavailable') {
          toast(t('notSupported'), 'error');
        } else {
          const msg = err instanceof ApiError ? err.message : t('notSupported');
          toast(msg, 'error');
        }
      }
    },
    [language, t, toast],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading
        eyebrow="CAP guidance"
        title={t('title')}
        actions={
          <Link
            href="/app/chat"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-sm border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-surface-sunk"
          >
            <MessageSquare className="h-4 w-4" /> {t('switchToChat')}
          </Link>
        }
      />

      <Card>
        <CardBody className="flex flex-col items-center gap-6 py-10">
          <div className="w-full max-w-[10rem]">
            <label htmlFor="voice-language" className="sr-only">
              {t('title')} language
            </label>
            <Select
              id="voice-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Locale)}
              disabled={state !== 'idle' && state !== 'speaking'}
              className="h-11 text-center text-sm"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </Select>
          </div>

          <VoiceRecorder
            state={state}
            onState={setState}
            onRecorded={onRecorded}
            onUnsupported={() => toast(t('notSupported'), 'error')}
          />

          {turn && (
            <button
              type="button"
              onClick={() => setTurn(null)}
              className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Ask another question
            </button>
          )}
        </CardBody>
      </Card>

      {turn && (
        <div className="mt-6 flex flex-col gap-4">
          {turn.audioBase64 && (
            <TTSPlayer
              key={turn.transcript + turn.answer}
              audioBase64={turn.audioBase64}
              mimeType={turn.audioMimeType}
              autoPlay
              onPlayStateChange={(playing) => {
                setState((prev) => (playing ? 'speaking' : prev === 'speaking' ? 'idle' : prev));
              }}
            />
          )}
          <Card>
            <CardBody>
              <TranscriptPanel
                transcript={turn.transcript}
                answer={turn.answer}
                citations={turn.citations}
                isFallback={turn.isFallback}
              />
            </CardBody>
          </Card>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-ink-3">
        Disha gives guidance, not the official portal.{' '}
        <a
          href={OFFICIAL_SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary-700 hover:underline"
        >
          cetcell.mahacet.org
        </a>
      </p>

      <AdBannerSlot placement="chat_footer" className="mt-4" />
    </div>
  );
}
