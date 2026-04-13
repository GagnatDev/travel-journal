# Presigned GET URLs for media (optional architecture)

The app currently serves images **same-origin** via [`streamMediaObject`](../packages/server/src/services/media.service.ts) and the client [`mediaBlobCache`](../packages/client/src/lib/mediaBlobCache.ts) so authenticated bytes never require bucket CORS for `fetch`.

An alternative is to return **S3-compatible presigned GET URLs** (see `generateSignedUrl` in the media service) and set them as `<img src="…">` **or** `fetch` targets on the object-storage host.

## Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| Same-origin stream + blob cache (current) | No public bucket reads; trip membership enforced on every request; works with HttpOnly cookies + Bearer | Extra server bandwidth; blob URL layer unless clients add conditional requests |
| Presigned URL in `<img src>` | Native HTTP and image caches; no blob decode loop; offloads bytes from the API server | URLs expire (must refresh UI or re-fetch URLs); object hostname exposed; signing must stay gated by `assertMediaAccess` or equivalent |

## When presigned display helps most

- Very large timelines where even a ref-counted blob cache is heavy.
- CDN in front of object storage with cache keys tied to immutable object keys.

## Security notes

- Keep TTL short if URLs might leak from DevTools, or use long TTL only for **immutable** keys (this project uses UUID filenames, which are effectively immutable).
- `<img src>` does not send `Authorization`; the secret is in the query string until expiry.

No code change is required to stay on the current model; this document records the evaluation from the performance plan.
