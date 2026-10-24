import type { LayoutLoad } from './$types';

// A panel page: SettingsShell's sections are its pane, the section the page.
export const load: LayoutLoad = () => ({ pageType: 'panel' });
