// SPA, as every stamped app is (sveltekit-frontend.md §Configuration): the
// shell's page columns register on the client, so a server render would paint
// the page without them first.
export const ssr = false;
