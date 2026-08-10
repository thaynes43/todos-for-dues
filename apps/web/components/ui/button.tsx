import { Button as ButtonPrimitive } from '@base-ui/react/button';

import {
  buttonStyles,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui/styles';

/**
 * Sigo design-system v1.1 button. Variants: `primary` (the one most-wanted
 * action per view), `secondary` (green outline), `neutral` (quiet actions —
 * cancel, revoke, destructive-ish admin actions behind a confirm step).
 *
 * Legacy shadcn variant names are aliased for the invite/credential-auth
 * surfaces only; they leave with the portal-SSO seam rewrite.
 */
type LegacyVariant = 'default' | 'outline' | 'destructive';

const LEGACY_VARIANT_MAP: Record<LegacyVariant, ButtonVariant> = {
  default: 'primary',
  outline: 'neutral',
  destructive: 'neutral',
};

function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: Omit<ButtonPrimitive.Props, 'className'> & {
  className?: string;
  variant?: ButtonVariant | LegacyVariant;
  size?: ButtonSize;
}) {
  const resolved =
    variant in LEGACY_VARIANT_MAP
      ? LEGACY_VARIANT_MAP[variant as LegacyVariant]
      : (variant as ButtonVariant);
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonStyles({ variant: resolved, size, className })}
      {...props}
    />
  );
}

export { Button, buttonStyles };
