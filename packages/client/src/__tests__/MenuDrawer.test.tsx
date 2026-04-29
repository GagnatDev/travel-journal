import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import type { PublicUser } from '@travel-journal/shared';

import { AuthProvider } from '../context/AuthContext.js';
import { ThemeProvider } from '../context/ThemeContext.js';
import { MenuDrawer } from '../components/MenuDrawer.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { server } from './mocks/server.js';
import { mockAdminUser, mockUser } from './mocks/handlers.js';
import { AuthSessionProvider } from './AuthSessionProvider.js';

function renderDrawer(
  isOpen: boolean,
  onClose = vi.fn(),
  options?: { sessionUser?: PublicUser },
) {
  const routes = (
    <ThemeProvider>
      <Routes>
        <Route path="/trips" element={<div>Trips</div>} />
        <Route path="/profile" element={<div>Profile Page</div>} />
        <Route path="/admin" element={<div>Admin Page</div>} />
      </Routes>
      <MenuDrawer isOpen={isOpen} onClose={onClose} />
    </ThemeProvider>
  );

  if (options?.sessionUser) {
    return render(
      <TestMemoryRouter initialEntries={['/trips']}>
        <AuthSessionProvider accessToken="mock-token" user={options.sessionUser}>
          {routes}
        </AuthSessionProvider>
      </TestMemoryRouter>,
    );
  }

  return render(
    <TestMemoryRouter initialEntries={['/trips']}>
      <AuthProvider>{routes}</AuthProvider>
    </TestMemoryRouter>,
  );
}

describe('MenuDrawer', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
      ),
    );
  });

  it('is hidden when isOpen is false', () => {
    renderDrawer(false);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.className).toContain('-translate-x-full');
  });

  it('is visible when isOpen is true', () => {
    renderDrawer(true);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('translate-x-0');
    expect(dialog.className).not.toContain('-translate-x-full');
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    renderDrawer(true, onClose);
    // The backdrop is aria-hidden, use fireEvent to click it
    const backdrop = document.querySelector('[aria-hidden="true"].fixed.inset-0');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    renderDrawer(true, onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on Escape when drawer is closed', async () => {
    const onClose = vi.fn();
    renderDrawer(false, onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    renderDrawer(true, onClose);
    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('theme toggle calls toggleTheme', async () => {
    renderDrawer(true);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('language toggle switches language', async () => {
    renderDrawer(true);
    // default locale is nb (from mockUser), so button shows "English"
    const langButton = screen.getByRole('button', { name: /switch to english/i });
    await userEvent.click(langButton);
    expect(localStorage.getItem('preferredLocale')).toBe('en');
  });

  it('profile link navigates to /profile and calls onClose', async () => {
    const onClose = vi.fn();
    renderDrawer(true, onClose);
    await userEvent.click(screen.getByRole('button', { name: /profile|profil/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText('Profile Page')).toBeInTheDocument();
  });

  it('does not show admin link for non-admin users', async () => {
    renderDrawer(true);
    expect(screen.queryByRole('button', { name: /^admin$/i })).not.toBeInTheDocument();
  });

  it('admin link navigates to /admin and calls onClose for admin users', async () => {
    const onClose = vi.fn();
    renderDrawer(true, onClose, { sessionUser: mockAdminUser });
    await userEvent.click(screen.getByRole('button', { name: /^admin$/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText('Admin Page')).toBeInTheDocument();
  });
});
