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
- Multi-trip support

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
- As a user, I want to upload photos/videos so I can visually document experiences
- As a user, I want to write notes so I can remember details

### 3.2 Collaboration
- As a user, I want multiple people to contribute so the journal reflects everyone’s perspective
- As a user, I want to see who posted what

### 3.3 Consumption
- As a viewer, I want a clean timeline so I can follow the trip story
- As a viewer, I want to react/comment so I can engage with the content

### 3.4 Reliability
- As a user, I want to use the app offline so I can log entries without internet
- As a user, I want uploads to sync automatically later

---

## 4. Features & Requirements

## 4.1 MVP Features (Must Have)

### 4.1.1 Timeline Feed
- Chronological list of entries
- Entry card includes:
  - Title
  - Text content
  - Media (images/videos)
  - Timestamp
  - Author
  - Location (if available)

### 4.1.2 Entry Creation
- Create/edit/delete entries
- Rich text (basic formatting)
- Attach multiple images
- Optional:
  - Location tagging (GPS or manual)

### 4.1.3 Media Handling
- Image upload with compression
- Support for multiple images per entry
- Basic video support (optional MVP+)

### 4.1.4 Multi-User Support
- Simple authentication (shared or individual accounts)
- Each entry linked to an author

### 4.1.5 Shareable Public View
- Unique URL for trip
- Read-only access
- Optimized for non-technical users

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

### 4.2.3 Reactions & Comments
- Emoji reactions (❤️ 👍 😂)
- Optional comments on entries
- No login required (magic link or nickname)

### 4.2.4 Daily Grouping (“Story Mode”)
- Group entries by day
- Auto-generate day titles (e.g., “Day 4 in Paris”)
- Highlight key photos

### 4.2.5 Daily Prompts
- Optional prompts when creating entries:
  - “Best moment today?”
  - “What surprised you?”
  - “Favorite food?”

---

## 4.3 Delight Features (Nice to Have)

### 4.3.1 Memory Highlights
- Mark entries as favorites
- Generate “Best of Trip” view

### 4.3.2 Voice Notes
- Record short audio clips
- Attach to entries

### 4.3.3 Live Status
- “Currently in [location]”
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

## 5. UX / UI Requirements

### 5.1 Design Principles
- Mobile-first
- Fast interaction (low friction)
- Visual-first (photos prioritized)
- Minimal typing required

### 5.2 Key Screens

#### 5.2.1 Timeline Screen
- Vertical scroll
- Entry cards with large images
- Sticky “Add Entry” button

#### 5.2.2 Create Entry Screen
- Quick access camera/upload
- Text input
- Location toggle
- Prompt suggestions

#### 5.2.3 Map Screen
- Interactive map
- Pins for entries
- Tap → open entry

#### 5.2.4 Public View
- Clean, blog-like layout
- No editing controls
- Optimized for sharing

---

## 6. Technical Requirements

The app will be deployed to Scaleway.

### 6.1 Frontend
- Framework: React
- Styling: Tailwind CSS
- PWA:
  - Service Worker
  - Manifest
  - Offline caching

### 6.2 Backend Options

- Node.js v24 + MongoDB
- Object storage (S3-compatible)

### 6.3 Data Model

TBD

---

## 7. Non-Functional Requirements

### 7.1 Performance
- Fast load time (<2s on mobile)
- Optimized image delivery
- Lazy loading media

### 7.2 Reliability
- Offline-first capability
- Background sync for uploads

### 7.3 Security
- Private trip access via unique URL
- Optional password protection

### 7.4 Scalability
- Designed for small group usage (5–20 users)
- Moderate media storage

---

## 8. Analytics (Optional)
- Number of entries created
- Viewer engagement (views, reactions)

---

## 9. Development Plan

### Phase 1 (MVP – 2–4 days)
- Entry creation
- Image upload
- Timeline view
- Basic auth
- Public share page

### Phase 2 (Core Enhancements – 2–3 days)
- Offline support
- Map view
- Multi-user improvements

### Phase 3 (Polish – optional)
- Reactions/comments
- Story mode
- Export functionality

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Poor connectivity | Offline-first design |
| Large media uploads | Compression + background sync |
| Low engagement | Daily prompts |
| Complexity creep | Strict MVP scope |

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

---

## 13. Key Principles

- Speed > features
- Offline > perfect sync
- Memories > polish
- Simplicity > flexibility
