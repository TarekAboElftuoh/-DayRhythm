# برومبت التخطيط وإعادة التصميم الشامل لمنظومة «إيقاع اليوم | DayRhythm»
# Master Architectural Planning & UX Redesign Prompt for Claude Opus

> **إرشادات للمستخدم:** انسخ هذا الملف بالكامل وأرسله لنموذج **Claude 3.5 / 3.7 Opus**. تم إعداد البرومبت ليوجه Opus لتقديم **تخطيط معماري وهندسي وتصميمي بحت (Architecture & Design Specifications Only)** مع **أمر صارم بمنع كتابة أي أكواد برمجية تنفيذية**، للحفاظ على استهلاك الـ Tokens والتركيز الكامل على التخطيط، والخرائط، والمصفوفات، والأبعاد التصميمية، تمهيداً ليقوم مساعدك البرمجي (Antigravity) بتنفيذ الكود خطوة بخطوة دون أخطاء.

---

```markdown
# Role & Operational Mode: Principal Software Architect & Lead Product/UX Designer

You are acting as the World-Class Software Architect and Principal UX/UI Systems Designer.
You are tasked with conducting a comprehensive system audit, structural redesign, and complete UX/UI blueprinting for an advanced, cross-platform personal rhythm, prayer, hydration, and smart alarm ecosystem called:
**«إيقاع اليوم | DayRhythm»** (formerly known as DayPulse / TawkitSyncAlarm).

---

## ⚠️ STRICT OPERATIONAL CONSTRAINTS (MANDATORY & NON-NEGOTIABLE)

1. **PLANNING, BLUEPRINTS, AND SYSTEM SPECIFICATIONS ONLY — ABSOLUTELY ZERO IMPLEMENTATION CODE:**
   - **DO NOT write actual programming code** (no Kotlin, Java, Python, C++, XML, or JavaScript code blocks).
   - All actual coding and refactoring will be executed subsequently by a dedicated AI coding agent (Antigravity).
   - Your entire output quota must be allocated to:
     - Architectural diagrams, state machines, and data flow pipelines.
     - Deep failure-mode and race-condition analysis.
     - Concrete, ultra-precise UX/UI layouts, ASCII/structural wireframes, spatial dimension tokens (dp, sp, padding, margins, elevation, hex colors).
     - Component hierarchies, ergonomic thumb-zone flows, and micro-interaction states.
     - Algorithmic pseudo-logic (flowcharts, step-by-step state transitions, mathematical constraints).
     - Strategic feature recommendations and refinement roadmaps.
2. **ALL HARDWARE & INVARIANT CONSTRAINTS ARE IMMUTABLE:**
   - The user's exact health rules, privacy invariants, geographic coordinates, and time rules must be strictly preserved.
   - Do not drop or simplify ANY existing subsystem or service; every single feature built so far must be accounted for and elevated to production-grade excellence.

---

## 1. COMPREHENSIVE INVENTORY OF THE CURRENT SYSTEM

The system has evolved through intensive engineering sprints into a robust, offline-first, dual-platform ecosystem with real-time sync. Below is the complete inventory of what has been built and verified:

### A. Core Vision & Business Domains
1. **Daily Dual-Structure (الأيام العادية vs أيام الصيام):**
   - **Normal Days (Sat, Sun, Tue, Wed, Fri):** Wake up 04:25 AM (`⏰ 🦷`), Fajr 04:45 AM (`🕌 🌌`), Quran & Daily Commitment (`📖 🌱`), Room cleanup (`🪟 ✨`), Sunrise tea & morning adhkar (`🌅 🍵`), Light workout (`🏃 💪`), Deep Work Block 1 (`💼 🔥`), Breakfast + Flaxseed Oil (`🍳 💊`), Deep Work Block 2 (`🎯 ⚡`), Dhuhr (`🕌 ☀️`), Practical Work Block 3 (`🛠️ 📈`), Asr (`🕌 🌤️`), Lunch & Rest (`🍲 🛋️`), Sunset tea & evening adhkar (`🌇 📿`), Maghrib (`🕌 🌆`), Early light dinner (`🥗 🍏`), Isha (`🕌 🌃`), Islamic lecture video 1hr (`🎧 📺`), Optional walk (`🚶 🌿`), Witr + bedtime teeth cleaning (`🤲 🪥`), Sleep 09:15 PM (`😴 🌙`).
   - **Fasting Days (Mondays & Thursdays):** Suhoor 03:45 AM (`🏮 🥣`) with water in stages, Witr and teeth cleaning; standard morning routine (adhkar without tea); Fasting short break 20m (`☕ 😌`) during work; Pre-Iftar fasting nap (`🛌 🔋`); Light pre-Iftar workout (`🏃 💪`); Evening adhkar without tea; Iftar + flaxseed oil + tea (`🌴 🍽️`); normal night schedule (Witr was prayed at Suhoor).
2. **Strict Privacy Invariants (Golden Rules):**
   - **Teeth Cleaning:** Strictly denoted by `🦷` or `🪥` alone. Never write explicit text for teeth.
   - **Daily Commitment (Charity):** Strictly denoted by `🌱` alone. Strictly NEVER write the word "صدقة" (charity) anywhere in UI, code, logs, or calendars to preserve spiritual privacy.
   - **Titles Convention:** Event and task titles are composed of **distinct emoji pairs only** without plain text, guaranteeing fast reading and zero repetition.
3. **Health & Hydration Engine:**
   - User Metrics: Weight 69 kg, Height 177 cm. Health profile: Low blood pressure (Hypotension), high salts, dehydration-prone.
   - Standard Glass Size: `177 ml` (calibrated comfortable single intake).
   - Daily Targets: **13 cups (2.3 L)** on normal days spaced every ~75 mins; **9 cups (1.6 L)** on fasting days distributed between Maghrib and Suhoor.
   - Supplement: One daily dose of **Flaxseed Oil (زيت بذور الكتان)** with breakfast/iftar.
   - Rolling 7-day hydration persistence window, slots logging, and real-time mobile/desktop sync.
4. **Geographic & Astronomical Prayer Engine:**
   - Home Location: Aldahria, Sherbin, Dakahlia Governorate, Egypt (`31.1953° N, 31.5212° E`, `Africa/Cairo`).
   - Calculation Authority: Egyptian Survey Authority (الهيئة المصرية العامة للمساحة) — Fajr 19.5°, Isha 17.5°, verified against Tawkit.net.
   - Lead Time Rule: Prayer alarms trigger **exactly 3 minutes before the adhan** (`-3 mins`) for wudu and walking to the mosque.
   - Dynamic Travel Detection: High-accuracy active GPS/network location tracking (>15 km distance trigger via Haversine formula). Recalculates prayer times, updates local alarms, and syncs over LAN.
   - Offline GPS Fallback: Graceful local fallback to Aldahria/Sherbin when GPS or internet is disabled, non-blocking astronomical calculation with zero UI freeze.
5. **Standard Pomodoro Focus Engine:**
   - Francesco Cirillo's scientifically proven standard: **25 minutes focus session ➡️ automatically and immediately followed by a 5-minute break**.
   - Automatic visual color state transition (Aqua `#7FFFD4` for focus ➡️ Soothing Green `#4ADE80` for break).
   - Gentle audio chime and vibration feedback on completion.
   - Quick presets: `25m (Standard ⭐)`, `50m (Extended)`, `5m (Direct Break)`.
6. **Dual Commitment Streaks (سلاسل الالتزام):**
   - Obligatory prayer was intentionally removed from streaks (prayer is a fundamental pillar, not an optional tracked habit).
   - Two active streaks: 1) Quran & Daily Commitment (`📖 🌱`), 2) Daily Water Target (`💧 🥤`).
   - Synchronized bidirectionally across LAN between PC and Android.

---

### B. Windows PC Application Architecture (`pc_app/`)
- **Technology Stack:** Python 3.12, PySide6 (Qt for Python), asyncio background thread, Windows DPAPI. Standalone executable packaged via PyInstaller (`TawkitSyncAlarm.exe`).
- **Core Modules:**
  - `main.py`: Entry point, `AlarmController`, single-instance local IPC mutex, system tray with context menu, Windows power wake detector (`WM_POWERBROADCAST` / `PBT_APMRESUMEAUTOMATIC`), 30s background sync timer.
  - `ui/settings_window.py` (`DashboardWindow`): Complete dark UI with Schedule tab (calendar events list, deduplicated view, delete/restore, next alarm live countdown, Pomodoro card, dual streaks card, hydration tracker with clickable slots), Sounds tab, and Setup tab.
  - `ui/overlay_window.py` (`AlarmOverlayWindow`): Multi-monitor aware shaking and pulsing animated window. Automatically targets the **secondary monitor** if multiple displays are detected, leaving the primary display uninterrupted; corner floating card on single monitor; audio-only mode support.
  - `core/lan_server.py` (`LanSyncServer`): aiohttp HTTP + WebSocket server running on port `48721`, UDP broadcast discovery on `48722`, HMAC-SHA256 authenticated requests with timestamp + nonce, RFC1918 private network bound.
  - `core/google_sync.py`: Free multi-tier Google sync:
    1. Direct live calendar push from paired OnePlus 12R (`/api/v1/calendar/push`).
    2. Google Apps Script Web App Bridge (`script.google.com`) with 256-bit secret.
    3. Secret `.ics` calendar feed parsing.
    4. Direct CLI execution via `gcalendar` for instant cloud-level event deletion and restoration.
  - `core/settings_store.py`: Pydantic settings store, DPAPI encrypted secrets store (`SecretStore`).
  - `core/prayer_engine.py`: Offline astronomical calculation engine.
  - `core/audio_player.py`: QMediaPlayer / QAudioOutput category-based sound playback.

---

### C. Android Mobile Application Architecture (`android_app/`)
- **Technology Stack:** Native Kotlin, Android 14/15/16 (API 34+, targeted for OnePlus 12R / OxygenOS 16), Material 3, AndroidX Lifecycle, Coroutines, Flow. Packaged as `TawkitSyncAlarm-OnePlus12R.apk`.
- **Core Modules & Services:**
  - `KeepAliveSyncService.kt`: Persistent foreground service with custom silent notification, wake lock management, Wi-Fi connectivity callbacks, periodic background loop (30s check, 60s Google sync nudge), automatic revival via `onTaskRemoved` and `BootReceiver`.
  - `AlarmScheduler.kt` & `AlarmRingingService.kt`: High-priority exact alarms scheduled via `AlarmManager.setAlarmClock()`, immune to Doze mode and OxygenOS aggressive task killers.
  - `AlarmRingingActivity.kt`: Full-screen lock-screen overlay with continuous vibration waveforms (`VibratorManager`), category-based audio on `AudioAttributes.USAGE_ALARM`, stop/snooze controls.
  - `LocalCalendarReader.kt`: Direct SQLite queries on `CalendarContract.Events` and `CalendarContract.Instances`. Intelligent exception handling: when deleting a recurring event instance, it creates a `STATUS_CANCELED` exception row for today without mutating future days; when restoring, it cleans the exception row or injects a safe single instance.
  - `MainActivity.kt`:
    - Zero-Click Sync: Registered `ContentObserver` on `CalendarContract.Events.CONTENT_URI` and `CalendarContract.Instances.CONTENT_URI` for immediate (<200ms) UI updates when any calendar change occurs anywhere.
    - Automatic nudging of Google Calendar Sync Adapter via `ContentResolver.requestSync(SYNC_EXTRAS_MANUAL, SYNC_EXTRAS_EXPEDITED)` on resume.
    - Pomodoro Focus timer dialog with auto 5m break transition.
    - Dual Streaks UI (Quran & Water, 50/50 layout).
    - Hydration quick logging (+1 cup 177ml) and slots grid.
    - Trash dialog with 1-tap single/bulk restoration.
  - `TravelLocationManager.kt`: Active GPS fetch with timeout, distance calculation (>15 km), offline fallback to Aldahria/Sherbin, prayer lead-time recalculation (-3m).
  - **OnePlus 12R Specific Features:**
    - Live Alerts Capsule: notification capsule that transitions to live seconds countdown when <60s.
    - Battery Protection: 100W SUPERVOOC monitoring, silent PC notification upon reaching 90%, bypass charging detection, evening battery warning (<25% at 8:35–9:10 PM).
    - 4 Home Screen Widgets: Next Alarm, 5 Daily Prayers, Water Log +1, Quick Quiet Mode Toggle.
    - Alert Slider state integration.
    - Fast Swipe-to-Refresh with non-blocking background sync.

---

### D. Shared Doc Single Source of Truth
- Google Docs Document ID: `13RbQ2g7t_sy6sWxnfH0gNOdpQu4PgVR1qU6tOl2svEA`
- Named: `النظام اليومي والذاكرة المشتركة (الموبايل + Antigravity)`
- Section: "سجل التحديثات المشترك" (Shared Changelog) which tracks all revisions up to Update 11 (17 Nov 2026).

---

## 2. THE DESIGN CHALLENGE & REBUILD OBJECTIVES

While the current system is functionally complete and feature-packed, it grew organically through iterative problem-solving sprints. We now want you to perform a **world-class architectural and UX redesign** so the system can be cleanly re-engineered into an elegant, flawless, and intuitive daily companion that delights any user.

You must design:
1. **A Unified Modern UI/UX Design System:**
   - Must appeal to diverse aesthetic tastes while honoring the core dark theme: **Absolute AMOLED Black (`#000000`)** base, refined **Aquamarine (`#7FFFD4`)** primary accents, with an optional subtle "Deep Slate / Obsidian" secondary theme.
   - Flawless typography hierarchy (supporting Arabic Cairo / Tajawal / Readex Pro and English Inter / Roboto Flex).
   - Ergonomic one-handed mobile layout (placing interactive triggers in the bottom 60% thumb zone).
   - Desktop layout optimized for widescreen monitors, system tray subtlety, and zero-distraction overlays.
2. **Two Critical New Modules (Specified in `dayrhythm_spec.md`):**
   - **Module 1: 🧳 وضع السفر الذكي (Travel Mode):**
     - UI Entry: Top capsule button `🧳 سفر` / `🧳 Travel`.
     - Interaction: BottomSheet on Android, Modal on PC.
     - 3 Distinct Sections: 1) GPS auto-detection & prayer delta preview (-3m), 2) 3-Group Task Matrix (Group A: Fixed-place tasks like room/PC cleaning auto-postponed to return date; Group B: Work/workout toggleable; Group C: Portable habits like prayers, Quran, meals, water), 3) Duration chips (`Today only`, `Tomorrow also`, `Until manually stopped`).
     - State synchronization over LAN and Google Calendar overrides.
   - **Module 2: ⚡ تدارك اليوم والزحزحة الذكية (Smart Catch-Up & Collision-Free Reflow):**
     - Purpose: Solving schedule breakdown when waking up late or delayed, using **"Gap Absorption (امتصاص الفجوة)"** within flexible work blocks without breaking immutable prayer or sleep anchors.
     - Interactive Screen: List of overdue/missed tasks with 3 segmented decision buttons per task: `⏩ ابدأ الآن` (Start Now), `🌙 رحّل للمساء` (Shift to evening 7:45–8:30 PM), `❌ تخطّي اليوم` (Skip today only).
     - Collision-Free Reflow Algorithm: compresses work blocks (`💼 🔥`, `🎯 ⚡`) to fit deferred tasks, preserves prayer times and bedtime 100%.
     - Visual Timeline Diff Bar (Before vs. After preview).
     - 1-Tap Undo (`↩️ استعادة الجدول الأصلي`) via state snapshotting.

---

## 3. EXACT DELIVERABLES REQUIRED FROM CLAUDE OPUS

Please structure your response into the following clear, deeply detailed sections:

### SECTION 1: ARCHITECTURAL BLUEPRINT & DATA FLOW (No Code)
1. **Clean Architecture State Pipeline:**
   - Define the end-to-end unidirectional data flow (MVI / StateFlow on Android; Model-View-Controller with Qt Signals on PC).
   - How events from CalendarProvider, Apps Script, LAN WebSocket, and User Overrides merge into a single immutable `DayScheduleState`.
2. **Robust Multi-Source Conflict Resolution Engine:**
   - Matrix of race conditions (e.g., event deleted on PC while phone is sleeping; recurring event canceled on mobile while Google Calendar web edits the series; network drop during Travel Mode).
   - Deterministic resolution hierarchy ensuring zero duplicated events and zero resurrection of deleted tasks.
3. **Fail-Safe Offline-First & Background Guarantee:**
   - How OxygenOS 16 / Android 14+ background limits are permanently neutralized without battery drain.
   - How Windows Sleep/Resume is handled with sub-second recovery.

### SECTION 2: THE COMPLETE UX/UI DESIGN SYSTEM & SCREEN BLUEPRINTS
1. **Design Tokens & Visual Language:**
   - Color palette with exact HEX codes (AMOLED Black, Aqua Primary, Break Green, Alert Coral, Surface Greys, Stroke borders).
   - Typography scale (Header, Title, Body, Caption, Monospace timers) with Arabic and English font pairings and line-heights.
   - Spacing & Elevation tokens (4dp grid scale).
2. **Mobile UI Wireframe Blueprints (ASCII / Markdown Layout Blocks with exact dp/sp values):**
   - **Screen 1: Main Dashboard (إيقاع اليوم):**
     - Status App Bar (Live sync indicator, Battery telemetry, Quick pills: `🧳 سفر`, `🔇 اجتماع`, `⏱️ بومودورو`, `🔄 مزامنة`).
     - Hero Capsule Card: Next alarm countdown (switching to live seconds under 60s), prayer lead-time badge.
     - Dual Streaks Card: Quran & Water (50/50 balanced layout with progress indicators).
     - Hydration Mini-Tracker: Cups progress, 177ml bottle visual, clickable quick-log button, time-slotted pills.
     - Schedule Timeline: Chronological card list with distinct emoji pairs, category color tag, status indicator, swipe-to-delete action.
   - **Screen 2: 🧳 Travel Mode Bottom Sheet:**
     - Layout, GPS detection card, 3-group task matrix checkboxes, duration chips, confirmation CTA.
   - **Screen 3: ⚡ Smart Catch-Up (تدارك اليوم):**
     - Missed blocks list, 3-segmented button pill per item, Live Timeline Diff Preview bar, "Commit for Today" button, and "Undo to Original" button.
   - **Screen 4: ⏱️ Pomodoro Focus Modal:**
     - Big circular/pill countdown, state indicator (Focus Aqua vs Break Green), auto-transition trigger, preset chips.
   - **Screen 5: Android Home Screen Widgets & Live Capsule:**
     - Detailed layout specs for all 4 widgets (Next Alarm, 5 Prayers, Water +1, Quick Quiet).
3. **Desktop (Windows PC) UI Wireframe Blueprints:**
   - Main Window (Compact Widescreen Dashboard): Split pane, live sync telemetry, system tray menu structure.
   - Multi-Monitor Secondary Overlay (`AlarmOverlayWindow`): Dimensions, animation timing curves (shake frequency, pulse opacity), button ergonomics.

### SECTION 3: ALGORITHMIC SPECIFICATIONS (Step-by-Step Logic Flowcharts)
1. **Collision-Free Reflow & Gap Absorption Algorithm:**
   - Formal mathematical model: Defining Available Window Budget $W = T_{\text{anchor}} - T_{\text{now}}$.
   - Step-by-step logic for packing deferred tasks, truncating flexible work blocks, and validating against immutable prayer anchors.
2. **Travel Matrix Resolution Algorithm:**
   - Step-by-step logic for classifying tasks into Groups A, B, C, resolving dates, and applying Google Calendar exception overrides.
3. **Zero-Click ContentObserver Debounce & Cloud Nudge State Machine:**
   - Timing constants (200ms debounce, 1800ms secondary verification pass).

### SECTION 4: INNOVATIVE PROPOSALS & ARCHITECTURAL ENHANCEMENTS
- Suggest 3 to 5 high-impact, lightweight architectural or UX enhancements that would make the app even more delightful and robust, while adhering to the zero-external-cost, privacy-first, offline-ready philosophy.

### SECTION 5: IMPLEMENTATION CHECKLIST FOR THE DEVELOPER AGENT
- Provide a prioritized, checklist of discrete engineering tasks (Phase 1 through Phase 5) that the developer agent (Antigravity) can execute sequentially to rebuild and polish the entire codebase.

---
**REMINDER:** Provide comprehensive, top-tier engineering depth, exact wireframe layouts, and concrete technical rules. DO NOT write actual programming code snippets. Keep all output focused on architecture, UX design specs, algorithms, and execution blueprints.
```
