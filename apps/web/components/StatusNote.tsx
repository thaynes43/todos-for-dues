import type { ReactNode } from 'react';
import { statusNoteStyles, type StatusTone } from '@/components/ui/styles';

/**
 * Design-system v1.1 StatusNote — the one success/error/warning/info banner.
 * success/info announce politely (`role="status"`); error/warning interrupt
 * (`role="alert"`). Place directly above the form/section it talks about;
 * copy = what happened + what to do next.
 */
export function StatusNote({
  tone,
  children,
  className,
  testId,
  role,
  'aria-label': ariaLabel,
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
  testId?: string;
  role?: 'status' | 'alert' | 'region';
  'aria-label'?: string;
}) {
  const defaultRole = tone === 'error' || tone === 'warning' ? 'alert' : 'status';
  return (
    <div
      role={role ?? defaultRole}
      aria-label={ariaLabel}
      data-testid={testId}
      className={statusNoteStyles(tone, className)}
    >
      {children}
    </div>
  );
}
