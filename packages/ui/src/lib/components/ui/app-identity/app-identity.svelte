<script lang="ts">
	/**
	 * The signed-in user surface for AppShell's `identity` slot.
	 *
	 * Graduated from the shell lab (`packages/console/src/routes/lab/+page.svelte`,
	 * the `identity === 'avatar'` shape) — operator ruling 04/09/2026: avatar
	 * only at rest, no name, no chevron, and no prop reintroduces a variant.
	 * Opening it answers who is signed in, which workspace they act in, and the
	 * ways out — identity first, because a menu that opens on a list of actions
	 * makes you infer who you are from the avatar you just clicked.
	 *
	 * Prop names match the stamped template's auth store
	 * (`frontend/src/lib/auth.svelte.ts` — `User`, `Membership`) exactly, so a
	 * consumer wires this straight from `auth.user`, `auth.entitlements`,
	 * `auth.activeWorkspace` and `auth.activeRole` with no reshaping. A guessed
	 * shape needs rewriting the day it meets the real store, which is the whole
	 * reason this one didn't. `display_name` and `email` are both nullable
	 * there, and `activeWorkspace` is genuinely null until a caller with several
	 * memberships chooses one — this component is built against that, not a
	 * happy path.
	 *
	 * Sign-out and settings are the consuming app's concerns, never behaviour
	 * baked in here: `onSignOut` and `onAccountSettings` are callbacks. Theme
	 * follows AppShell's own `onToggleTheme` pattern — override it, or accept
	 * mode-watcher's `toggleMode` by default.
	 */
	import { toggleMode } from 'mode-watcher';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';

	let {
		user,
		workspace = null,
		role = null,
		entitlements = [],
		onSignOut,
		onAccountSettings,
		onSwitchTheme
	}: {
		user: { username: string; display_name: string | null; email: string | null };
		/** The active workspace's name. Omit while none is chosen yet — the block hides rather than rendering empty. */
		workspace?: string | null;
		/** The caller's standing in `workspace`. Ignored while `workspace` is unset. */
		role?: 'owner' | 'member' | null;
		entitlements?: string[];
		/** Required — the whole reason this slot exists is a stamped app rendering no way to sign out. */
		onSignOut: () => void;
		/** Optional until the app has an account-settings destination to send it to. */
		onAccountSettings?: () => void;
		/** Override the theme action. Defaults to mode-watcher's toggleMode, matching AppShell. */
		onSwitchTheme?: () => void;
	} = $props();

	const shown = $derived(user.display_name ?? user.username);
	// Shown separately only when it says something the display name doesn't —
	// an audit log and a support question use the username, and it is not
	// always the display name.
	const showUsername = $derived(!!user.display_name && user.display_name !== user.username);

	function initialsOf(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}
	const initials = $derived(initialsOf(shown));

	function switchTheme() {
		if (onSwitchTheme) onSwitchTheme();
		else toggleMode();
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				aria-label="Account"
				class="hover:bg-surface-2 grid size-[34px] cursor-pointer place-items-center rounded-md"
			>
				<Avatar.Root class="size-6.5 flex-none">
					<Avatar.Fallback class="bg-primary text-primary-foreground text-[11px] font-bold">
						{initials}
					</Avatar.Fallback>
				</Avatar.Root>
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-72">
		<div class="flex items-start gap-3 px-2 py-1.5">
			<Avatar.Root class="size-9 flex-none">
				<Avatar.Fallback class="bg-primary text-primary-foreground text-[13px] font-bold">
					{initials}
				</Avatar.Fallback>
			</Avatar.Root>
			<div class="min-w-0">
				<div class="truncate text-[13.5px] font-semibold">{shown}</div>
				{#if showUsername}
					<div class="text-muted-foreground truncate font-mono text-[11px]">{user.username}</div>
				{/if}
				{#if user.email}
					<div class="text-muted-foreground truncate text-[12px]">{user.email}</div>
				{/if}
			</div>
		</div>
		{#if workspace}
			<DropdownMenu.Separator />
			<DropdownMenu.Label class="text-muted-foreground text-[10px] tracking-[0.1em] uppercase">
				Workspace
			</DropdownMenu.Label>
			<div class="flex items-center justify-between gap-2 px-2 pb-1.5">
				<span class="truncate text-[13px]">{workspace}</span>
				{#if role}
					<span
						class="border-border text-muted-foreground rounded-full border px-1.5 py-px text-[10px] capitalize"
					>
						{role}
					</span>
				{/if}
			</div>
			{#if entitlements.length}
				<div class="flex flex-wrap gap-1 px-2 pb-2">
					{#each entitlements as e (e)}
						<span class="bg-surface-2 text-muted-foreground font-mono rounded px-1.5 py-px text-[10px]">
							{e}
						</span>
					{/each}
				</div>
			{/if}
		{/if}
		<DropdownMenu.Separator />
		<DropdownMenu.Item onSelect={switchTheme}>Switch theme</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={onAccountSettings}>Account settings</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Item class="text-status-error" onSelect={onSignOut}>Sign out</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
