import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ok } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { speechToText, textToSpeech, SARVAM_VOICES } from '../../services/sarvam';
import { answerQuestion } from '../chat/rag.service';
import { assertVoiceQuota, incrementVoiceUsage } from './voice.service';
import type { Locale } from '../../types';

/** Wrap an async handler so thrown errors reach the central error middleware. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** POST /voice/stt — multipart audio → transcript. */
export const stt = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw Errors.validation('An audio file is required', [{ field: 'audio', issue: 'required' }]);
  const language = (req.body.language as Locale) ?? 'en';

  const result = await speechToText(file.buffer, file.mimetype, language);
  ok(res, { transcript: result.transcript, language: result.language });
});

/** POST /voice/tts — JSON { text, language } → audio/wav buffer. */
export const tts = asyncHandler(async (req, res) => {
  const { text, language } = req.body as { text: string; language: Locale };
  const audio = await textToSpeech(text, language);
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Length', audio.length);
  res.status(200).send(audio);
});

/** POST /voice/ask — stt → RAG answer → (if grounded) tts. */
export const ask = asyncHandler(async (req, res) => {
  const userId = req.auth!.sub;
  assertVoiceQuota(userId);

  const file = req.file;
  if (!file) throw Errors.validation('An audio file is required', [{ field: 'audio', issue: 'required' }]);
  const language = (req.body.language as Locale) ?? 'en';

  const { transcript } = await speechToText(file.buffer, file.mimetype, language);

  const answer = await answerQuestion({ question: transcript, userId });

  let audioBase64: string | null = null;
  if (!answer.isFallback && answer.content.trim()) {
    // Speak the answer in the language it was actually written in.
    const audio = await textToSpeech(answer.content, answer.language);
    audioBase64 = audio.toString('base64');
  }

  incrementVoiceUsage(userId);

  ok(res, {
    transcript,
    answer: answer.content,
    language: answer.language,
    citations: answer.citations,
    isFallback: answer.isFallback,
    audioBase64,
  });
});

/** GET /voice/voices — available Sarvam voices per locale. */
export const voices: RequestHandler = (_req, res) => {
  ok(res, { voices: SARVAM_VOICES });
};
