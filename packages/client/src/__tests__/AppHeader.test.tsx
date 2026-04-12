import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';

import { AuthProvider } from '../context/AuthContext.js';
import { ThemeProvider } from '../context/ThemeContext.js';
import { AppHeader } from '../components/AppHeader.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { server } from './mocks/server.js';
import { mockUser } from './mocks/handlers.js';

function renderHeader() {
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
    ),
  );
  return render(
    <TestMemoryRouter>
      <AuthProvider>
        <ThemeProvider>
          <AppHeader />
        </ThemeProvider>
      </AuthProvider>
    </TestMemoryRouter>,
  );
}

describe('AppHeader', () => {
  it('renders hamburger button with correct aria-label', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  it('renders the app name', () => {
    renderHeader();
    expect(screen.getByText('Reisedagbok')).toBeInTheDocument();
  });

  it('renders notification bell button with correct aria-label', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('opens the MenuDrawer when hamburger is clicked', async () => {
    renderHeader();
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.className).toContain('-translate-x-full');

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(dialog.className).toContain('translate-x-0');
    expect(dialog.className).not.toContain('-translate-x-full');
  });

  it('closes the MenuDrawer when close button is clicked', async () => {
    renderHeader();
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('translate-x-0');

    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    expect(screen.getByRole('dialog', { hidden: true }).className).toContain('-translate-x-full');
  });
});
