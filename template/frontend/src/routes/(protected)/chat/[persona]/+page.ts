import type { PageLoad } from './$types';

// A panel page: past questions are its pane, the conversation the page.
export const load: PageLoad = () => ({ title: 'Ask', pageType: 'panel' });
