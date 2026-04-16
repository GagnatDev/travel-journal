import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Entry } from '@travel-journal/shared';

import { EntryCard } from '../components/EntryCard.js';

import { AuthSessionProvider } from './AuthSessionProvider.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
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
    reactions: [],
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={['/trips/trip-1/timeline']}>
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
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EntryCard', () => {
  it('renders title and author name', () => {
    renderCard(makeEntry(), 'other-user');

    expect(screen.getByText('My Adventure')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders the entry content', () => {
    renderCard(makeEntry(), 'other-user');
    // The content "It was a great day." should appear in the card
    expect(screen.getAllByText(/it was a great day/i).length).toBeGreaterThan(0);
  });

  it('renders an Avatar with the author name', () => {
    renderCard(makeEntry(), 'other-user');
    // Avatar renders a div[role="img"] with aria-label equal to the name
    expect(screen.getByRole('img', { name: 'Alice' })).toBeInTheDocument();
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

  it('overflow menu button is present for the author and hidden by default', () => {
    const entry = makeEntry({ authorId: 'user-1' });
    renderCard(entry, 'user-1');

    expect(screen.getByRole('button', { name: /flere valg|more options/i })).toBeInTheDocument();
    // Edit and delete are hidden until the menu is opened
    expect(screen.queryByRole('button', { name: /rediger|edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /slett|delete/i })).not.toBeInTheDocument();
  });

  it('overflow menu is not shown for non-authors', () => {
    const entry = makeEntry({ authorId: 'user-1' });
    renderCard(entry, 'user-99');

    expect(screen.queryByRole('button', { name: /flere valg|more options/i })).not.toBeInTheDocument();
  });

  it('shows Edit and Delete after opening overflow menu', async () => {
    const entry = makeEntry({ authorId: 'user-1' });
    renderCard(entry, 'user-1');

    await userEvent.click(screen.getByRole('button', { name: /flere valg|more options/i }));

    expect(screen.getByRole('button', { name: /rediger|edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /slett|delete/i })).toBeInTheDocument();
  });

  it('calls onDelete with the entry id when delete is clicked from overflow menu', async () => {
    const onDelete = vi.fn();
    const entry = makeEntry({ authorId: 'user-1' });
    renderCard(entry, 'user-1', onDelete);

    await userEvent.click(screen.getByRole('button', { name: /flere valg|more options/i }));
    await userEvent.click(screen.getByRole('button', { name: /slett|delete/i }));
    expect(onDelete).toHaveBeenCalledWith('entry-1');
  });

  it('hero image is inside an aspect-ratio wrapper above the author row', () => {
    const entry = makeEntry({
      images: [
        { key: 'media/trip-1/abc.jpg', width: 800, height: 600, order: 0, uploadedAt: new Date().toISOString() },
      ],
    });
    const { container } = renderCard(entry, 'other-user');

    const heroWrapper = container.querySelector('.aspect-\\[4\\/3\\]');
    expect(heroWrapper).toBeInTheDocument();

    // The author row should come AFTER the hero wrapper in the DOM
    const article = container.querySelector('article');
    const children = article ? Array.from(article.children) : [];
    const heroIndex = children.findIndex((el) => el.classList.contains('aspect-[4/3]'));
    const authorRowIndex = children.findIndex(
      (el) => el.classList.contains('px-4') && el.classList.contains('pt-3'),
    );
    expect(heroIndex).toBeGreaterThanOrEqual(0);
    expect(authorRowIndex).toBeGreaterThan(heroIndex);
  });

  it('renders images using the media proxy path, not a raw S3 URL', async () => {
    const entry = makeEntry({
      images: [
        { key: 'media/trip-1/abc.jpg', width: 800, height: 600, order: 0, uploadedAt: new Date().toISOString() },
      ],
    });
    renderCard(entry, 'other-user');

    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      // The hero image is loaded via auth proxy (blob URL). The avatar has role=img too.
      const heroImg = imgs.find((el) => el.tagName === 'IMG') as HTMLImageElement | undefined;
      if (heroImg) {
        expect(heroImg.src).toMatch(/^blob:/);
        expect(heroImg.src).not.toMatch(/\.s3\./);
      }
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

  it('opens carousel from a thumbnail, supports navigation and closes', async () => {
    const entry = makeEntry({
      images: [
        { key: 'media/trip-1/a.jpg', width: 800, height: 600, order: 0, uploadedAt: new Date().toISOString() },
        { key: 'media/trip-1/b.jpg', width: 800, height: 600, order: 1, uploadedAt: new Date().toISOString() },
        { key: 'media/trip-1/c.jpg', width: 800, height: 600, order: 2, uploadedAt: new Date().toISOString() },
      ],
    });
    const user = userEvent.setup();
    renderCard(entry, 'other-user');

    const openSecondImageButton = await screen.findByRole('button', { name: /open image 2/i });
    await user.click(openSecondImageButton);

    expect(
      screen.getByRole('dialog', { name: /image carousel|entries\.carousel\.dialogLabel/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next image|entries\.carousel\.nextImage/i }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /previous image|entries\.carousel\.previousImage/i }),
    );
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /close image carousel|entries\.carousel\.closeImageCarousel/i }),
    );
    expect(
      screen.queryByRole('dialog', { name: /image carousel|entries\.carousel\.dialogLabel/i }),
    ).not.toBeInTheDocument();
  });

  it('closes the carousel on browser back without leaving the timeline route', async () => {
    const entry = makeEntry({
      images: [
        { key: 'media/trip-1/a.jpg', width: 800, height: 600, order: 0, uploadedAt: new Date().toISOString() },
        { key: 'media/trip-1/b.jpg', width: 800, height: 600, order: 1, uploadedAt: new Date().toISOString() },
      ],
    });
    const user = userEvent.setup();
    renderCard(entry, 'other-user');

    await user.click(await screen.findByRole('button', { name: /open image carousel/i }));
    expect(
      screen.getByRole('dialog', { name: /image carousel|entries\.carousel\.dialogLabel/i }),
    ).toBeInTheDocument();

    window.history.back();

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /image carousel|entries\.carousel\.dialogLabel/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('changes carousel image on horizontal swipe gestures', async () => {
    const entry = makeEntry({
      images: [
        { key: 'media/trip-1/a.jpg', width: 800, height: 600, order: 0, uploadedAt: new Date().toISOString() },
        { key: 'media/trip-1/b.jpg', width: 800, height: 600, order: 1, uploadedAt: new Date().toISOString() },
      ],
    });
    const user = userEvent.setup();
    renderCard(entry, 'other-user');

    await user.click(await screen.findByRole('button', { name: /open image carousel/i }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    const carouselContainer = screen.getByTestId('entry-image-carousel-swipe-area');

    fireEvent.touchStart(carouselContainer, {
      changedTouches: [{ clientX: 220 }],
    });
    fireEvent.touchEnd(carouselContainer, {
      changedTouches: [{ clientX: 120 }],
    });
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    fireEvent.touchStart(carouselContainer, {
      changedTouches: [{ clientX: 120 }],
    });
    fireEvent.touchEnd(carouselContainer, {
      changedTouches: [{ clientX: 220 }],
    });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('does not open another entry carousel while one is open', async () => {
    const firstEntry = makeEntry({
      id: 'entry-1',
      title: 'First entry',
      images: [
        { key: 'media/trip-1/a1.jpg', width: 800, height: 600, order: 0, uploadedAt: new Date().toISOString() },
        { key: 'media/trip-1/a2.jpg', width: 800, height: 600, order: 1, uploadedAt: new Date().toISOString() },
      ],
    });
    const secondEntry = makeEntry({
      id: 'entry-2',
      title: 'Second entry',
      images: [
        { key: 'media/trip-1/b1.jpg', width: 800, height: 600, order: 0, uploadedAt: new Date().toISOString() },
        { key: 'media/trip-1/b2.jpg', width: 800, height: 600, order: 1, uploadedAt: new Date().toISOString() },
        { key: 'media/trip-1/b3.jpg', width: 800, height: 600, order: 2, uploadedAt: new Date().toISOString() },
      ],
    });
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <TestMemoryRouter initialEntries={['/trips/trip-1/timeline']}>
          <AuthSessionProvider accessToken="mock-token" user={mockUser}>
            <Routes>
              <Route
                path="/trips/:id/timeline"
                element={
                  <>
                    <EntryCard entry={firstEntry} tripId="trip-1" currentUserId="other-user" />
                    <EntryCard entry={secondEntry} tripId="trip-1" currentUserId="other-user" />
                  </>
                }
              />
            </Routes>
          </AuthSessionProvider>
        </TestMemoryRouter>
      </QueryClientProvider>,
    );

    await user.click((await screen.findAllByRole('button', { name: /open image carousel/i }))[0]!);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    await user.click((await screen.findAllByRole('button', { name: /open image carousel/i }))[1]!);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.queryByText('1 / 3')).not.toBeInTheDocument();
  });
});
