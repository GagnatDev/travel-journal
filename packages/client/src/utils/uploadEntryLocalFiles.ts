import type { EntryImage } from '@travel-journal/shared';

import { uploadMedia } from '../api/media.js';
import { compressImage } from './compressImage.js';

export type UploadEntryLocalFilesProgress = (completed: number, total: number) => void;

/** Upload local files for an entry; failed files are returned for offline sync. */
export async function uploadEntryLocalFiles(
  tripId: string,
  token: string,
  existingImages: EntryImage[],
  files: File[],
  onProgress?: UploadEntryLocalFilesProgress,
): Promise<{ images: EntryImage[]; failedFiles: File[] }> {
  const nextImages = [...existingImages];
  const failedFiles: File[] = [];
  let order = nextImages.length;
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    try {
      const { blob, width, height } = await compressImage(file);
      const result = await uploadMedia(tripId, blob, width, height, token);
      nextImages.push({
        key: result.key,
        ...(result.thumbnailKey !== undefined && { thumbnailKey: result.thumbnailKey }),
        width,
        height,
        order,
        uploadedAt: new Date().toISOString(),
      });
      order += 1;
    } catch {
      failedFiles.push(file);
    }
    onProgress?.(i + 1, total);
  }

  return { images: nextImages, failedFiles };
}
