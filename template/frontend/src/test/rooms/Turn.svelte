<!--
	A test app's own turn (`RoomExtensions.Turn`): the package's own while an
	answer is written; once it settles, the question, the answer as unboxed
	prose with its [n] marks taken out, a pill per source named by its title
	and section, and the package's answer mark. Built from the package's parts,
	as an app that presents an answer its own way builds it.
-->
<script lang="ts">
	import AgentTranscript, { type AgentTranscriptProps } from '@poodle64/librarian/agent-transcript';
	import AnswerMark from '@poodle64/librarian/answer-mark';
	import Markdown from '@poodle64/librarian/markdown';
	import type { TextBlock } from '@poodle64/librarian/transcript';
	import type { Room } from '$lib/agent/rooms';

	let { room, ...turn }: AgentTranscriptProps & { room: Room } = $props();

	const prose = $derived(
		turn.blocks
			.filter((block): block is TextBlock => block.kind === 'text')
			.map((block) => block.text)
			.join('\n\n')
			.replace(/\s*\[\d+\]/g, '')
	);
	const settled = $derived(!turn.running && prose !== '' && !turn.artefact);
</script>

{#if settled}
	<article class="flex flex-col gap-3" data-testid="app-turn" data-room={room.id}>
		<p class="bg-primary text-primary-foreground max-w-[85%] self-end rounded-xl px-4 py-2">
			{turn.question}
		</p>
		<Markdown content={prose} />
		{#if turn.citations?.length}
			<ul class="flex flex-wrap gap-2">
				{#each turn.citations as citation (citation.n)}
					<li>
						<button
							type="button"
							class="bg-primary/10 text-primary hover:bg-primary/20 focus-visible:ring-ring rounded-full px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
							onclick={() => turn.oncite?.(citation)}
						>
							{citation.section ? `${citation.title}, ${citation.section}` : citation.title}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if turn.onmark}
			<div class="text-muted-foreground flex items-center gap-1">
				<AnswerMark onmark={turn.onmark} copy={turn.copy} />
			</div>
		{/if}
	</article>
{:else}
	<AgentTranscript {...turn} />
{/if}
