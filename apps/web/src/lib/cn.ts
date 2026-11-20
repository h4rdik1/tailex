import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and lets later Tailwind classes win over earlier ones.
 * `cn('px-2', isWide && 'px-4')` → 'px-4' (clsx joins, tailwind-merge removes the conflict).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
