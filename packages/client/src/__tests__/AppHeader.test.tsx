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
    <TestMemoryRouter initialEntries={['/trips']}>
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
    expect(screen.getByRole('button', { name: /Åpne meny|Open menu|menu\.openMenu/ })).toBeInTheDocument();
  });

  it('renders the app name', () => {
    renderHeader();
    expect(screen.getByText('Reisedagbok')).toBeInTheDocument();
  });

  it('renders notification bell button with correct aria-label', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: /Varsler|Notifications/i })).toBeInTheDocument();
  });

  it('opens the notifications panel when the bell is clicked', async () => {
    renderHeader();
    const panel = screen.getByRole('dialog', { name: /Varsler om nye innlegg|New entry alerts/i });
    expect(panel.className).toContain('translate-x-full');

    await userEvent.click(screen.getByRole('button', { name: /Varsler|Notifications/i }));

    expect(panel.className).toContain('translate-x-0');
    expect(panel.className).not.toContain('translate-x-full');
    expect(
      await screen.findByText(/Serveren er satt opp for Web Push|configured for Web Push/i, {
        timeout: 5000,
      }),
    ).toBeInTheDocument();
  });

  it('closes the notifications panel when the close control is activated', async () => {
    renderHeader();
    await userEvent.click(screen.getByRole('button', { name: /Varsler|Notifications/i }));
    const panel = screen.getByRole('dialog', { name: /Varsler om nye innlegg|New entry alerts/i });
    expect(panel.className).toContain('translate-x-0');

    await userEvent.click(screen.getByRole('button', { name: /Lukk varselspanelet|Close notifications/i }));

    expect(panel.className).toContain('translate-x-full');
  });

  it('opens the MenuDrawer when hamburger is clicked', async () => {
    renderHeader();
    const menuDialog = screen.getByRole('dialog', {
      name: /Profil|Profile|menu\.profile/i,
      hidden: true,
    });
    expect(menuDialog.className).toContain('-translate-x-full');

    await userEvent.click(screen.getByRole('button', { name: /Åpne meny|Open menu|menu\.openMenu/ }));

    expect(menuDialog.className).toContain('translate-x-0');
    expect(menuDialog.className).not.toContain('-translate-x-full');
  });

  it('closes the MenuDrawer when close button is clicked', async () => {
    renderHeader();
    await userEvent.click(screen.getByRole('button', { name: /Åpne meny|Open menu|menu\.openMenu/ }));

    const menuDialog = screen.getByRole('dialog', { name: /Profil|Profile|menu\.profile/i });
    expect(menuDialog.className).toContain('translate-x-0');

    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    expect(
      screen.getByRole('dialog', { name: /Profil|Profile|menu\.profile/i, hidden: true }).className,
    ).toContain('-translate-x-full');
  });
});
