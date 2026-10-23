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
import type { Visual } from '@poodle64/librarian/visuals';
import { goto, preloadCode } from '$app/navigation';
import { api, apiFetch } from '$lib/api';

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
	/** The fence languages the persona was told to draw. */
	visuals: string[];
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
	/** Renderers for a fenced block's language, added to the package's own
	 *  (`chart`, `timeline`, `card`) or replacing one: `{ component, parse }`,
	 *  where `parse` turns the block's text into the `value` the component draws
	 *  and throws on a block that is invalid (the page then shows the code). Its
	 *  source need not be JSON. */
	visuals?: Record<string, Visual>;
	/** Drawn in place of the package's own "working" line while an answer has
	 *  shown nothing yet; `label` and `since` are that line's own. */
	Thinking?: Component<{ persona: Persona; label?: string; since?: number }>;
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
				endpoint: `${BASE}/api/agent/${persona.id}/ask`,
				fetch: apiFetch
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

let personaList: Promise<Persona[]> | null = null;

/** The personas this person may ask, read once for the SPA session and shared
 *  while in flight, so a Home page that has them makes the chat page's arrival
 *  need no request. A failure is forgotten, not kept. */
export function personasOf(): Promise<Persona[]> {
	personaList ??= data<Persona[]>(api.GET('/api/agent/personas')).catch((error) => {
		personaList = null;
		throw error;
	});
	return personaList;
}

/** How long a persona's collection list is reused before it is read again. */
const COLLECTIONS_FRESH_MS = 60_000;
const collectionLists = new Map<string, { at: number; list: Promise<Collection[]> }>();

/** The collections `persona` reads as the caller (none for a persona that reads
 *  none), reused for a minute and shared while in flight. */
export function collectionsOf(persona: Pick<Persona, 'id'>): Promise<Collection[]> {
	const held = collectionLists.get(persona.id);
	if (held && Date.now() - held.at < COLLECTIONS_FRESH_MS) return held.list;
	const list = data<Collection[]>(
		api.GET('/api/agent/{persona}/collections', { params: { path: { persona: persona.id } } })
	).catch((error) => {
		if (collectionLists.get(persona.id)?.list === list) collectionLists.delete(persona.id);
		throw error;
	});
	collectionLists.set(persona.id, { at: Date.now(), list });
	return list;
}

/** Forgets what `personasOf` and `collectionsOf` hold. */
export function forgetAgent(): void {
	personaList = null;
	collectionLists.clear();
}

/** The kind a briefing is asked as, and read back by. */
export const BRIEFING = 'briefing';

/** What a Home page hands the chat page: the question, the files that go with
 *  it, the collection (by name) it is narrowed to, and the kind it is asked as
 *  (`BRIEFING` for the box's briefing control; absent for a plain question). */
export interface HandedOver {
	ask: string;
	files?: File[];
	collection?: string;
	kind?: string;
}

/**
 * Takes the person to `/chat/<persona>` with `ask` asked on arrival; the page
 * sends it without waiting on anything but the persona. A Home page calls
 * this on Enter and awaits nothing (`AskHome` is that page's box).
 */
export function handOff(
	persona: string,
	{ ask, files, collection, kind }: HandedOver
): Promise<void> {
	const query = collection ? `?${new URLSearchParams({ collection })}` : '';
	return goto(`/chat/${encodeURIComponent(persona)}${query}`, {
		state: { ask, ...(files?.length ? { files } : {}), ...(kind ? { kind } : {}) }
	});
}

/**
 * Readies `/chat/<persona>` ahead of a `handOff`: its code, the personas and
 * that persona's collections. A Home page calls this as it mounts.
 */
export function warmChat(persona: string): void {
	void preloadCode(`/chat/${encodeURIComponent(persona)}`).catch(() => undefined);
	void personasOf()
		.then((all) => {
			const found = all.find((p) => p.id === persona);
			return found?.collections ? collectionsOf(found) : undefined;
		})
		.catch(() => undefined);
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
