import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EntryImage } from '@travel-journal/shared';

import { ImageReorder } from '../components/ImageReorder.js';

function makeImage(key: string, order: number): EntryImage {
  return { key, width: 100, height: 100, order, uploadedAt: new Date().toISOString() };
}

function renderReorder(
  images: EntryImage[],
  onImagesChange = vi.fn(),
  onFileSelect = vi.fn(),
) {
  return render(
    <ImageReorder
      images={images}
      onImagesChange={onImagesChange}
      onFileSelect={onFileSelect}
    />,
  );
}

describe('ImageReorder', () => {
  it('renders thumbnails for each image using the media proxy path', () => {
    const { container } = renderReorder([makeImage('media/trip-1/a.jpg', 0), makeImage('media/trip-1/b.jpg', 1)]);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute('src', '/api/v1/media/media/trip-1/a.jpg');
  });

  it('deleting an image calls onImagesChange with the image removed', async () => {
    const onChange = vi.fn();
    renderReorder(
      [makeImage('media/trip-1/a.jpg', 0), makeImage('media/trip-1/b.jpg', 1)],
      onChange,
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
