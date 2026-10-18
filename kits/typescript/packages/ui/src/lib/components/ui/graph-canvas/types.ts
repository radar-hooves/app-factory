/** One entity. `kind` keys it to a `GraphKind`; extra fields ride along to the callbacks. */
export interface GraphNode {
	id: string;
	label: string;
	kind: string;
	/** One line under the title in the detail card. */
	description?: string;
	/** A second ring: the subject of the page, a watched entity. */
	emphasis?: boolean;
	/** Radius in px at zoom 1. Defaults from the node's degree. */
	size?: number;
}

/** One relation. Edges naming an id not in `nodes` are dropped. */
export interface GraphEdge {
	source: string;
	target: string;
	/** The relation's verb, drawn on the line on the highlighted path or around a focused node. */
	label?: string;
	/** `dashed` for a weaker link, such as a claim with no citation yet. Defaults to `solid`. */
	style?: 'solid' | 'dashed';
}

export type GraphShape = 'circle' | 'square' | 'diamond' | 'triangle';

/** A legend row. The colour is any CSS colour; a `var(--…)` resolves against the graph's own element. */
export interface GraphKind {
	id: string;
	label: string;
	color?: string;
	shape?: GraphShape;
}

/** A node beside the selected one, with the relation that joins them. */
export interface GraphNeighbour<N extends GraphNode = GraphNode> {
	node: N;
	label?: string;
	/** `out` when the selected node is the edge's source. */
	direction: 'in' | 'out';
}
