import type { ComponentProps } from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from '../../lib/cn.ts';

const FIELD_CLASSES = cn(
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900',
  'placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100',
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500',
  'aria-invalid:border-red-500 disabled:opacity-50',
);

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(FIELD_CLASSES, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(FIELD_CLASSES, 'min-h-16 resize-y', className)} {...props} />;
}

/** A native <select>: fully accessible and keyboard-friendly with no extra code. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(FIELD_CLASSES, 'h-10', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm font-medium text-zinc-800 dark:text-zinc-200', className)}
      {...props}
    />
  );
}

/** Small helper text under a field. Link it with aria-describedby. */
export function Hint({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-xs text-zinc-500 dark:text-zinc-400', className)} {...props} />;
}

/** Field error text. Rendered with role="alert" so screen readers announce it. */
export function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      role="alert"
      className={cn('text-xs text-red-600 dark:text-red-400', className)}
      {...props}
    />
  );
}
