import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const backupPath = path.join(rootDir, 'tools', 'migration', 'master_migration_backup.json');
const shaPath = path.join(rootDir, 'tools', 'migration', 'master_migration_backup.sha256');

const workerUrl = process.env.DAYRHYTHM_BROKER_URL?.replace(/\/$/, '');
const authToken = process.env.DAYRHYTHM_AUTH_TOKEN || '';

if (!fs.existsSync(backupPath)) {
  console.error(`Backup file not found: ${backupPath}`);
  process.exit(1);
}

const rawBytes = fs.readFileSync(backupPath);
const computedSha = crypto.createHash('sha256').update(rawBytes).digest('hex');
if (fs.existsSync(shaPath)) {
  const expectedSha = fs.readFileSync(shaPath, 'utf8').trim().toLowerCase();
  if (expectedSha && expectedSha !== computedSha) {
    console.error(`SHA-256 mismatch! Expected ${expectedSha}, got ${computedSha}`);
    process.exit(1);
  }
}

const backup = JSON.parse(rawBytes.toString('utf8'));
const uid = backup.uid;
const entities = [];

if (backup.parsedEntities?.state_v3) {
  entities.push({
    entityId: 'state_v3',
    entityKind: 1,
    lamportSeq: 1,
    clientId: 'migration',
    timestampMs: Date.now(),
    payloadJson: JSON.stringify(backup.parsedEntities.state_v3),
  });
}

for (const med of backup.parsedEntities?.medications || []) {
  entities.push({
    entityId: `med_${med.id}`,
    entityKind: 2,
    lamportSeq: 1,
    clientId: 'migration',
    timestampMs: Date.now(),
    payloadJson: JSON.stringify(med),
  });
}

for (const mem of backup.parsedEntities?.memories || []) {
  entities.push({
    entityId: `mem_${mem.id}`,
    entityKind: 3,
    lamportSeq: 1,
    clientId: 'migration',
    timestampMs: Date.now(),
    payloadJson: JSON.stringify(mem),
  });
}

if (Array.isArray(backup.parsedEntities?.chats)) {
  entities.push({
    entityId: 'gemini_chats_v1',
    entityKind: 4,
    lamportSeq: 1,
    clientId: 'migration',
    timestampMs: Date.now(),
    payloadJson: JSON.stringify(backup.parsedEntities.chats),
  });
}

console.log(`[DayRhythm Migrate] Verified SHA-256 (${computedSha.slice(0, 12)}...), prepared ${entities.length} entities for uid=${uid}.`);

if (!workerUrl) {
  console.log('[DayRhythm Migrate] Set DAYRHYTHM_BROKER_URL=https://your-worker.workers.dev to push to Cloudflare Durable Objects.');
  process.exit(0);
}

const res = await fetch(`${workerUrl}/admin/import?uid=${encodeURIComponent(uid)}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  },
  body: JSON.stringify({ entities }),
});

if (!res.ok) {
  console.error(`Import failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

console.log('[DayRhythm Migrate] Cloud import result:', await res.json());
