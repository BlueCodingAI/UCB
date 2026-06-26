'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-[#0c171c]/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full sm:max-w-lg bg-surface border border-border rounded-t-xl sm:rounded-xl shadow-lg animate-fade-up max-h-[90vh] overflow-y-auto',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-2">
          {title && <h3 className="text-lg font-semibold text-primary">{title}</h3>}
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-sm p-1 text-ink-3 hover:bg-surface-sunk hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 pb-6">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-border p-4">{footer}</div>}
      </div>
    </div>
  );
}
