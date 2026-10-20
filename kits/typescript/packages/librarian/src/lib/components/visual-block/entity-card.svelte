<!--
  One thing, its kind, a line on it, and its facts.
-->
<script lang="ts">
	import type { CardValue } from '../../visuals';

	interface Props {
		value: unknown;
		source: string;
	}

	let { value }: Props = $props();
	const card = $derived(value as CardValue);
</script>

<figure class="ds-lib-entity">
	<header class="ds-lib-entity-head">
		<span class="ds-lib-entity-name">{card.name}</span>
		{#if card.kind}<span class="ds-lib-entity-kind">{card.kind}</span>{/if}
	</header>
	{#if card.summary}<p class="ds-lib-entity-summary">{card.summary}</p>{/if}
	{#if card.facts.length > 0}
		<dl class="ds-lib-entity-facts">
			{#each card.facts as fact, i (i)}
				<div class="ds-lib-entity-fact">
					<dt>{fact.label}</dt>
					<dd>{fact.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}
</figure>

<style>
	.ds-lib-entity {
		margin: 0.75em 0;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-1);
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.ds-lib-entity-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.625rem;
	}

	.ds-lib-entity-name {
		color: var(--ds-color-foreground);
		font-size: 1rem;
		font-weight: 600;
	}

	.ds-lib-entity-kind {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.ds-lib-entity-summary {
		margin: 0.25rem 0 0;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-entity-facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.5rem 1rem;
		margin: 0.625rem 0 0;
		border-top: 1px solid var(--ds-color-border);
		padding-top: 0.625rem;
	}

	.ds-lib-entity-fact {
		margin: 0;
	}

	.ds-lib-entity-fact dt {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-entity-fact dd {
		margin: 0;
		color: var(--ds-color-foreground);
		font-weight: 500;
		overflow-wrap: anywhere;
	}
</style>
