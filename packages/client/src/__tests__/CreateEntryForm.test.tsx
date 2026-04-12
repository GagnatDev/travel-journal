import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { Entry } from '@travel-journal/shared';

import { AuthProvider } from '../context/AuthContext.js';
import { CreateEntryScreen } from '../screens/CreateEntryScreen.js';

import { server } from './mocks/server.js';
import { mockUser } from './mocks/handlers.js';

const TRIP_ID = 'trip-1';

const mockEntry: Entry = {
  id: 'entry-1',
  tripId: TRIP_ID,
  authorId: 'user-1',
  authorName: 'Test User',
  title: 'Existing Entry',
  content: 'Existing content',
  images: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function renderCreate(initialPath = `/trips/${TRIP_ID}/entries/new`) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
    ),
  );
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <Routes>
            <Route path="/trips/:id/entries/new" element={<CreateEntryScreen />} />
            <Route path="/trips/:id/entries/:entryId/edit" element={<CreateEntryScreen />} />
            <Route path="/trips/:id/timeline" element={<div data-testid="timeline">Timeline</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CreateEntryScreen', () => {
  beforeEach(() => {
    // Mock geolocation
    const mockGetCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 59.9139, longitude: 10.7522, accuracy: 10 } as GeolocationCoordinates,
        timestamp: Date.now(),
      } as GeolocationPosition);
    });
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: mockGetCurrentPosition },
    });
  });

  it('submitting without a title shows validation error; no API call made', async () => {
    const postSpy = vi.fn();
    server.use(
      http.post(`/api/v1/trips/${TRIP_ID}/entries`, () => {
        postSpy();
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    renderCreate();

    await waitFor(() => {
      expect(screen.getByLabelText(/tittel|title/i)).toBeInTheDocument();
    });

    // Try to submit without a title
    await userEvent.click(screen.getByRole('button', { name: /lagre|save/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('enabling location toggle calls geolocation.getCurrentPosition and shows coordinates', async () => {
    renderCreate();

    await waitFor(() => {
      expect(screen.getByLabelText(/legg til plassering|add location/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText(/legg til plassering|add location/i));

    await waitFor(() => {
      expect(screen.getByText(/59.91390|59\.9139/i)).toBeInTheDocument();
    });
  });

  it('navigating away with unsaved changes triggers a confirmation dialog', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderCreate();

    await waitFor(() => {
      expect(screen.getByLabelText(/tittel|title/i)).toBeInTheDocument();
    });

    // Type something to make the form dirty
    await userEvent.type(screen.getByLabelText(/tittel|title/i), 'Draft title');

    // Click cancel
    await userEvent.click(screen.getByRole('button', { name: /avbryt|cancel/i }));

    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('cancelling without changes navigates back without confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderCreate();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /avbryt|cancel/i })).toBeInTheDocument();
    });

    // Click cancel immediately (no changes)
    await userEvent.click(screen.getByRole('button', { name: /avbryt|cancel/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('successful submit navigates back to the timeline', async () => {
    server.use(
      http.post(`/api/v1/trips/${TRIP_ID}/entries`, () =>
        HttpResponse.json({ ...mockEntry, id: 'new-entry' }, { status: 201 }),
      ),
    );

    renderCreate();

    await waitFor(() => {
      expect(screen.getByLabelText(/tittel|title/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/tittel|title/i), 'My New Entry');
    await userEvent.type(
      screen.getByLabelText(/innhold|content/i),
      'Some content here',
    );
    await userEvent.click(screen.getByRole('button', { name: /lagre|save/i }));

    await waitFor(() => {
      expect(screen.getByTestId('timeline')).toBeInTheDocument();
    });
  });

  it('edit mode loads existing entry into the form', async () => {
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries/:entryId`, () =>
        HttpResponse.json(mockEntry),
      ),
    );

    renderCreate(`/trips/${TRIP_ID}/entries/entry-1/edit`);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Existing Entry')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Existing content')).toBeInTheDocument();
    });
  });
});
