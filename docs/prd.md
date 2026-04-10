# Travel Journal PWA – Product Requirements Document (PRD)

## 1. Overview

### 1.1 Product Name
**Travel Journal** (EN) / **Reisedagbok** (NO)

### 1.2 Vision
Create a lightweight, mobile-first Progressive Web App (PWA) that allows a family to document their travel experiences in real-time and share them with others through a private, beautifully presented timeline.

### 1.3 Goals
- Enable fast and easy journaling during travel
- Support collaborative input from multiple family members
- Provide a shareable, read-only experience for friends and family
- Work reliably in low or no connectivity environments
- Generate lasting memories that can be exported post-trip
- Multi-trip support: users can create and manage multiple trips
- Full Norwegian and English UI from day one, Norwegian as the default language

### 1.4 Language & Code Conventions
- **UI languages:** Norwegian Bokmål (`nb`) and English (`en`)
- **Default language:** Norwegian Bokmål — the app opens in `nb` unless the user has previously selected `en`
- **All source code** (variable names, function names, comments, commit messages, API field names, database field names) is written in **English**
- Translation strings are the only user-facing text — no hard-coded UI strings anywhere in the codebase

---

## 2. Target Users

### 2.1 App-Level User Roles

There are three distinct app-level roles, determined at account creation and changeable only by admin:

| Role | Can create trips | Can contribute to trips | Can follow trips | Notes |
|------|-----------------|------------------------|-----------------|-------|
| **Admin** | Yes | Yes | Yes | One account; bootstrapped via `ADMIN_EMAIL`; can invite any user to the platform; can promote followers to creators |
| **Creator** | Yes | Yes | Yes | Default role for users invited by admin as creators; can create their own trips and be invited to others |
| **Follower** | No | Yes (if trip creator grants it) | Yes | Can only access trips they are explicitly invited to; cannot create trips; can be promoted to Creator by admin |

> **App-level role vs. trip-level role:** A user's app-level role controls what they can do platform-wide (e.g., create trips). Their trip-level role controls what they can do within a specific trip (see Section 4.1.4).

### 2.2 Trip-Level Membership Roles

Within any given trip, a user has exactly one of three trip-level roles:

| Trip Role | Who holds it | Permissions within the trip |
|-----------|-------------|----------------------------|
| **Trip Creator** | The user who created the trip (1 per trip) | Full control: edit trip settings, manage the member list, invite/remove contributors and followers, delete the trip |
| **Contributor** | Users granted posting rights by the trip creator | Read timeline + create/edit/delete their own entries |
| **Follower** | Users with read-only access | Read timeline only; no posting |

> A Follower (app-level) can be made a Contributor within a specific trip by the trip creator — this is a trip-level grant only and does not affect their app-level role.

---

## 3. Core User Stories

### 3.1 Content Creation
- As a user, I want to quickly create a journal entry so I can capture moments in real time
- As a user, I want to upload photos so I can visually document experiences
- As a user, I want to write notes so I can remember details
- As a user, I want to reorder images within an entry so I can tell the story in the right sequence

### 3.2 Collaboration
- As a contributor, I want to post entries to a trip so the journal reflects everyone's perspective
- As a user, I want to see who posted what
- As a trip creator, I want to control who can contribute vs. only follow my trip
- As an admin, I want to invite new users to the platform and set their starting role

### 3.3 Consumption
- As a viewer, I want a clean timeline so I can follow the trip story
- As a viewer, I want to react/comment so I can engage with the content

### 3.4 Reliability
- As a user, I want to use the app offline so I can log entries without internet
- As a user, I want uploads to sync automatically later

### 3.5 Trip Management
- As a creator or admin, I want to create multiple trips so I can plan ahead and keep separate journals
- As a trip creator, I want to invite existing platform users to my trip as contributors or followers
- As a user, I want to switch between trips easily
- As an admin, I want to promote a follower to creator so they can start their own trips

---

## 4. Features & Requirements

## 4.1 MVP Features (Must Have)

### 4.1.1 Timeline Feed
- Chronological list of entries
- Entry card includes:
  - Title
  - Text content (plain text with basic formatting: bold, italic)
  - Media (images)
  - Timestamp
  - Author
  - Location (if available)

### 4.1.2 Entry Creation
- Create/edit/delete entries
- Plain text with basic formatting (bold, italic — no rich text editor)
- Attach multiple images (max 10 per entry)
- Reorder images within an entry via drag-and-drop
- Client-side image compression before upload (using browser Canvas API) to save bandwidth on mobile networks
- Max 10MB per image (before compression)
- Optional:
  - Location tagging (GPS or manual)

### 4.1.3 Media Handling
- Image upload with client-side compression before upload
- Support for multiple images per entry (max 10)
- Expected volume: ~5–10 images per user per day
- **All media access goes through the backend API — no direct client access to S3**
- Upload flow: client POSTs image file to backend → backend validates, compresses if needed, and stores in S3
- Download flow: client requests media via backend API (`GET /api/v1/media/:key`) → backend verifies trip membership, generates a signed S3 URL (1-hour TTL), and returns a 302 redirect; no permanent or stored S3 URLs are ever exposed to the client

#### Image Ordering
Images within an entry are stored as an ordered array. Since the maximum is 10 images per entry, ordering is handled by simple full-array replacement:

- Client-side: drag-and-drop reorders the in-memory image array
- On save: client sends the complete `images` array in display order; backend normalizes `order` values to sequential integers (0–9) and atomically replaces the images array on the entry document
- No fractional indexing needed at this scale; the entire array is always replaced, never partially updated
- This avoids any ordering drift or collision issues

### 4.1.4 Authentication & Multi-User

All access to the app — including viewing trip journals — requires a user account and a valid JWT session.

#### Admin Bootstrap (First User)
The very first account is bootstrapped via a server-side environment variable `ADMIN_EMAIL`:

1. The backend is deployed with `ADMIN_EMAIL` set to a specific address (e.g., the owner's email)
2. Navigating to `/register` shows a registration form — **only if no admin account exists yet**; otherwise the route redirects to `/login`
3. If the submitted email matches `ADMIN_EMAIL`, the account is created with `role: "admin"` and the user is logged in immediately
4. If the email does not match `ADMIN_EMAIL`, the registration is rejected with a generic error (do not reveal that an admin email is configured)
5. Once the admin account exists, the `/register` route is permanently disabled — all subsequent accounts are created via the invite flow

The admin user is a normal user in all other respects (can create trips, post entries, etc.).

#### Platform Invite Flow (Admin only — creates new accounts)
Only the admin can invite new users to the platform. This is the only way new accounts are created (aside from the admin bootstrap):

1. Admin opens the Admin Panel and enters one or more email addresses, selecting a starting app-level role for each (`creator` or `follower`)
2. Backend generates a unique, single-use invite link with a time-limited token (valid for 7 days). **The app never sends email** — the admin copies the link and shares it manually (e.g., via messaging app)
3. Recipient opens the link → lands on the sign-up screen with email pre-filled
4. Recipient enters a display name and password (min 8 characters) → account is created with the assigned app-level role
5. User is immediately logged in and redirected to the trip dashboard

Account creation is intentionally minimal: **email (pre-filled), display name, password**. No email verification step required (the invite link itself serves as verification).

#### Trip Share Flow (Trip Creator — invite by nickname or email)
Trip creators can share a trip with others directly from Trip Settings, whether or not the person already has a platform account:

1. Trip creator opens Trip Settings → Member Management, enters a nickname or email address, and selects a trip-level role (`contributor` or `follower`)
2. **If the user exists** (matched by nickname or email): they are added to the trip immediately with the selected role. They will see the trip on their dashboard on next login or app refresh.
3. **If no account is found**: the trip creator is prompted to confirm the email address. The backend generates a unique, single-use invite link tied to that trip and role. **No email is sent** — the trip creator copies the link and sends it to the person manually
4. When the invited person opens the link → sign-up screen with email pre-filled. They enter a display name and password and complete registration
5. New accounts created via a trip invite link receive app-level role `follower`: they can only access the trip they were invited to and cannot create their own trips. Admin can later promote them to `creator` from the Admin Panel

> **No email is sent at any point in Phase 1.** Both platform invites (admin) and trip invite links (trip creator) are generated by the backend and shared manually by the person issuing the invite. Email delivery may be added in a future phase.

#### Role Management
- **Promoting a Follower to Creator:** Admin-only action, available in the Admin Panel on the user's profile. Changes the user's app-level `role` from `follower` to `creator`.
- **Changing a trip-level role:** Trip creator can change any member's trip role (contributor ↔ follower) from Trip Settings → Member Management. The trip creator role itself cannot be transferred.
- **Removing a member from a trip:** Trip creator can remove any contributor or follower from Trip Settings. Removed users lose access immediately.
- **Account deletion:** An account cannot be deleted while the user is the `createdBy` owner of any trip with status `planned` or `active`. The user must complete or delete those trips first. Admin exception: the admin can reassign trip ownership from the Admin Panel (emergency use only — not a routine trip management feature).

#### Session Management

Two tokens are issued on every successful login:

| Token | Type | Expiry | Storage | Used for |
|-------|------|--------|---------|----------|
| **Access token** | JWT; payload `{ userId, email, appRole }` | 15 min | JS memory only | `Authorization: Bearer` header on every API call |
| **Refresh token** | Opaque random 32-byte hex string | 30 days | `HttpOnly Secure SameSite=Strict` cookie | Exchanged at `POST /api/v1/auth/refresh` for a new access token |

The raw refresh token is never stored on the server — only its SHA-256 hash is written to the `Session` collection, enabling server-side revocation.

- **Auto-login:** on app load, if no access token is in memory, silently call the refresh endpoint. If the `HttpOnly` cookie is valid, a new access token is issued without prompting the user.
- **Logout:** client discards the access token from memory; server deletes the `Session` document and instructs the browser to clear the cookie.
- **Token rotation:** the refresh token is rotated (new token issued, old one revoked) on each successful refresh call, limiting the blast radius of a stolen cookie.

#### Account Ownership
- A user account is independent of any single trip
- One account can belong to multiple trips, with a different trip-level role in each
- Each entry is linked to its author

### 4.1.5 Multi-Trip Support
- Users with app-level role `admin` or `creator` can create trips; `follower` users cannot
- Each trip has a name, description, planned departure/return dates, and a status (`planned` / `active` / `completed`)
- **Status transitions are manual** — the trip creator explicitly sets the status in Trip Settings. Departure/return dates serve as a reference display only, not as auto-triggers
- Allowed transitions: `planned → active`, `active → completed`, `completed → active` (re-open allowed)
- Trip dashboard: list of trips the user belongs to (as creator, contributor, or follower), grouped by status
- Multiple trips can be active simultaneously. The dashboard groups trips by status; no backend constraint limits the number of active trips.

---

## 4.2 Enhanced Features (Should Have)

### 4.2.1 Map View
- Display entries as pins on a map
- Clicking a pin opens the entry
- Show travel path (optional)

### 4.2.2 Offline Support (PWA Core)
- Cache app shell
- Allow entry creation offline
- Queue uploads for background sync
- **Conflict resolution:** last-write-wins (LWW) strategy per entry, with server timestamp as tie-breaker. If two users edit the same entry offline, the last sync wins and the overwritten version is appended to `editHistory` on the entry document.

### 4.2.3 Push Notifications (PWA)
- Notify trip members when a new entry is posted
- Leverages PWA push notification APIs
- User can opt-in/opt-out per trip
- *Moved to Phase 2: requires service worker push infrastructure; too complex for MVP*

### 4.2.4 Daily Grouping ("Story Mode")
- Group entries by day
- Auto-generate day titles (e.g., "Day 4 in Paris")
- Highlight key photos

### 4.2.5 Daily Prompts
- Optional prompts when creating entries:
  - "Best moment today?"
  - "What surprised you?"
  - "Favorite food?"

### 4.2.6 Trip Templates
- Pre-fill a trip with known destinations and dates
- Timeline has structure (day placeholders) before content is added
- Useful for planning-oriented users

### 4.2.7 Weather Data
- Auto-attach weather conditions to entries at creation time (using a free weather API)
- Stored as metadata: temperature, conditions, icon
- Displayed as a subtle badge on entry cards

### 4.2.8 Mentions & Tags
- Tag/mention other trip members in entries (e.g., "@Mom found this amazing bakery")
- Mentioned users receive a notification

---

## 4.3 Delight Features (Nice to Have)

### 4.3.1 Memory Highlights
- Mark entries as favorites
- Generate "Best of Trip" view

### 4.3.2 Reactions & Comments
- Emoji reactions (❤️ 👍 😂)
- Optional comments on entries

### 4.3.3 Voice Notes
- Record short audio clips
- Attach to entries

### 4.3.4 Live Status
- "Currently in [location]"
- Manual or auto-updated

### 4.3.5 Trip Stats
- Number of places visited
- Entries created
- Photos uploaded

### 4.3.6 Export / Keepsake Mode
- Export to:
  - PDF (travel book)
  - Static website
- Slideshow / replay mode

---

## 4.4 Out of Scope

The following are explicitly excluded from all phases:

- **Rich text editing** — a full rich text editor (WYSIWYG) is too complex for mobile. Plain text with basic Markdown-style formatting (bold, italic) is sufficient.
- **Video support** — transcoding, storage costs, and streaming complexity make this a significant undertaking. May be revisited in a distant future phase.

---

## 5. UX / UI Requirements

### 5.1 Design Language
Visual design — color palette, typography, component style, motion, theming (light/dark mode), and responsive layout — is defined in [`docs/design_guidelines.md`](design_guidelines.md). That document is the single source of truth for all visual decisions; do not duplicate those details here.

The functional principles that drive screen and interaction design are:
- Mobile-first, single-column vertical flow
- Low friction — minimize taps and typing to capture a moment
- Visual-first — photos are the hero; text supports them
- All UI text via i18n (`nb` default, `en` supported) — see Section 1.4

### 5.2 Key Screens

#### 5.2.1 Trip Dashboard
- List of trips the user belongs to (grouped by status: active / planned / completed)
- "Create Trip" button — visible only for `admin` and `creator` users
- Quick-switch between trips
- Trip cards indicate the user's trip-level role (creator / contributor / follower)

#### 5.2.2 Timeline Screen
- Vertical scroll
- Entry cards with large images
- Sticky "Add Entry" button — visible only for contributors and the trip creator

#### 5.2.3 Create Entry Screen
- Quick access camera/upload
- Text input (plain text with bold/italic)
- Image reordering (drag-and-drop)
- Location toggle
- Prompt suggestions

#### 5.2.4 Map Screen
- Interactive map
- Pins for entries
- Tap → open entry

#### 5.2.5 Trip Settings
- Accessible only by the trip creator
- Trip details (name, dates, description, status transitions)
- **Member Management:**
  - Member list showing each user's display name, email, and trip-level role
  - Change a member's trip role (contributor ↔ follower) via inline dropdown
  - Remove a member from the trip
  - **Add a member:** enter a nickname or email address + select trip-level role (`contributor` / `follower`)
    - If the user exists → added immediately
    - If not → backend generates a trip invite link; trip creator copies and shares it manually; pending invites are listed with their role and expiry
  - No email is ever sent by the app

#### 5.2.6 Invite Accept / Sign Up Screen
- Reached by opening an invite link — either a **platform invite** (admin-issued) or a **trip invite** (trip-creator-issued); both use the same screen
- Email address pre-filled and read-only
- User enters: display name, password (min 8 characters)
- Single "Create Account" button — auto-logs in and redirects to the trip dashboard on success
- Accounts created via a trip invite link are assigned app-level role `follower` and are immediately added to the invited trip with the role the trip creator selected
- If the invite token is expired or already used, show a clear error with instructions to contact the person who sent the link

#### 5.2.7 Login Screen
- Email + password fields
- "Forgot password" (Phase 2)
- No self-registration path; accounts are created via admin platform invite or the one-time admin bootstrap

#### 5.2.8 Admin Registration Screen (`/register`)
- Only rendered if no admin account exists yet; otherwise redirects to `/login`
- Email + display name + password fields (same minimal form as invite sign-up)
- Backend silently rejects any email that does not match `ADMIN_EMAIL`
- On success: auto-login, redirect to trip dashboard

#### 5.2.9 Admin Panel
- Accessible only to users with `appRole: admin`
- **User list:** table of all platform users showing display name, email, app-level role, and account creation date
- **Platform invite:** enter email address(es), select starting app-level role (`creator` or `follower`) → backend generates invite link; admin copies and shares it manually (no email sent)
- **Pending invites:** list of outstanding platform invites with status, expiry, and revoke action
- **Promote user:** change a `follower`'s app-level role to `creator` via inline action on the user list

---

## 6. Technical Requirements

Full architecture detail — stack choices, media proxy flow, auth model, deployment, and improvement recommendations — is in [`docs/architecture.md`](architecture.md).

Full data model — collections, fields, indexes, relationships, and improvement recommendations — is in [`docs/data_model.md`](data_model.md).

### Summary

| Concern | Choice |
|---------|--------|
| Frontend | React + Tailwind CSS (tokens from [`docs/design_guidelines.md`](design_guidelines.md)) |
| i18n | `react-i18next`; locales `nb` (default) and `en`; translation files at `public/locales/{nb,en}/translation.json` |
| PWA | Service Worker + Web App Manifest; offline + background sync in Phase 2 |
| Backend | Node.js v24 + Express/Fastify |
| Database | MongoDB Atlas (managed) |
| Object storage | Scaleway Object Storage (S3-compatible, private bucket) |
| Compute | Scaleway Serverless Containers |
| Auth | Dual-token: 15-min JWT access token (JS memory) + 30-day refresh token (`HttpOnly` cookie); bcrypt passwords (cost ≥ 12) |
| Media | All S3 access via backend proxy; S3 URLs are never exposed to clients |

---

## 7. Non-Functional Requirements

### 7.1 Performance
- **LCP < 2s on a 4G mobile connection** (Largest Contentful Paint, measured with images lazy-loaded)
- Optimized image delivery (client-side compression before upload + backend media proxy streaming from S3)
- Lazy loading media in timeline

### 7.2 Reliability
- Offline-first capability (Phase 2)
- Background sync for uploads (Phase 2)
- LWW conflict resolution with edit history (Phase 2)

### 7.3 Security & Authorization

See [`docs/architecture.md § Authentication & Authorization`](architecture.md#4-authentication--authorization) for the full auth model and authorization matrix.

Summary:
- All app functionality requires a valid JWT access token
- Access token JWT payload: `{ userId, email, appRole }`; 15-min expiry; stored in JS memory only
- Refresh token: 30-day opaque token in `HttpOnly Secure` cookie; rotated on each use; SHA-256 hash stored server-side in `Session` collection
- `ADMIN_EMAIL` is a server-side environment variable only; never exposed to clients or API responses
- All S3 access is private; media served only via backend proxy (`GET /api/v1/media/:key`) using signed URLs (1-hour TTL); no permanent S3 URLs are stored or exposed to clients
- Rate limiting on auth and media upload endpoints

### 7.4 Scalability
- Designed for small group usage (5–20 users per trip)
- Moderate media storage (~10 images/user/day, max 10MB each before compression)

---

## 8. Analytics (Optional)
- Number of entries created
- Viewer engagement (views, reactions)

---

## 9. Development Plan

### Phase 1 (MVP)
- i18n foundation: `react-i18next` setup, `nb` and `en` translation files, language switcher, `preferredLocale` persisted per user
- Admin bootstrap registration (`ADMIN_EMAIL`-gated `/register` route, disabled after first use)
- Admin Panel: platform invite flow (generates link, no email sent), pending invite management, user list, promote follower → creator
- Login screen + JWT session management (7-day tokens, `appRole` in payload)
- Trip creation (admin and creator only)
- Trip share flow: add member by nickname or email + assign trip role; generate trip invite link for new users (no email sent); new accounts via trip invite get app-level `follower` role; change trip roles; remove members
- Multi-trip dashboard
- Entry creation with image upload (client-side compression, backend media proxy)
- Image reordering within entries (full-array replacement)
- Timeline view

### Phase 2 (Core Enhancements)
- Offline support with LWW conflict resolution and edit history
- Push notifications for new entries (PWA)
- Map view
- Trip templates
- Weather data on entries
- Mentions & tags
- Daily prompts
- Password reset flow

### Phase 3 (Polish)
- Reactions/comments
- Story mode (daily grouping)
- Memory highlights & favorites
- Trip stats
- Export functionality

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Poor connectivity | Offline-first design with LWW sync (Phase 2) |
| Large media uploads | Client-side compression + backend media proxy |
| Low engagement | Daily prompts + push notifications (Phase 2) |
| Complexity creep | Strict MVP scope + explicit out-of-scope list |
| Sync conflicts (offline edits) | LWW strategy with edit history preservation (Phase 2) |
| Invite abuse | Tokens are single-use and expire in 7 days; trip invite links are scoped to a specific trip and role |

---

## 11. Success Metrics

- Daily entries created
- % of days with at least one entry
- Viewer engagement (reactions/comments)
- Successful export at end of trip

---

## 12. Future Opportunities

- AI-generated summaries
- Printed photo book integration
- Collaborative real-time editing

---

## 13. Key Principles

- Speed > features
- Offline > perfect sync
- Memories > polish
- Simplicity > flexibility
