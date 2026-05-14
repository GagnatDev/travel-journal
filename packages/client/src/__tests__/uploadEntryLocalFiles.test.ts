import { describe, it, expect, vi, beforeEach } from 'vitest';

import { uploadMedia } from '../api/media.js';
import { compressImage } from '../utils/compressImage.js';
import { uploadEntryLocalFiles } from '../utils/uploadEntryLocalFiles.js';

vi.mock('../api/media.js', () => ({
  uploadMedia: vi.fn(),
}));

vi.mock('../utils/compressImage.js', () => ({
  compressImage: vi.fn(),
}));

describe('uploadEntryLocalFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob(['x']),
      width: 100,
      height: 80,
    });
  });

  it('invokes onProgress after each file', async () => {
    const onProgress = vi.fn();
    vi.mocked(uploadMedia).mockResolvedValue({ key: 'new', url: 'http://x' });
    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const f2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    await uploadEntryLocalFiles('trip-1', 'token', [], [f1, f2], onProgress);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('returns uploaded images and empty failedFiles when all uploads succeed', async () => {
    vi.mocked(uploadMedia).mockResolvedValue({
      key: 'k1',
      thumbnailKey: 't1',
      url: 'http://example.com/1',
    });

    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const result = await uploadEntryLocalFiles('trip-1', 'token', [], [f1]);

    expect(result.failedFiles).toEqual([]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      key: 'k1',
      thumbnailKey: 't1',
      width: 100,
      height: 80,
      order: 0,
    });
    expect(uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('collects failed files and still uploads the rest', async () => {
    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const f2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    vi.mocked(uploadMedia)
      .mockResolvedValueOnce({ key: 'ok', url: 'http://example.com/ok' })
      .mockRejectedValueOnce(new Error('network'));

    const result = await uploadEntryLocalFiles('trip-1', 'token', [], [f1, f2]);

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.key).toBe('ok');
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0]).toBe(f2);
  });

  it('preserves existing images and continues order after them', async () => {
    vi.mocked(uploadMedia).mockResolvedValue({ key: 'new', url: 'http://x' });
    const existing = [
      {
        key: 'old',
        width: 1,
        height: 1,
        order: 0,
        uploadedAt: new Date().toISOString(),
      },
    ];
    const file = new File(['z'], 'z.jpg', { type: 'image/jpeg' });

    const result = await uploadEntryLocalFiles('trip-1', 'token', existing, [file]);

    expect(result.images).toHaveLength(2);
    expect(result.images[0]?.key).toBe('old');
    expect(result.images[1]?.key).toBe('new');
    expect(result.images[1]?.order).toBe(1);
  });
});
