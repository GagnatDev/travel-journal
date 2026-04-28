import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { Trip } from '@travel-journal/shared';

import { AuthProvider } from '../context/AuthContext.js';
import { CreateTripModal } from '../components/CreateTripModal.js';

import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { mockUser } from './mocks/handlers.js';

function makeTrip(name: string): Trip {
  return {
    id: 'new-trip',
    name,
    status: 'planned',
    createdBy: 'user-1',
    allowContributorInvites: false,
    members: [{ userId: 'user-1', displayName: 'Test User', tripRole: 'creator', addedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
    ),
  );
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={['/trips']}>
        <AuthProvider>
          <Routes>
            <Route path="/trips" element={<CreateTripModal onClose={onClose} />} />
            <Route path="/trips/:id/timeline" element={<div>Timeline</div>} />
          </Routes>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CreateTripModal', () => {
  it('shows validation error and makes no API call when name is empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderModal();

    await waitFor(() => screen.getByRole('dialog'));

    await userEvent.click(screen.getByRole('button', { name: /opprett tur|create trip/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();

    const tripCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('/api/v1/trips'));
    expect(tripCalls.length).toBe(0);
    fetchSpy.mockRestore();
  });

  it('closes modal and navigates to new trip on success', async () => {
    const onClose = vi.fn();
    server.use(
      http.post('/api/v1/trips', async () => {
        return HttpResponse.json(makeTrip('My New Trip'), { status: 201 });
      }),
    );

    renderModal(onClose);

    await waitFor(() => screen.getByRole('dialog'));

    await userEvent.type(screen.getByLabelText(/turnavn|trip name/i), 'My New Trip');
    await userEvent.click(screen.getByRole('button', { name: /opprett tur|create trip/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });
  });
});
