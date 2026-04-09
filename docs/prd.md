# Travel Journal PWA – Product Requirements Document (PRD)

## 1. Overview

### 1.1 Product Name
**Travel Journal (working title)**

### 1.2 Vision
Create a lightweight, mobile-first Progressive Web App (PWA) that allows a family to document their travel experiences in real-time and share them with others through a private, beautifully presented timeline.

### 1.3 Goals
- Enable fast and easy journaling during travel
- Support collaborative input from multiple family members
- Provide a shareable, read-only experience for friends and family
- Work reliably in low or no connectivity environments
- Generate lasting memories that can be exported post-trip
- Multi-trip support: users can create and manage multiple trips

---

## 2. Target Users

### 2.1 Primary Users
- Family members on the trip
- Mixed technical proficiency
- Primarily mobile users

### 2.2 Secondary Users
- Extended family / friends viewing the shared link
- Passive consumers (read-only)

---

## 3. Core User Stories

### 3.1 Content Creation
- As a user, I want to quickly create a journal entry so I can capture moments in real time
- As a user, I want to upload photos so I can visually document experiences
- As a user, I want to write notes so I can remember details
- As a user, I want to reorder images within an entry so I can tell the story in the right sequence

### 3.2 Collaboration
- As a user, I want multiple people to contribute so the journal reflects everyone's perspective
- As a user, I want to see who posted what

### 3.3 Consumption
- As a viewer, I want a clean timeline so I can follow the trip story
- As a viewer, I want to react/comment so I can engage with the content

### 3.4 Reliability
- As a user, I want to use the app offline so I can log entries without internet
- As a user, I want uploads to sync automatically later

### 3.5 Trip Management
- As a user, I want to create multiple trips so I can plan ahead and keep separate journals
- As a user, I want to invite others to my trip via a link so they can create an account and join
- As a user, I want to switch between trips easily

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

### 4.1.4 Authentication & Multi-User
- **Invite-link-based access:**
  - Trip creator generates an invite link
  - Invited person clicks link, creates an individual account (email + password)
  - Account is linked to the trip
- Individual accounts: a single user can belong to multiple trips
- Each entry linked to an author

### 4.1.5 Multi-Trip Support
- Users can create multiple trips
- Each trip has a name, description, planned departure/return dates, and status (planned / active / completed)
- Trip dashboard: list of trips the user belongs to
- Only one trip is typically "active" at a time, but users can switch freely

### 4.1.6 Shareable Public View
- Unique URL per trip for read-only access
- Protected by an optional password
- Optimized for non-technical viewers
- Single shared link per trip

### 4.1.7 Push Notifications (PWA)
- Notify trip members when a new entry is posted
- Leverages PWA push notification APIs
- User can opt-in/opt-out per trip

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
- **Conflict resolution:** last-write-wins (LWW) strategy per entry, with server timestamp as tie-breaker. If two users edit the same entry offline, the last sync wins and the overwritten version is stored in an edit history.

### 4.2.3 Reactions & Comments
- Emoji reactions (❤️ 👍 😂)
- Optional comments on entries
- No login required for viewers (nickname-based)

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

### 4.3.2 Voice Notes
- Record short audio clips
- Attach to entries

### 4.3.3 Live Status
- "Currently in [location]"
- Manual or auto-updated

### 4.3.4 Trip Stats
- Number of places visited
- Entries created
- Photos uploaded

### 4.3.5 Export / Keepsake Mode
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

### 5.1 Design Principles
- Mobile-first
- Fast interaction (low friction)
- Visual-first (photos prioritized)
- Minimal typing required

### 5.2 Key Screens

#### 5.2.1 Trip Dashboard
- List of trips the user belongs to (grouped by status: active / planned / completed)
- "Create Trip" button
- Quick-switch between trips

#### 5.2.2 Timeline Screen
- Vertical scroll
- Entry cards with large images
- Sticky "Add Entry" button

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

#### 5.2.5 Public View
- Clean, blog-like layout
- No editing controls
- Password prompt if protected
- Optimized for sharing

#### 5.2.6 Trip Settings
- Invite link management (generate / revoke)
- Trip details (name, dates, description)
- Shared link + password configuration
- Member list

---

## 6. Technical Requirements

### 6.1 Frontend
- Framework: React
- Styling: Tailwind CSS
- PWA:
  - Service Worker
  - Manifest
  - Offline caching
  - Push notifications

### 6.2 Backend
- Node.js v24 + Express/Fastify
- External MongoDB (managed, e.g., MongoDB Atlas)
- Object storage: Scaleway S3-compatible buckets

### 6.3 Deployment
- **Compute:** Scaleway Serverless Containers
- **Storage:** Scaleway Object Storage (S3-compatible) for media
- **Database:** External MongoDB (e.g., MongoDB Atlas)

### 6.4 Data Model

#### User
| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `email` | string | unique, used for login |
| `passwordHash` | string | bcrypt |
| `displayName` | string | shown on entries |
| `avatarUrl` | string? | optional profile picture |
| `createdAt` | Date | |
| `updatedAt` | Date | |

#### Trip
| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `name` | string | e.g., "Japan 2026" |
| `description` | string? | optional |
| `departureDate` | Date? | planned start |
| `returnDate` | Date? | planned end |
| `status` | enum | `planned` / `active` / `completed` |
| `createdBy` | ObjectId | ref → User |
| `members` | ObjectId[] | refs → User |
| `inviteCode` | string | unique, used in invite links |
| `shareSlug` | string | unique, used in public URL |
| `sharePassword` | string? | bcrypt hashed, optional |
| `createdAt` | Date | |
| `updatedAt` | Date | |

#### Entry
| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `tripId` | ObjectId | ref → Trip |
| `authorId` | ObjectId | ref → User |
| `title` | string | |
| `content` | string | plain text with basic formatting |
| `images` | Image[] | ordered array (see sub-document) |
| `location` | Location? | see sub-document |
| `weather` | Weather? | auto-populated (Phase 2) |
| `mentions` | ObjectId[] | refs → User (Phase 2) |
| `promptUsed` | string? | which prompt was used, if any |
| `isFavorite` | boolean | default false |
| `createdAt` | Date | |
| `updatedAt` | Date | |
| `syncVersion` | number | incremented on each update, used for LWW conflict resolution |

#### Image (sub-document of Entry)
| Field | Type | Notes |
|-------|------|-------|
| `key` | string | S3 object key |
| `url` | string | public or signed URL |
| `thumbnailUrl` | string | compressed thumbnail |
| `width` | number | original dimensions |
| `height` | number | original dimensions |
| `order` | number | display order within entry |
| `uploadedAt` | Date | |

#### Location (sub-document)
| Field | Type | Notes |
|-------|------|-------|
| `lat` | number | latitude |
| `lng` | number | longitude |
| `name` | string? | human-readable (e.g., "Shibuya, Tokyo") |

#### Weather (sub-document, Phase 2)
| Field | Type | Notes |
|-------|------|-------|
| `temp` | number | temperature in °C |
| `conditions` | string | e.g., "Partly Cloudy" |
| `icon` | string | icon code from weather API |

#### Reaction
| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `entryId` | ObjectId | ref → Entry |
| `emoji` | string | e.g., "❤️" |
| `nickname` | string | viewer display name |
| `createdAt` | Date | |

#### Comment
| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `entryId` | ObjectId | ref → Entry |
| `nickname` | string | viewer display name |
| `content` | string | |
| `createdAt` | Date | |

---

## 7. Non-Functional Requirements

### 7.1 Performance
- Fast load time (<2s on mobile)
- Optimized image delivery (client-side compression + server-side thumbnails)
- Lazy loading media

### 7.2 Reliability
- Offline-first capability
- Background sync for uploads
- LWW conflict resolution with edit history

### 7.3 Security
- Individual user authentication (email + password)
- Invite-link-based trip access (invite codes are single-use or revocable)
- Private trip access via unique URL + optional password for viewers
- JWT-based session management

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
- Individual account creation (email + password)
- Trip creation with invite links
- Multi-trip dashboard
- Entry creation with image upload (client-side compression)
- Image reordering within entries
- Timeline view
- Public share page (URL + optional password)
- Push notifications for new entries

### Phase 2 (Core Enhancements)
- Offline support with LWW conflict resolution
- Map view
- Trip templates
- Weather data on entries
- Mentions & tags
- Daily prompts

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
| Poor connectivity | Offline-first design with LWW sync |
| Large media uploads | Client-side compression + background sync |
| Low engagement | Daily prompts + push notifications |
| Complexity creep | Strict MVP scope + explicit out-of-scope list |
| Sync conflicts (offline edits) | LWW strategy with edit history preservation |

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
- Public sharing templates
- Collaborative real-time editing

---

## 13. Key Principles

- Speed > features
- Offline > perfect sync
- Memories > polish
- Simplicity > flexibility
