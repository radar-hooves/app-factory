/**
 * The page padding the shell gives its content area.
 *
 * A constant rather than a literal in app-shell.svelte, because it is no longer
 * declared in one place: SettingsShell runs inside an UNPADDED content area (its
 * section list has to reach the area's edges to read as a pane rather than a
 * floating card) and then pads its own content pane, which must land on the same
 * rhythm as every other page or the settings destination is the one route whose
 * text sits somewhere else.
 *
 * Utilities rather than a class in styles.css, deliberately: both consumers pass
 * this through `cn()`, so an app overriding the padding — `mainClass="px-0"`, a
 * flush table — still resolves through tailwind-merge. A base-layer class would
 * be invisible to it, and the utility would win by layer order instead of by
 * being last, which is the cascade trap recorded against `.ds-nav`'s ink.
 *
 * The bottom pad carries `env(safe-area-inset-bottom)` so the last row of a page
 * clears a home-indicator gesture bar.
 */
export const CONTENT_PADDING =
	'px-4 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 md:px-8 md:pt-7 md:pb-[calc(1.75rem+env(safe-area-inset-bottom))] 2xl:px-12';
