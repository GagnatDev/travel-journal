import { useEffect, useState } from 'react';

import { useAuth } from '../context/AuthContext.js';

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  mediaKey: string;
}

export function AuthenticatedImage({ mediaKey, ...props }: AuthenticatedImageProps) {
  const { accessToken } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let objectUrl: string | null = null;
    let cancelled = false;

    fetch(`/api/v1/media/${mediaKey}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load media: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        // leave blobUrl as null — broken image will not render
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaKey, accessToken]);

  if (!blobUrl) return null;

  return <img src={blobUrl} {...props} />;
}
