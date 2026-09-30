<script lang="ts">
	/**
	 * A bounded numeric field as a track plus a live readout.
	 *
	 * Composed here rather than imported: the package ships no slider, and the
	 * only caller is a Control whose subschema carries `minimum`/`maximum`. It is
	 * a native `<input type="range">` so the keyboard, ARIA and touch behaviour
	 * are the platform's; the only styling is the accent utility, which resolves
	 * through the palette, so an app that changes `--ds-color-primary` changes
	 * the track with it.
	 */
	let {
		id,
		value,
		min,
		max,
		step = 1,
		disabled = false,
		describedBy,
		onchange
	}: {
		id: string;
		value: number | undefined;
		min: number;
		max: number;
		step?: number;
		disabled?: boolean;
		describedBy?: string;
		onchange: (next: number) => void;
	} = $props();

	const current = $derived(typeof value === 'number' && Number.isFinite(value) ? value : min);
</script>

<div class="flex items-center gap-3">
	<input
		{id}
		{min}
		{max}
		{step}
		{disabled}
		type="range"
		value={current}
		aria-describedby={describedBy}
		class="accent-primary focus-visible:ring-ring/50 h-8 w-full cursor-pointer rounded-lg outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
		oninput={(event) => onchange(Number((event.currentTarget as HTMLInputElement).value))}
	/>
	<output for={id} class="ds-tabular text-muted-foreground w-10 shrink-0 text-right text-xs"
		>{current}</output
	>
</div>
