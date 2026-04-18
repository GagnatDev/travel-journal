import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../context/AuthContext.js';
import { TripNotificationModeControl } from '../components/timeline/TripNotificationModeControl.js';

import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { mockUser } from './mocks/handlers.js';

vi.mock('../notifications/push.js', () => ({
  ensurePushSubscription: vi.fn(async () => 'granted'),
  getPushPermissionState: vi.fn(() => 'granted'),
}));

function renderControl(currentMode: 'off' | 'per_entry' | 'daily_digest' | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
    ),
  );
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter>
        <AuthProvider>
          <TripNotificationModeControl tripId="trip-1" currentMode={currentMode} />
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TripNotificationModeControl', () => {
  it('defaults to per_entry when currentMode is undefined (legacy doc)', async () => {
    renderControl(undefined);

    await userEvent.click(screen.getByTestId('trip-notification-mode-trigger'));
    await screen.findByTestId('trip-notification-mode-popover');

    const perEntry = screen.getByTestId('trip-notification-mode-option-per_entry');
    expect(perEntry).toHaveAttribute('aria-checked', 'true');
  });

  it('offers all three modes in the popover', async () => {
    renderControl('off');

    await userEvent.click(screen.getByTestId('trip-notification-mode-trigger'));
    await screen.findByTestId('trip-notification-mode-popover');

    expect(screen.getByTestId('trip-notification-mode-option-per_entry')).toBeInTheDocument();
    expect(screen.getByTestId('trip-notification-mode-option-daily_digest')).toBeInTheDocument();
    expect(screen.getByTestId('trip-notification-mode-option-off')).toBeInTheDocument();

    expect(screen.getByTestId('trip-notification-mode-option-off')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('PATCHes newEntriesMode when a new option is picked', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    server.use(
      http.patch(
        '/api/v1/trips/trip-1/members/me/notification-preferences',
        async ({ request }) => {
          const body = (await request.json()) as { newEntriesMode: string };
          return HttpResponse.json({
            id: 'trip-1',
            name: 'Trip',
            status: 'active',
            createdBy: 'user-1',
            members: [
              {
                userId: 'user-1',
                displayName: 'User',
                tripRole: 'creator',
                addedAt: new Date().toISOString(),
                notificationPreferences: { newEntriesMode: body.newEntriesMode },
              },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        },
      ),
    );

    renderControl('per_entry');

    await userEvent.click(screen.getByTestId('trip-notification-mode-trigger'));
    await userEvent.click(screen.getByTestId('trip-notification-mode-option-daily_digest'));

    await waitFor(() => {
      const patchCalls = fetchSpy.mock.calls.filter(
        (c) =>
          String(c[0]).includes('/api/v1/trips/trip-1/members/me/notification-preferences') &&
          (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBe(1);
      const body = JSON.parse(String((patchCalls[0]![1] as RequestInit).body));
      expect(body).toEqual({ newEntriesMode: 'daily_digest' });
    });
    fetchSpy.mockRestore();
  });

  it('does not call the API when the selected mode equals the current mode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    renderControl('per_entry');

    await userEvent.click(screen.getByTestId('trip-notification-mode-trigger'));
    await userEvent.click(screen.getByTestId('trip-notification-mode-option-per_entry'));

    // Brief settle so any rogue fetch would have fired by now.
    await new Promise((r) => setTimeout(r, 50));

    const patchCalls = fetchSpy.mock.calls.filter(
      (c) =>
        String(c[0]).includes('/api/v1/trips/trip-1/members/me/notification-preferences') &&
        (c[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCalls.length).toBe(0);
    fetchSpy.mockRestore();
  });
});
