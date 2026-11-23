# DayRhythm Design System & Craft Guidelines

> Built adhering to the 5 design ecosystems:
> 1. **GreenSock (GSAP)**: High-performance timelines and spatial continuity
> 2. **Framer Motion**: React spring physics, `layoutId` sliding pills, and `AnimatePresence`
> 3. **Taste Skill**: Anti-AI slop, real product UI, equal edges, deliberate hierarchy
> 4. **Impeccable**: Mode: `Operate`, high craft, dark contrast floor, zero decoration fluff
> 5. **UI/UX Pro Max**: 44px touch targets, tabular numerals, 4.5:1 contrast, CLS < 0.1

---

## 1. Surface Mode & Personality
- **Primary Mode**: `Operate` (Day rhythm tracking, prayer anchors, hydration, medication, life capsule).
- **Bar**: The experience must feel physical, responsive, and respectful of the user's attention. Zero template aesthetics, zero artificial AI decorative fluff.
- **Palette Identity**: Pure AMOLED Dark + Electric Mint Accent (`#7FFFD4`).

---

## 2. Color Tokens & Contrast Floor
| Token | Hex / Value | Purpose |
|---|---|---|
| Background (Ground) | `#05080E` / `#070A0F` | True dark OLED background; reduces battery drain on mobile |
| Elevated Surface | `#0B0E14` / `#0D1118` | Cards, sidebars, modal containers |
| Subtle Borders | `rgba(255, 255, 255, 0.08)` | Crisp, quiet separation without visual noise |
| Brand Accent / Mint | `#7FFFD4` | Active tabs, primary CTAs, water goals, rhythm anchors |
| Success / Done | `#4ADE80` | Completed tasks, logged doses, full hydration |
| Priority / Caution | `#FBBF24` | Active audio alerts, battery warnings, adhan override |
| Danger / Destructive | `#F87171` | Deletions, emergency stops |

---

## 3. Typography & Numerical Stability
- **Headings & Body**: Clean sans-serif hierarchy (`text-white`, `text-zinc-200`, `text-zinc-400`).
- **Tabular Figures**: Every timer, countdown, water count (`8/8`), medication dosage (`1/2`), and time of day (`04:30 ص`) MUST use tabular figures (`font-mono-tabular` / `tabular-nums`) to prevent Cumulative Layout Shift (CLS).

---

## 4. Motion & Spring Physics
- **Library**: `motion/react` (Motion v14 / React 19 native).
- **Micro-interactions (Chips, Buttons, Toggles)**:
  - `whileHover={{ scale: 1.04, y: -1 }}`
  - `whileTap={{ scale: 0.94 }}`
  - `transition={{ type: 'spring', stiffness: 480, damping: 28 }}`
- **Active Navigation Indicator**:
  - Uses Framer Motion `layoutId="activeTabPillDesktop"` and `layoutId="mobileActiveTabPill"` for fluid pill translation between tabs.
- **Mounting / Unmounting Alerts**:
  - Wrapped in `<AnimatePresence>` with `initial={{ opacity: 0, y: -10, scale: 0.98 }}`, `animate={{ opacity: 1, y: 0, scale: 1 }}`, `exit={{ opacity: 0, y: -8, scale: 0.98 }}`.

---

## 5. Mobile Touch & Interaction Standards
- **Minimum Target Size**: All interactive buttons, chips, and toggles have `min-h-[44px]` (or `min-h-[36px]` on dense desktop toolbars).
- **Bottom Navigation**: Thumb-friendly layout anchored to `pb-[max(0.5rem,env(safe-area-inset-bottom))]`.
- **Keyboard & Voice**: Zero-friction transitions with immediate responsive feedback.
