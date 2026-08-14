# Server boot entry and mirrored tests — lane report

## Lane identity

- Lane: `server-entry-boot`
- Semantic scope: boot migration, orphan lock recovery, owner/credential/default-content/maintenance seed steps, bundled demo transcripts, and 10 paired test files.
- Snapshot commit: assignment snapshot `e777c47e5860a105c114e061dcf98bcab1baa952`; current audited `HEAD` `f1f6e3d1075071c2d8e7552734e19daeadde48ee`.
- Working-tree basis: current working-tree bytes. All owned hashes equal the assignment snapshot; no owned dirty path.
- Assigned files read: 30 / 30 (100%).
- Assigned lines read: 2306 / 2306 (100%).
- Assigned bytes read: 285802 / 285802 (100%).
- Dirty assigned paths: 0. The untracked lane-artifact directory is audit output, not an assigned path.
- Exclusions: composition root `packages/server/src/entry/lifecycle.ts` and all domains are cross-lane dependencies; only their resolution-aware call receipts are used.

## Read receipt

`read-receipt.tsv` covers all 30 paths and reconciles exactly to `assignment.txt`: 2306 text lines and 285802 bytes. Its stored hashes also equal the present working-tree hashes.

## Architecture observed

`entry/boot/index.ts:3-24` is a public barrel for discrete boot steps. The only examined live callers are in the lifecycle composition root: migrations at `packages/server/src/entry/lifecycle.ts:176`, owner provisioning at `:195`, credential seeding at `:267`, demo chats at `:291`, and lock recovery at `:295` (R3; resolution-aware `pnpm ast callers`, recorded in `commands.md`).

The migration step resolves the DB package migration directory, performs baseline policy before mutation, backs up only when mutation follows, verifies referential integrity, and prunes after a change (`packages/server/src/entry/boot/migrate.ts:45-78`). Owner provisioning preserves the single-owner invariant, relocates a trusted moved configured owner handle without stealing a member handle, and seeds a local password only if no hash exists (`packages/server/src/entry/boot/seed-owner.ts:87-145`). The demo-chat path reads shipped JSONL as UTF-8 with a per-file absence tolerance (`packages/server/src/entry/boot/seed-assets/index.ts:43-51`) and calls the shared idempotent seeder only after the default character step (`packages/server/src/entry/boot/seed-demo-chats.ts:1-20`).

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Migration + backup/recovery (2 source, 1 integration test) | 4 | 3 | 4 | 3 | 4 | high | `packages/server/src/entry/boot/migrate.ts:45-78`; `tests/server/entry/boot/migrate.int.test.ts:28-124`; focused integration run (R5) |
| Owner bootstrap + local password (1 source, 1 integration test) | 4 | 3 | 4 | 3 | 4 | high | `packages/server/src/entry/boot/seed-owner.ts:61-145`; `tests/server/entry/boot/seed-owner.int.test.ts:39-315`; focused integration run (R5) |
| Lock reclaim (1 source, 1 integration test) | 3 | 3 | 4 | 2 | 3 | high | `packages/server/src/entry/boot/reclaim-locks.ts:23-32`; `tests/server/entry/boot/reclaim-locks.int.test.ts:22-81`; current integration behavior (R5), no independent enforcement gate in scope |
| Default/persona/content seeds + assets (10 source/data, 6 tests) | 4 | 3 | 4 | 3 | 4 | high | `packages/server/src/entry/boot/seed-default-persona.ts:66-110`; `packages/server/src/entry/boot/seed-demo-chats.ts:1-20`; `tests/server/entry/boot/seed-demo-chats.int.test.ts:44-320`; focused integration run (R5) |
| CAS schedule + preset/theme seeds (3 source, 2 paired tests) | 3 | 2 | 3 | 2 | 3 | medium | `packages/server/src/entry/boot/seed-cas-schedules.ts:30-51`; `packages/server/src/entry/boot/seed-default-preset.ts:9-14`; current unit/integration tests (R4–R5), no independent enforcement gate in scope |

## Findings

No defect finding met the rubric threshold in this owned slice. The only incompleteness is instrument coverage, not a claimed product defect: the broad orphan lens has no retained final receipt, so no liveness-negative conclusion is made.

## Proven strengths

### server-entry-boot-01 — Boot migration protects mutating and regenerated-baseline paths

- Class: proven-strength
- Confidence: high
- Evidence rung: R5
- Scope denominator: `migrate.ts` plus 8 direct integration tests.
- Receipts: `packages/server/src/entry/boot/migrate.ts:45-78`; `tests/server/entry/boot/migrate.int.test.ts:28-124`; focused run, 8/8 passed.
- Established fact: fresh DB migration, no-op idempotency, regenerated-dev reset, pre-change backup, retention pruning, and the launched-db fatal branch are directly asserted on real libSQL.

### server-entry-boot-02 — Owner recovery preserves authority and avoids password clobber

- Class: proven-strength
- Confidence: high
- Evidence rung: R5
- Scope denominator: `seed-owner.ts` plus 11 direct integration tests.
- Receipts: `packages/server/src/entry/boot/seed-owner.ts:61-145`; `tests/server/entry/boot/seed-owner.int.test.ts:85-315`; focused run, 11/11 passed.
- Established fact: owner re-enable, OIDC return-to-boot, trusted-key move, occupied-key refusal, local initial authentication, and rotated-password preservation are asserted against real services/database paths.

### server-entry-boot-03 — Shipped demo pack installs from bytes without model access and remains playable

- Class: proven-strength
- Confidence: high
- Evidence rung: R5
- Scope denominator: six JSONL inputs, reader/step code, and 9 integration-serial tests.
- Receipts: `packages/server/src/entry/boot/seed-assets/index.ts:43-51`; `packages/server/src/entry/boot/seed-demo-chats.ts:1-20`; `tests/server/entry/boot/seed-demo-chats.int.test.ts:44-320`; focused run, 9/9 passed.
- Established fact: the test executes the composed seeding graph with no model calls, validates every example, identity rebinding, narrator/blank-anchor behavior, RPG panels, and unlocked continuation state.

## Declared versus completed

| Declared surface | Strongest evidence |
| - | - |
| Migration / baseline policy | R5: real integration checks including destructive and launched guard branches (`migrate.int.test.ts:28-124`). |
| Boot lock reclaim | R5: real DB workload and chat-lock assertions (`reclaim-locks.int.test.ts:22-81`). |
| Owner / local-password bootstrap | R5: real sessions+DB behavior (`seed-owner.int.test.ts:129-315`). |
| Character/persona/asset/demo seeds | R5: paired direct/integration tests, including the real fixture path (`seed-default-persona.int.test.ts:92-222`, `seed-avatars.suite.int.test.ts:128-190`, `seed-demo-chats.int.test.ts:44-320`). |
| CAS schedule/preset seeds | R5 for their paired focused tests (`seed-cas-schedules.test.ts:72-109`, `seed-default-preset.int.test.ts:13-40`). |
| Theme wrapper | R3: it is a single awaited domain call (`seed-themes.ts:9-12`) and is lifecycle composition-adjacent only outside this lane; no direct paired assertion exists in scope. |

## Tests and gates

The fresh scoped behavioral run passed all 55 tests in 10 files: 6 integration files, 3 unit files, and one integration-serial demo-pack file; the runner reported no Type Errors. Assertion quality is substantive: destructive migration recovery, lock ownership separation, actual asset magic-byte storage, identity rebinding, fixture serde, and persisted password behavior are exercised. No current integration/CT/e2e receipt for the entire lifecycle was run because its composition root is outside this lane; the caller receipts prove only R3 wiring.

## Cross-lane edges

- `packages/server/src/entry/lifecycle.ts:176,195,267,291,295` is the composition-root owner’s responsibility. It is the live caller for the four sampled boot functions and migration; integration behavior across their order belongs there.
- The single-call theme wrapper (`seed-themes.ts:9-12`) needs any broader lifecycle coverage assessed by the composition/domain owner; this lane makes no defect conclusion from its lack of a direct paired test.

## Tool receipts

Completed resolution-aware AST caller lenses each found one lifecycle caller. The attempted broad orphan lens has no final captured stdout, hence no structural-negative claim or scan denominator. `commands.md` retains exact commands, completion/failure status, and the fresh behavioral log summary.

## Lane verdict

All 30 assigned files were read and hash-reconciled to the snapshot values. The paired focused suite is green: 55/55 tests across all 10 assigned test files. Migration safety, owner recovery/password preservation, lock reclaim, and byte-only demo-pack installation have R5 evidence. Lifecycle composition is R3 only in this lane, via caller resolution. No defect finding is supported by the present evidence. The largest remaining uncertainty is whole-lifecycle ordering and broad export liveness, both outside the owned source surface; the orphan lens produced no retained result.
