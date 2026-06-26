'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Quote, ChevronLeft, ChevronRight } from 'lucide-react';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const COUNT = 3;

/** Auto-advancing testimonial carousel with manual controls. Quotes from messages. */
export function TestimonialCarousel() {
  const t = useTranslations('landing.testimonials');
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback((next: number) => setActive((next + COUNT) % COUNT), []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % COUNT), 6000);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <section className="container-page section-pad">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="font-display mt-4 text-3xl tracking-tight text-primary sm:text-4xl lg:text-5xl">{t('title')}</h2>
      </div>

      <div
        className="relative mx-auto mt-14 max-w-3xl"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        aria-roledescription="carousel"
      >
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-8 shadow-md sm:p-12">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-8 font-display text-[10rem] leading-none text-primary-600/5 select-none"
          >
            &rdquo;
          </span>
          <Quote className="h-9 w-9 text-accent" aria-hidden />
          {Array.from({ length: COUNT }).map((_, i) => (
            <figure
              key={i}
              hidden={i !== active}
              className={cn(i === active && 'animate-fade-up')}
            >
              <blockquote className="mt-5 text-xl leading-relaxed text-ink sm:text-2xl">
                {t(`items.${i}.quote`)}
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-600/12 font-mono text-sm font-semibold text-primary-700">
                  {initials(t(`items.${i}.name`))}
                </span>
                <span>
                  <span className="block font-semibold text-ink">{t(`items.${i}.name`)}</span>
                  <span className="block text-sm text-ink-3">{t(`items.${i}.role`)}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Previous testimonial"
            onClick={() => go(active - 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink-2 transition hover:bg-surface-sunk"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex gap-2" role="tablist" aria-label="Choose testimonial">
            {Array.from({ length: COUNT }).map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === active}
                aria-label={`Testimonial ${i + 1}`}
                onClick={() => setActive(i)}
                className={cn(
                  'h-2.5 rounded-pill transition-all',
                  i === active ? 'w-7 bg-accent' : 'w-2.5 bg-border-strong hover:bg-ink-3',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next testimonial"
            onClick={() => go(active + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink-2 transition hover:bg-surface-sunk"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
