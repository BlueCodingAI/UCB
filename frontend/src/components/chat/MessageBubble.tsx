import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/types';
import { CitationStrip } from './CitationChip';

/**
 * Safe, dependency-free Markdown-ish renderer (no HTML injection):
 * headings (#, ##, ###), unordered/ordered lists, paragraphs, and inline
 * **bold**, `code`, [links](url) + bare URLs.
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex =
    /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|((?:https?:\/\/)[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`} className="font-semibold">{m[2]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(
        <code key={`${keyPrefix}-c${i}`} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em]">
          {m[4]}
        </code>,
      );
    } else if (m[6] !== undefined) {
      nodes.push(
        <a key={`${keyPrefix}-l${i}`} href={m[7]} target="_blank" rel="noreferrer noopener" className="underline">
          {m[6]}
        </a>,
      );
    } else if (m[8] !== undefined) {
      nodes.push(
        <a key={`${keyPrefix}-u${i}`} href={m[8]} target="_blank" rel="noreferrer noopener" className="break-all underline">
          {m[8]}
        </a>,
      );
    }
    last = regex.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderContent(content: string): React.ReactNode {
  const blocks = content.trim().split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const lines = block.split('\n');

    const heading = lines.length === 1 ? /^(#{1,3})\s+(.*)$/.exec(lines[0]) : null;
    if (heading) {
      return (
        <p
          key={bi}
          className={cn(
            'font-semibold text-primary',
            heading[1].length === 1 ? 'text-base' : 'text-[0.95rem]',
            bi > 0 && 'mt-3',
          )}
        >
          {renderInline(heading[2], `h${bi}`)}
        </p>
      );
    }

    const isUL = lines.length > 0 && lines.every((l) => /^\s*[-*•]\s+/.test(l));
    if (isUL) {
      return (
        <ul key={bi} className={cn('list-disc space-y-1 pl-5', bi > 0 && 'mt-2')}>
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^\s*[-*•]\s+/, ''), `ul${bi}-${li}`)}</li>
          ))}
        </ul>
      );
    }

    const isOL = lines.length > 0 && lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
    if (isOL) {
      return (
        <ol key={bi} className={cn('list-decimal space-y-1 pl-5', bi > 0 && 'mt-2')}>
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^\s*\d+[.)]\s+/, ''), `ol${bi}-${li}`)}</li>
          ))}
        </ol>
      );
    }

    return (
      <p key={bi} className={cn(bi > 0 && 'mt-2')}>
        {lines.map((l, li) => (
          <span key={li}>
            {renderInline(l, `p${bi}-${li}`)}
            {li < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

export function MessageBubble({
  message,
  sourceLabel,
  pending,
}: {
  message: Pick<ChatMessage, 'role' | 'content' | 'citations' | 'isGrounded' | 'isFallback'>;
  sourceLabel?: string;
  /** Streaming/optimistic: suppress the source strip until finalized. */
  pending?: boolean;
}) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1 animate-bubble-in">
        <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-600 px-4 py-2.5 text-[0.95rem] leading-relaxed text-white shadow-sm sm:max-w-[78%]">
          {renderContent(message.content)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 animate-bubble-in">
      <div className="max-w-[88%] break-words rounded-2xl rounded-bl-md bg-surface-sunk px-4 py-2.5 text-[0.95rem] leading-relaxed text-ink shadow-xs sm:max-w-[78%]">
        {renderContent(message.content)}
      </div>
      {!pending && message.isGrounded && message.citations.length > 0 && (
        <div className="max-w-[88%] sm:max-w-[78%]">
          <CitationStrip citations={message.citations} sourceLabel={sourceLabel} />
        </div>
      )}
    </div>
  );
}
