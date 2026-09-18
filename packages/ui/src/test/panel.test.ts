/**
 * Panel is also the settings SECTION, and this suite is what makes that claim
 * true rather than asserted: there is no SettingsSection component, so the three
 * things a settings page needs from its section frame — a description that
 * wraps, a footer for Save/Cancel, a destructive tone for a danger zone — have
 * to be provable here.
 *
 * What is NOT asserted here: that the destructive rule is visibly red, that the
 * footer strip sits at the foot, or that a three-line description does not shove
 * the actions out of the header. jsdom applies no stylesheet and has no layout.
 * Those are driven in `harness/drive.mjs` (`?surface=settings`).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Harness from './panel.svelte';

const section = () => document.querySelector('section') as HTMLElement;
const footer = () => document.querySelector('[data-slot="panel-footer"]');

describe('Panel — the titled section', () => {
	it('renders the title as a real heading, so a settings page has an outline', () => {
		render(Harness, { props: { title: 'Delegation limits' } });
		expect(screen.getByRole('heading', { name: 'Delegation limits' })).toBeInTheDocument();
	});

	it('renders a description under the title', () => {
		render(Harness, {
			props: { description: 'Who can approve a bill, and up to what value.' }
		});
		expect(
			screen.getByText('Who can approve a bill, and up to what value.')
		).toBeInTheDocument();
	});

	it('does not truncate the description — it is the sentence, not a qualifier', () => {
		// `subtitle` truncates and every existing call site is written against
		// that. A description that truncated too would be the defect this prop
		// exists to avoid: the 240px section row already proved an ellipsis says
		// less than the label.
		render(Harness, { props: { description: 'Who can approve a bill.' } });
		const text = screen.getByText('Who can approve a bill.');
		expect(text.className).not.toContain('truncate');
		expect(text.className).not.toContain('line-clamp');
	});

	it('keeps subtitle a truncating one-liner beside it', () => {
		render(Harness, { props: { subtitle: 'Company-wide' } });
		expect(screen.getByText('Company-wide').className).toContain('truncate');
	});

	it('tops-aligns the header once a description can wrap', () => {
		// Centring the action row against three lines of prose floats it in the
		// middle of the header, which is the one thing a wrapping description
		// breaks about the existing header.
		render(Harness, { props: { description: 'Two lines of it.', withAction: true } });
		const header = section().querySelector('header') as HTMLElement;
		expect(header.className).toContain('items-start');
		expect(header.className).not.toContain('items-center');
	});

	it('keeps the header centred when there is no description', () => {
		render(Harness, { props: { subtitle: 'Company-wide' } });
		expect((section().querySelector('header') as HTMLElement).className).toContain(
			'items-center'
		);
	});
});

describe('Panel — the footer', () => {
	it('renders no strip at all when there are no actions', () => {
		render(Harness);
		expect(footer()).not.toBeInTheDocument();
	});

	it('renders the actions on a top-bordered muted strip, right-aligned', () => {
		render(Harness, { props: { withFooter: true } });
		const strip = footer() as HTMLElement;
		expect(strip).toBeInTheDocument();
		expect(strip.className).toContain('border-t');
		expect(strip.className).toContain('bg-muted/50');
		expect(strip.className).toContain('justify-end');
		expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});
});

describe('Panel — the destructive tone', () => {
	it('carries no tone attribute by default, so the prop is additive', () => {
		// The same reasoning as the shell's `measure` and `texture`: at the default
		// the attribute is ABSENT rather than set to a no-op value, so a panel that
		// never names a tone is byte-identical to one from before the prop existed.
		render(Harness);
		expect(section().hasAttribute('data-tone')).toBe(false);
		expect(section().className).toContain('border-border');
	});

	it('moves the rule and the title to the destructive ink', () => {
		render(Harness, { props: { title: 'Delete this workspace', tone: 'destructive' } });
		expect(section()).toHaveAttribute('data-tone', 'destructive');
		expect(section().className).toContain('border-destructive/40');
		expect(section().className).not.toContain('border-border');

		const heading = screen.getByRole('heading', { name: 'Delete this workspace' });
		expect(heading.className).toContain('text-destructive');

		const header = section().querySelector('header') as HTMLElement;
		expect(header.className).toContain('border-destructive/25');
	});

	it('takes the icon with it, so the header reads as one thing', () => {
		render(Harness, { props: { tone: 'destructive', withIcon: true } });
		const icon = section().querySelector('header svg') as SVGElement;
		expect(icon.getAttribute('class')).toContain('text-destructive');
		expect(icon.getAttribute('class')).not.toContain('text-muted-foreground');
	});
});
