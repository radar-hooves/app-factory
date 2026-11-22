import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The type scale's keys (styles.css `@theme`) are sizes. Unknown to tailwind-merge, `text-body`
// reads as a colour, and a `text-foreground` beside it is dropped.
const twMerge = extendTailwindMerge({
	extend: { classGroups: { 'font-size': [{ text: ['display', 'section', 'heading', 'body', 'stat'] }] } }
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, 'child'> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};
