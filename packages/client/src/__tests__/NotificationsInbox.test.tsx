import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppNotification, ListNotificationsResponse } from '@travel-journal/shared';
import { useLocation } from 'react-router-dom';

import { AuthProvider } from '../context/AuthContext.js';
import { ThemeProvider } from '../context/ThemeContext.js';
import { NotificationsPanel } from '../components/NotificationsPanel.js';
import { AppHeader } from '../components/AppHeader.js';

import { TestMemoryRouter } from './TestMemoryRouter.js';
import { server } from './mocks/server.js';
import { mockUser } from './mocks/handlers.js';

vi.mock('../notifications/push.js', () => ({
  getPushPermissionState: vi.fn(() => 'granted' as NotificationPermission),
  isPushSupported: vi.fn(() => true),
  ensurePushSubscription: vi.fn(),
  syncPushSubscriptionIfPermitted: vi.fn(),
}));

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const tripEntryNotification: AppNotification = {
  id: 'notif-trip-1',
  type: 'trip.new_entry',
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  readAt: null,
  data: {
    type: 'trip.new_entry',
    tripId: 'trip-abc',
    tripName: 'Nordic Loop',
    entryId: 'entry-1',
    entryTitle: 'Fjord sunset',
    authorId: 'other-user',
    authorName: 'Ada Lovelace',
  },
};

const releaseNotification: AppNotification = {
  id: 'notif-release-1',
  type: 'system.release_announcement',
  createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  readAt: null,
  data: { type: 'system.release_announcement', version: '2.3.0' },
};

const messageNotification: AppNotification = {
  id: 'notif-msg-1',
  type: 'user.private_message',
  createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  readAt: null,
  data: {
    type: 'user.private_message',
    threadId: 'thread-1',
    fromUserId: 'user-xyz',
    fromUserName: 'Grace Hopper',
    preview: 'See you at the rendezvous tomorrow!',
  },
};

function installAuthAndInbox(inbox: ListNotificationsResponse) {
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
    ),
    http.get('/api/v1/notifications', () => HttpResponse.json(inbox)),
  );
}

function renderHeader() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TestMemoryRouter initialEntries={['/trips']}>
        <AuthProvider>
          <ThemeProvider>
            <AppHeader />
          </ThemeProvider>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

function PathProbe() {
  const loc = useLocation();
  return (
    <span data-testid="router-path">
      {loc.pathname}
      {loc.search}
    </span>
  );
}

function renderPanel() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TestMemoryRouter initialEntries={['/trips/trip-abc/timeline']}>
        <AuthProvider>
          <ThemeProvider>
            <PathProbe />
            <NotificationsPanel isOpen onClose={() => {}} />
          </ThemeProvider>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Notifications inbox (bell badge + panel)', () => {
  it('shows the unread count on the bell and switches aria-label to a localized count', async () => {
    installAuthAndInbox({
      notifications: [tripEntryNotification, releaseNotification],
      unreadCount: 2,
    });
    renderHeader();
    const badge = await screen.findByTestId('notifications-badge');
    expect(badge).toHaveTextContent('2');
    expect(
      screen.getByRole('button', { name: /2 uleste varsler|2 unread notifications/i }),
    ).toBeInTheDocument();
  });

  it('caps the badge at 9+ when more than nine notifications are unread', async () => {
    installAuthAndInbox({
      notifications: Array.from({ length: 12 }, (_, i) => ({
        ...tripEntryNotification,
        id: `notif-${i}`,
      })),
      unreadCount: 12,
    });
    renderHeader();
    const badge = await screen.findByTestId('notifications-badge');
    expect(badge).toHaveTextContent('9+');
  });

  it('hides the badge when there are no unread notifications', async () => {
    installAuthAndInbox({ notifications: [], unreadCount: 0 });
    renderHeader();
    await screen.findByRole('button', { name: /^Varsler$|^Notifications$/i });
    expect(screen.queryByTestId('notifications-badge')).not.toBeInTheDocument();
  });

  it('renders type-specific copy for each NotificationType', async () => {
    installAuthAndInbox({
      notifications: [tripEntryNotification, releaseNotification, messageNotification],
      unreadCount: 3,
    });
    renderPanel();
    await screen.findByTestId('notification-item-notif-trip-1');
    expect(screen.getByText(/Ada Lovelace la til et nytt innlegg/)).toBeInTheDocument();
    expect(screen.getByText(/Fjord sunset · Nordic Loop/)).toBeInTheDocument();
    expect(screen.getByText(/er oppdatert til 2\.3\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Ny melding fra Grace Hopper/)).toBeInTheDocument();
    expect(screen.getByText(/See you at the rendezvous tomorrow/)).toBeInTheDocument();
  });

  it('fires mark-all-read on open when there are unread items', async () => {
    let markAllReadCalls = 0;
    installAuthAndInbox({ notifications: [tripEntryNotification], unreadCount: 1 });
    server.use(
      http.post('/api/v1/notifications/read-all', () => {
        markAllReadCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPanel();
    await waitFor(() => expect(markAllReadCalls).toBeGreaterThan(0));
  });

  it('optimistically removes a notification when the dismiss button is clicked', async () => {
    let dismissCalled = false;
    const state: ListNotificationsResponse = {
      notifications: [tripEntryNotification],
      unreadCount: 1,
    };
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
      http.get('/api/v1/notifications', () =>
        HttpResponse.json({
          notifications: state.notifications,
          unreadCount: state.unreadCount,
        }),
      ),
      http.delete('/api/v1/notifications/notif-trip-1', () => {
        dismissCalled = true;
        state.notifications = [];
        state.unreadCount = 0;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPanel();
    const item = await screen.findByTestId('notification-item-notif-trip-1');
    const dismissBtn = item.querySelector('button[aria-label="Fjern varsel"]');
    expect(dismissBtn).not.toBeNull();
    await userEvent.click(dismissBtn!);
    await waitFor(() =>
      expect(screen.queryByTestId('notification-item-notif-trip-1')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(dismissCalled).toBe(true));
  });

  it('navigates to the deep link when a trip.new_entry notification is activated', async () => {
    installAuthAndInbox({ notifications: [tripEntryNotification], unreadCount: 1 });
    server.use(
      http.delete('/api/v1/notifications/notif-trip-1', () => new HttpResponse(null, { status: 204 })),
    );
    renderPanel();
    const title = await screen.findByText(/Ada Lovelace la til et nytt innlegg/);
    await userEvent.click(title);
    await waitFor(() =>
      expect(screen.getByTestId('router-path')).toHaveTextContent(
        '/trips/trip-abc/timeline?entryId=entry-1',
      ),
    );
  });

  it('clears all when the clear-all action is used', async () => {
    let cleared = false;
    const state: ListNotificationsResponse = {
      notifications: [tripEntryNotification, releaseNotification],
      unreadCount: 2,
    };
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
      http.get('/api/v1/notifications', () =>
        HttpResponse.json({
          notifications: state.notifications,
          unreadCount: state.unreadCount,
        }),
      ),
      http.delete('/api/v1/notifications', () => {
        cleared = true;
        state.notifications = [];
        state.unreadCount = 0;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPanel();
    await screen.findByTestId('notification-item-notif-trip-1');
    await userEvent.click(screen.getByRole('button', { name: /Fjern alle|Clear all/ }));
    await waitFor(() =>
      expect(screen.queryByTestId('notification-item-notif-trip-1')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(cleared).toBe(true));
  });

  it('shows the empty state when there are no notifications', async () => {
    installAuthAndInbox({ notifications: [], unreadCount: 0 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('notifications-empty')).toHaveTextContent(
        /Du er à jour|You're all caught up/,
      );
    });
  });
});
