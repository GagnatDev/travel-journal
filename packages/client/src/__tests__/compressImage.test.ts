import { describe, it, expect, vi, beforeEach } from 'vitest';

import { compressImage } from '../utils/compressImage.js';

describe('compressImage', () => {
  let mockBlob: Blob;
  let mockToBlob: ReturnType<typeof vi.fn<[BlobCallback, string, number], void>>;
  let mockCanvas: HTMLCanvasElement;
  let mockCtx: CanvasRenderingContext2D;
  let mockImg: { onload: (() => void) | null; onerror: (() => void) | null; src: string; naturalWidth: number; naturalHeight: number };

  beforeEach(() => {
    mockBlob = new Blob(['fake jpeg content'], { type: 'image/jpeg' });
    mockToBlob = vi.fn<[BlobCallback, string, number], void>((callback: BlobCallback) => callback(mockBlob));
    mockCtx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      toBlob: mockToBlob,
    } as unknown as HTMLCanvasElement;

    mockImg = { onload: null, onerror: null, src: '', naturalWidth: 0, naturalHeight: 0 };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas;
      if (tag === 'img') return mockImg as unknown as HTMLImageElement;
      return document.createElement(tag);
    });

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  // Helper to trigger image load
  function triggerLoad(w: number, h: number) {
    mockImg.naturalWidth = w;
    mockImg.naturalHeight = h;
    mockImg.onload?.();
  }

  it('output MIME type is image/jpeg', async () => {
    const file = new File(['data'], 'test.png', { type: 'image/png' });
    const promise = compressImage(file);
    triggerLoad(100, 100);
    const result = await promise;
    expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    expect(result.blob).toBe(mockBlob);
  });

  it('scales down an oversized image — longest side becomes maxDimension', async () => {
    const file = new File(['data'], 'large.jpg', { type: 'image/jpeg' });
    const promise = compressImage(file, 800);
    triggerLoad(2000, 1000);
    await promise;
    expect(mockCanvas.width).toBe(800);
    expect(mockCanvas.height).toBe(400);
  });

  it('does not up-scale images smaller than maxDimension', async () => {
    const file = new File(['data'], 'small.jpg', { type: 'image/jpeg' });
    const promise = compressImage(file, 2560);
    triggerLoad(400, 300);
    await promise;
    expect(mockCanvas.width).toBe(400);
    expect(mockCanvas.height).toBe(300);
  });

  it('returns the correct width and height', async () => {
    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
    const promise = compressImage(file, 800);
    triggerLoad(2000, 1000);
    const result = await promise;
    expect(result.width).toBe(800);
    expect(result.height).toBe(400);
  });
});
