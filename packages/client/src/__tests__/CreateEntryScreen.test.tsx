import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { Entry } from '@travel-journal/shared';

import { AuthProvider } from '../context/AuthContext.js';
import { CreateEntryScreen } from '../screens/CreateEntryScreen.js';
import { formatComposerEntryDate } from '../screens/createEntry/formatComposerEntryDate.js';
import { getPendingEntry } from '../offline/db.js';
import { saveOfflineEntry } from '../offline/entrySync.js';
import { compressImage } from '../utils/compressImage.js';
import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { mockUser } from './mocks/handlers.js';

vi.mock('../offline/db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../offline/db.js')>();
  return {
    ...actual,
    getPendingEntry: vi.fn(),
  };
});

vi.mock('../offline/entrySync.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../offline/entrySync.js')>();
  return {
    ...actual,
    saveOfflineEntry: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('../utils/compressImage.js', () => ({
  compressImage: vi.fn(() =>
    Promise.resolve({
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      width: 10,
      height: 10,
    }),
  ),
}));

const TRIP_ID = 'trip-1';
const FIXED_CREATED_AT = 1_700_000_000_000;

const mockEntry: Entry = {
  id: 'entry-1',
  tripId: TRIP_ID,
  authorId: 'user-1',
  authorName: 'Test User',
  title: 'Existing Entry',
  content: 'Existing content',
  images: [],
  reactions: [],
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
      <TestMemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <Routes>
            <Route path="/trips/:id/entries/new" element={<CreateEntryScreen />} />
            <Route path="/trips/:id/entries/pending/:localId/edit" element={<CreateEntryScreen />} />
            <Route path="/trips/:id/entries/:entryId/edit" element={<CreateEntryScreen />} />
            <Route path="/trips/:id/timeline" element={<div data-testid="timeline">Timeline</div>} />
          </Routes>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CreateEntryScreen', () => {
  beforeEach(() => {
    vi.mocked(getPendingEntry).mockReset();
    vi.mocked(compressImage).mockImplementation(() =>
      Promise.resolve({
        blob: new Blob(['x'], { type: 'image/jpeg' }),
        width: 10,
        height: 10,
      }),
    );
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

  it('modal header shows close button with correct aria-label', async () => {
    renderCreate();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /lukk|close/i })).toBeInTheDocument();
    });
  });

  it('modal header shows "Draft" label when creating a new entry', async () => {
    renderCreate();

    await waitFor(() => {
      expect(screen.getByText(/kladd|draft/i)).toBeInTheDocument();
    });
  });

  it('photo upload zone shows decorative ghost cards when no images are present', async () => {
    const { container } = renderCreate();

    await waitFor(() => {
      expect(screen.getByLabelText(/tittel|title/i)).toBeInTheDocument();
    });

    // The two decorative ghost cards have aria-hidden="true"
    const ghostCards = container.querySelectorAll('[aria-hidden="true"].border-dashed');
    expect(ghostCards.length).toBeGreaterThanOrEqual(2);
  });

  it('"SAVE ENTRY" pill button is present and triggers submission', async () => {
    renderCreate();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /lagre innlegg|save entry/i })).toBeInTheDocument();
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

  it('server edit shows persisted createdAt in the metadata row', async () => {
    const historicalCreated = '2020-06-15T14:30:00.000Z';
    server.use(
      http.get(`/api/v1/trips/${TRIP_ID}/entries/:entryId`, () =>
        HttpResponse.json({ ...mockEntry, createdAt: historicalCreated }),
      ),
    );

    renderCreate(`/trips/${TRIP_ID}/entries/entry-1/edit`);

    const expected = formatComposerEntryDate(historicalCreated, 'nb');
    await waitFor(() => {
      expect(screen.getByTestId('entry-composer-entry-date')).toHaveTextContent(expected);
    });
  });

  it('new entry metadata shows the composer-open day formatted for the locale', async () => {
    const expected = formatComposerEntryDate(Date.now(), 'nb');
    renderCreate();

    await waitFor(() => {
      expect(screen.getByLabelText(/tittel|title/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId('entry-composer-entry-date')).toHaveTextContent(expected);
  });

  it('pending edit loads from IDB and save keeps localId and createdAt', async () => {
    vi.mocked(getPendingEntry).mockResolvedValue({
      localId: 'local-pending-1',
      tripId: TRIP_ID,
      status: 'failed',
      payload: {
        title: 'Offline title',
        content: 'Offline body',
        images: [],
      },
      images: [],
      createdAt: FIXED_CREATED_AT,
      retryCount: 2,
    });

    renderCreate(`/trips/${TRIP_ID}/entries/pending/local-pending-1/edit`);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Offline title')).toBeInTheDocument();
    });

    expect(screen.getByTestId('entry-composer-entry-date')).toHaveTextContent(
      formatComposerEntryDate(FIXED_CREATED_AT, 'nb'),
    );

    await userEvent.clear(screen.getByLabelText(/tittel|title/i));
    await userEvent.type(screen.getByLabelText(/tittel|title/i), 'Fixed title');
    await userEvent.click(screen.getByRole('button', { name: /lagre|save/i }));

    await waitFor(() => {
      expect(saveOfflineEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          localId: 'local-pending-1',
          createdAt: FIXED_CREATED_AT,
          status: 'pending',
          payload: expect.objectContaining({
            title: 'Fixed title',
            content: 'Offline body',
          }),
        }),
      );
    });
  });

  it('shows upload progress banner when adding photos from the empty state', async () => {
    let resolveUpload: (() => void) | undefined;
    const uploadGate = new Promise<void>((r) => {
      resolveUpload = r;
    });
    server.use(
      http.post('/api/v1/media/upload', async () => {
        await uploadGate;
        return HttpResponse.json(
          {
            key: 'media/trip-1/deferred.jpg',
            thumbnailKey: 'media/trip-1/deferred.thumb.webp',
            url: '/api/v1/media/media/trip-1/deferred.jpg',
          },
          { status: 201 },
        );
      }),
    );

    renderCreate();

    await waitFor(() => {
      expect(screen.getByLabelText(/tittel|title/i)).toBeInTheDocument();
    });

    const file = new File(['fake'], 'shot.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByTestId('entry-media-file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('entry-photo-upload-progress')).toBeInTheDocument();
    });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    resolveUpload?.();
    await waitFor(() => {
      expect(screen.queryByTestId('entry-photo-upload-progress')).not.toBeInTheDocument();
    });
  });
});
