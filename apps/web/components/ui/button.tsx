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
 */
function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: Omit<ButtonPrimitive.Props, 'className'> & {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  );
}

export { Button, buttonStyles };
