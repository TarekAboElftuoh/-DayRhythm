import sqlite3
import json
import hashlib
import os

base_dir = r"C:\Users\Administrator\.gemini\antigravity\scratch\DayRhythm\tools\migration"
backup_file = os.path.join(base_dir, "master_migration_backup.json")
sha_file = os.path.join(base_dir, "master_migration_backup.sha256")
db_file = os.path.join(base_dir, "dayrhythm_v2.db")
schema_file = os.path.join(base_dir, "schema.sql")

# 1. Verify SHA-256
with open(backup_file, "rb") as f:
    backup_bytes = f.read()
with open(sha_file, "r", encoding="utf-8") as f:
    expected_sha = f.read().strip()

actual_sha = hashlib.sha256(backup_bytes).hexdigest()
if actual_sha != expected_sha:
    raise ValueError(f"Checksum mismatch! Expected {expected_sha}, got {actual_sha}")
print("[Migration] Cryptographic SHA-256 verification passed!")

master = json.loads(backup_bytes.decode("utf-8"))

# 2. Initialize SQLite
if os.path.exists(db_file):
    os.remove(db_file)

conn = sqlite3.connect(db_file)
cur = conn.cursor()

with open(schema_file, "r", encoding="utf-8") as f:
    cur.executescript(f.read())
conn.commit()

from datetime import datetime, timezone

# 3. Populate User Profile
uid = master.get("uid")
email = master.get("email")
fs_fields = master.get("firestoreUserDoc", {}).get("fields", {})
state_v3 = master.get("parsedEntities", {}).get("state_v3", {})
life_profile = state_v3.get("lifeProfile", {})

def get_fs_field(key, default=None):
    if key not in fs_fields:
        return default
    val_map = fs_fields[key]
    if "stringValue" in val_map:
        return val_map["stringValue"]
    if "integerValue" in val_map:
        return int(val_map["integerValue"])
    if "booleanValue" in val_map:
        return 1 if val_map["booleanValue"] else 0
    if "doubleValue" in val_map:
        return float(val_map["doubleValue"])
    return default

cur.execute("""
INSERT INTO user_profiles (
    uid, email, surface_theme, quiet_mode, adhan_override_silent,
    weight_kg, height_cm, cup_size_ml, sleep_target_minutes, sleep_strategy,
    prayer_silence_minutes, current_city_name, current_time_zone,
    current_lat, current_lng, priority_order_ar, created_at, updated_at, raw_payload
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", (
    uid,
    email,
    get_fs_field("surfaceTheme", "amoled"),
    get_fs_field("quietMode", "normal"),
    get_fs_field("adhanOverrideSilent", 1),
    float(life_profile.get("weightKg", 70.0)),
    float(life_profile.get("heightCm", 175.0)),
    int(life_profile.get("cupSizeMl", 250)),
    int(life_profile.get("sleepTargetMinutes", 450)),
    life_profile.get("sleepStrategy", "night_only_strict"),
    int(life_profile.get("prayerSilenceMinutes", 20)),
    life_profile.get("currentCityName", "Cairo"),
    life_profile.get("currentTimeZone", "Africa/Cairo"),
    float(life_profile.get("currentLat", 30.0444)),
    float(life_profile.get("currentLng", 31.2357)),
    life_profile.get("priorityOrderAr", "الصلاة ثم الصحة ثم العمل"),
    1732000000000,
    1732400000000,
    json.dumps(fs_fields, ensure_ascii=False)
))

# 4. Populate Hydration History & Streaks
state_v3 = master.get("parsedEntities", {}).get("state_v3", {})
hydration_history = state_v3.get("hydrationHistory", [])

for h in hydration_history:
    date_key = h.get("dateKey")
    label_ar = h.get("labelAr", "")
    cups_logged = h.get("cupsLogged", 0)
    target_cups = h.get("targetCups", 13)
    slots = json.dumps(h.get("slots", []))
    cur.execute("""
    INSERT OR REPLACE INTO hydration_history (date_key, label_ar, cups_logged, target_cups, slots_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (date_key, label_ar, cups_logged, target_cups, slots, 1732400000000))

# Streaks
cur.execute("""
INSERT INTO streaks (id, daily_commitment_days, daily_commitment_done_today, water_target_days, water_target_done_today, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
""", (
    "primary",
    get_fs_field("dailyCommitmentDays", 20),
    get_fs_field("dailyCommitmentDoneToday", 1),
    get_fs_field("waterTargetDays", 15),
    get_fs_field("waterTargetDoneToday", 1),
    1732400000000
))

# 5. Populate Medications
medications = master.get("parsedEntities", {}).get("medications", [])
for m in medications:
    cur.execute("""
    INSERT INTO medications (
        id, name, time24, times24_json, days_of_week_json, dose_note,
        course_end_date, remaining_doses, total_doses, refill_alert_days,
        taken_dates_json, calendar_event_id, updated_at, raw_payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        m.get("id"),
        m.get("name"),
        m.get("time24"),
        json.dumps(m.get("times24", [])),
        json.dumps(m.get("daysOfWeek", [])),
        m.get("doseNote"),
        m.get("courseEndDate"),
        m.get("remainingDoses", -1),
        m.get("totalDoses", -1),
        m.get("refillAlertDays", 3),
        json.dumps(m.get("takenDates", [])),
        m.get("calendarEventId"),
        1732400000000,
        json.dumps(m, ensure_ascii=False)
    ))

# 6. Populate Memories
memories = master.get("parsedEntities", {}).get("memories", [])
for mem in memories:
    cur.execute("""
    INSERT INTO memories (id, category, rule_text, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        mem.get("id"),
        mem.get("category", "general"),
        mem.get("ruleText", ""),
        mem.get("source", "user"),
        1732000000000,
        1732400000000
    ))

# 7. Populate Chat History
chats = master.get("parsedEntities", {}).get("chats", [])
for msg in chats:
    if isinstance(msg, dict):
        msg_id = msg.get("id") or f"msg_{len(chats)}"
        role = msg.get("role", "user")
        text = msg.get("text", "")
        created_at_iso = msg.get("createdAtIso", "")
        ts = 0
        if created_at_iso:
            try:
                dt = datetime.fromisoformat(created_at_iso.replace("Z", "+00:00"))
                ts = int(dt.timestamp() * 1000)
            except Exception:
                pass
        cur.execute("""
        INSERT OR REPLACE INTO chat_history (id, session_id, role, text, timestamp_ms, created_at_iso, raw_payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            msg_id,
            "default",
            role,
            text,
            ts,
            created_at_iso,
            json.dumps(msg, ensure_ascii=False)
        ))

# 8. Populate App Settings (Capsule, Auth, Tokens, Water Reminders)
ls = master.get("localStorage", {})
for k, v in ls.items():
    if k.startswith("dayrhythm_"):
        cur.execute("""
        INSERT OR REPLACE INTO app_settings (key, value_json, updated_at)
        VALUES (?, ?, ?)
        """, (k, v, 1732400000000))

# 9. Initialize Spirc Cluster State
cur.execute("""
INSERT INTO spirc_cluster_state (cluster_id, active_device_id, state_seq, vector_clock_json, last_action, last_action_ts)
VALUES (?, ?, ?, ?, ?, ?)
""", (
    f"cluster_{uid}",
    "desktop_pc",
    1,
    json.dumps({"desktop_pc": 1, "android_mobile": 0}),
    "INIT_MIGRATION",
    1732400000000
))

conn.commit()

# Verification check
print("[Migration] SQLite Verification Counts:")
for table in ["user_profiles", "hydration_history", "streaks", "medications", "memories", "chat_history", "app_settings", "spirc_cluster_state"]:
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    count = cur.fetchone()[0]
    print(f" - Table {table}: {count} rows")

conn.close()
print(f"[Migration] Successfully migrated all data into SQLite database: {db_file}")
