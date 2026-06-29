import { useContext, useEffect, useState } from 'react';

import { AuthContext } from '../context/AuthContext.js';
import {
  acquireAuthenticatedMediaObjectUrl,
  releaseAuthenticatedMediaObjectUrl,
} from '../lib/authenticatedMedia.js';
import { Avatar } from './ui/Avatar.js';

interface AuthenticatedAvatarProps {
  name: string;
  avatarKey?: string | undefined;
  size?: 'sm' | 'md';
  onClick?: (() => void) | undefined;
}

export function AuthenticatedAvatar({ name, avatarKey, size = 'md', onClick }: AuthenticatedAvatarProps) {
  const auth = useContext(AuthContext);
  const accessToken = auth?.accessToken ?? null;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarKey || !accessToken) {
      setBlobUrl(null);
      return;
    }

    let cacheKey: string | null = null;
    let cancelled = false;

    acquireAuthenticatedMediaObjectUrl(avatarKey, accessToken)
      .then(({ cacheKey: ck, objectUrl }) => {
        if (cancelled) return;
        cacheKey = ck;
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(null);
      });

    return () => {
      cancelled = true;
      if (cacheKey) releaseAuthenticatedMediaObjectUrl(cacheKey);
      setBlobUrl(null);
    };
  }, [avatarKey, accessToken]);

  return <Avatar name={name} src={blobUrl ?? undefined} size={size} onClick={onClick} />;
}
