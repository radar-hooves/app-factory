/**
 * A persona's chat routes as `@poodle64/librarian`'s `Chat` reaches them
 * (`app-factory docs/design/agent-console.md` §Stamped: `api/agent/`).
 *
 * The routes return the package's own shapes, so every body passes through
 * untranslated; `data` only turns a refusal into the rejection `Chat` reads
 * as "that failed". The ask goes through the package's own `ask()`, which
 * never throws: a 429 or a 409 arrives as an `agent_error` carrying its
 * status.
 */

import type { Component } from 'svelte';
import type { AgentTranscriptProps } from '@poodle64/librarian/agent-transcript';
import { ask } from '@poodle64/librarian/client';
import type {
	ChatTransport,
	ConversationRead,
	ConversationSummary,
	Quota,
	StoredTurn
} from '@poodle64/librarian/chat';
import type { Citation, LoadDocument } from '@poodle64/librarian/citations';
import type { ChatCopy } from '@poodle64/librarian/copy';
import type { DescribeTool } from '@poodle64/librarian/transcript';
import { api } from '$lib/api';

/** A persona as `GET /api/agent/personas` lists it. */
export interface Persona {
	id: string;
	/** What a person calls it: "Ask Outrider". */
	name: string;
	blurb: string;
	examples: string[];
	not_held: string;
	/** Whether each question first reads the library's collections as the person. */
	collections: boolean;
}

/** A collection the person may read, as `GET /api/agent/{persona}/collections` lists it. */
export interface Collection {
	name: string;
	/** How a reader knows it; empty where the library has none, and the composer falls back to the name. */
	title: string;
	/** One line on what it holds, empty where the library has none. */
	description: string;
	/** When the library last confirmed its documents current. Null until it says. */
	documents_to?: string | null;
}

/** A briefing on a persona: what the composer's own control asks, and the card it reads as. */
export interface Briefing {
	/** The words sent, the app's own fixed instruction. */
	question: string;
	/** The card's title; the briefing's prose opens in the column. */
	title: string;
	summary?: string;
}

/**
 * What `src/lib/agent/app.ts` may export to shape this app's chat pages. Each
 * is optional, and the factory's copy exports none.
 */
export interface ChatExtensions {
	/** What a citation opens, in place of the page's own reading pane. */
	oncite?: (persona: Persona, citation: Citation) => void;
	/** How a tool call in an answer reads. */
	describeTool?: DescribeTool;
	/** Words in place of the package's own, per persona. */
	copy?: (persona: Persona) => Partial<ChatCopy>;
	/** What sits on a persona's home, inside the conversation's scroll under its
	 *  opening, before a question. */
	Home?: Component<{ persona: Persona }>;
	/** How a question and its answer read, in place of the package's own:
	 *  given every prop `AgentTranscript` takes, to render the app's own
	 *  presentation, or `AgentTranscript` inside it to add to it. */
	Turn?: Component<AgentTranscriptProps & { persona: Persona }>;
	/** A briefing from the composer's own control; absent, the composer
	 *  offers none. */
	briefing?: (persona: Persona) => Briefing;
	/** What an answer cost, in this app's own currency and words ("about
	 *  A$0.34"), from US dollars; absent, the plain US dollar figure. */
	formatCost?: (usd: number) => string;
	/** Fenced code blocks of a language this app names, drawn by its own
	 *  component in place of the code (`{ chart: Chart }` draws ```chart); the
	 *  block's text arrives as `source`. Absent, every fence renders as code. */
	fences?: Record<string, Component<{ source: string }>>;
}

const BASE = import.meta.env.VITE_API_URL ?? '';

async function data<T>(
	call: Promise<{ data?: unknown; error?: unknown; response: Response }>
): Promise<T> {
	const { data, error, response } = await call;
	if (error !== undefined || !response.ok) throw new Error(`HTTP ${response.status}`);
	return data as T;
}

/** The file name a download's `Content-Disposition` names, or `fallback`. */
export function fileName(disposition: string | null, fallback: string): string {
	const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
	return encoded ? decodeURIComponent(encoded) : fallback;
}

/** One version of a document the persona wrote, as `source` or a rendered format. */
function artefactUrl(id: string, name: string, version: number, format: string): string {
	const query = new URLSearchParams({ name, version: String(version), format });
	return `${BASE}/api/agent/conversations/${encodeURIComponent(id)}/artefact?${query}`;
}

export function chatTransport(persona: Persona): ChatTransport {
	const at = (id: string) => ({ params: { path: { conversation_id: id } } });
	return {
		ask: ({ question, files, resume, signal, kind, collection, edit }) =>
			ask({
				question,
				files,
				resume,
				signal,
				kind,
				collection,
				edit,
				endpoint: `${BASE}/api/agent/${persona.id}/ask`
			}),
		read: (id) =>
			data<ConversationRead>(api.GET('/api/agent/conversations/{conversation_id}', at(id))),
		stop: (id) => data(api.POST('/api/agent/conversations/{conversation_id}/stop', at(id))),
		quota: () => data<Quota>(api.GET('/api/agent/quota')),
		list: () =>
			data<ConversationSummary[]>(
				api.GET('/api/agent/{persona}/conversations', {
					params: { path: { persona: persona.id } }
				})
			),
		rename: (id, title) =>
			data(api.PATCH('/api/agent/conversations/{conversation_id}', { ...at(id), body: { title } })),
		remove: (id) => data(api.DELETE('/api/agent/conversations/{conversation_id}', at(id))),
		mark: (id, turn, verdict) =>
			data(
				api.PUT('/api/agent/conversations/{conversation_id}/turns/{turn}/mark', {
					params: { path: { conversation_id: id, turn } },
					body: { helpful: verdict.helpful, note: verdict.note ?? null }
				})
			),
		share: async (id, turn, share) => {
			const answer = { params: { path: { conversation_id: id, turn } } };
			if (!share) {
				await data(
					api.DELETE('/api/agent/conversations/{conversation_id}/turns/{turn}/share', answer)
				);
				return null;
			}
			const shared = await data<StoredTurn>(
				api.PUT('/api/agent/conversations/{conversation_id}/turns/{turn}/share', answer)
			);
			return shared.shared ?? null;
		},
		loadArtefact: async (id, name, version) => {
			const { data: text, response } = await api.GET(
				'/api/agent/conversations/{conversation_id}/artefact',
				{
					params: { path: { conversation_id: id }, query: { name, version } },
					parseAs: 'text'
				}
			);
			if (!response.ok || text === undefined) throw new Error(`HTTP ${response.status}`);
			return { text: text as string, mediaType: response.headers.get('content-type') ?? '' };
		},
		artefactUrl,
		download: async (id) => {
			const { data: body, response } = await api.GET(
				'/api/agent/conversations/{conversation_id}/export',
				{ ...at(id), parseAs: 'blob' }
			);
			if (!response.ok || !body) throw new Error(`HTTP ${response.status}`);
			const name = fileName(response.headers.get('content-disposition'), 'Conversation.md');
			return { name, body: body as Blob };
		}
	};
}

/** "Checked against the open record on 30 September 2026.", in the reader's own words for a date. */
export function documentsTo(date: string): string {
	const day = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
	return `Checked against the open record on ${day}.`;
}

/** The collections `persona` reads as the caller, or none for a persona that reads none. */
export function collectionsOf(persona: Persona): Promise<Collection[]> {
	return data<Collection[]>(
		api.GET('/api/agent/{persona}/collections', { params: { path: { persona: persona.id } } })
	);
}

/** An answer shared from `persona`, read-only; rejects for one not shared or a persona not entered. */
export function sharedAnswer(
	persona: string,
	conversation: string,
	turn: number
): Promise<StoredTurn> {
	return data<StoredTurn>(
		api.GET('/api/agent/{persona}/answers/{conversation_id}/{turn}', {
			params: { path: { persona, conversation_id: conversation, turn } }
		})
	);
}

/** The reading pane: the cited document, from the persona's own route. */
export function personaDocuments(persona: Persona): LoadDocument {
	return (documentId) =>
		data(
			api.GET('/api/agent/{persona}/documents/{document_id}', {
				params: { path: { persona: persona.id, document_id: Number(documentId) } }
			})
		);
}
