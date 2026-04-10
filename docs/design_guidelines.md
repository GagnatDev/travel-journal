# Design Implementation Guide: Terra & Tide

## 1. Creative North Star: "The Curated Chronicle"
Terra & Tide is designed to feel like a digital keepsake—a modern evolution of the physical travel journal. It prioritizes warmth, tactile textures, and a sense of timelessness, moving away from sterile, grid-locked app designs.

## 2. Core Visual Principles
- **Organic Structure:** Uses softer edges (ROUND_EIGHT) and generous whitespace to create a relaxed, breathable reading experience.
- **Visual Storytelling:** Large, high-impact imagery is the hero, framed by subtle tonal shifts rather than harsh borders.
- **Tactile Typography:** A mix of Noto Serif for storytelling and Plus Jakarta Sans for functional utility creates a "published" feel.

## 3. Color Palettes

### 3.1 Light Mode (The Morning Journal)
- **Background:** Primary `#fbf9f5` (warm paper). Secondary `#f5f2eb`.
- **Primary Accent:** `#9b3f2b` (Terracotta) used for CTAs, active states, and brand highlights.
- **Typography:**
    - Headings: `#1b1c1a` (Deep Charcoal)
    - Body: `#58624a` (Olive Grey)
    - Captions: `#70573f` (Warm Umber)

### 3.2 Dark Mode (The Midnight Journal)
- **Background:** Primary `#1b1c1a` (Deep Stone). Secondary Surface `#262624`.
- **Primary Accent:** `#c05a44` (Softened Terracotta) for high contrast against dark backgrounds.
- **Typography:**
    - Headings: `#fbf9f5` (Off-white / Paper)
    - Body: `#d6d3d1` (Stone Gray)
    - Captions: `#a8a29e` (Muted Stone)

## 4. Typography System
- **Display & Headings:** `Noto Serif`. Serif fonts are used to evoke the feeling of a printed book or high-end travel magazine.
- **Interface & Utilities:** `Plus Jakarta Sans`. A clean, modern sans-serif ensures readability for labels, buttons, and settings.

## 5. UI Components & Motion
- **Navigation:** A floating `BottomNavBar` with a distinct `Add Entry` action centered. 
- **Elevation:** Minimal use of shadows. Depth is primarily created through subtle tonal background changes (e.g., a card being slightly lighter/darker than the main background).
- **Interactions:** Subtle scale transitions (`scale-95`) on button presses to mimic physical tactile feedback.

## 6. Implementation Notes for PWA
- **Responsive Layout:** The design is "mobile-first," prioritizing a single-column vertical flow that adapts to larger screens via max-width containers.
- **Theming:** Use CSS variables for all color tokens to ensure seamless switching between `light` and `dark` modes based on user preference or system settings.
