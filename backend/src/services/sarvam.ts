import crypto from 'node:crypto';
import { env, integrations } from '../config/env';
import { logger } from '../lib/logger';
import { Errors } from '../lib/errors';
import { TtlCache } from './cache';
import type { Locale } from '../types';

const LANG_MAP: Record<Locale, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

export function sarvamLang(locale: Locale): string {
  return LANG_MAP[locale] ?? 'en-IN';
}

const ttsCache = new TtlCache<Buffer>(300, 12 * 60 * 60 * 1000);

const TIMEOUT_MS = 12000;

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await p;
  } finally {
    clearTimeout(timer);
  }
}

export interface SttResult {
  transcript: string;
  language: Locale;
}

/** Speech-to-text via Sarvam Saarika. */
export async function speechToText(audio: Buffer, mime: string, language: Locale): Promise<SttResult> {
  if (!integrations.sarvamEnabled) {
    throw Errors.upstreamUnavailable('Voice transcription is not configured (missing SARVAM_API_KEY).');
  }
  const form = new FormData();
  const blob = new Blob([audio], { type: mime || 'audio/wav' });
  form.append('file', blob, 'audio.wav');
  form.append('model', env.sarvamSttModel);
  form.append('language_code', sarvamLang(language));

  try {
    const res = await withTimeout(
      fetch(`${env.sarvamBaseUrl}/speech-to-text`, {
        method: 'POST',
        headers: { 'api-subscription-key': env.sarvamApiKey },
        body: form,
      }),
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, 'sarvam STT non-200');
      throw Errors.upstreamUnavailable('Could not transcribe audio. Please type your question.');
    }
    const data = (await res.json()) as { transcript?: string };
    return { transcript: data.transcript ?? '', language };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw Errors.upstreamUnavailable('Transcription timed out. Please type your question.');
    }
    throw err;
  }
}

/** Text-to-speech via Sarvam Bulbul → WAV buffer (cached by text+lang). */
export async function textToSpeech(text: string, language: Locale): Promise<Buffer> {
  if (!integrations.sarvamEnabled) {
    throw Errors.upstreamUnavailable('Voice playback is not configured (missing SARVAM_API_KEY).');
  }
  const key = crypto.createHash('sha1').update(`${language}:${text}`).digest('hex');
  const cached = ttsCache.get(key);
  if (cached) return cached;

  // Sarvam TTS has a per-request character cap; chunk long answers.
  const chunks = chunkText(text, 480);
  const audios: Buffer[] = [];
  for (const part of chunks) {
    const res = await withTimeout(
      fetch(`${env.sarvamBaseUrl}/text-to-speech`, {
        method: 'POST',
        headers: { 'api-subscription-key': env.sarvamApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: part,
          target_language_code: sarvamLang(language),
          speaker: env.sarvamTtsSpeaker,
          model: env.sarvamTtsModel,
          speech_sample_rate: 22050,
          enable_preprocessing: true,
        }),
      }),
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, 'sarvam TTS non-200');
      throw Errors.upstreamUnavailable('Could not generate audio.');
    }
    const data = (await res.json()) as { audios?: string[] };
    const b64 = data.audios?.[0];
    if (b64) audios.push(Buffer.from(b64, 'base64'));
  }
  const combined = Buffer.concat(audios);
  ttsCache.set(key, combined);
  return combined;
}

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  const sentences = text.split(/(?<=[.!?।])\s+/);
  let buf = '';
  for (const s of sentences) {
    if ((buf + ' ' + s).length > max) {
      if (buf) parts.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) parts.push(buf.trim());
  return parts;
}

export function sarvamHealth(): 'ok' | 'degraded' {
  return integrations.sarvamEnabled ? 'ok' : 'degraded';
}

export const SARVAM_VOICES: Record<Locale, { code: string; speaker: string }> = {
  en: { code: 'en-IN', speaker: env.sarvamTtsSpeaker },
  hi: { code: 'hi-IN', speaker: env.sarvamTtsSpeaker },
  mr: { code: 'mr-IN', speaker: env.sarvamTtsSpeaker },
};
