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

const USER = { id: 1, username: 'someone', email: null, is_admin: false, last_seen_at: null };

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
