import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProvider } from '../context/AuthContext.js';
import { PasswordResetScreen } from '../screens/PasswordResetScreen.js';

import { server } from './mocks/server.js';
import { TestMemoryRouter } from './TestMemoryRouter.js';
import { mockUser } from './mocks/handlers.js';

function renderScreen(token: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'mock-token', user: mockUser }),
    ),
  );
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={[`/password-reset?token=${token}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/password-reset" element={<PasswordResetScreen />} />
            <Route path="/login" element={<div>Login stub</div>} />
          </Routes>
        </AuthProvider>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PasswordResetScreen', () => {
  it('shows expired error for an invalid token', async () => {
    server.use(
      http.get('/api/v1/auth/password-reset/:token/validate', () =>
        HttpResponse.json({ error: { message: 'Gone' } }, { status: 410 }),
      ),
    );

    renderScreen('bad-token');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('shows mismatch error when passwords differ', async () => {
    server.use(
      http.get('/api/v1/auth/password-reset/:token/validate', () =>
        HttpResponse.json({ email: 'user@example.com' }),
      ),
    );

    renderScreen('good-token');

    await waitFor(() => screen.getByDisplayValue('user@example.com'));

    const passwordFields = screen.getAllByLabelText(/passord|password/i);
    await userEvent.type(passwordFields[0]!, 'password123');
    await userEvent.type(passwordFields[1]!, 'password124');
    await userEvent.click(screen.getByRole('button', { name: /lagre passord|save password/i }));

    await waitFor(() => {
      expect(screen.getByText(/ikke like|do not match/i)).toBeInTheDocument();
    });
  });

  it('navigates to login after successful reset', async () => {
    server.use(
      http.get('/api/v1/auth/password-reset/:token/validate', () =>
        HttpResponse.json({ email: 'user@example.com' }),
      ),
      http.post('/api/v1/auth/password-reset/complete', () => new HttpResponse(null, { status: 204 })),
    );

    renderScreen('good-token');

    await waitFor(() => screen.getByDisplayValue('user@example.com'));

    const passwordFields = screen.getAllByLabelText(/passord|password/i);
    await userEvent.type(passwordFields[0]!, 'password123');
    await userEvent.type(passwordFields[1]!, 'password123');
    await userEvent.click(screen.getByRole('button', { name: /lagre passord|save password/i }));

    await waitFor(() => {
      expect(screen.getByText('Login stub')).toBeInTheDocument();
    });
  });
});
