# DayRhythm Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants
1. **Strict Owner Isolation (`/users/{userId}`)**: A user can only `get`, `create`, or `update` their own document where `request.auth.uid == userId`, `request.auth.token.email_verified == true`, and `data.uid == request.auth.uid`. Blanket reads and `allow list` are completely forbidden.
2. **No Shadow Fields**: Both `create` and `update` reject any unexpected top-level key or unexpected key inside `deviceSettings`.
3. **Immutable Ownership & Creation Timestamp**: `uid` and `createdAt` can never change after document creation.
4. **Server Temporal Integrity**: `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
5. **Bounded Numeric & Array Limits**: `cupsLogged` in `0..30`, `targetCups` in `1..30`, `hydrationWeeklyCounts.size() == 7`, `liveAlertsLeadMinutes` in `[5, 10, 15, 20, 30]`.
6. **Zero PII Exposure**: No email, phone, or address fields are stored in Firestore; Google OAuth tokens remain strictly in memory.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated read/write** (`request.auth == null`) on `/users/uid123`.
2. **Unverified email write** (`request.auth.token.email_verified == false`) on `/users/uid123`.
3. **Cross-user read (`get`)** by `uidB` targeting `/users/uidA`.
4. **Cross-user collection scan (`list`)** on `/users`.
5. **Identity spoofing on create**: `uidA` writes `/users/uidA` with `uid: "uidB"`.
6. **Shadow/ghost field injection on create**: adding `isAdmin: true` or `role: "admin"` at top level.
7. **Shadow field inside `deviceSettings`**: adding `deviceSettings.hacked: true`.
8. **Invalid ID poisoning**: path `/users/invalid$id!with/junk` or >128 chars.
9. **Client-forged timestamp**: `updatedAt` set to a client date instead of `request.time`.
10. **Immutable field tampering on update**: attempting to modify `createdAt` or `uid`.
11. **Value poisoning / resource exhaustion**: `hydrationWeeklyCounts` with 500 elements or string element, or `cupsLogged: 999999`, or `quietMode: "invalid"`.
12. **Unauthorized delete**: any `delete` request on `/users/{userId}` (blocked to preserve sync state integrity).
