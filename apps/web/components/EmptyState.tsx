import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Design-system v1.1 EmptyState — a muted paragraph; `bordered` for
 * whole-section empties. Always say what to do next.
 */
export function EmptyState({
  children,
  bordered = false,
  className,
  testId,
}: {
  children: ReactNode;
  bordered?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <p
      data-testid={testId}
      className={cn(
        'leading-relaxed opacity-70',
        bordered &&
          'rounded-2xl border border-dashed border-stone-300 px-6 py-10 text-center dark:border-stone-700',
        className,
      )}
    >
      {children}
    </p>
  );
}
