import { ExternalLink, Info } from 'lucide-react';
import { OFFICIAL_SOURCE_URL } from '@/lib/constants';

/**
 * Distinct, warm-styled notice shown when the bot has no grounded answer
 * (is_fallback). Carries the mandated fallback text + a link to the official portal.
 */
export function FallbackNotice({
  text,
  badgeLabel,
  officialLabel,
}: {
  text: string;
  badgeLabel: string;
  officialLabel: string;
}) {
  return (
    <div className="max-w-[88%] self-start rounded-2xl rounded-bl-md bg-accent-soft p-4 shadow-sm ring-1 ring-accent/30 animate-bubble-in sm:max-w-[78%]">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[#9a5a07] dark:text-accent">
          <Info className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[0.66rem] font-semibold uppercase tracking-wider text-[#9a5a07] dark:text-accent">
          {badgeLabel}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-accent-ink dark:text-on-dark">{text}</p>
      <a
        href={OFFICIAL_SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
      >
        {officialLabel}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}
