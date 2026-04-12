import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import { AuthProvider } from '../context/AuthContext.js';
import { AdminRegisterScreen } from '../screens/AdminRegisterScreen.js';

import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';

const refresh401 = http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 }));

function renderRegisterScreen() {
  return render(
    <TestMemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<AdminRegisterScreen />} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/trips" element={<div>Trips page</div>} />
        </Routes>
      </AuthProvider>
    </TestMemoryRouter>,
  );
}

describe('AdminRegisterScreen', () => {
  it('redirects to /login when admin already exists', async () => {
    server.use(
      refresh401,
      http.get('/api/v1/auth/register', () => HttpResponse.json({ adminExists: true })),
    );

    renderRegisterScreen();

    await waitFor(() => {
      expect(screen.getByText('Login page')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText(/e-post/i)).not.toBeInTheDocument();
  });

  it('renders email, displayName, and password fields when no admin exists', async () => {
    server.use(
      refresh401,
      http.get('/api/v1/auth/register', () => HttpResponse.json({ adminExists: false })),
    );

    renderRegisterScreen();

    await waitFor(() => {
      expect(screen.getByLabelText(/e-post/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/visningsnavn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/passord/i)).toBeInTheDocument();
  });

  it('auto-logs in and navigates to /trips after successful registration', async () => {
    const mockAdminUser = {
      id: '1',
      email: 'admin@test.com',
      displayName: 'Admin',
      appRole: 'admin' as const,
      preferredLocale: 'nb' as const,
    };

    server.use(
      refresh401,
      http.get('/api/v1/auth/register', () => HttpResponse.json({ adminExists: false })),
      http.post('/api/v1/auth/register', () =>
        HttpResponse.json({ accessToken: 'admin-tok', user: mockAdminUser }, { status: 201 }),
      ),
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({ accessToken: 'admin-tok', user: mockAdminUser }),
      ),
    );

    renderRegisterScreen();

    await waitFor(() => {
      expect(screen.getByLabelText(/e-post/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/e-post/i), 'admin@test.com');
    await userEvent.type(screen.getByLabelText(/visningsnavn/i), 'Admin');
    await userEvent.type(screen.getByLabelText(/passord/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /opprett konto/i }));

    await waitFor(() => {
      expect(screen.getByText('Trips page')).toBeInTheDocument();
    });
  });
});
