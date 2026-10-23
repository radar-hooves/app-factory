import type { PageLoad } from './$types';

// Unpadded: past questions are a column flush against the rail, full height,
// and the conversation keeps its own gutters.
export const load: PageLoad = () => ({ title: 'Ask', padded: false });
