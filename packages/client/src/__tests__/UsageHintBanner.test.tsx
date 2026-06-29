import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { UsageHintBanner } from '../components/UsageHintBanner.js';
import { dismissUsageHint, isUsageHintVisible } from '../lib/usageHintsPrefs.js';

describe('UsageHintBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders when visible and context matches', () => {
    render(
      <UsageHintBanner hintId="createTrip" when={true}>
        Tap Create to start your first trip.
      </UsageHintBanner>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Tap Create to start your first trip.');
  });

  it('does not render when context gate is false', () => {
    render(
      <UsageHintBanner hintId="createTrip" when={false}>
        Tap Create to start your first trip.
      </UsageHintBanner>,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('dismisses and persists', async () => {
    const user = userEvent.setup();
    render(
      <UsageHintBanner hintId="createTrip" when={true}>
        Tap Create to start your first trip.
      </UsageHintBanner>,
    );

    await user.click(screen.getByRole('button', { name: 'Lukk hint' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(isUsageHintVisible('createTrip')).toBe(false);
  });

  it('stays hidden after dismiss even when remounted', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <UsageHintBanner hintId="createTrip" when={true}>
        Tap Create to start your first trip.
      </UsageHintBanner>,
    );

    await user.click(screen.getByRole('button', { name: 'Lukk hint' }));
    unmount();

    render(
      <UsageHintBanner hintId="createTrip" when={true}>
        Tap Create to start your first trip.
      </UsageHintBanner>,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not render when already dismissed', () => {
    dismissUsageHint('createTrip');
    render(
      <UsageHintBanner hintId="createTrip" when={true}>
        Tap Create to start your first trip.
      </UsageHintBanner>,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});
