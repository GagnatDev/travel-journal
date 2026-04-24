import type { EntryImage } from '@travel-journal/shared';

import { uploadMedia } from '../api/media.js';
import { compressImage } from './compressImage.js';

/** Upload local files for an entry; failed files are returned for offline sync. */
export async function uploadEntryLocalFiles(
  tripId: string,
  token: string,
  existingImages: EntryImage[],
  files: File[],
): Promise<{ images: EntryImage[]; failedFiles: File[] }> {
  const nextImages = [...existingImages];
  const failedFiles: File[] = [];
  let order = nextImages.length;

  for (const file of files) {
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
  }

  return { images: nextImages, failedFiles };
}
