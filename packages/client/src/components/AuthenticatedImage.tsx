import { useEffect, useState } from 'react';

import { useAuth } from '../context/AuthContext.js';
import {
  acquireAuthenticatedMediaObjectUrl,
  releaseAuthenticatedMediaObjectUrl,
} from '../lib/authenticatedMedia.js';

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  mediaKey: string;
}

export function AuthenticatedImage({ mediaKey, ...props }: AuthenticatedImageProps) {
  const { accessToken } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setBlobUrl(null);
      return;
    }

    let cacheKey: string | null = null;
    let cancelled = false;

    void acquireAuthenticatedMediaObjectUrl(mediaKey, accessToken)
      .then(({ cacheKey: resolvedCacheKey, objectUrl }) => {
        cacheKey = resolvedCacheKey;
        if (!cancelled) setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(null);
      });

    return () => {
      cancelled = true;
      if (cacheKey) {
        releaseAuthenticatedMediaObjectUrl(cacheKey);
      }
    };
  }, [mediaKey, accessToken]);

  if (!blobUrl) return null;

  return <img src={blobUrl} decoding="async" {...props} />;
}
