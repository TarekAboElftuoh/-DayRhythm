-- ====================================================================
-- DayRhythm Connect v2 SQLite Persistence Schema
-- Monotonic Sequence Support, Spirc Vector Clock & Zero Data Loss Format
-- ====================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profiles (
    uid TEXT PRIMARY KEY,
    email TEXT,
    surface_theme TEXT DEFAULT 'amoled',
    quiet_mode TEXT DEFAULT 'normal',
    adhan_override_silent INTEGER DEFAULT 1,
    weight_kg REAL DEFAULT 70.0,
    height_cm REAL DEFAULT 175.0,
    cup_size_ml INTEGER DEFAULT 250,
    sleep_target_minutes INTEGER DEFAULT 450,
    sleep_strategy TEXT DEFAULT 'night_only_strict',
    prayer_silence_minutes INTEGER DEFAULT 20,
    current_city_name TEXT,
    current_time_zone TEXT,
    current_lat REAL,
    current_lng REAL,
    priority_order_ar TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    raw_payload TEXT
);

CREATE TABLE IF NOT EXISTS hydration_history (
    date_key TEXT PRIMARY KEY,
    label_ar TEXT,
    cups_logged INTEGER DEFAULT 0,
    target_cups INTEGER DEFAULT 13,
    slots_json TEXT,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS streaks (
    id TEXT PRIMARY KEY,
    daily_commitment_days INTEGER DEFAULT 0,
    daily_commitment_done_today INTEGER DEFAULT 0,
    water_target_days INTEGER DEFAULT 0,
    water_target_done_today INTEGER DEFAULT 0,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    time24 TEXT,
    times24_json TEXT,
    days_of_week_json TEXT,
    dose_note TEXT,
    course_end_date TEXT,
    remaining_doses INTEGER DEFAULT -1,
    total_doses INTEGER DEFAULT -1,
    refill_alert_days INTEGER DEFAULT 3,
    taken_dates_json TEXT,
    calendar_event_id TEXT,
    updated_at INTEGER,
    raw_payload TEXT
);

CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    rule_text TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS chat_history (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp_ms INTEGER,
    created_at_iso TEXT,
    raw_payload TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS spirc_cluster_state (
    cluster_id TEXT PRIMARY KEY,
    active_device_id TEXT,
    state_seq INTEGER DEFAULT 0,
    vector_clock_json TEXT,
    last_action TEXT,
    last_action_ts INTEGER
);
