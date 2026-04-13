import { useEffect, useState } from 'react';

import { useAuth } from '../context/AuthContext.js';
import { acquireMediaObjectUrl, releaseMediaObjectUrl } from '../lib/mediaBlobCache.js';

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  mediaKey: string;
}

export function AuthenticatedImage({ mediaKey, ...props }: AuthenticatedImageProps) {
  const { accessToken } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    const cacheKey = `${accessToken}:${mediaKey}`;
    let cancelled = false;

    void acquireMediaObjectUrl(cacheKey, () =>
      fetch(`/api/v1/media/${mediaKey}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((res) => {
        if (!res.ok) throw new Error(`Failed to load media: ${res.status}`);
        return res.blob();
      }),
    )
      .then((url) => {
        if (!cancelled) setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(null);
      });

    return () => {
      cancelled = true;
      releaseMediaObjectUrl(cacheKey);
      setBlobUrl(null);
    };
  }, [mediaKey, accessToken]);

  if (!blobUrl) return null;

  return <img src={blobUrl} {...props} />;
}
