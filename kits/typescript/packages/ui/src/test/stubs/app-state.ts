/** `$app/state`, for the unit runner only — see ./app-environment.ts. */
export const page = { url: new URL('http://localhost/'), params: {}, data: {}, form: undefined };
export const navigating = { current: null };
export const updated = { current: false, check: async () => false };
