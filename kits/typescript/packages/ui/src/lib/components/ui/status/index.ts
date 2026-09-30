// The fixed status vocabulary shared by StatusBadge, StatCard, StatList and
// DataTableToolbar. Meaning is consistent across every app: five semantic states,
// no more, backed by the --ds-color-status-* tokens.
export type Status = 'success' | 'warning' | 'error' | 'info' | 'neutral';
