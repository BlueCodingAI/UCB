import nodemailer from 'nodemailer';
import { env, integrations } from '../config/env';
import { logger } from '../lib/logger';

let _transport: nodemailer.Transporter | null = null;
function transport(): nodemailer.Transporter {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  }
  return _transport;
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Send an email; in dev without SMTP config, logs to console instead. */
export async function sendMail(input: MailInput): Promise<void> {
  if (!integrations.emailEnabled) {
    logger.info({ to: input.to, subject: input.subject }, '[email:console] (SMTP not configured)');
    // eslint-disable-next-line no-console
    console.log(`\n--- EMAIL (dev) ---\nTo: ${input.to}\nSubject: ${input.subject}\n${input.text ?? input.html}\n-------------------\n`);
    return;
  }
  try {
    await transport().sendMail({
      from: env.mailFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  } catch (err) {
    logger.error({ err, to: input.to }, 'email send failed');
  }
}

export function emailHealth(): 'ok' | 'degraded' {
  return integrations.emailEnabled ? 'ok' : 'degraded';
}
