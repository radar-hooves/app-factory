import type { LayoutLoad } from './$types';

// SettingsShell draws its section list and its content pane edge to edge and
// pads the content itself, so it asks AppShell for `padded={false}` — or the
// two panes read as a floating card (@poodle64/ui settings-shell.svelte). The
// route says so in its own data, and the app's frame passes it on, so no app
// has to know which of the factory's routes pad themselves. `page` keeps the
// two columns together on a wide screen.
export const load: LayoutLoad = () => ({ padded: false, measure: 'page' });
