import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import type { Entry, Trip } from '@travel-journal/shared';

import { AuthProvider } from '../context/AuthContext.js';
import { TimelineScreen } from '../screens/TimelineScreen.js';

import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { mockUser } from './mocks/handlers.js';

const TRIP_ID = 'trip-1';

const mockTrip: Trip = {
  id: TRIP_ID,
  name: 'Adventure Trip',
  status: 'active',
  createdBy: 'user-1',
  members: [
    { userId: 'user-1', displayName: 'Test User', tripRole: 'creator', addedAt: new Date().toISOString() },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    tripId: TRIP_ID,
    authorId: 'user-1',
    authorName: 'Test User',
    title: 'Test Entry',
    content: 'Some content',
    images: [],
    reactions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderTimeline(user = mockUser, tripPartial?: Partial<Trip>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trip = { ...mockTrip, ...tripPartial };
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user }),
    ),
    http.get('/api/v1/trips/:id', () => HttpResponse.json(trip)),
  );
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={[`/trips/${TRIP_ID}/timeline`]}>
        <AuthProvider>
          <Routes>
            <Route path="/trips/:id/timeline" element={<TimelineScreen />} />
            <Route path="/trips/:id/entries/new" element={<div>New Entry</div>} />
            <Route path="/trips/:id/entries/:entryId/edit" element={<div>Edit Entry</div>} />
          </Routes>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TimelineScreen', () => {
  beforeEach(() => {
    // Mock IntersectionObserver
    const mockObserve = vi.fn();
    const mockDisconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn().mockImplementation((_cb: IntersectionObserverCallback) => ({
        observe: mockObserve,
        disconnect: mockDisconnect,
        unobserve: vi.fn(),
      })),
    );
  });

  it('renders a list of entry cards', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries: [makeEntry(), makeEntry({ id: 'entry-2', title: 'Entry 2' })], total: 2 }),
      ),
    );

    renderTimeline();

    await waitFor(() => {
      expect(screen.getByText('Test Entry')).toBeInTheDocument();
      expect(screen.getByText('Entry 2')).toBeInTheDocument();
    });
  });

  it('shows empty state message when no entries exist', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries: [], total: 0 }),
      ),
    );

    renderTimeline();

    await waitFor(() => {
      expect(
        screen.getByText(/ingen innlegg ennå|no entries yet/i),
      ).toBeInTheDocument();
    });
  });

  it('renders trip intro below empty state when trip has a description', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries: [], total: 0 }),
      ),
    );

    renderTimeline(mockUser, { description: 'Summit weekend in the Alps.' });

    await waitFor(() => {
      expect(screen.getByText('Summit weekend in the Alps.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trip-timeline-intro')).toBeInTheDocument();
  });

  it('renders trip intro after entry cards when trip has a description', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries: [makeEntry()], total: 1 }),
      ),
    );

    renderTimeline(mockUser, { description: 'Coastal road trip.' });

    await waitFor(() => {
      expect(screen.getByText('Test Entry')).toBeInTheDocument();
    });

    const intro = screen.getByTestId('trip-timeline-intro');
    const entryTitle = screen.getByText('Test Entry');
    expect(entryTitle.compareDocumentPosition(intro)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows Add Entry FAB for creators', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries: [], total: 0 }),
      ),
    );

    // mockUser has tripRole 'creator' via the mockTrip members
    renderTimeline(mockUser);

    // The FAB appears after the trip data (and its members) loads.
    expect(
      await screen.findByRole('button', { name: /legg til innlegg|add entry/i }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('hides Add Entry FAB for followers', async () => {
    const followerUser = { ...mockUser, id: 'follower-1' };
    const followerTrip: Trip = {
      ...mockTrip,
      members: [
        {
          userId: 'follower-1',
          displayName: 'Follower',
          tripRole: 'follower',
          addedAt: new Date().toISOString(),
        },
      ],
    };

    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: followerUser }),
      ),
      http.get('/api/v1/trips/:id', () => HttpResponse.json(followerTrip)),
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries: [], total: 0 }),
      ),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TestMemoryRouter initialEntries={[`/trips/${TRIP_ID}/timeline`]}>
          <AuthProvider>
            <Routes>
              <Route path="/trips/:id/timeline" element={<TimelineScreen />} />
            </Routes>
          </AuthProvider>
        </TestMemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /legg til innlegg|add entry/i })).not.toBeInTheDocument();
    });
  });

  it('renders Story Mode toggle button', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries: [], total: 0 }),
      ),
    );

    renderTimeline();

    await waitFor(() => {
      expect(screen.getByTestId('story-mode-toggle')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trip-notification-mode-trigger')).toBeInTheDocument();
  });

  it('shows timeline shell and skeleton rows while first entries page is loading', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, async () => {
        await delay(4000);
        return HttpResponse.json({ entries: [], total: 0 });
      }),
    );

    renderTimeline();

    expect(
      await screen.findByTestId('story-mode-toggle', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('timeline-entry-skeleton')).toHaveLength(4);
  });

  it('shows entries load error and retry when entries request fails', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ message: 'Server error' }, { status: 500 }),
      ),
    );

    renderTimeline();

    await waitFor(() => {
      expect(screen.getByText(/kunne ikke laste innlegg/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /prøv igjen/i })).toBeInTheDocument();
  });

  it('shows day headers when Story Mode is toggled on', async () => {
    const day1Entry = makeEntry({
      id: 'e1',
      title: 'Day 1 Entry',
      createdAt: '2024-06-10T08:00:00.000Z',
    });
    const day2Entry = makeEntry({
      id: 'e2',
      title: 'Day 2 Entry',
      createdAt: '2024-06-11T08:00:00.000Z',
    });

    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries: [day1Entry, day2Entry], total: 2 }),
      ),
    );

    renderTimeline();

    await waitFor(() => {
      expect(screen.getByText('Day 1 Entry')).toBeInTheDocument();
    });

    // Story Mode is off by default — no DayHeader elements
    expect(screen.queryAllByTestId('day-header')).toHaveLength(0);

    // Toggle Story Mode on
    await userEvent.click(screen.getByTestId('story-mode-toggle'));

    // Two entries on two different days → two DayHeader elements
    await waitFor(() => {
      expect(screen.getAllByTestId('day-header')).toHaveLength(2);
    });
  });

  it('infinite scroll: intersecting the sentinel triggers next-page query', async () => {
    let observerCallback: IntersectionObserverCallback | undefined;

    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn().mockImplementation((cb: IntersectionObserverCallback) => {
        observerCallback = cb;
        return {
          observe: vi.fn(),
          disconnect: vi.fn(),
          unobserve: vi.fn(),
        };
      }),
    );

    // First page: 20 entries, total = 25 (so there's a next page)
    const page1Entries = Array.from({ length: 20 }, (_, i) =>
      makeEntry({ id: `entry-${i}`, title: `Entry ${i}` }),
    );
    const page2Entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ id: `entry-p2-${i}`, title: `Page2 Entry ${i}` }),
    );

    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, ({ request }) => {
        const url = new URL(request.url);
        const page = url.searchParams.get('page') ?? '1';
        if (page === '1') {
          return HttpResponse.json({ entries: page1Entries, total: 25 });
        }
        return HttpResponse.json({ entries: page2Entries, total: 25 });
      }),
    );

    renderTimeline();

    // Wait for first page to load
    await waitFor(() => {
      expect(screen.getByText('Entry 0')).toBeInTheDocument();
    });

    // Simulate intersection
    await act(async () => {
      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    // Second page should be fetched
    await waitFor(() => {
      expect(screen.getByText('Page2 Entry 0')).toBeInTheDocument();
    });
  });

  it('delete from overflow opens confirm dialog; cancel keeps entry and skips DELETE', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries: [makeEntry()], total: 1 }),
      ),
    );

    renderTimeline();

    await waitFor(() => {
      expect(screen.getByText('Test Entry')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /more options|flere valg/i }));
    await userEvent.click(screen.getByRole('button', { name: /^delete$|^slett$/i }));

    expect(screen.getByTestId('delete-entry-dialog')).toBeInTheDocument();
    expect(screen.getByText(/delete this entry\?|slette dette innlegget\?/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /cancel|avbryt/i }));

    const deleteCalls = fetchSpy.mock.calls.filter(
      (c) => String(c[0]).includes('/entries/') && (c[1] as RequestInit)?.method === 'DELETE',
    );
    expect(deleteCalls.length).toBe(0);
    expect(screen.getByText('Test Entry')).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it('confirming in-app delete calls DELETE and removes the entry card', async () => {
    let entries: Entry[] = [makeEntry()];
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries, total: entries.length }),
      ),
      http.delete(`/api/v1/trips/${TRIP_ID}/entries/:entryId`, ({ params }) => {
        entries = entries.filter((e) => e.id !== params['entryId']);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderTimeline();

    await waitFor(() => {
      expect(screen.getByText('Test Entry')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /more options|flere valg/i }));
    await userEvent.click(screen.getByRole('button', { name: /^delete$|^slett$/i }));

    const dialog = screen.getByTestId('delete-entry-dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$|^slett$/i }));

    await waitFor(() => {
      expect(screen.queryByText('Test Entry')).not.toBeInTheDocument();
    });
  });
});
