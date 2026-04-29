import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EntryImage } from '@travel-journal/shared';

import { ImageReorder } from '../components/ImageReorder.js';
import { AuthSessionProvider } from './AuthSessionProvider.js';
import { mockUser } from './mocks/handlers.js';

vi.mock('../components/AuthenticatedImage.js', () => ({
  AuthenticatedImage: ({
    mediaKey: _mediaKey,
    loading,
    className,
    alt,
  }: {
    mediaKey: string;
    loading?: HTMLImageElement['loading'];
    className?: string;
    alt?: string;
  }) => (
    <img
      src="blob:http://localhost/test-placeholder"
      alt={alt ?? ''}
      loading={loading}
      className={className}
    />
  ),
}));

function makeImage(key: string, order: number): EntryImage {
  return { key, width: 100, height: 100, order, uploadedAt: new Date().toISOString() };
}

function renderReorder(
  images: EntryImage[],
  onImagesChange = vi.fn(),
  onFileSelect = vi.fn(),
) {
  return render(
    <AuthSessionProvider accessToken="mock-token" user={mockUser}>
      <ImageReorder
        images={images}
        onImagesChange={onImagesChange}
        onFileSelect={onFileSelect}
      />
    </AuthSessionProvider>,
  );
}

describe('ImageReorder', () => {
  it('renders thumbnails for each image using the media proxy path', async () => {
    const { container } = renderReorder([makeImage('media/trip-1/a.jpg', 0), makeImage('media/trip-1/b.jpg', 1)]);
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2));
    const imgs = container.querySelectorAll('img');
    expect(imgs[0]?.src).toMatch(/^blob:/);
    expect(imgs[1]?.src).toMatch(/^blob:/);
  });

  it('deleting an image calls onImagesChange with the image removed', async () => {
    const onChange = vi.fn();
    renderReorder(
      [makeImage('media/trip-1/a.jpg', 0), makeImage('media/trip-1/b.jpg', 1)],
      onChange,
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /×|remove|fjern/i })).toHaveLength(2),
    );
    const deleteButtons = screen.getAllByRole('button', { name: /×|remove|fjern/i });
    await userEvent.click(deleteButtons[0]!);
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ key: 'media/trip-1/b.jpg' })]),
    );
    expect(onChange.mock.calls[0]![0]).toHaveLength(1);
  });

  it('"Add Photos" button is visible when fewer than 10 images', () => {
    renderReorder([makeImage('media/trip-1/a.jpg', 0)]);
    expect(screen.getByRole('button', { name: /legg til bilder|add photos/i })).toBeInTheDocument();
  });

  it('"Add Photos" button is absent when 10 images are present', () => {
    const images = Array.from({ length: 10 }, (_, i) => makeImage(`media/trip-1/${i}.jpg`, i));
    renderReorder(images);
    expect(screen.queryByRole('button', { name: /legg til bilder|add photos/i })).not.toBeInTheDocument();
  });
});
