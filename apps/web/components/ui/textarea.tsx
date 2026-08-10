import * as React from 'react';
import { cn } from '@/lib/utils';
import { controlBase } from '@/components/ui/styles';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          controlBase,
          'min-h-[5rem] placeholder:opacity-60',
          className,
        )}
        {...props}
      />
    );
  },
);
