import { useEffect, type RefObject } from 'react';

export function useInfiniteScrollSentinel(
  sentinelRef: RefObject<HTMLElement | null>,
  fetchNextPage: () => unknown,
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
): void {
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
}
