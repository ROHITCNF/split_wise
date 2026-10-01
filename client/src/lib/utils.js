import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves Tailwind conflicts (shadcn/ui helper). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
