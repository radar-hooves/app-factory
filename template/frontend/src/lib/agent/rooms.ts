/**
 * A room's routes as `@poodle64/librarian`'s `Chat` reaches them
 * (`docs/design/agent-console.md` §Stamped: `api/agent/`).
 *
 * The routes return the package's own shapes, so every body passes through
 * untranslated; `data` only turns a refusal into the rejection `Chat` reads
 * as "that failed". The ask goes through the package's own `ask()`, which
 * never throws: a 429 or a 409 arrives as a `library_error` carrying its
 * status.
 */

import type { Component } from 'svelte';
import type { AgentTranscriptProps } from '@poodle64/librarian/agent-transcript';
import { ask } from '@poodle64/librarian/client';
import type {
	ConversationRead,
	ConversationSummary,
	Quota,
	RoomTransport
} from '@poodle64/librarian/chat';
import type { Citation, LoadDocument } from '@poodle64/librarian/citations';
import type { LibrarianCopy } from '@poodle64/librarian/copy';
import type { DescribeTool } from '@poodle64/librarian/transcript';
import { api } from '$lib/api';

/** A room as `GET /api/agent/rooms` lists it. */
export interface Room {
	id: string;
	title: string;
	blurb: string;
	examples: string[];
	not_held: string;
	/** The collections' names as a reader knows them, for a library room. */
	sources: string[];
	/** Milton over collections: citations open, and an answer takes a mark. */
	library: boolean;
}

/** A briefing on a room: what the composer's own control asks, and the card it reads as. */
export interface Briefing {
	/** The words sent, the app's own fixed instruction. */
	question: string;
	/** The card's title; the briefing's prose opens in the column. */
	title: string;
	summary?: string;
}

/**
 * What `src/lib/agent/app.ts` may export to shape this app's room pages. Each
 * is optional, and the factory's copy exports none.
 */
export interface RoomExtensions {
	/** What a citation opens, in place of the room's own reading pane. */
	oncite?: (room: Room, citation: Citation) => void;
	/** How a tool call in an answer reads. */
	describeTool?: DescribeTool;
	/** Words in place of the package's own, per room. */
	copy?: (room: Room) => Partial<LibrarianCopy>;
	/** What sits on a room's home, inside the conversation's scroll under its
	 *  opening, before a question. */
	Home?: Component<{ room: Room }>;
	/** How a question and its answer read, in place of the package's own:
	 *  given every prop `AgentTranscript` takes, to render the app's own
	 *  presentation, or `AgentTranscript` inside it to add to it. */
	Turn?: Component<AgentTranscriptProps & { room: Room }>;
	/** A briefing on the room, from the composer's own control; absent, the
	 *  composer offers none. */
	briefing?: (room: Room) => Briefing;
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

export function roomTransport(room: Room): RoomTransport {
	const at = (id: string) => ({ params: { path: { conversation_id: id } } });
	const transport: RoomTransport = {
		ask: ({ question, files, resume, signal, kind, depth }) =>
			ask({
				question,
				files,
				resume,
				signal,
				kind,
				depth,
				endpoint: `${BASE}/api/agent/rooms/${room.id}/ask`
			}),
		read: (id) =>
			data<ConversationRead>(api.GET('/api/agent/conversations/{conversation_id}', at(id))),
		stop: (id) => data(api.POST('/api/agent/conversations/{conversation_id}/stop', at(id))),
		quota: () => data<Quota>(api.GET('/api/agent/quota')),
		list: () =>
			data<ConversationSummary[]>(
				api.GET('/api/agent/rooms/{room_id}/conversations', {
					params: { path: { room_id: room.id } }
				})
			),
		rename: (id, title) =>
			data(api.PATCH('/api/agent/conversations/{conversation_id}', { ...at(id), body: { title } })),
		remove: (id) => data(api.DELETE('/api/agent/conversations/{conversation_id}', at(id))),
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
	if (room.library) {
		transport.mark = (id, turn, verdict) =>
			data(
				api.PUT('/api/agent/conversations/{conversation_id}/turns/{turn}/mark', {
					params: { path: { conversation_id: id, turn } },
					body: { helpful: verdict.helpful, note: verdict.note ?? null }
				})
			);
	}
	return transport;
}

/** A library room's reading pane: the cited document, from the room's own route. */
export function roomDocuments(room: Room): LoadDocument {
	return (documentId) =>
		data(
			api.GET('/api/agent/rooms/{room_id}/documents/{document_id}', {
				params: { path: { room_id: room.id, document_id: Number(documentId) } }
			})
		);
}
