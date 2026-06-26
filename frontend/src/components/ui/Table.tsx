import { cn } from '@/lib/utils';

/** Admin table primitives — mono uppercase headers, horizontal-scroll safe. */
export function TableWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('w-full overflow-x-auto rounded-md border border-border bg-surface', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'bg-surface-sunk px-3.5 py-2.5 font-mono text-[0.72rem] uppercase tracking-wide text-ink-3 font-medium',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-t border-border px-3.5 py-3 text-ink-2 align-middle', className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('hover:bg-surface-sunk/60', className)} {...props} />;
}
