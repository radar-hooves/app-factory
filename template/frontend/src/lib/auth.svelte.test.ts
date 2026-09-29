import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACTIVE_WORKSPACE_STORAGE_KEY } from './auth.svelte';

// The store holds module-level state, so each case imports it fresh.
const setActiveWorkspaceId = vi.fn();
const GET = vi.fn();

vi.mock('./api/client', () => ({
	api: {
		GET: (...args: unknown[]) => GET(...args)
	},
	setActiveWorkspaceId: (...args: unknown[]) => setActiveWorkspaceId(...args)
}));

const USER = { id: 1, username: 'someone', display_name: null, email: null, last_seen_at: null };

function membership(id: number, name: string, role: 'owner' | 'member' = 'owner') {
	return { workspace: { id, slug: name, name }, role };
}

function respondWith(user: object, memberships: object[]) {
	GET.mockImplementation((path: string) =>
		path === '/api/users/me'
			? Promise.resolve({ data: user, error: undefined })
			: Promise.resolve({ data: memberships, error: undefined })
	);
}

async function freshAuth() {
	vi.resetModules();
	return (await import('./auth.svelte')).auth;
}

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
});

describe('auth store — workspace resolution', () => {
	it('selects the sole membership, so a single-workspace user never chooses', async () => {
		respondWith({ ...USER, entitlements: [] }, [membership(7, 'personal-1')]);
		const auth = await freshAuth();
		await auth.init();

		expect(auth.activeWorkspace?.id).toBe(7);
		expect(auth.canSwitchWorkspace).toBe(false);
		expect(setActiveWorkspaceId).toHaveBeenCalledWith(7);
		// Selected, not remembered: the only option was never a choice, so the
		// day a second membership arrives the next load asks rather than
		// reloading into the old, empty workspace.
		expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull();
	});

	it('remembers a workspace the person actually chose', async () => {
		respondWith({ ...USER, entitlements: [] }, [
			membership(7, 'household'),
			membership(8, 'circle')
		]);
		const auth = await freshAuth();
		await auth.init();

		auth.setActiveWorkspace(8);
		expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe('8');
	});

	it('selects NOTHING when two are reachable and none is remembered', async () => {
		// Deliberate: the backend answers 409 with the choices rather than guessing,
		// because a silent default is how one workspace's data lands in another.
		respondWith({ ...USER, entitlements: [] }, [
			membership(7, 'household'),
			membership(8, 'circle')
		]);
		const auth = await freshAuth();
		await auth.init();

		expect(auth.activeWorkspace).toBeNull();
		expect(auth.canSwitchWorkspace).toBe(true);
		expect(setActiveWorkspaceId).toHaveBeenCalledWith(null);
	});

	it('honours a remembered workspace across a reload', async () => {
		localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, '8');
		respondWith({ ...USER, entitlements: [] }, [
			membership(7, 'household'),
			membership(8, 'circle')
		]);
		const auth = await freshAuth();
		await auth.init();

		expect(auth.activeWorkspace?.id).toBe(8);
	});

	it('discards a remembered workspace the caller is no longer a member of', async () => {
		// Otherwise every request keeps sending a workspace that now 403s, with
		// nothing on screen explaining why.
		localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, '99');
		respondWith({ ...USER, entitlements: [] }, [membership(7, 'household')]);
		const auth = await freshAuth();
		await auth.init();

		expect(auth.activeWorkspace?.id).toBe(7);
		expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull();
	});

	it('switches only to a workspace the caller actually belongs to', async () => {
		respondWith({ ...USER, entitlements: [] }, [
			membership(7, 'household'),
			membership(8, 'circle')
		]);
		const auth = await freshAuth();
		await auth.init();

		auth.setActiveWorkspace(999);
		expect(auth.activeWorkspace).toBeNull();

		auth.setActiveWorkspace(8);
		expect(auth.activeWorkspace?.id).toBe(8);
	});
});

describe('auth store — why nobody is signed in', () => {
	function failWith(status: number, error: object) {
		GET.mockResolvedValue({ data: undefined, error, response: { status } });
	}

	it('reads a 401 as a lapsed session', async () => {
		failWith(401, { detail: 'Not authenticated' });
		const auth = await freshAuth();
		await auth.init();

		expect(auth.isAuthenticated).toBe(false);
		expect(auth.failure).toBe('lapsed');
	});

	it("reads a request the proxy turned away as a lapsed session: the client's network_error", async () => {
		// What client.ts's normaliser makes of the redirect to the identity
		// provider, which a fetch cannot follow.
		failWith(503, { error: 'network_error', message: 'Could not reach the API.' });
		const auth = await freshAuth();
		await auth.init();

		expect(auth.failure).toBe('lapsed');
	});

	it('reads a backend that answered with an error as a failure a sign-in cannot fix', async () => {
		failWith(503, { error: 'service_unavailable', message: 'Database unavailable.' });
		const auth = await freshAuth();
		await auth.init();

		expect(auth.failure).toBe('failed');
	});

	it('clears the failure once a later init finds the caller', async () => {
		failWith(500, { detail: 'boom' });
		const auth = await freshAuth();
		await auth.init();
		expect(auth.failure).toBe('failed');

		respondWith({ ...USER, entitlements: [] }, [membership(7, 'personal-1')]);
		await auth.init();
		expect(auth.failure).toBeNull();
		expect(auth.isAuthenticated).toBe(true);
	});
});

describe('auth store — a choice is asked for, never defaulted', () => {
	it('needs a choice only while several are held and none is chosen', async () => {
		respondWith({ ...USER, entitlements: [] }, [
			membership(7, 'household'),
			membership(8, 'circle')
		]);
		const auth = await freshAuth();
		await auth.init();

		expect(auth.needsWorkspaceChoice).toBe(true);
		expect(auth.activeRole).toBeNull();

		auth.setActiveWorkspace(8);
		expect(auth.needsWorkspaceChoice).toBe(false);
		expect(auth.activeRole).toBe('owner');
	});

	it('never needs a choice for an org-of-one', async () => {
		respondWith({ ...USER, entitlements: [] }, [membership(7, 'personal-1', 'member')]);
		const auth = await freshAuth();
		await auth.init();

		expect(auth.needsWorkspaceChoice).toBe(false);
		expect(auth.activeRole).toBe('member');
	});
});

describe('auth store — refreshing memberships after a grant, a rename or a retraction', () => {
	it('keeps the active workspace and follows its new name', async () => {
		respondWith({ ...USER, entitlements: [] }, [membership(7, 'household')]);
		const auth = await freshAuth();
		await auth.init();

		respondWith({ ...USER, entitlements: [] }, [membership(7, 'the family')]);
		await auth.refreshWorkspaces();

		expect(auth.activeWorkspace?.id).toBe(7);
		expect(auth.activeWorkspace?.name).toBe('the family');
	});

	it('drops an active workspace the caller was removed from, and selects the sole remaining one', async () => {
		localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, '8');
		respondWith({ ...USER, entitlements: [] }, [
			membership(7, 'household'),
			membership(8, 'circle')
		]);
		const auth = await freshAuth();
		await auth.init();
		expect(auth.activeWorkspace?.id).toBe(8);

		respondWith({ ...USER, entitlements: [] }, [membership(7, 'household')]);
		await auth.refreshWorkspaces();

		expect(auth.activeWorkspace?.id).toBe(7);
		expect(setActiveWorkspaceId).toHaveBeenLastCalledWith(7);
	});

	it('leaves nothing chosen when a grant makes the held set ambiguous', async () => {
		// The person had one workspace and was auto-selected into it; a grant
		// arrives. Their existing choice stands — the new one is offered by the
		// switcher, never silently switched to.
		respondWith({ ...USER, entitlements: [] }, [membership(7, 'household')]);
		const auth = await freshAuth();
		await auth.init();

		respondWith({ ...USER, entitlements: [] }, [
			membership(7, 'household'),
			membership(8, 'circle', 'member')
		]);
		await auth.refreshWorkspaces();

		expect(auth.activeWorkspace?.id).toBe(7);
		expect(auth.canSwitchWorkspace).toBe(true);
		expect(auth.needsWorkspaceChoice).toBe(false);
	});
});

describe('auth store — entitlement grades', () => {
	it('reads a bare key as read-only and :write as both', async () => {
		respondWith({ ...USER, entitlements: ['property', 'travel:write'] }, [membership(7, 'w')]);
		const auth = await freshAuth();
		await auth.init();

		expect(auth.can('property')).toBe(true);
		expect(auth.can('property', true)).toBe(false);
		expect(auth.can('travel')).toBe(true);
		expect(auth.can('travel', true)).toBe(true);
		expect(auth.can('securities')).toBe(false);
	});
});
