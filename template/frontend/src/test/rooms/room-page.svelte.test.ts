/**
 * The room page through a test app's extension points (`./app`), over a fake
 * of its routes (self-test only). Moving between rooms needs a live router,
 * so the rooms E2E drives that one.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
	page: { params: { room: 'manual' }, url: new URL('http://localhost/rooms/manual') },
	goto: vi.fn(async () => undefined),
	GET: vi.fn()
}));

vi.mock('$app/state', () => ({ page: fake.page }));
vi.mock('$app/navigation', () => ({ goto: fake.goto }));
vi.mock('$lib/api', () => ({
	api: { GET: fake.GET, POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }
}));
// Every member the page reads, the test app's unset ones included: a mock
// refuses a read of a name it was not given.
vi.mock('$lib/agent/app', async () => ({
	oncite: undefined,
	describeTool: undefined,
	copy: undefined,
	...(await import('./app'))
}));

import RoomPage from '../../routes/rooms/[room]/+page.svelte';

const ROOM = {
	id: 'manual',
	title: 'The Manual',
	blurb: '',
	examples: ['How much leave?'],
	not_held: '',
	sources: ['the Manual'],
	library: true
};
const CITATION = {
	n: 1,
	document_id: '1042',
	title: 'The Manual, Part 5: Leave',
	section: '5.1 Recreation leave'
};
const CONVERSATION = {
	id: 'c1',
	title: 'Leave',
	last_activity_at: '2026-09-30T02:00:00Z',
	answering_since: null,
	turns: [
		{
			question: 'How much leave?',
			answer: 'Four weeks a year [1].',
			at: null,
			citations: [CITATION]
		},
		{ question: 'Write a briefing.', answer: '# Leave', at: null, kind: 'briefing' }
	]
};
const ROUTES: Record<string, unknown> = {
	'/api/agent/rooms': [ROOM],
	'/api/agent/quota': {
		limit: 40,
		remaining: 39,
		exempt: false,
		reached: false,
		resets_at: '2026-10-01T00:00:00+10:00'
	},
	'/api/agent/rooms/{room_id}/conversations': [],
	'/api/agent/conversations/{conversation_id}': CONVERSATION
};
fake.GET.mockImplementation(async (path: string) => ({
	data: ROUTES[path],
	response: new Response(null, { status: 200 })
}));

function at(address: string) {
	fake.page.url = new URL(address, 'http://localhost');
	return render(RoomPage);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('A room page, through the app extension points', () => {
	it('puts a question another page handed over in the box, unsent', async () => {
		const asked = vi.fn();
		vi.stubGlobal('fetch', asked);
		at('/rooms/manual?q=How%20much%20leave%3F');
		const box = await screen.findByRole('textbox');
		await waitFor(() => expect(box).toHaveValue('How much leave?'));
		expect(asked).not.toHaveBeenCalled();
		expect(fake.goto).toHaveBeenCalledWith(
			'/rooms/manual',
			expect.objectContaining({ replaceState: true })
		);
	});

	it("shows the room's home inside the conversation's scroll", async () => {
		at('/rooms/manual');
		const home = await screen.findByTestId('app-home');
		expect(screen.getByRole('log')).toContainElement(home);
	});

	it("reads a reopened answer through the app's own turn, and a briefing as its card", async () => {
		at('/rooms/manual?c=c1');
		const turn = await screen.findByTestId('app-turn');
		expect(turn).toHaveAttribute('data-room', 'manual');
		expect(within(turn).getByText('Four weeks a year.')).toBeInTheDocument();
		expect(
			within(turn).getByRole('button', { name: 'The Manual, Part 5: Leave, 5.1 Recreation leave' })
		).toBeInTheDocument();
		expect(screen.getByText('Briefing: The Manual')).toBeInTheDocument();
		expect(screen.queryByTestId('app-home')).toBeNull();
	});

	it("asks the app's briefing from the composer, as a briefing", async () => {
		const stream = [
			{ type: 'system', subtype: 'init', session_id: 'c2' },
			{ type: 'result', result: '# Leave', is_error: false }
		];
		const asked = vi.fn(
			async () =>
				new Response(stream.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
					headers: { 'content-type': 'text/event-stream' }
				})
		);
		vi.stubGlobal('fetch', asked);
		at('/rooms/manual');
		await fireEvent.click(await screen.findByRole('button', { name: 'Ask for a briefing' }));
		await waitFor(() => expect(asked).toHaveBeenCalled());
		const [url, init] = asked.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toMatch(/\/api\/agent\/rooms\/manual\/ask$/);
		expect(JSON.parse(String(init.body))).toMatchObject({
			question: 'Write a briefing on The Manual, every claim cited.',
			kind: 'briefing'
		});
		// Its card, and its prose opened in the column beside it under the same title.
		expect(await screen.findAllByText('Briefing: The Manual')).toHaveLength(2);
	});
});
