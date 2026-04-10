# Travel Journal PWA – Data Model

All data is stored in MongoDB. Sub-documents are embedded unless noted otherwise. Indexes are listed per collection.

---

## Collections

### User

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `email` | string | unique; used for login |
| `passwordHash` | string | bcrypt (cost factor ≥ 12) |
| `displayName` | string | shown on entries and member lists |
| `appRole` | enum | `admin` \| `creator` \| `follower`; set at account creation; only admin can promote `follower → creator` |
| `preferredLocale` | enum | `nb` \| `en`; defaults to `nb`; user-selectable |
| `avatarKey` | string? | S3 object key for profile picture (served via media proxy) |
| `createdAt` | Date | |
| `updatedAt` | Date | |

**Indexes:**
- `{ email: 1 }` — unique

---

### Session

Stores active refresh tokens to support server-side revocation in the dual-token auth flow. One document per active login session.

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `tokenHash` | string | SHA-256 hex of the raw refresh token (raw token sent as `HttpOnly` cookie only, never stored) |
| `userId` | ObjectId | ref → User |
| `expiresAt` | Date | 30 days from creation; reset on each token rotation |
| `createdAt` | Date | |

**Indexes:**
- `{ tokenHash: 1 }` — unique; refresh token lookup on every `/auth/refresh` call
- `{ userId: 1 }` — revoke all sessions for a user (logout all devices)
- `{ expiresAt: 1 }` — TTL index with `expireAfterSeconds: 0`; auto-purges expired sessions

---

### Trip

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `name` | string | e.g., "Japan 2026" |
| `description` | string? | optional |
| `departureDate` | Date? | planned start; display only, not an auto-trigger |
| `returnDate` | Date? | planned end; display only |
| `status` | enum | `planned` \| `active` \| `completed`; manually set by trip creator |
| `createdBy` | ObjectId | ref → User; always holds trip role `creator` |
| `members` | TripMember[] | embedded array; see sub-document below |
| `coverImageKey` | string? | S3 key for trip cover image (Phase 2) |
| `createdAt` | Date | |
| `updatedAt` | Date | |

**Status transitions:** `planned → active`, `active → completed`, `completed → active` (re-open allowed).

**Indexes:**
- `{ createdBy: 1 }` — list trips created by a user
- `{ "members.userId": 1 }` — list all trips a user belongs to
- `{ status: 1 }` — filter by status on the dashboard

#### TripMember (embedded sub-document)

| Field | Type | Notes |
|-------|------|-------|
| `userId` | ObjectId | ref → User |
| `tripRole` | enum | `creator` \| `contributor` \| `follower` |
| `addedAt` | Date | when the user was added to the trip |

> When a trip is created, the creator is automatically added to the `members` array with `tripRole: "creator"`. The `createdBy` field is a convenience reference to identify the owner without scanning the array; all membership queries use the `members` array as the single source of truth.

> The `members` array is always small (5–20 users per trip) so embedding is appropriate. The multikey index on `members.userId` covers membership queries across trips efficiently.

> **Orphan handling:** if a creator account is deleted without being reassigned, trips with a dangling `createdBy` reference are treated as admin-owned for management purposes.

---

### PlatformInvite

Issued by admin to create new platform accounts.

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `email` | string | invited email address |
| `assignedAppRole` | enum | `creator` \| `follower`; app-level role granted on sign-up |
| `tokenHash` | string | SHA-256 hex of the raw invite token (raw token sent in email only, never stored) |
| `status` | enum | `pending` \| `accepted` \| `revoked` |
| `invitedBy` | ObjectId | ref → User (must be admin) |
| `expiresAt` | Date | 7 days from creation |
| `createdAt` | Date | |
| `updatedAt` | Date | updated when status changes (`accepted` or `revoked`) |

**Indexes:**
- `{ tokenHash: 1 }` — invite lookup on accept
- `{ email: 1, status: 1 }` — check for existing pending invite before issuing a new one
- `{ expiresAt: 1 }` — TTL index to auto-purge expired invites (set `expireAfterSeconds: 0`)

---

### Entry

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `tripId` | ObjectId | ref → Trip |
| `authorId` | ObjectId | ref → User |
| `title` | string | |
| `content` | string | plain text with basic formatting (bold, italic) |
| `images` | Image[] | ordered array (max 10); full array atomically replaced on update |
| `location` | Location? | see sub-document |
| `weather` | Weather? | auto-populated at creation time (Phase 2) |
| `promptUsed` | string? | which prompt was selected, if any |
| `isFavorite` | boolean | default `false` |
| `syncVersion` | number | incremented on each update; used for LWW conflict resolution (Phase 2) |
| `editHistory` | EditSnapshot[]? | previous versions preserved on LWW conflict (Phase 2) |
| `createdAt` | Date | |
| `deletedAt` | Date? | soft-delete timestamp; `null` on active entries |
| `updatedAt` | Date | |

**Indexes:**
- `{ tripId: 1, createdAt: -1, deletedAt: 1 }` — timeline feed; always filter `{ deletedAt: null }` for active entries
- `{ tripId: 1, authorId: 1 }` — "my entries in this trip"
- `{ authorId: 1 }` — global author query (admin view)
- `{ deletedAt: 1 }` — TTL index with `expireAfterSeconds: 2592000`; permanently purges soft-deleted entries after 30 days

> Entries are soft-deleted: `deletedAt` is set to the current timestamp instead of removing the document. All timeline and detail queries filter `{ deletedAt: null }`. The TTL index handles permanent removal automatically after the 30-day grace period.

#### Image (embedded sub-document)

| Field | Type | Notes |
|-------|------|-------|
| `key` | string | S3 object key |
| `width` | number | pixel dimensions post-compression |
| `height` | number | pixel dimensions post-compression |
| `order` | number | 0-based integer; normalized to 0–9 on every save |
| `uploadedAt` | Date | |

> The `url` field (previously `/api/media/:key`) is **not stored** — it is derived from `key` at query time. Storing a derived URL would require migration if the proxy endpoint ever changes.

#### Location (embedded sub-document)

| Field | Type | Notes |
|-------|------|-------|
| `lat` | number | latitude |
| `lng` | number | longitude |
| `name` | string? | human-readable place name (e.g., "Shibuya, Tokyo") |

#### Weather (embedded sub-document, Phase 2)

| Field | Type | Notes |
|-------|------|-------|
| `temp` | number | temperature in °C |
| `conditions` | string | e.g., "Partly Cloudy" |
| `icon` | string | icon code from weather API |

#### EditSnapshot (embedded sub-document, Phase 2)

| Field | Type | Notes |
|-------|------|-------|
| `content` | string | entry content at time of snapshot |
| `images` | Image[] | image array at time of snapshot |
| `savedAt` | Date | timestamp of the overwritten version |
| `savedBy` | ObjectId | ref → User who held this version |

---

### Reaction

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `entryId` | ObjectId | ref → Entry |
| `tripId` | ObjectId | ref → Trip (denormalized for efficient trip-level queries) |
| `emoji` | string | e.g., `❤️` |
| `userId` | ObjectId | ref → User |
| `nickname` | string | display name; derived from `User.displayName` |
| `createdAt` | Date | |

**Indexes:**
- `{ entryId: 1 }` — reactions per entry
- `{ entryId: 1, userId: 1 }` — unique index; prevents duplicate reactions from the same user

---

### Comment

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `entryId` | ObjectId | ref → Entry |
| `tripId` | ObjectId | ref → Trip (denormalized) |
| `userId` | ObjectId | ref → User |
| `nickname` | string | display name; derived from `User.displayName` |
| `content` | string | |
| `createdAt` | Date | |

**Indexes:**
- `{ entryId: 1, createdAt: 1 }` — comments per entry in chronological order

---

### Notification *(Phase 2)*

Created when a user is added to a trip, a new entry is posted to a trip they follow, or they are mentioned in an entry.

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `userId` | ObjectId | recipient |
| `type` | enum | `trip_invite` \| `new_entry` \| `mention` |
| `refId` | ObjectId | ref to the triggering document (Trip or Entry) |
| `read` | boolean | default `false` |
| `createdAt` | Date | |

**Indexes:**
- `{ userId: 1, read: 1, createdAt: -1 }` — unread notifications for a user

---

## Relationships

```
User ──< Session (refresh tokens)
User ──< TripMember (embedded in Trip) >── Trip
User ──< Entry
Trip ──< Entry
Entry ──< Image (embedded)
Entry ──< Reaction
Entry ──< Comment
User ──< PlatformInvite (as invitedBy)
User ──< Notification (as recipient, Phase 2)
```