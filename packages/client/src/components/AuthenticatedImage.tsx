import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext.js';
import {
  acquireAuthenticatedMediaObjectUrl,
  releaseAuthenticatedMediaObjectUrl,
} from '../lib/authenticatedMedia.js';

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
  const [imagePainted, setImagePainted] = useState(false);

  useEffect(() => {
    setFailed(false);
    setImagePainted(false);
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
  const showPulse =
    !failed &&
    (phase === 'loading' || (phase === 'ready' && Boolean(blobUrl) && !imagePainted));
  const showNeutralUnderlay = !failed && !showPulse && !(blobUrl && imagePainted);
  const showError = failed;
  const unavailableLabel = t('media.imageUnavailable', { defaultValue: 'Image unavailable' });

  return (
    <span className={frameClass}>
      {showPulse && (
        <span
          className="absolute inset-0 z-0 bg-caption/10 animate-pulse motion-reduce:animate-none"
          aria-hidden
        />
      )}
      {showNeutralUnderlay && <span className="absolute inset-0 z-0 bg-bg-secondary" aria-hidden />}
      {showError && (
        <span
          className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-1 bg-bg-secondary px-2 text-center text-caption"
          role="status"
          aria-live="polite"
          aria-label={unavailableLabel}
        >
          <svg
            className="h-8 w-8 shrink-0 opacity-70"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M8 11h.01M16 11h.01M8 15h8" />
            <path d="m4 19 16-16" />
          </svg>
          <span className="font-ui text-xs leading-tight">{unavailableLabel}</span>
        </span>
      )}
      {blobUrl && !failed && (
        <img
          src={blobUrl}
          decoding="async"
          alt={alt}
          loading={loading}
          onLoad={() => setImagePainted(true)}
          className={`absolute inset-0 z-[1] h-full w-full transition-opacity duration-200 motion-reduce:transition-none ${imagePainted ? 'opacity-100' : 'opacity-0'} ${className}`}
          {...imgRest}
        />
      )}
    </span>
  );
}
