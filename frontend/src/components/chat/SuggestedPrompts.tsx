'use client';

import { useLocale } from 'next-intl';
import { Sparkles } from 'lucide-react';
import type { Locale } from '@/lib/types';

/** Sample CAP questions per locale, used to bootstrap an empty chat. */
const PROMPTS: Record<Locale, string[]> = {
  en: [
    'How do I register for CAP?',
    'What documents do I need for verification?',
    'How does the option form work?',
    'When is the merit list published?',
    'What happens after seat allotment?',
  ],
  hi: [
    'CAP के लिए पंजीकरण कैसे करें?',
    'सत्यापन के लिए कौन-से दस्तावेज़ चाहिए?',
    'विकल्प फॉर्म कैसे भरें?',
    'मेरिट सूची कब जारी होती है?',
    'सीट आवंटन के बाद क्या होता है?',
  ],
  mr: [
    'CAP साठी नोंदणी कशी करावी?',
    'पडताळणीसाठी कोणती कागदपत्रे लागतात?',
    'पर्याय अर्ज कसा भरावा?',
    'गुणवत्ता यादी कधी जाहीर होते?',
    'जागा वाटपानंतर काय होते?',
  ],
};

export function SuggestedPrompts({ title, onPick }: { title: string; onPick: (prompt: string) => void }) {
  const locale = useLocale() as Locale;
  const prompts = PROMPTS[locale] ?? PROMPTS.en;

  return (
    <div className="animate-fade-up">
      <div className="mb-3 flex items-center gap-2 text-ink-3">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden />
        <p className="eyebrow">{title}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-pill border border-border bg-surface px-4 py-2 text-left text-sm text-ink-2 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-primary-600/40 hover:text-ink hover:shadow-sm focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
