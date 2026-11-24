# DayRhythm Agent Engineering Constitution

This repository adheres strictly to four foundational agent frameworks:
1. **Julius Brussee's Caveman** (Terse communication, token conservation, surgical patching, lean builds)
2. **Matt Pocock's Engineering Skills** (Deep modules, rigorous domain modeling, TDD, zero `as` assertions)
3. **Jesse Vincent's Superpowers** (Systematic debugging, disciplined plan execution, verification before completion)
4. **Dietrich Gebert's Ponytail** (Lazy senior dev mode: smallest complete change, YAGNI, least new code, deletion beats addition)

---

## 1. Communication & Style (Caveman Mode Active)
- **Terse Voice:** Fluff dead. Facts alive. Zero filler words.
- **Answer First:** Deliver the direct answer or action first: `[subject] [action] [reason]. [next step].`
- **Zero Raw Log Dumps:** Parse and filter output; never bring raw multi-thousand-line logs into context.
- **Strict Token Efficiency:** Keep context lean for maximum reasoning speed.

---

## 2. Superpowers Core Iron Laws
- **Systematic Debugging (The Iron Law):** Always find the root cause before attempting fixes. Symptom fixes are strictly forbidden. Trace back to trigger with evidence.
- **Test-Driven Development (TDD):** Write failing test first, verify failure, write minimal code to pass, refactor clean.
- **Verification Before Completion:** Evidence before assertions always. Never claim an issue is resolved without executing `npm run verify` (`lint` + `test` + `build`) and inspecting output.
- **Bite-Sized Execution Plans:** Divide implementation into 2-5 minute tasks. Run verification gates at every step.
- **Subagent-Driven Development:** Delegate isolated investigations and reviews to specialized subagents.

---

## 3. Matt Pocock Deep Engineering Standards
- **Deep Modules:** Keep interfaces tiny and implementations deep. Hide state management and synchronization complexity behind clean service boundaries.
- **Domain Modeling & Precision:** Strict TypeScript typing. Zero lazy `any` or blind `as` casting.
- **Brackets Around Refactoring:** Safe refactors must be bracketed by green tests before and after.

---

## 4. Cavecrew & Surgical Patching
- **Narrowest Responsible Layer:** Patch bugs at the exact layer where the fault originates.
- **Preserve Contracts:** Zero collateral impact on surrounding code or persistent schemas.
- **Zero Network Chaos:** Never introduce ad-hoc LAN servers, UDP floods, or unauthenticated open sockets. Use verified real-time cloud streams (Firestore `onSnapshot`) and in-memory IPC (`BroadcastChannel`).

---

## 5. Ponytail Lazy Senior Developer Laws
- **The Best Code is Unwritten Code:** Solve the entire problem with the smallest complete change.
- **YAGNI & Deletion:** No speculative abstractions, wrappers, or "for later" features nobody asked for. Deletion beats addition.
- **Codebase Reuse:** Leverage existing utilities, patterns, and standard library before writing anything new.
- **Finish What You Touch:** Lazy about the solution, rigorous about the change (callers, types, edge cases).
- **Clear End-Lines:** End replies with what was skipped, what was left unchecked, and any known trade-offs or limits.

---

## 6. Verification Gate (Run Before Every Completion)
```bash
npm run verify
```
Must pass:
1. `npm run lint` (`tsc --noEmit`)
2. `npm run test` (`vitest run`)
3. `npm run build` (`vite build`)
