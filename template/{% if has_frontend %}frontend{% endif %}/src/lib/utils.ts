import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// The WithoutChild / WithoutChildren / WithoutChildrenOrChild / WithElementRef
// helpers are NOT re-exported here: @poodle64/ui ships its own, and a local
// copy is a vendored fork (sveltekit-frontend.md §Utils). Import them from the
// package.
