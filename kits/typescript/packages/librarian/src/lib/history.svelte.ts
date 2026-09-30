/**
 * Past conversations.
 *
 * Held in the browser, deliberately and provisionally. The agent's own session
 * survives server-side — Claude Code keeps it and `--resume` reaches it — so
 * what is missing is only the RENDERED transcript, which is a display concern.
 * Persisting that here needs no schema, no migration and no decision about
 * whose conversation it is.
 *
 * Namespaced by the caller: two apps, or two rooms in one app, must not share
 * a `localStorage` key, so the namespace is a constructor argument rather than
 * a module-level constant.
 */

export interface StoredTurn {
	question: string;
	answer: string;
}

export interface Conversation {
	id: string;
	/** The agent's session id, which is what `--resume` needs. */
	sessionId: string | null;
	title: string;
	updated: number;
	turns: StoredTurn[];
}

const LIMIT = 40;

export class History {
	items = $state<Conversation[]>([]);
	#key: string;

	constructor(namespace: string) {
		this.#key = namespace;
	}

	load(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			this.items = JSON.parse(localStorage.getItem(this.#key) ?? '[]') as Conversation[];
		} catch {
			this.items = [];
		}
	}

	save(conversation: Conversation): void {
		const rest = this.items.filter((c) => c.id !== conversation.id);
		this.items = [conversation, ...rest].slice(0, LIMIT);
		this.#flush();
	}

	remove(id: string): void {
		this.items = this.items.filter((c) => c.id !== id);
		this.#flush();
	}

	#flush(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(this.#key, JSON.stringify(this.items));
		} catch {
			// A full quota costs history, never the conversation in progress.
		}
	}
}

/** One store per namespace — a distinct `localStorage` key per app or room. */
export function createHistory(namespace: string): History {
	return new History(namespace);
}

/** A conversation is named by its first question, trimmed to something legible. */
export function titleFrom(question: string): string {
	const flat = question.replace(/\s+/g, ' ').trim();
	return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}
