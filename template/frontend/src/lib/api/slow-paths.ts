/**
 * The calls that are legitimately slower than the client's default budget, by
 * SCHEMA path (the templated path openapi-fetch hands the middleware, e.g.
 * '/api/items/{id}'), in milliseconds. `client.ts` reads it for every request.
 *
 * Factory-owned and empty. An app adds its own in `app.ts`
 * (`Object.assign(SLOW_PATHS, { '/api/items/{id}': 180_000 })`): `client.ts`
 * imports `app.ts` for that side effect, so a call made through the client alone
 * sees them. An entry is an argued exception, not a tuning knob, and it names the
 * one call that fans out or waits on something outside this app: raising the
 * default instead would hide every stuck call behind the slowest one's budget.
 * One app arrived here the hard way — a retrieval query fanning out across
 * collections was abandoned at 30s while the API went on to answer it fine.
 *
 * No imports here: `app.ts` and the client both import this file.
 */
export const SLOW_PATHS: Record<string, number> = {};
