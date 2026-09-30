<script lang="ts">
	// Harness for CardTitle's `level` prop. It mounts the title inside a real
	// Card/CardHeader rather than on its own, because the class list carries
	// `group-data-[size=sm]/card:text-sm` — a rule that only means anything with
	// the card group above it — and a title asserted in isolation would not be
	// the element a consumer actually ships.
	//
	// `id` and `data-testid` are passed through deliberately: rest props reaching
	// the element is part of the claim, and it has to hold on both branches.
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '$lib/components/ui/card';

	let { level, class: className }: { level?: 1 | 2 | 3 | 4 | 5 | 6; class?: string } = $props();
</script>

<Card>
	<CardHeader>
		<CardTitle {level} class={className} id="probe-title" data-testid="card-title">
			Estate summary
		</CardTitle>
		<CardDescription>Everything under management.</CardDescription>
	</CardHeader>
	<CardContent>Body</CardContent>
</Card>
