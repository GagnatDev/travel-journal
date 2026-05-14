import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { AuthenticatedImage } from '../components/AuthenticatedImage.js';
import * as authenticatedMedia from '../lib/authenticatedMedia.js';
import { AuthSessionProvider } from './AuthSessionProvider.js';
import { mockUser } from './mocks/handlers.js';
import { server } from './mocks/server.js';

describe('AuthenticatedImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a sized frame and resolves to a blob-backed image', async () => {
    const objectUrl = URL.createObjectURL(new Blob([], { type: 'image/png' }));
    const acquireSpy = vi.spyOn(authenticatedMedia, 'acquireAuthenticatedMediaObjectUrl').mockResolvedValue({
      cacheKey: 'mock-token:media/trip-1/hero.png',
      objectUrl,
    });
    vi.spyOn(authenticatedMedia, 'releaseAuthenticatedMediaObjectUrl').mockImplementation(() => {});

    const { container } = render(
      <AuthSessionProvider accessToken="mock-token" user={mockUser}>
        <AuthenticatedImage
          mediaKey="media/trip-1/hero.png"
          alt="Sunset"
          className="h-24 w-32 object-cover"
          loading="lazy"
        />
      </AuthSessionProvider>,
    );

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toMatch(/h-24/);
    expect(frame.className).toMatch(/w-32/);
    expect(acquireSpy).toHaveBeenCalledWith('media/trip-1/hero.png', 'mock-token');

    await waitFor(() => {
      const img = screen.getByRole('img', { name: 'Sunset' });
      expect(img).toHaveAttribute('src', objectUrl);
      expect(img).toHaveAttribute('loading', 'lazy');
    });
  });

  it('shows a fallback when the media request fails', async () => {
    server.use(
      http.get(
        ({ request }) => new URL(request.url).pathname === '/api/v1/media/missing-asset-key',
        () => HttpResponse.json({ error: 'nf' }, { status: 404 }),
      ),
    );

    render(
      <AuthSessionProvider accessToken="mock-token" user={mockUser}>
        <AuthenticatedImage mediaKey="missing-asset-key" alt="X" className="h-16 w-16" />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Bildet er ikke tilgjengelig' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('img', { name: 'X' })).toBeNull();
  });
});
