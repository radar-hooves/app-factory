<script lang="ts">
	import GraphCanvas, {
		type GraphEdge,
		type GraphKind,
		type GraphNeighbour,
		type GraphNode
	} from '$lib/components/ui/graph-canvas/index.js';

	let {
		selected: initial = null,
		onselect,
		onactivate,
		activateLabel,
		path
	}: {
		selected?: string | null;
		onselect?: (node: GraphNode | null) => void;
		onactivate?: (node: GraphNode) => void;
		activateLabel?: string;
		path?: string[];
	} = $props();

	let selected = $state<string | null>(null);
	let hiddenKinds = $state<string[]>([]);
	$effect.pre(() => {
		selected = initial;
	});

	const kinds: GraphKind[] = [
		{ id: 'person', label: 'People', color: '#3366cc' },
		{ id: 'organisation', label: 'Organisations', color: '#cc6633', shape: 'square' },
		{ id: 'source', label: 'Sources', color: '#339966', shape: 'diamond' }
	];
	const nodes: GraphNode[] = [
		{ id: 'p-alice', label: 'Alice Marlow', kind: 'person' },
		{ id: 'p-mara', label: 'Mara Quinn', kind: 'person', description: 'Chair of two boards' },
		{ id: 'o-acme', label: 'Acme Holdings', kind: 'organisation' },
		{ id: 'o-marlow', label: 'Marlow Trust', kind: 'organisation' },
		{ id: 's-report', label: 'Annual Report', kind: 'source' },
		{ id: 's-news', label: 'News Item', kind: 'source' },
		{ id: 'n-stray', label: 'Stray Note', kind: 'note' }
	];
	const edges: GraphEdge[] = [
		{ source: 'p-mara', target: 'o-marlow', label: 'director of' },
		{ source: 's-report', target: 'p-mara', label: 'mentions' },
		{ source: 'p-alice', target: 'o-acme', label: 'director of' },
		{ source: 's-news', target: 'o-acme', label: 'mentions' },
		{ source: 'n-stray', target: 's-news', style: 'dashed' }
	];
</script>

{#snippet detail(node: GraphNode, neighbours: GraphNeighbour[])}
	<div data-testid="detail">
		{node.label}|{neighbours.map((n) => n.node.label).join(',')}
	</div>
{/snippet}

<button type="button" onclick={() => (selected = 'o-acme')}>Parent selects Acme</button>
<output data-testid="selected">{selected ?? ''}</output>
<output data-testid="hidden">{hiddenKinds.join(',')}</output>
<div style="height:480px;width:900px">
	<GraphCanvas
		{nodes}
		{edges}
		{kinds}
		directed
		label="Relations"
		{activateLabel}
		{path}
		bind:selected
		bind:hiddenKinds
		{onselect}
		{onactivate}
		{detail}
	/>
</div>
