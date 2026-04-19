import { gps } from 'exifr';

export interface ImageGps {
  lat: number;
  lng: number;
}

/** Reads GPS coordinates from image EXIF (original file; survives client compression). */
export async function extractImageGps(file: File): Promise<ImageGps | null> {
  try {
    const out = await gps(file);
    if (!out || typeof out.latitude !== 'number' || typeof out.longitude !== 'number') {
      return null;
    }
    if (!Number.isFinite(out.latitude) || !Number.isFinite(out.longitude)) {
      return null;
    }
    return { lat: out.latitude, lng: out.longitude };
  } catch {
    return null;
  }
}
