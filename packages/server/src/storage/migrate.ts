import type { ObjectHead, ObjectListing, ObjectStore } from './objectStore.js';

export interface CopyOptions {
  /** Report what would be copied without writing anything. */
  dryRun?: boolean;
  /** Only objects whose key starts with this prefix. */
  prefix?: string;
  /** Parallel copies (default 4). */
  concurrency?: number;
  onCopied?: (key: string) => void;
  onFailed?: (key: string, error: unknown) => void;
}

export interface CopyResult {
  dryRun: boolean;
  scanned: number;
  /** In a dry run: the number that would be copied. */
  copied: number;
  skipped: number;
  failed: number;
  bytesCopied: number;
  failures: { key: string; error: string }[];
}

const normalizeEtag = (etag: string | undefined) => etag?.replace(/^W\//i, '').replaceAll('"', '');

/**
 * Same object when sizes match and, where both sides report one, ETags match.
 * Our objects are single-part PUTs, so the ETag is the MD5 on every S3 backend.
 */
export function isSameObject(source: ObjectListing, target: ObjectHead): boolean {
  if (source.size !== undefined && target.contentLength !== undefined && source.size !== target.contentLength) {
    return false;
  }
  const a = normalizeEtag(source.etag);
  const b = normalizeEtag(target.etag);
  return a === undefined || b === undefined || a === b;
}

/**
 * Copy every object from `source` to `target`, skipping ones already there. Idempotent:
 * re-run until it reports `copied: 0, failed: 0`. Objects are streamed (get → put), so
 * the two buckets may live on different endpoints with different credentials.
 */
export async function copyAllObjects(
  source: ObjectStore,
  target: ObjectStore,
  options: CopyOptions = {},
): Promise<CopyResult> {
  const result: CopyResult = {
    dryRun: options.dryRun ?? false,
    scanned: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    bytesCopied: 0,
    failures: [],
  };

  const copyOne = async (item: ObjectListing): Promise<void> => {
    result.scanned += 1;
    try {
      const existing = await target.head(item.key);
      if (existing && isSameObject(item, existing)) {
        result.skipped += 1;
        return;
      }
      if (result.dryRun) {
        result.copied += 1;
        return;
      }
      const obj = await source.get(item.key);
      if (!obj) {
        // Deleted since it was listed: nothing to copy.
        result.skipped += 1;
        return;
      }
      await target.put(item.key, obj.body, {
        ...(obj.contentType !== undefined && { contentType: obj.contentType }),
        ...(obj.contentLength !== undefined && { contentLength: obj.contentLength }),
      });
      result.copied += 1;
      result.bytesCopied += obj.contentLength ?? 0;
      options.onCopied?.(item.key);
    } catch (err: unknown) {
      result.failed += 1;
      result.failures.push({ key: item.key, error: err instanceof Error ? err.message : String(err) });
      options.onFailed?.(item.key, err);
    }
  };

  // A small worker pool sharing one listing iterator (async generators queue next()).
  const iterator = source.list(options.prefix)[Symbol.asyncIterator]();
  const worker = async () => {
    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      await copyOne(next.value);
    }
  };
  const concurrency = Math.max(1, options.concurrency ?? 4);
  await Promise.all(Array.from({ length: concurrency }, worker));

  return result;
}
