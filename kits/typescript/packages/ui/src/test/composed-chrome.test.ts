// Behaviour proof for the page-chrome components (rules-library/core/73-verification.md
// §"Behaviour vs Appearance"). Anything with state or a callback is DRIVEN and its
// outcome read from a non-visual probe; the purely declarative components are
// asserted on the branch logic they actually own (a status maps to a chip class,
// a muted stat suppresses its dot), not on the fact that they rendered.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ChromeHarness from './composed-chrome.svelte';

describe('AppDialog', () => {
	it('is closed until the trigger is pressed, then shows its frame', async () => {
		render(ChromeHarness);
		expect(screen.queryByText('Harness dialog')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Open app dialog' }));

		await waitFor(() => {
			expect(screen.getByText('Harness dialog')).toBeInTheDocument();
		});
		expect(screen.getByText('A subtitle')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
	});

	it('closes again from its own close control', async () => {
		render(ChromeHarness);
		await fireEvent.click(screen.getByRole('button', { name: 'Open app dialog' }));
		await waitFor(() => expect(screen.getByText('Harness dialog')).toBeInTheDocument());

		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

		await waitFor(() => {
			expect(screen.queryByText('Harness dialog')).not.toBeInTheDocument();
		});
	});

	it('reports its own dismissal through onOpenChange, not only through the binding', async () => {
		// The gap this closes: a caller that has to reset a form or abort a request
		// when its dialogue closes has nowhere to hang that work if the only signal
		// is a bound value. 12 of 28 dialogues in the reporting app close through a
		// path the caller never drove — Escape, the scrim, this close control — so
		// the self-dismiss leg is the one that matters, and it is asserted here
		// rather than the caller-driven one.
		render(ChromeHarness);
		expect(screen.getByTestId('dialog-open-changes')).toHaveTextContent('none');

		await fireEvent.click(screen.getByRole('button', { name: 'Open app dialog' }));
		await waitFor(() => expect(screen.getByText('Harness dialog')).toBeInTheDocument());
		// The caller set `open` itself, so it is told nothing: the callback reports
		// the dialogue's OWN changes, which is precisely the set a bound variable
		// cannot distinguish.
		expect(screen.getByTestId('dialog-open-changes')).toHaveTextContent('none');

		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

		await waitFor(() => {
			expect(screen.getByTestId('dialog-open-changes')).toHaveTextContent('false');
		});
		// And the binding still moves — the two compose rather than replacing
		// each other.
		expect(screen.queryByText('Harness dialog')).not.toBeInTheDocument();
	});
});

describe('DialogSection', () => {
	it('renders each body section under the class the divider rule keys off', async () => {
		render(ChromeHarness);
		await fireEvent.click(screen.getByRole('button', { name: 'Open app dialog' }));
		await waitFor(() => expect(screen.getByText('Section one body')).toBeInTheDocument());

		// The between-sections divider is the adjacent-sibling rule in
		// @poodle64/ui/styles.css; jsdom applies no stylesheet, so what is provable
		// here is that adjacent siblings both carry the hook the rule selects on.
		const sections = document.querySelectorAll('.ds-dialog-section');
		expect(sections).toHaveLength(2);
		expect(sections[0].nextElementSibling).toBe(sections[1]);
		expect(screen.getByText('Section two body')).toBeInTheDocument();
	});
});

describe('DetailPanel', () => {
	it('fires onClose when its close control is pressed', async () => {
		render(ChromeHarness);
		expect(screen.getByTestId('panel-closed')).toHaveTextContent('open');

		await fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));

		await waitFor(() => {
			expect(screen.getByTestId('panel-closed')).toHaveTextContent('closed');
		});
	});

	it('renders its status chip when both status and statusLabel are given', () => {
		render(ChromeHarness);
		const chip = screen.getByText('Expiring').closest('.ds-chip');
		expect(chip).not.toBeNull();
		expect(chip?.className).toContain('ds-chip-warning');
	});

	it('draws no chip for a status with no label', () => {
		render(ChromeHarness);
		// A colour with no label is the WCAG 1.4.1 failure the status vocabulary
		// exists to prevent, so the panel must suppress the chip entirely rather
		// than render an empty one.
		const panel = screen.getByText('record-99').closest('section');
		expect(panel).not.toBeNull();
		expect(panel?.querySelector('.ds-chip')).toBeNull();
		expect(panel?.querySelector('.ds-dot-error')).toBeNull();
	});
});

describe('ContextColumn', () => {
	it('flows the detail panel in and out without disturbing the stat card', async () => {
		render(ChromeHarness);
		expect(screen.getByText('record-42')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Toggle detail' }));

		await waitFor(() => {
			expect(screen.queryByText('record-42')).not.toBeInTheDocument();
		});
		// The standing stat card is unaffected — the column never changes shape.
		expect(screen.getByText('Totals')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Toggle detail' }));
		await waitFor(() => {
			expect(screen.getByText('record-42')).toBeInTheDocument();
		});
	});
});

describe('EmptyState / ErrorState', () => {
	it('runs the action snippet the caller supplied', async () => {
		render(ChromeHarness);
		expect(screen.getByTestId('empty-action')).toHaveTextContent('idle');
		expect(screen.getByTestId('error-action')).toHaveTextContent('idle');

		await fireEvent.click(screen.getByRole('button', { name: 'Create' }));
		await waitFor(() => expect(screen.getByTestId('empty-action')).toHaveTextContent('fired'));

		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		await waitFor(() => expect(screen.getByTestId('error-action')).toHaveTextContent('fired'));
	});
});

describe('LoadingState', () => {
	it('announces itself as a live status region', () => {
		render(ChromeHarness);
		const status = screen.getByRole('status', { name: 'Fetching records…' });
		expect(status).toHaveAttribute('aria-live', 'polite');
		// The spinner is decorative; the message carries the meaning.
		expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
	});
});

describe('ErrorState', () => {
	it('announces itself assertively, unlike its polite loading sibling', () => {
		render(ChromeHarness);
		const alert = screen.getByRole('alert');
		// assertive, not the sibling's polite: this surface only exists because
		// the user's task has already broken, so it interrupts rather than
		// waiting its turn.
		expect(alert).toHaveAttribute('aria-live', 'assertive');
		expect(alert).toHaveTextContent('Could not load the estate.');
		// The glyph is decorative; the message carries the meaning. This one
		// cannot be driven red from the component: @lucide/svelte adds
		// aria-hidden itself to any icon given no aria-*/role/title and no
		// children, so it holds whether or not the component writes it. What it
		// pins is the emitted output — which is the contract a consumer sees —
		// against that default ever changing.
		expect(alert.querySelector('[aria-hidden="true"]')).not.toBeNull();
	});

	it('leaves EmptyState with no live region of its own', () => {
		render(ChromeHarness);
		const empty = screen.getByRole('heading', { level: 3, name: 'Nothing yet' }).closest('div');
		expect(empty).not.toBeNull();
		// An empty result is ordinary static page content the app placed
		// deliberately, not an outcome that arrived and must interrupt. Giving it
		// a live region would announce a blank list as urgently as a failure.
		expect(empty?.getAttribute('role')).toBeNull();
		expect(empty?.getAttribute('aria-live')).toBeNull();
	});
});

describe('InfoTip', () => {
	it('exposes the hint to assistive tech whether or not it is hovered', () => {
		render(ChromeHarness);
		expect(screen.getByText('Standalone hint')).toHaveClass('sr-only');
		expect(screen.getByText('Wrapping hint')).toHaveClass('sr-only');
	});

	it('wraps supplied children instead of drawing its own icon trigger', () => {
		render(ChromeHarness);
		const wrapped = screen.getByTestId('wrapped-trigger');
		const trigger = wrapped.closest('button');
		expect(trigger).not.toBeNull();
		// The wrapping trigger renders the child, not the fallback info glyph.
		expect(trigger?.querySelector('svg')).toBeNull();
	});
});

describe('StatusBadge / StatCard / StatList', () => {
	it('maps a status onto the shared chip and dot vocabulary', () => {
		render(ChromeHarness);
		const badge = screen.getByText('Healthy').closest('.ds-chip');
		expect(badge?.className).toContain('ds-chip-success');
		expect(badge?.querySelector('.ds-dot-success')).not.toBeNull();
	});

	it('animates the dot only when the state is still moving', () => {
		render(ChromeHarness);
		const settled = screen.getByText('Healthy').closest('.ds-chip');
		const moving = screen.getByText('Syncing').closest('.ds-chip');

		expect(settled?.querySelector('.ds-dot-pulse')).toBeNull();
		expect(moving?.querySelector('.ds-dot-pulse')).not.toBeNull();
		// Motion refines the colour; it never replaces it, so a reader who cannot
		// perceive the animation still gets the state (WCAG 1.4.1).
		expect(moving?.querySelector('.ds-dot-info')).not.toBeNull();
	});

	it('takes a class for placement without losing its own chip identity', () => {
		render(ChromeHarness);
		const moving = screen.getByText('Syncing').closest('.ds-chip');
		expect(moving?.className).toContain('ml-auto');
		// The reason this is `cn` and not string concatenation: the caller's class
		// must not be able to knock out the chip's own colour.
		expect(moving?.className).toContain('ds-chip-info');
	});

	it('colours the figure independently of the source status', () => {
		render(ChromeHarness);
		const figure = screen.getByText('-1,204.55');

		// The number is the loss; the dot is the health of the feed reporting it.
		expect(figure).toHaveClass('ds-ink-error');
		const card = figure.closest('.bg-card');
		expect(card?.querySelector('.ds-dot-success')).not.toBeNull();
		expect(card?.querySelector('.ds-dot-error')).toBeNull();
	});

	it('leaves an untoned figure in the default foreground', () => {
		render(ChromeHarness);
		// The default has to stay inert: every existing StatCard call site passes
		// no valueTone, and none of them may change colour.
		const figure = screen.getByText('12');
		expect(figure.className).not.toContain('ds-ink-');
		expect(figure.getAttribute('data-tone')).toBeNull();
	});

	it('shows a StatCard dot for its status and renders unit and sub', () => {
		render(ChromeHarness);
		const card = screen.getByText('Sessions').closest('div')?.parentElement;
		expect(card?.querySelector('.ds-dot-info')).not.toBeNull();
		expect(screen.getByText('live')).toBeInTheDocument();
		expect(screen.getByText('last hour')).toBeInTheDocument();
	});

	it('suppresses the dot on a muted stat but keeps one on a live stat', () => {
		render(ChromeHarness);
		const warm = screen.getByText('Warm').closest('div');
		const cold = screen.getByText('Cold').closest('div');

		expect(warm?.querySelector('.ds-dot-success')).not.toBeNull();
		// Cold is a healthy zero: status is set, muted wins, so no dot is drawn.
		expect(cold?.querySelector('.ds-dot-error')).toBeNull();
	});
});

describe('PageHeader / Panel', () => {
	it('renders the eyebrow, title, clamped subtitle and actions slot', () => {
		render(ChromeHarness);
		expect(screen.getByRole('heading', { level: 1, name: 'Chrome harness' })).toBeInTheDocument();
		expect(screen.getByText('Section')).toBeInTheDocument();
		expect(screen.getByText('One line, clamped.')).toHaveClass('line-clamp-1');
		expect(screen.getByRole('button', { name: 'Primary action' })).toBeInTheDocument();
	});

	it('renders as a breadcrumb bar with no title at all', () => {
		render(ChromeHarness);
		// The whole point of making `title` optional: this shape must produce no
		// heading. An empty <h1> would be worse than the component not adopting —
		// it puts a nameless stop in the document outline of every such page.
		//
		// Scoped to THIS header rather than counting the h1s in the document: the
		// claim is about the title-less shape, and a document-wide count changes
		// meaning every time another fixture in this file grows a title.
		const trail = screen.getByTestId('page-header-trail');
		expect(trail.querySelectorAll('h1')).toHaveLength(0);

		expect(screen.getByTestId('crumb-current')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Estate' })).toBeInTheDocument();
		// Actions still sit opposite the trail, so the title-less shape is the same
		// header rather than a second component with its own spacing.
		expect(screen.getByRole('button', { name: 'Trail action' })).toBeInTheDocument();
	});

	it('keeps the trail above the title when a header carries both', () => {
		render(ChromeHarness);
		const bar = screen.getByTestId('crumb-current').closest('div')?.parentElement;
		expect(bar).not.toBeNull();
		// Document order is the claim: a trail reads as context for the heading
		// beneath it, never as a caption under it.
		const trailRow = screen.getByTestId('crumb-current').closest('div');
		expect(trailRow?.previousElementSibling).toBeNull();
	});

	it('renders the icon glyph inside the package\'s own tinted square', () => {
		render(ChromeHarness);
		const glyph = screen.getByTestId('header-glyph');
		const square = glyph.parentElement;
		// The app supplies the glyph; the TREATMENT is the package's, which is the
		// half that drifts — two apps had picked two sizes for the same square.
		expect(square?.className).toContain('bg-primary/10');
		expect(square?.className).toContain('size-10');
		// It never collapses when the title is long, and it is decorative: the
		// glyph restates the heading beside it, so a screen reader already has it.
		expect(square?.className).toContain('shrink-0');
		expect(square).toHaveAttribute('aria-hidden', 'true');
	});

	it('renders meta items as one wrapped row under the title', () => {
		render(ChromeHarness);
		const opened = screen.getByTestId('meta-opened');
		expect(opened).toBeInTheDocument();
		expect(screen.getByTestId('meta-status')).toBeInTheDocument();
		const row = opened.parentElement;
		expect(row?.className).toContain('flex-wrap');
		// `min-w-0` for the reason the actions row carries it: a flex item floors
		// at its own min-content width, which wrapping cannot get below.
		expect(row?.className).toContain('min-w-0');
	});

	it('leaves a header that names neither slot completely unchanged', () => {
		render(ChromeHarness);
		// Both are additive. The original header passes no icon and no meta, so it
		// must render no square and no meta row at all — a promotion that quietly
		// added an empty box to every existing header would be worse than none.
		const original = screen.getByTestId('page-header-root');
		expect(original.querySelector('span[class*="bg-primary/10"]')).toBeNull();
		// The same query DOES find the square on the header that names the slot,
		// so a null above is the absence of a square rather than a bad selector.
		const withIcon = screen.getByTestId('page-header-icon');
		expect(withIcon.querySelector('span[class*="bg-primary/10"]')).not.toBeNull();
		expect(original.className).toContain('mb-6');
	});

	it('renders a Panel header with its subtitle above the body', () => {
		render(ChromeHarness);
		expect(screen.getByRole('heading', { level: 2, name: 'Panel title' })).toBeInTheDocument();
		expect(screen.getByText('Panel subtitle')).toBeInTheDocument();
		expect(screen.getByText('Panel body')).toBeInTheDocument();
	});
});

// design-system#14: an adopting app cannot name a landmark or tag an element it
// must identify. Asserted on the root element each component actually renders,
// not on the fact that a prop was accepted — a `class`/`id`/`data-testid` that
// reaches the wrong element (or nowhere) would pass a shallower check.
describe('rest props (design-system#14)', () => {
	it('PageHeader forwards id/data-testid/class to its root, alongside its own classes', () => {
		render(ChromeHarness);
		const root = screen.getByTestId('page-header-root');
		expect(root.id).toBe('page-header-root');
		expect(root.className).toContain('ring-1');
		// The component's own layout class survives — restProps augments, it does
		// not replace.
		expect(root.className).toContain('mb-6');
	});

	it('StatCard, StatList, Panel, DetailPanel, EmptyState, ErrorState and LoadingState all carry a data-testid on their actual root', () => {
		render(ChromeHarness);
		for (const testId of [
			'stat-card-root',
			'stat-list-root',
			'panel-root',
			'detail-panel-root',
			'empty-state-root',
			'error-state-root',
			'loading-state-root'
		]) {
			expect(screen.getByTestId(testId)).toBeInTheDocument();
		}
	});

	it('ContextColumn takes ariaLabel, so its <aside> is a named landmark rather than a bare "complementary"', () => {
		render(ChromeHarness);
		// Queryable by role+name is the actual accessibility-tree claim; a bare
		// data-testid check would pass on an <aside> with no name at all.
		const region = screen.getByRole('complementary', { name: 'Record context' });
		expect(region).toHaveAttribute('data-testid', 'context-column-root');
	});
});

describe('DetailPanel titleFace (design-system#9)', () => {
	// The class-name half only — jsdom cannot resolve a computed font-family
	// (rules-library/core/73-verification.md §"Behaviour vs Appearance"), and a
	// class present with no rule behind it is exactly the silent failure this
	// package's other gates exist to catch. The resolved-font-family half is
	// the real assertion, in harness/drive.mjs's "DetailPanel's title face"
	// section — this only pins that the default is unchanged and the prop
	// reaches the right class.
	it('defaults to the mono face, unchanged', () => {
		render(ChromeHarness);
		const title = screen.getByTestId('detail-panel-face-default').querySelector('h2')!;
		expect(title.className).toContain('font-mono');
		expect(title.className).not.toContain('font-display');
	});

	it('titleFace="display" switches the class, not just accepts the prop', () => {
		render(ChromeHarness);
		const title = screen.getByTestId('detail-panel-face-display').querySelector('h2')!;
		expect(title.className).toContain('font-display');
		expect(title.className).not.toContain('font-mono');
		expect(title).toHaveTextContent('Jordan Rivers');
	});
});
