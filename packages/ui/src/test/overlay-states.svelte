<script lang="ts">
	// Fixture for data-state-variants.test.ts: one overlay of each shape whose
	// state attributes the package writes utilities against, so the CSS side of
	// that gate is pinned to what bits-ui really renders rather than to a table.
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Switch from '$lib/components/ui/switch/switch.svelte';
</script>

<Dialog.Root>
	<Dialog.Trigger>Open dialog</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Title>Overlay dialog</Dialog.Title>
	</Dialog.Content>
</Dialog.Root>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>Open menu</DropdownMenu.Trigger>
	<DropdownMenu.Content>
		<DropdownMenu.Item>Live item</DropdownMenu.Item>
		<DropdownMenu.Item disabled>Disabled item</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<Select.Root type="single">
	<Select.Trigger data-testid="overlay-select-trigger">Pick one</Select.Trigger>
	<Select.Content>
		<Select.Item value="a" label="Alpha">Alpha</Select.Item>
	</Select.Content>
</Select.Root>

<!-- The checked/unchecked/indeterminate/active/inactive half of the same gate.
     `data-checked:` and `data-active:` were the two values that shipped as dead
     utilities in a consuming app; these are what pin the mapping to the
     attributes bits-ui really writes, rather than to a table someone typed. -->
<Checkbox data-testid="state-checkbox-checked" checked />
<Checkbox data-testid="state-checkbox-unchecked" />
<Checkbox data-testid="state-checkbox-indeterminate" indeterminate />
<Switch data-testid="state-switch-checked" checked />
<Switch data-testid="state-switch-unchecked" />

<Tabs.Root value="one">
	<Tabs.List>
		<Tabs.Trigger value="one" data-testid="state-tab-active">One</Tabs.Trigger>
		<Tabs.Trigger value="two" data-testid="state-tab-inactive">Two</Tabs.Trigger>
	</Tabs.List>
	<Tabs.Content value="one">First</Tabs.Content>
	<Tabs.Content value="two">Second</Tabs.Content>
</Tabs.Root>
