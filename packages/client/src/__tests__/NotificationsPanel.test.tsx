import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';

import { fetchPushServerAvailability } from '../api/notifications.js';
import { AuthProvider } from '../context/AuthContext.js';
import { ThemeProvider } from '../context/ThemeContext.js';
import { NotificationsPanel } from '../components/NotificationsPanel.js';

import { TestMemoryRouter } from './TestMemoryRouter.js';
import { server } from './mocks/server.js';
import { mockUser } from './mocks/handlers.js';

vi.mock('../api/notifications.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../api/notifications.js')>();
  return {
    ...orig,
    fetchPushServerAvailability: vi.fn(orig.fetchPushServerAvailability),
  };
});

vi.mock('../notifications/push.js', () => ({
  getPushPermissionState: vi.fn(() => 'denied' as NotificationPermission),
  isPushSupported: vi.fn(() => true),
  ensurePushSubscription: vi.fn(),
  syncPushSubscriptionIfPermitted: vi.fn(),
}));

function renderPanel(initialPath = '/trips/trip-1/timeline') {
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
    ),
  );
  return render(
    <TestMemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <ThemeProvider>
          <NotificationsPanel isOpen onClose={() => {}} />
        </ThemeProvider>
      </AuthProvider>
    </TestMemoryRouter>,
  );
}

describe('NotificationsPanel', () => {
  it('shows browser denied messaging when permission is denied', async () => {
    renderPanel();
    expect(
      await screen.findByText(
        /Push-varsler er blokkert|Push notifications are blocked|trips\.settings\.notificationsDenied/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows server unavailable messaging when VAPID is not configured', async () => {
    vi.mocked(fetchPushServerAvailability).mockResolvedValueOnce('unavailable');
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
    );
    render(
      <TestMemoryRouter initialEntries={['/trips']}>
        <AuthProvider>
          <ThemeProvider>
            <NotificationsPanel isOpen onClose={() => {}} />
          </ThemeProvider>
        </AuthProvider>
      </TestMemoryRouter>,
    );

    await waitFor(
      () => {
        expect(
          screen.getByText(
            /Push er ikke konfigurert på denne serveren|Push is not configured on this server|notifications\.serverUnavailable/i,
          ),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('navigates to trip settings when the shortcut is used', async () => {
    function PathProbe() {
      return <span data-testid="router-path">{useLocation().pathname}</span>;
    }
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
    );
    render(
      <TestMemoryRouter initialEntries={['/trips/trip-42/timeline']}>
        <AuthProvider>
          <ThemeProvider>
            <PathProbe />
            <NotificationsPanel isOpen onClose={() => {}} />
          </ThemeProvider>
        </AuthProvider>
      </TestMemoryRouter>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /Åpne innstillinger for denne turen|Open this trip/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('router-path')).toHaveTextContent('/trips/trip-42/settings');
    });
  });
});
