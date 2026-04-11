import { useCallback, useEffect, useRef, useState } from 'react';

export function useCopyFeedback(durationMs = 2000) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const copyToClipboard = useCallback(
    async (text: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setCopied(false);
      setCopyFailed(false);
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        timeoutRef.current = setTimeout(() => {
          setCopied(false);
          timeoutRef.current = null;
        }, durationMs);
      } catch {
        setCopyFailed(true);
        timeoutRef.current = setTimeout(() => {
          setCopyFailed(false);
          timeoutRef.current = null;
        }, durationMs);
      }
    },
    [durationMs],
  );

  return { copied, copyFailed, copyToClipboard };
}
