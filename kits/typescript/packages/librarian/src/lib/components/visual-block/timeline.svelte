<!--
  A run of dated events, as a vertical line with a mark at each.
-->
<script lang="ts">
	import type { TimelineValue } from '../../visuals';

	interface Props {
		value: unknown;
		source: string;
	}

	let { value }: Props = $props();
	const timeline = $derived(value as TimelineValue);
</script>

<figure class="ds-lib-timeline">
	{#if timeline.title}<figcaption class="ds-lib-timeline-title">{timeline.title}</figcaption>{/if}
	<ol class="ds-lib-timeline-events">
		{#each timeline.events as event, i (i)}
			<li class="ds-lib-timeline-event">
				{#if event.date}<time class="ds-lib-timeline-date">{event.date}</time>{/if}
				<span class="ds-lib-timeline-name">{event.title}</span>
				{#if event.detail}<span class="ds-lib-timeline-detail">{event.detail}</span>{/if}
			</li>
		{/each}
	</ol>
</figure>

<style>
	.ds-lib-timeline {
		margin: 0.75em 0;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-1);
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.ds-lib-timeline-title {
		margin-bottom: 0.5rem;
		color: var(--ds-color-foreground);
		font-weight: 600;
	}

	.ds-lib-timeline-events {
		position: relative;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ds-lib-timeline-events::before {
		content: '';
		position: absolute;
		inset-block: 0.5rem;
		inset-inline-start: 0.28125rem;
		width: 1px;
		background: var(--ds-color-border-strong, var(--ds-color-border));
	}

	.ds-lib-timeline-event {
		position: relative;
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0 0 0.75rem 1.5rem;
	}

	.ds-lib-timeline-event:last-child {
		padding-bottom: 0;
	}

	.ds-lib-timeline-event::before {
		content: '';
		position: absolute;
		inset-block-start: 0.4rem;
		inset-inline-start: 0;
		width: 0.5625rem;
		height: 0.5625rem;
		border-radius: var(--ds-radius-full);
		background: var(--chart-1, var(--ds-color-primary));
	}

	.ds-lib-timeline-date {
		color: var(--ds-color-muted-foreground);
		font-family: var(--ds-font-code);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-timeline-name {
		color: var(--ds-color-foreground);
		font-weight: 600;
	}

	.ds-lib-timeline-detail {
		color: var(--ds-color-muted-foreground);
	}
</style>
