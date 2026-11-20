import type { ComponentProps } from 'react';
import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '../../lib/cn.ts';

const BADGE_TONES = {
  neutral: 'border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300',
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warning:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  danger:
    'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
} as const;

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: keyof typeof BADGE_TONES;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-xs',
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded border border-zinc-400 dark:border-zinc-600',
        'data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex rounded-md border border-zinc-200 p-1 dark:border-zinc-800',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400',
        'data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-zinc-100',
        'focus-visible:outline-2 focus-visible:outline-emerald-500',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
