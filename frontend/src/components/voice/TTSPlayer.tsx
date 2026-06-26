'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Play, Pause } from 'lucide-react';
import { WaveformVisualizer } from './WaveformVisualizer';

/**
 * Plays a base64-encoded WAV answer via a hidden <audio> element.
 * Auto-plays once when a new clip arrives (browsers may block until a user
 * gesture — in that case the play button remains the fallback).
 */
export function TTSPlayer({
  audioBase64,
  mimeType = 'audio/wav',
  autoPlay = true,
  onPlayStateChange,
}: {
  audioBase64: string;
  mimeType?: string;
  autoPlay?: boolean;
  onPlayStateChange?: (playing: boolean) => void;
}) {
  const t = useTranslations('voice');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const src = `data:${mimeType};base64,${audioBase64}`;

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !autoPlay) return;
    el.currentTime = 0;
    el.play().catch(() => {
      /* autoplay blocked — user can press play */
    });
  }, [src, autoPlay]);

  useEffect(() => {
    onPlayStateChange?.(playing);
  }, [playing, onPlayStateChange]);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 shadow-xs">
      <button
        type="button"
        onClick={toggle}
        aria-label={t('play')}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white transition hover:bg-primary-700 focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
      </button>
      <WaveformVisualizer active={playing} className="flex-1" />
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
