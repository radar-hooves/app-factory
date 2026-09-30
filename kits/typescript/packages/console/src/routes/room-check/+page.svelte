<!--
	app-factory#15's regression fixture, driven by `tests/e2e/room-check.spec.ts`.

	The real AppShell, the real ReportWidget and the librarian package's live
	Composer, composed exactly as a stamped app's root layout and its
	`rooms/[room]` page compose them (`routes/rooms/[room]/+page.svelte`, on
	the unmerged `foreman/wt-5dbff3eb`) — the rail, the padded content area
	and the conversation-list column all count against the composer's width,
	which is what put the composer's own Send flush against the shell's fixed
	report trigger at 1280px. The defect and its fix both live in the two
	shared packages composed here, not in the room page itself, so this proves
	it without needing that page.
-->
<script lang="ts">
	import { AppShell } from '@poodle64/ui/app-shell';
	import { ReportWidget } from '@poodle64/ui/feedback';
	import { Chat } from '@poodle64/librarian/chat';
	import Composer from '@poodle64/librarian/composer';
	import Conversation from '@poodle64/librarian/conversation';
	import ConversationList from '@poodle64/librarian/conversation-list';
	import { labRoom } from '$lib/librarian-fixtures';

	const nav = [{ label: 'Room check', href: '/room-check', exact: true }];

	// The package's own fake of the rooms slice's routes — no backend, and
	// already exercised live by /librarian?state=room.
	const chat = new Chat(labRoom(), { pollMs: 1500 });
	chat.new();
	void chat.list();
</script>

<AppShell {nav} currentPath="/room-check" brandTitle="Room check">
	<div class="relative flex h-full min-h-0 flex-1">
		<aside
			class="border-border bg-background absolute inset-y-0 left-0 z-10 w-72 overflow-y-auto border-r shadow-lg max-md:hidden md:static md:shadow-none"
		>
			<ConversationList
				conversations={chat.conversations}
				failed={chat.listFailed}
				current={chat.conversationId}
				onopen={(id) => void chat.open(id)}
				onnew={() => chat.new()}
				onrename={(id, title) => chat.rename(id, title)}
				ondownload={(id) => chat.download(id)}
				ondelete={(id) => chat.remove(id)}
			/>
		</aside>
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			<Conversation
				turns={chat.turns}
				running={chat.busy}
				version={chat.version}
				waiting={chat.waiting}
				answering={chat.answering}
			>
				{#snippet composer()}
					<Composer
						bind:value={chat.draft}
						bind:files={chat.files}
						running={chat.busy}
						sendWhileRunning={chat.sendWhileRunning}
						onsubmit={() => void chat.ask()}
						onstop={() => void chat.stop()}
					/>
				{/snippet}
			</Conversation>
		</div>
	</div>
</AppShell>

<!-- The layout-root sibling every stamped app renders once the caller is
     signed in — see `template/frontend/src/routes/+layout.svelte.jinja`. -->
<ReportWidget />
