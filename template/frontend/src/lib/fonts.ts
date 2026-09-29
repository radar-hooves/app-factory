// @poodle64/design-tokens names these as --ds-font-display/body/mono; the
// faces render only where something imports the stylesheet that loads them.
//
// The factory's own +layout.svelte imports this once. An app that owns its
// root layout (canonical-app-shape.md §Exceptions) imports it there instead
// of the three @fontsource-variable packages directly — same reason as
// $lib/alerts/admin-alert-bell.svelte: the face set is a factory fact, not a
// per-app copy that goes stale as the design system's own faces change.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/hanken-grotesk';
import '@fontsource-variable/jetbrains-mono';
