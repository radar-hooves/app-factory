<script lang="ts">
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Switch } from '$lib/components/ui/switch';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

  let checkboxChecked = $state(false);
  let switchChecked = $state(false);
</script>

<Checkbox bind:checked={checkboxChecked} aria-label="smoke-checkbox" />
<Switch bind:checked={switchChecked} aria-label="smoke-switch" />

<Dialog.Root>
  <Dialog.Trigger>Open dialog</Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Title>Smoke dialog</Dialog.Title>
  </Dialog.Content>
</Dialog.Root>

<Tabs.Root value="one">
  <Tabs.List>
    <Tabs.Trigger value="one">One</Tabs.Trigger>
    <Tabs.Trigger value="two">Two</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="one">Content one</Tabs.Content>
  <Tabs.Content value="two">Content two</Tabs.Content>
</Tabs.Root>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>Open menu</DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenu.Item>Smoke item</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
