import * as React from 'react';
import { cn } from '@/lib/utils';
import { controlBase } from '@/components/ui/styles';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(controlBase, 'placeholder:opacity-60', className)}
        {...props}
      />
    );
  },
);
