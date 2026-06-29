import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '../context/AuthContext.js';
import { ThemeProvider } from '../context/ThemeContext.js';
import { NotificationsPanel } from '../components/NotificationsPanel.js';
import { applyUpdate, usePwaUpdate } from '../pwa/usePwaUpdate.js';
import { hasUnsavedChanges } from '../lib/unsavedChanges.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { server } from './mocks/server.js';
import { mockUser } from './mocks/handlers.js';

vi.mock('../notifications/push.js', () => ({
  getPushPermissionState: vi.fn(() => 'granted' as NotificationPermission),
  isPushSupported: vi.fn(() => true),
  ensurePushSubscription: vi.fn(),
  syncPushSubscriptionIfPermitted: vi.fn(),
}));

vi.mock('../pwa/usePwaUpdate.js', () => ({
  usePwaUpdate: vi.fn(),
  applyUpdate: vi.fn(),
}));

vi.mock('../lib/unsavedChanges.js', () => ({
  hasUnsavedChanges: vi.fn(() => false),
  setUnsavedChanges: vi.fn(),
}));

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPanel() {
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
    ),
  );
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TestMemoryRouter initialEntries={['/trips']}>
        <AuthProvider>
          <ThemeProvider>
            <NotificationsPanel isOpen onClose={() => {}} />
          </ThemeProvider>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationsPanel update banner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(hasUnsavedChanges).mockReturnValue(false);
  });

  it('hides the banner when no update is available', () => {
    vi.mocked(usePwaUpdate).mockReturnValue({ updateAvailable: false, applyUpdate });
    renderPanel();
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
  });

  it('applies the update immediately when nothing is unsaved', async () => {
    vi.mocked(usePwaUpdate).mockReturnValue({ updateAvailable: true, applyUpdate });
    vi.mocked(hasUnsavedChanges).mockReturnValue(false);
    renderPanel();

    await userEvent.click(screen.getByTestId('update-now'));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('confirms before applying when there are unsaved changes', async () => {
    vi.mocked(usePwaUpdate).mockReturnValue({ updateAvailable: true, applyUpdate });
    vi.mocked(hasUnsavedChanges).mockReturnValue(true);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel();

    await userEvent.click(screen.getByTestId('update-now'));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(applyUpdate).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByTestId('update-now'));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });
});
