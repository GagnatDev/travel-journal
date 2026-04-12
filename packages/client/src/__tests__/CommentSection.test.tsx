import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { Comment } from '@travel-journal/shared';

import { CommentSection } from '../components/CommentSection.js';

import { AuthSessionProvider } from './AuthSessionProvider.js';
import { mockUser } from './mocks/handlers.js';
import { server } from './mocks/server.js';

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthSessionProvider accessToken="mock-token" user={mockUser}>
        <CommentSection tripId="trip-1" entryId="entry-1" />
      </AuthSessionProvider>
    </QueryClientProvider>,
  );
}

describe('CommentSection', () => {
  it('renders a collapsed toggle button', () => {
    renderSection();
    // toggle button shows comment count (zero state)
    expect(screen.getByRole('button', { name: /kommentar/i })).toBeInTheDocument();
  });

  it('expands comment section on button click and shows input', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /kommentar/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/kommentar/i)).toBeInTheDocument();
    });
  });

  it('loads and displays existing comments when expanded', async () => {
    const mockComment: Comment = {
      id: 'c-1',
      entryId: 'entry-1',
      tripId: 'trip-1',
      authorId: 'user-2',
      authorName: 'Alice',
      content: 'Great entry!',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    server.use(
      http.get('/api/v1/trips/:id/entries/:entryId/comments', () =>
        HttpResponse.json([mockComment]),
      ),
    );

    renderSection();
    await userEvent.click(screen.getByRole('button', { name: /kommentar/i }));

    await waitFor(() => {
      expect(screen.getByText('Great entry!')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  it("shows delete button only for the current user's own comment", async () => {
    const ownComment: Comment = {
      id: 'c-own',
      entryId: 'entry-1',
      tripId: 'trip-1',
      authorId: mockUser.id,
      authorName: mockUser.displayName,
      content: 'My comment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const otherComment: Comment = {
      id: 'c-other',
      entryId: 'entry-1',
      tripId: 'trip-1',
      authorId: 'other-user',
      authorName: 'Other',
      content: 'Their comment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    server.use(
      http.get('/api/v1/trips/:id/entries/:entryId/comments', () =>
        HttpResponse.json([ownComment, otherComment]),
      ),
    );

    renderSection();
    await userEvent.click(screen.getByRole('button', { name: /kommentar/i }));

    await waitFor(() => {
      expect(screen.getByText('My comment')).toBeInTheDocument();
      expect(screen.getByText('Their comment')).toBeInTheDocument();
    });

    // Only one delete button: for own comment (nb translation = 'Slett')
    const deleteButtons = screen.getAllByRole('button', { name: /slett/i });
    expect(deleteButtons).toHaveLength(1);
  });

  it('submits a new comment and clears the input', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: /kommentar/i }));

    const input = await screen.findByPlaceholderText(/kommentar/i);
    await userEvent.type(input, 'Hello!');

    // Submit button text (nb) = 'Publiser'
    const submitBtn = screen.getByRole('button', { name: /publiser/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });
});
