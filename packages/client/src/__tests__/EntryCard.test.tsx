import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Entry } from '@travel-journal/shared';

import { EntryCard } from '../components/EntryCard.js';
import { AuthSessionProvider } from './AuthSessionProvider.js';

import { mockUser } from './mocks/handlers.js';

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    tripId: 'trip-1',
    authorId: 'user-1',
    authorName: 'Alice',
    title: 'My Adventure',
    content: 'It was a great day.',
    images: [],
    createdAt: new Date('2024-06-15T10:00:00Z').toISOString(),
    updatedAt: new Date('2024-06-15T10:00:00Z').toISOString(),
    ...overrides,
  };
}

function renderCard(
  entry: Entry,
  currentUserId: string,
  onDelete = vi.fn(),
): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/trips/trip-1/timeline']}>
      <AuthSessionProvider accessToken="mock-token" user={mockUser}>
        <Routes>
          <Route
            path="/trips/:id/timeline"
            element={
              <EntryCard
                entry={entry}
                tripId="trip-1"
                currentUserId={currentUserId}
                onDelete={onDelete}
              />
            }
          />
          <Route path="/trips/:id/entries/:entryId/edit" element={<div>Edit screen</div>} />
        </Routes>
      </AuthSessionProvider>
    </MemoryRouter>,
  );
}

describe('EntryCard', () => {
  it('renders title, author, and formatted content', () => {
    renderCard(makeEntry(), 'other-user');

    expect(screen.getByText('My Adventure')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('It was a great day.')).toBeInTheDocument();
  });

  it('renders location name when present', () => {
    const entry = makeEntry({ location: { lat: 10, lng: 20, name: 'Paris' } });
    renderCard(entry, 'other-user');

    expect(screen.getByText('Paris')).toBeInTheDocument();
  });

  it('does not show location when absent', () => {
    renderCard(makeEntry(), 'other-user');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('shows Edit and Delete buttons for the author', () => {
    const entry = makeEntry({ authorId: 'user-1' });
    renderCard(entry, 'user-1');

    expect(screen.getByRole('button', { name: /rediger|edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /slett|delete/i })).toBeInTheDocument();
  });

  it('hides Edit and Delete buttons for non-authors', () => {
    const entry = makeEntry({ authorId: 'user-1' });
    renderCard(entry, 'user-99');

    expect(screen.queryByRole('button', { name: /rediger|edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /slett|delete/i })).not.toBeInTheDocument();
  });

  it('calls onDelete with the entry id when delete is clicked', async () => {
    const onDelete = vi.fn();
    const entry = makeEntry({ authorId: 'user-1' });
    renderCard(entry, 'user-1', onDelete);

    await userEvent.click(screen.getByRole('button', { name: /slett|delete/i }));
    expect(onDelete).toHaveBeenCalledWith('entry-1');
  });

  it('renders images using the media proxy path, not a raw S3 URL', async () => {
    const entry = makeEntry({
      images: [
        { key: 'media/trip-1/abc.jpg', width: 800, height: 600, order: 0, uploadedAt: new Date().toISOString() },
      ],
    });
    renderCard(entry, 'other-user');

    await waitFor(() => {
      const img = screen.getByRole('img') as HTMLImageElement;
      expect(img.src).toMatch(/^blob:/);
      expect(img.src).not.toMatch(/\.s3\./);
    });
  });

  it('all images have loading="lazy" attribute', async () => {
    const entry = makeEntry({
      images: [
        { key: 'media/trip-1/a.jpg', width: 800, height: 600, order: 0, uploadedAt: new Date().toISOString() },
        { key: 'media/trip-1/b.jpg', width: 800, height: 600, order: 1, uploadedAt: new Date().toISOString() },
      ],
    });
    const { container } = renderCard(entry, 'other-user');
    // Thumbnail images use alt="" (decorative); they are omitted from the a11y tree, so query DOM img nodes.
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2), { timeout: 5000 });
    container.querySelectorAll('img').forEach((img) => expect(img).toHaveAttribute('loading', 'lazy'));
  });
});
