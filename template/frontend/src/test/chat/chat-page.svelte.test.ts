/**
 * The persona page and a shared answer's page through a test app's extension
 * points (`./app`), over a fake of their routes (self-test only). Moving
 * between personas needs a live router, so the chat E2E drives that one.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
	goto: vi.fn(async (_href: string, _options?: { state?: { ask?: string } }) => undefined),
	GET: vi.fn(),
	PUT: vi.fn()
}));

vi.mock('$app/state', async () => ({ page: (await import('./page-state.svelte')).nav }));
vi.mock('$app/navigation', () => ({ goto: fake.goto }));
vi.mock('$lib/api', () => ({
	api: { GET: fake.GET, POST: vi.fn(), PATCH: vi.fn(), PUT: fake.PUT, DELETE: vi.fn() }
}));
// Every member the page reads, the test app's unset ones included: a mock
// refuses a read of a name it was not given.
vi.mock('$lib/agent/app', async () => ({
	oncite: undefined,
	describeTool: undefined,
	copy: undefined,
	formatCost: undefined,
	...(await import('./app'))
}));

import { nav as page } from './page-state.svelte';
import ChatPage from '../../routes/(protected)/chat/[persona]/+page.svelte';
import SharedPage from '../../routes/(protected)/chat/[persona]/answers/[conversation]/[turn]/+page.svelte';

const PERSONA = {
	id: 'outrider',
	name: 'Outrider',
	blurb: '',
	examples: ['How much leave?'],
	not_held: '',
	collections: true
};
const COLLECTIONS = [
	{
		name: 'manual',
		title: 'Pay and leave',
		description: 'Pay, allowances and leave.',
		documents_to: '2026-09-29'
	},
	{
		name: 'conditions',
		title: 'Conditions of service',
		description: 'Conditions of service.',
		documents_to: '2026-09-20'
	}
];
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
	'/api/agent/personas': [PERSONA],
	'/api/agent/{persona}/collections': COLLECTIONS,
	'/api/agent/quota': {
		limit: 40,
		remaining: 39,
		exempt: false,
		reached: false,
		resets_at: '2026-10-01T00:00:00+10:00'
	},
	'/api/agent/{persona}/conversations': [],
	'/api/agent/conversations/{conversation_id}': CONVERSATION,
	'/api/agent/{persona}/documents/{document_id}': {
		title: 'The Manual, Part 5: Leave',
		sections: [
			{
				anchor: '5-1',
				heading: '5.1 Recreation leave',
				text: 'A member accrues four weeks a year.'
			}
		]
	},
	'/api/agent/{persona}/answers/{conversation_id}/{turn}': {
		...CONVERSATION.turns[0],
		shared: '/chat/outrider/answers/c1/0'
	}
};
// A navigation that sets state, as the router does: the entry takes it.
fake.goto.mockImplementation(async (_href, options) => {
	if (options && 'state' in options) page.state = options.state ?? {};
});
const routes = async (path: string) => ({
	data: ROUTES[path],
	response: new Response(null, { status: 200 })
});
fake.GET.mockImplementation(routes);

function at(address: string, state: { ask?: string } = {}) {
	page.url = new URL(address, 'http://localhost');
	page.state = state;
	return render(ChatPage);
}

/** A stream that answers once, for a test that asks. */
function answering(session: string, result: string) {
	const stream = [
		{ type: 'system', subtype: 'init', session_id: session },
		{ type: 'result', result, is_error: false }
	];
	const asked = vi.fn(
		async () =>
			new Response(stream.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
				headers: { 'content-type': 'text/event-stream' }
			})
	);
	vi.stubGlobal('fetch', asked);
	return asked;
}

afterEach(() => {
	vi.unstubAllGlobals();
	fake.goto.mockClear();
});

describe('A persona page, through the app extension points', () => {
	it('puts a question another page handed over in the box, unsent', async () => {
		const asked = vi.fn();
		vi.stubGlobal('fetch', asked);
		at('/chat/outrider?q=How%20much%20leave%3F');
		const box = await screen.findByRole('textbox');
		await waitFor(() => expect(box).toHaveValue('How much leave?'));
		expect(asked).not.toHaveBeenCalled();
		expect(fake.goto).toHaveBeenCalledWith(
			'/chat/outrider',
			expect.objectContaining({ replaceState: true })
		);
	});

	it('asks a question handed over in navigation state, and leaves no trace in the entry', async () => {
		const asked = answering('s1', 'Four weeks.');
		at('/chat/outrider', { ask: 'How much leave?' });
		await waitFor(() => expect(asked).toHaveBeenCalledTimes(1));
		const [, init] = asked.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(String(init.body))).toMatchObject({ question: 'How much leave?' });
		expect(fake.goto).toHaveBeenCalledWith(
			'/chat/outrider',
			expect.objectContaining({ replaceState: true, state: {} })
		);
	});

	it('keeps the turn on screen once the state is cleared, and asks once', async () => {
		const asked = answering('s1', 'Four weeks.');
		at('/chat/outrider', { ask: 'How much leave?' });
		await waitFor(() => expect(asked).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(page.state).toEqual({}));
		// The persona named the conversation: the address follows it.
		await waitFor(() => expect(fake.goto).toHaveBeenCalledWith('?c=s1', expect.anything()));
		// Clearing the state must not have started the room over.
		expect(within(screen.getByRole('log')).getByText('How much leave?')).toBeInTheDocument();
		expect(asked).toHaveBeenCalledTimes(1);
	});

	it('never asks from the address alone', async () => {
		const asked = vi.fn();
		vi.stubGlobal('fetch', asked);
		at('/chat/outrider?ask=How%20much%20leave%3F');
		await screen.findByRole('textbox');
		expect(asked).not.toHaveBeenCalled();
	});

	it("shows the persona's home under the composer, before the first question", async () => {
		at('/chat/outrider');
		const home = await screen.findByTestId('app-home');
		expect(screen.getByRole('log')).not.toContainElement(home);
		expect(
			screen.getByRole('textbox').compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});

	it('brings past questions over the page on demand, never as a column beside it', async () => {
		at('/chat/outrider');
		const open = await screen.findByRole('button', { name: 'Past questions' });
		expect(screen.queryByRole('region', { name: 'Past questions' })).toBeNull();
		// Nothing to start over from yet.
		expect(screen.queryByRole('button', { name: 'New question' })).toBeNull();

		await fireEvent.click(open);
		const past = await screen.findByRole('region', { name: 'Past questions' });
		expect(within(past).getByText('No past questions yet.')).toBeTruthy();
		await fireEvent.click(within(past).getByRole('button', { name: 'Close past questions' }));
		await waitFor(() =>
			expect(screen.queryByRole('region', { name: 'Past questions' })).toBeNull()
		);
	});

	it('offers a new question from the bar once a conversation is open', async () => {
		at('/chat/outrider?c=c1');
		await screen.findAllByTestId('app-turn');
		fake.goto.mockClear();
		await fireEvent.click(screen.getByRole('button', { name: 'New question' }));
		expect(fake.goto).toHaveBeenCalledWith('/chat/outrider', expect.anything());
	});

	it("reads a reopened answer through the app's own turn, and a briefing as its card", async () => {
		at('/chat/outrider?c=c1');
		const turn = await screen.findByTestId('app-turn');
		expect(turn).toHaveAttribute('data-persona', 'outrider');
		expect(within(turn).getByText('Four weeks a year.')).toBeInTheDocument();
		expect(
			within(turn).getByRole('button', { name: 'The Manual, Part 5: Leave, 5.1 Recreation leave' })
		).toBeInTheDocument();
		expect(screen.getByText('Briefing: Outrider')).toBeInTheDocument();
		expect(screen.queryByTestId('app-home')).toBeNull();
	});

	it("asks the app's briefing from the composer, as a briefing", async () => {
		const asked = answering('c2', '# Leave');
		at('/chat/outrider');
		await fireEvent.click(await screen.findByRole('button', { name: 'Ask for a briefing' }));
		await waitFor(() => expect(asked).toHaveBeenCalled());
		const [url, init] = asked.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toMatch(/\/api\/agent\/outrider\/ask$/);
		expect(JSON.parse(String(init.body))).toMatchObject({
			question: 'Write a briefing on Outrider, every claim cited.',
			kind: 'briefing'
		});
		// Its card, and its prose opened in the column beside it under the same title.
		expect(await screen.findAllByText('Briefing: Outrider')).toHaveLength(2);
	});

	it('opens a cited document through the persona, in the reading pane', async () => {
		at('/chat/outrider?c=c1');
		const turn = await screen.findByTestId('app-turn');
		await fireEvent.click(within(turn).getByRole('button', { name: /5.1 Recreation leave/ }));
		expect(
			await screen.findByText('Four weeks a year.', { selector: 'p, div, section' })
		).toBeTruthy();
		expect(fake.GET).toHaveBeenCalledWith('/api/agent/{persona}/documents/{document_id}', {
			params: { path: { persona: 'outrider', document_id: 1042 } }
		});
	});
});

describe('Choosing where a persona looks', () => {
	it('offers every collection the person may read, by its title, and asks across all of them', async () => {
		const asked = answering('c3', 'Four weeks.');
		at('/chat/outrider');
		await fireEvent.click(
			await screen.findByRole('button', { name: 'Where Outrider looks: All your collections' })
		);
		const list = screen.getByRole('listbox', { name: 'Where Outrider looks' });
		expect(within(list).getByRole('option', { name: 'All your collections' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		expect(within(list).getByRole('option', { name: /^Pay and leave/ })).toBeTruthy();
		expect(within(list).getByRole('option', { name: /^Conditions of service/ })).toBeTruthy();
		expect(screen.queryByText('manual')).toBeNull();
		await fireEvent.keyDown(list, { key: 'Escape' });

		await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'How much leave?' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
		await waitFor(() => expect(asked).toHaveBeenCalled());
		const [, init] = asked.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(String(init.body)).collection).toBeUndefined();
	});

	it('puts the picked collection in the address', async () => {
		at('/chat/outrider');
		await fireEvent.click(await screen.findByRole('button', { name: /^Where Outrider looks/ }));
		await fireEvent.click(screen.getByRole('option', { name: /^Conditions of service/ }));
		expect(fake.goto).toHaveBeenCalledWith(
			'?collection=conditions',
			expect.objectContaining({ replaceState: true })
		);
	});

	it('narrows the question to the collection a link names', async () => {
		const asked = answering('c4', 'Four weeks.');
		at('/chat/outrider?collection=conditions');
		await screen.findByRole('button', { name: 'Where Outrider looks: Conditions of service' });

		await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'How much leave?' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
		await waitFor(() => expect(asked).toHaveBeenCalled());
		const [, init] = asked.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(String(init.body))).toMatchObject({ collection: 'conditions' });
	});

	it('asks across them all when a link names a collection the person may not read', async () => {
		at('/chat/outrider?collection=restricted');
		expect(
			await screen.findByRole('button', { name: 'Where Outrider looks: All your collections' })
		).toBeTruthy();
	});

	it('offers no choice for a persona that reads no collections', async () => {
		ROUTES['/api/agent/personas'] = [{ ...PERSONA, collections: false }];
		ROUTES['/api/agent/{persona}/collections'] = [];
		try {
			at('/chat/outrider');
			await screen.findByRole('textbox');
			expect(screen.queryByRole('button', { name: /Where Outrider looks/ })).toBeNull();
		} finally {
			ROUTES['/api/agent/personas'] = [PERSONA];
			ROUTES['/api/agent/{persona}/collections'] = COLLECTIONS;
		}
	});
});

describe('Sharing an answer', () => {
	it("says how current the persona's documents are on its home, by the oldest check", async () => {
		at('/chat/outrider');
		// Folded to one line under the centred composer, and opened from it.
		await fireEvent.click(
			await screen.findByRole('button', { name: 'What Outrider answers from' })
		);
		expect(screen.getByText(/Checked against the open record on .*20.*2026\./)).toBeInTheDocument();
	});

	it("shares a settled answer from the app's own turn, by its place", async () => {
		const writeText = vi.fn(async () => undefined);
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
		fake.PUT.mockResolvedValueOnce({
			data: { ...CONVERSATION.turns[0], shared: '/chat/outrider/answers/c1/0' },
			response: new Response(null, { status: 200 })
		});
		at('/chat/outrider?c=c1');
		const turn = await screen.findByTestId('app-turn');
		await fireEvent.click(within(turn).getByRole('button', { name: 'Share' }));

		expect(fake.PUT).toHaveBeenCalledWith(
			'/api/agent/conversations/{conversation_id}/turns/{turn}/share',
			{ params: { path: { conversation_id: 'c1', turn: 0 } } }
		);
		expect(
			await within(turn).findByRole('button', { name: /Link copied|Copy link/ })
		).toBeInTheDocument();
		expect(writeText).toHaveBeenCalledWith(
			new URL('/chat/outrider/answers/c1/0', location.href).href
		);
	});

	it('marks a settled answer of a persona, stored through the app', async () => {
		fake.PUT.mockResolvedValueOnce({ response: new Response(null, { status: 204 }) });
		// A mark sits on the last settled answer, so this conversation ends on one.
		ROUTES['/api/agent/conversations/{conversation_id}'] = {
			...CONVERSATION,
			turns: [CONVERSATION.turns[0]]
		};
		at('/chat/outrider?c=c1');
		const turn = await screen.findByTestId('app-turn');
		await fireEvent.click(within(turn).getByRole('button', { name: /^Helpful$/ }));

		expect(fake.PUT).toHaveBeenCalledWith(
			'/api/agent/conversations/{conversation_id}/turns/{turn}/mark',
			expect.objectContaining({ body: { helpful: true, note: null } })
		);
		ROUTES['/api/agent/conversations/{conversation_id}'] = CONVERSATION;
	});
});

describe("A shared answer's page", () => {
	function shared() {
		page.params = { persona: 'outrider', conversation: 'c1', turn: '0' };
		page.url = new URL('http://localhost/chat/outrider/answers/c1/0');
		return render(SharedPage);
	}

	afterEach(() => {
		page.params = { persona: 'outrider' };
		fake.GET.mockImplementation(routes);
	});

	it('reads the question, the answer and its sources, and asks nothing', async () => {
		shared();
		const turn = await screen.findByTestId('app-turn');
		expect(within(turn).getByText('How much leave?')).toBeInTheDocument();
		expect(within(turn).getByText('Four weeks a year.')).toBeInTheDocument();
		expect(
			within(turn).getByRole('button', { name: 'The Manual, Part 5: Leave, 5.1 Recreation leave' })
		).toBeInTheDocument();
		expect(within(turn).queryByRole('button', { name: 'Share' })).toBeNull();
		expect(screen.queryByRole('textbox')).toBeNull();
		expect(screen.getByRole('link', { name: 'Ask Outrider' })).toHaveAttribute(
			'href',
			'/chat/outrider'
		);
	});

	it('refuses someone who may not chat with the persona, as the chat does', async () => {
		fake.GET.mockImplementation(async (path: string) =>
			path === '/api/agent/personas'
				? { data: [], response: new Response(null, { status: 200 }) }
				: { error: { error: 'forbidden' }, response: new Response(null, { status: 403 }) }
		);
		shared();
		expect(await screen.findByText('Nothing to ask here')).toBeInTheDocument();
	});

	it('says an answer no longer shared is not shared', async () => {
		fake.GET.mockImplementation(async (path: string) =>
			path === '/api/agent/personas'
				? { data: [PERSONA], response: new Response(null, { status: 200 }) }
				: { error: { error: 'not_found' }, response: new Response(null, { status: 404 }) }
		);
		shared();
		expect(await screen.findByText('This answer is not shared')).toBeInTheDocument();
	});
});
