import { acquireMediaObjectUrl, releaseMediaObjectUrl } from './mediaBlobCache.js';

export function createMediaCacheKey(accessToken: string, mediaKey: string): string {
  return `${accessToken}:${mediaKey}`;
}

export function fetchAuthenticatedMediaBlob(mediaKey: string, accessToken: string): Promise<Blob> {
  return fetch(`/api/v1/media/${mediaKey}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to load media: ${res.status}`);
    return res.blob();
  });
}

export function acquireAuthenticatedMediaObjectUrl(
  mediaKey: string,
  accessToken: string,
): Promise<{ cacheKey: string; objectUrl: string }> {
  const cacheKey = createMediaCacheKey(accessToken, mediaKey);
  return acquireMediaObjectUrl(cacheKey, () => fetchAuthenticatedMediaBlob(mediaKey, accessToken)).then(
    (objectUrl) => ({
      cacheKey,
      objectUrl,
    }),
  );
}

export function releaseAuthenticatedMediaObjectUrl(cacheKey: string): void {
  releaseMediaObjectUrl(cacheKey);
}
