import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Layout from './+layout.svelte';

// The signed-in app's layout, rendered with the factory's own stamped frame:
// what every route under (app)/ gets, which is the reason a route the factory
// stamps there needs no move to reach the shell or the guard (app-factory#6).
// The auth store is stubbed at its getters — how it reaches each state is
// auth.svelte.test.ts's subject, what the layout renders in each is this one's.

const redirectToAuthentik = vi.fn();

vi.mock('$lib/api/client', () => ({
	api: { GET: vi.fn(), POST: vi.fn() },
	redirectToAuthentik: (...args: unknown[]) => redirectToAuthentik(...args),
	setActiveWorkspaceId: vi.fn(),
	getActiveWorkspaceId: vi.fn(() => null)
}));

const route = vi.hoisted(() => ({
	url: new URL('http://localhost/settings/application?tab=models'),
	params: {},
	data: {} as Record<string, unknown>
}));

vi.mock('$app/state', () => ({ page: route }));

const session = vi.hoisted(() => ({
	isLoading: false,
	user: null as { id: number; username: string } | null,
	workspaces: [] as { workspace: { id: number; slug: string; name: string }; role: string }[],
	activeWorkspace: null as { id: number; slug: string; name: string } | null
}));

vi.mock('$lib/auth.svelte', () => ({
	auth: {
		init: vi.fn(),
		get isLoading() {
			return session.isLoading;
		},
		get user() {
			return session.user;
		},
		get isAuthenticated() {
			return session.user !== null;
		},
		get workspaces() {
			return session.workspaces;
		},
		get activeWorkspace() {
			return session.activeWorkspace;
		},
		get canSwitchWorkspace() {
			return session.workspaces.length > 1;
		},
		get needsWorkspaceChoice() {
			return session.workspaces.length > 1 && session.activeWorkspace === null;
		},
		activeRole: null,
		entitlements: [],
		can: () => false,
		setActiveWorkspace: vi.fn(),
		logout: vi.fn()
	}
}));

const USER = { id: 1, username: 'someone' };

function workspace(id: number, name: string) {
	return { workspace: { id, slug: name, name }, role: 'owner' };
}

const children = createRawSnippet(() => ({
	render: () => '<p data-testid="the-page">the page</p>'
}));

beforeEach(() => {
	vi.clearAllMocks();
	Object.assign(session, { isLoading: false, user: null, workspaces: [], activeWorkspace: null });
	route.data = {};
});

function signIn() {
	const sole = workspace(7, 'personal-1');
	Object.assign(session, { user: USER, workspaces: [sole], activeWorkspace: sole.workspace });
}

describe('the signed-in app layout', () => {
	it("renders a signed-in caller's page inside the app's frame", () => {
		signIn();
		render(Layout, { props: { children } });

		expect(screen.getByRole('main')).toContainElement(screen.getByTestId('the-page'));
		expect(screen.getByTestId('ds-shell-search')).toBeInTheDocument();
		expect(screen.getByTestId('the-page').parentElement).toHaveClass('pt-5');
		expect(redirectToAuthentik).not.toHaveBeenCalled();
	});

	it('drops the shell padding for a route whose data says it pads its own panes', () => {
		// What (app)/settings/+layout.ts returns, for SettingsShell.
		signIn();
		route.data = { padded: false };
		render(Layout, { props: { children } });

		expect(screen.getByTestId('the-page').parentElement).not.toHaveClass('pt-5');
	});

	it('sends a lapsed session back for the page it asked for, and never renders it', () => {
		render(Layout, { props: { children } });

		expect(redirectToAuthentik).toHaveBeenCalledWith('/settings/application?tab=models');
		expect(screen.queryByTestId('the-page')).toBeNull();
	});

	it('renders nothing of the page until the caller has loaded', () => {
		session.isLoading = true;
		render(Layout, { props: { children } });

		expect(screen.getByRole('status')).toBeInTheDocument();
		expect(screen.queryByTestId('the-page')).toBeNull();
		expect(redirectToAuthentik).not.toHaveBeenCalled();
	});

	it('asks which workspace, never a silent default, when two are held and none chosen', () => {
		Object.assign(session, {
			user: USER,
			workspaces: [workspace(7, 'household'), workspace(8, 'circle')]
		});
		render(Layout, { props: { children } });

		expect(screen.getByTestId('workspace-chooser')).toBeInTheDocument();
		expect(screen.queryByTestId('the-page')).toBeNull();
	});
});
