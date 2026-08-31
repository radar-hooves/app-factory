/** `$app/stores`, for the unit runner only — see ./app-environment.ts. */
import { readable } from 'svelte/store';

export const page = readable({ url: new URL('http://localhost/'), params: {}, data: {} });
export const navigating = readable(null);
export const updated = readable(false);
