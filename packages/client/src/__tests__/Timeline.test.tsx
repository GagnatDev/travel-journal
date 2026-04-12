import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
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

function renderTimeline(user = mockUser) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user }),
    ),
    http.get('/api/v1/trips/:id', () => HttpResponse.json(mockTrip)),
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

  it('shows Add Entry FAB for creators', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ entries: [], total: 0 }),
      ),
    );

    // mockUser has tripRole 'creator' via the mockTrip members
    renderTimeline(mockUser);

    // Entries and trip load in parallel; the FAB needs trip.members (see BottomNavBar
    // canAddEntry). waitFor only on the button can time out when entries finish first.
    await screen.findByRole('heading', { name: 'Adventure Trip' }, { timeout: 5000 });
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

    await screen.findByRole('heading', { name: 'Adventure Trip' });
    expect(screen.getByTestId('story-mode-toggle')).toBeInTheDocument();
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
});
