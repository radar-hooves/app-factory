// Interaction proof, not a render-only check (rules-library/core/73-verification.md
// §"Behaviour vs Appearance"). This is the gate that would have caught the
// checkbox/index.ts bug fixed in this same pass — that bug compiled and
// typechecked cleanly; only real interaction surfaced it. Covers one
// representative of each shape the package ships: a simple bindable toggle
// (Checkbox, Switch), a portal-based compound component (Dialog,
// DropdownMenu), and a value-driven compound component (Tabs).
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import InteractionSmoke from './interaction-smoke.svelte';

describe('shared component interaction smoke test', () => {
  it('toggles Checkbox on click', async () => {
    render(InteractionSmoke);
    const checkbox = screen.getByRole('checkbox', { name: 'smoke-checkbox' });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    await fireEvent.click(checkbox);

    await waitFor(() => {
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('toggles Switch on click', async () => {
    render(InteractionSmoke);
    const toggle = screen.getByRole('switch', { name: 'smoke-switch' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('opens Dialog content on trigger click', async () => {
    render(InteractionSmoke);
    expect(screen.queryByText('Smoke dialog')).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    await waitFor(() => {
      expect(screen.getByText('Smoke dialog')).toBeInTheDocument();
    });
  });

  it('switches Tabs content on trigger click', async () => {
    render(InteractionSmoke);
    expect(screen.getByText('Content one')).toBeVisible();

    await fireEvent.click(screen.getByRole('tab', { name: 'Two' }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('opens DropdownMenu content on trigger click', async () => {
    render(InteractionSmoke);
    expect(screen.queryByText('Smoke item')).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    await waitFor(() => {
      expect(screen.getByText('Smoke item')).toBeInTheDocument();
    });
  });
});
