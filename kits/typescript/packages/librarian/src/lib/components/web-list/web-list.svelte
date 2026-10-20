<!--
  The web pages an answer drew on, apart from the library's numbered sources.
  Never numbered; each opens in a new tab.
-->
<script lang="ts">
	import type { ChatCopy } from '../../copy';
	import type { WebSource } from '../../web-sources';

	interface Props {
		sources: WebSource[];
		words: ChatCopy;
	}

	let { sources, words }: Props = $props();
</script>

<section class="ds-lib-web">
	<h2 class="ds-lib-web-heading">{words.fromTheWeb}</h2>
	<ul class="ds-lib-web-list">
		{#each sources as source (source.url)}
			<li>
				<a class="ds-lib-web-link" href={source.url} target="_blank" rel="noopener noreferrer">
					<span class="ds-lib-web-title">{source.title}</span>
					<span class="ds-lib-web-host">{source.host}</span>
				</a>
			</li>
		{/each}
	</ul>
</section>

<style>
	.ds-lib-web-heading {
		margin: 0 0 0.375rem;
		color: var(--ds-color-muted-foreground);
		font-family: inherit;
		font-size: var(--ds-text-2xs);
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.ds-lib-web-list {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		margin: 0;
		border-top: 1px solid var(--ds-color-border);
		padding: 0.375rem 0 0;
		list-style: none;
	}

	.ds-lib-web-link {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		border-radius: var(--ds-radius-md);
		padding: 0.375rem 0.625rem;
		color: inherit;
		font-size: 0.875rem;
		text-decoration: none;
	}

	.ds-lib-web-link:hover {
		background: var(--ds-color-surface-2);
	}

	.ds-lib-web-link:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-web-title {
		min-width: 0;
		color: var(--ds-color-foreground);
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.ds-lib-web-host {
		flex: none;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}
</style>
