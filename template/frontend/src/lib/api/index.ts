export { api, redirectToAuthentik, getActiveWorkspaceId, setActiveWorkspaceId } from './client';
export { extractApiError, describeApiError, formatErrorDetails, type ApiErrorInfo } from './error';
export { toastApiError } from './error-toast';
// This app's own API modules (frontend/src/lib/api/app.ts) — the one seam on
// this barrel, and the reason the barrel itself stays byte-identical. Last, so
// the factory's exports above keep precedence over a same-named app export.
export * from './app';
