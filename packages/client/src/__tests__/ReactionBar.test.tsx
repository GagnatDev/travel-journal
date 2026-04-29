import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Reaction } from '@travel-journal/shared';

import { ReactionBar } from '../components/ReactionBar.js';
import { AuthSessionProvider } from './AuthSessionProvider.js';
import { mockUser } from './mocks/handlers.js';

function renderBar(reactions: Reaction[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthSessionProvider accessToken="mock-token" user={mockUser}>
        <ReactionBar tripId="trip-1" entryId="entry-1" reactions={reactions} />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

describe('ReactionBar', () => {
  it('renders three emoji buttons', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /❤️/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /👍/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /😂/u })).toBeInTheDocument();
  });

  it('shows reaction count when reactions are present', () => {
    const reactions: Reaction[] = [
      { emoji: '❤️', userId: 'other-user', createdAt: new Date().toISOString() },
      { emoji: '❤️', userId: 'user-2', createdAt: new Date().toISOString() },
    ];
    renderBar(reactions);

    expect(screen.getByRole('button', { name: /❤️ 2/u })).toBeInTheDocument();
  });

  it('marks the button as pressed when the current user has reacted', () => {
    const reactions: Reaction[] = [
      { emoji: '👍', userId: mockUser.id, createdAt: new Date().toISOString() },
    ];
    renderBar(reactions);

    const btn = screen.getByRole('button', { name: /👍/u });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not mark button as pressed when another user reacted', () => {
    const reactions: Reaction[] = [
      { emoji: '👍', userId: 'different-user', createdAt: new Date().toISOString() },
    ];
    renderBar(reactions);

    const btn = screen.getByRole('button', { name: /👍/u });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls toggle reaction API on click', async () => {
    renderBar();

    await userEvent.click(screen.getByRole('button', { name: /❤️/u }));

    // After mutation succeeds the handler returns a reaction for user-1
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /❤️ 1/u })).toBeInTheDocument();
    });
  });
});
