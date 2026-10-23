/**
 * The shell's one feedback door. `ReportWidget` owns the dialogue and, while
 * mounted, registers how to open it here; `AppShell` draws the trigger: an icon
 * in the bar from md, a row in the phone's drawer. The widget is mounted by the
 * app's layout beside the shell rather than inside it, so a context could not
 * join them; this module-level slot does, and there is no wiring for an app.
 */
export const shellReport: { open: (() => void) | null } = $state({ open: null });
