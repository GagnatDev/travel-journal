import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext.js';
import {
  acquireAuthenticatedMediaObjectUrl,
  releaseAuthenticatedMediaObjectUrl,
} from '../lib/authenticatedMedia.js';
import {
  AuthenticatedImageLoadingPulse,
  AuthenticatedImageNeutralUnderlay,
  AuthenticatedImageUnavailable,
} from './media/AuthenticatedImageOverlays.js';

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  mediaKey: string;
}

type Phase = 'idle' | 'loading' | 'ready';

export function AuthenticatedImage({
  mediaKey,
  className = '',
  alt = '',
  loading,
  ...imgRest
}: AuthenticatedImageProps) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setBlobUrl(null);

    if (!accessToken) {
      setPhase('idle');
      return;
    }

    setPhase('loading');
    let cacheKey: string | null = null;
    let cancelled = false;

    void acquireAuthenticatedMediaObjectUrl(mediaKey, accessToken)
      .then(({ cacheKey: resolvedCacheKey, objectUrl }) => {
        cacheKey = resolvedCacheKey;
        if (cancelled) return;
        setBlobUrl(objectUrl);
        setPhase('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setBlobUrl(null);
          setFailed(true);
          setPhase('idle');
        }
      });

    return () => {
      cancelled = true;
      if (cacheKey) {
        releaseAuthenticatedMediaObjectUrl(cacheKey);
      }
    };
  }, [mediaKey, accessToken]);

  const frameClass = `relative block min-h-0 min-w-0 overflow-hidden ${className}`.trim();
  const showPulse = !failed && phase === 'loading';
  const showNeutralUnderlay = !failed && !showPulse && !blobUrl;
  const unavailableLabel = t('media.imageUnavailable', { defaultValue: 'Image unavailable' });

  return (
    <span className={frameClass}>
      {showPulse && <AuthenticatedImageLoadingPulse />}
      {showNeutralUnderlay && <AuthenticatedImageNeutralUnderlay />}
      {failed && <AuthenticatedImageUnavailable label={unavailableLabel} />}
      {blobUrl && !failed && (
        <img
          src={blobUrl}
          decoding="async"
          alt={alt}
          loading={loading}
          className={`absolute inset-0 h-full w-full ${className}`}
          {...imgRest}
        />
      )}
    </span>
  );
}
