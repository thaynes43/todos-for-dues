import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Design-system v1.1 PageHeader — one per page, always the `h1`. Optional
 * eyebrow above, one-sentence description below, optional right-aligned
 * actions on the title baseline.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
  titleTestId,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleTestId?: string;
}) {
  return (
    <header
      className={cn('flex flex-wrap items-end justify-between gap-4', className)}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-sm tracking-widest uppercase opacity-60">{eyebrow}</p>
        ) : null}
        <h1
          className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          data-testid={titleTestId}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-4 max-w-2xl text-lg leading-relaxed opacity-80">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-3">{actions}</div> : null}
    </header>
  );
}
