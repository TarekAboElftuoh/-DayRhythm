# DayRhythm (إيقاع اليوم) - Product Context

## Overview
DayRhythm is an offline-first, private personal rhythm and productivity system. It harmonizes daily life around natural prayer anchors, hydration targets, medication schedules, focus blocks, and persistent AI collaboration via Gemini.

## Core Surfaces
1. **Today / Dashboard (`dashboard`)**:
   - Prayer anchors (Fajr, Dhuhr, Asr, Maghrib, Isha) with accurate local calculation and adhan chime options.
   - Interactive hydration strip with heat-adjusted targets and quick logging.
   - Medication tracker with dosage times, refill warnings, and consumption history.
   - Smart Reflow & Catch-Up: automatically shifts uncompleted tasks without shame or guilt.
2. **Gemini Assistant (`assistant`)**:
   - Local Constitution & Memories: Gemini respects personal user rules and profile constraints.
   - Real-world action proposals: Google Calendar sync, Google Tasks sync, and medication logging with user confirmation.
   - Multi-mode support: General Chat, Google Maps search for nearby places/mosques, Web Search.
   - Voice input and instant response streaming.
3. **Platform Modes**:
   - **Desktop / Windows**: Native WebView2 desktop application with floating PiP capsule, battery telemetry, and background alerts.
   - **Mobile / Android**: Safe-area responsive layout, thumb-zone bottom navigation, PWA offline caching.

## Architecture & Guarantees
- **Offline First**: All user data, habits, hydration, and settings persist locally first.
- **Privacy First**: Sensitive data remains under the user's control; cloud backup is securely encrypted.
- **Zero AI Slop**: Crafted for utility, reliability, and tactile delight.
