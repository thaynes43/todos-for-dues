import { cn } from '@/lib/utils';

/*
 * Sigo design-system v1.1 component recipes (sigo-alumni:
 * backlog/ux-governance/design-system/components.md). Raw class strings live
 * here so they stay usable on native elements; components are thin wrappers.
 */

/** Card shell — rounded-2xl, border + surface color, no shadow. Padding is the caller's. */
export const cardBase =
  'rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900';

/** Whole-tile link variant of the card shell. */
export const cardLinkBase = cn(cardBase, 'transition-colors hover:border-accent');

/** Form-control shell — 16px text (content floor; also prevents iOS zoom). */
export const controlBase =
  'w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 text-base focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700';

export type ButtonVariant = 'primary' | 'secondary' | 'neutral';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Fill is the darker green (#4a7530) so white 16px labels clear AA; hover
  // brightens to #588838. Never fill with #588838 under 18px-bold text.
  primary: 'bg-accent-strong font-semibold text-white hover:bg-accent',
  secondary:
    'border border-accent font-medium text-accent-strong hover:bg-accent hover:text-white dark:text-stone-100',
  neutral:
    'border border-stone-300 font-medium text-stone-900 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-100 dark:hover:bg-stone-800',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-6 py-3 text-lg',
};

export function buttonStyles(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = 'primary', size = 'md', className } = opts ?? {};
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-lg transition-colors select-none disabled:pointer-events-none disabled:opacity-50',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

export type StatusTone = 'success' | 'error' | 'warning' | 'info';

export const statusTones: Record<StatusTone, string> = {
  success: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  error: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  info: 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200',
};

export function statusNoteStyles(tone: StatusTone, className?: string): string {
  return cn('rounded-lg px-4 py-3', statusTones[tone], className);
}

/** Pill badge base — tier pills and status pills share the shape. */
export const pillBase =
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

/** Real-tier pill: green outline, matches the secondary button. */
export const tierPill = cn(
  pillBase,
  'border border-accent text-accent-strong dark:text-stone-100',
);

/** Inline field-error text (chrome-sized; sits under its control). */
export const fieldError = 'text-sm text-red-700 dark:text-red-300';

/** Muted hint text under a control. */
export const fieldHint = 'text-sm font-normal opacity-70';
