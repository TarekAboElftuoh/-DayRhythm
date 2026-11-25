import json
import hashlib
import os

base_dir = r"C:\Users\Administrator\.gemini\antigravity\scratch\DayRhythm\tools\migration"
backup_file = os.path.join(base_dir, "master_migration_backup.json")
sha_file = os.path.join(base_dir, "master_migration_backup.sha256")

# Read local storage dump
ls_path = os.path.join(base_dir, "migration_backup_localstorage.json")
with open(ls_path, "r", encoding="utf-8-sig") as f:
    ls_data = json.load(f)

# Read firestore root doc
with open("extracted_user_root.json", "r", encoding="utf-8") as f:
    fs_root = json.load(f)

# Read auth tokens
with open("firebase_auth_tokens.json", "r", encoding="utf-8") as f:
    auth_data = json.load(f)

uid = auth_data.get("localId", "BLzoZhXVNXQv8nQEvaQItWDqDmJ2")
email = auth_data.get("email", "tarek13us@gmail.com")

meds_raw = ls_data.get("dayrhythm_medications_v1", "[]")
meds = json.loads(meds_raw) if meds_raw else []

mems_raw = ls_data.get("dayrhythm_memories_v1", "[]")
mems = json.loads(mems_raw) if mems_raw else []

chats_raw = ls_data.get("dayrhythm_gemini_chats_v1", "[]")
chats = json.loads(chats_raw) if chats_raw else []

cal_key = f"dayrhythm_offline_cal_v1_{uid}"
cal_data = ls_data.get(cal_key, "")

# Combine master backup
master_bundle = {
    "version": "2.0.0",
    "exportedAt": "2026-11-24T18:45:00Z",
    "uid": uid,
    "email": email,
    "firestoreUserDoc": fs_root,
    "localStorage": ls_data,
    "parsedEntities": {
        "medications": meds,
        "memories": mems,
        "chats": chats,
        "state_v3": json.loads(ls_data.get("dayrhythm_state_v3", "{}")),
    },
    "summary": {
        "habits_and_hydration": True,
        "medications_count": len(meds),
        "memories_count": len(mems),
        "gemini_chat_sessions": len(chats),
        "calendar_cache_bytes": len(cal_data)
    }
}

json_bytes = json.dumps(master_bundle, ensure_ascii=False, indent=2).encode("utf-8")
with open(backup_file, "wb") as f:
    f.write(json_bytes)

sha256_hash = hashlib.sha256(json_bytes).hexdigest()
with open(sha_file, "w", encoding="utf-8") as f:
    f.write(sha256_hash)

print("MASTER BACKUP CREATED SUCCESSFULLY!")
print("Backup file size:", len(json_bytes), "bytes")
print("SHA-256:", sha256_hash)
print("Summary:", json.dumps(master_bundle["summary"], indent=2))
