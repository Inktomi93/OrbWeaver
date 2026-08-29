---
kind: design
status: active
updated: 2026-08-29
---

# Issue 754 — batch-boundary spike: measured rejection of the E6 structural proxy

## Verdict

REJECT the proposed proxy ("multi-write persistence operations expose unexecuted `BatchStmt` builders, and one canonical commit boundary owns `db.batch(batchMany(...))`") as a structural gate. E6 stays review-tier exactly as `issue-712-gate-family.md` ruled — this spike replaces that ruling's judgment call with a measured floor: the best honest detector reaches 1 true positive against 11 false positives (8%) naive, 25% with control-flow disjointness analysis, and its two surviving false-positive classes are live idioms that would each demand an escape-marker vocabulary from birth. Both of the proxy's premises are refuted by the tree's own deliberate design, not by noise alone.

## Census (detector-equivalent, 2026-08-29, tree `6eb6f9c33`)

Structural sweeps via ast-grep over `packages/ tooling/ tests/ scripts/`; scanned counts `ts=4800`, `tsx=1272` (both languages run separately; **zero tsx matches on every pattern** — the whole batch surface is `.ts`). Function-level grouping via a syntax-only ts-morph walk of `packages/server/src` (1438 files): every `AwaitExpression` containing a `.insert(`/`.update(`/`.delete(` chain on a db-like receiver (`db`, `ctx.db`, `deps.db`, `opDb`, `tx`) and not containing `.batch(`, attributed to its nearest enclosing function; `db.batch` commits counted separately; loop ancestry recorded. Optional-chain (`$X?.batch`) and bracket (`$X["batch"]`) shapes: 0 each.

| population | count | receipt |
| - | - | - |
| `$X.batch(...)` commit sites | 141 (89 production across 51 files in 16 domains + entry/compose; 52 tests) | ast-grep `--json` |
| `batchMany(...)` calls | 131 (86 production, 45 tests) | ast-grep `--json` |
| production `.batch(` NOT via `batchMany` | 3 — `automation/persistence/fires.ts:155` (tuple literal), `discovery/verbs/distill.ts:317` (raw `as BatchItem` cast, chunked), `rpg/persistence/portability-write.ts:64` (read-only 6-SELECT snapshot batch) | read in full; all three legitimate (below) |
| `db.transaction` | 3, all tests (`tests/db/client.int.test.ts:67` BEGIN-semantics probe) — batch IS the production atomic primitive | ast-grep |
| raw `db.run(sql...)` in server/src | 1 — `fires.ts:74`, a single-statement conditional INSERT...SELECT (atomic by construction) | ast-grep receiver census |
| `BatchStmt` literal occurrences | 263 / 74 files repo-wide; 216 lines in packages/: 55 imports, 54 builder return-type declarations (23 `: BatchStmt`, 14 `: BatchStmt[]`, 10 `: AwaitableBatchStmt<T>`, 5 `: Promise<BatchStmt[]>`), 52 local `const x: BatchStmt[] =` accumulators, ~31 contract members/param positions, 3 casts, 7 comments | ast-grep per-shape + rg corroboration |
| functions touching writes/batch (server/src) | 296: **202 single-awaited-write** (the dominant, correct idiom), 79 batch-commit-only, 12 multi-write flags, 3 mixed, 0 loop-writes | ts-morph detector |

## The flag population, classified (every row read in full)

Naive rule — a function with ≥2 awaited mutating statements — flags 12. Eleven are false positives in five classes:

| class | n | rows |
| - | - | - |
| switch-arm disjoint (one write per invocation) | 2 | `embeddings/persistence/clear.ts:23` `clearVectorTable`, `:52` `purgeStaleVectors` |
| if/else or early-return disjoint | 6 | `chat/verbs/chat-lifecycle.ts:518` setChatInjection, `persona/verbs/import.ts:20`, `refinery/verbs/run-stage.ts:360` + `:454`, `rpg/persistence/sheets.ts:55` upsertSheet, `world-info/verbs/entries/upsert-entries.ts:45` upsertOne |
| deliberate sequencing across external effects | 1 | `refinery/verbs/iterate.ts:21` — the guidance write MUST land before the model stages read it; the count write MUST follow their success. Batching would be a defect. |
| result-dependent CAS ladder | 1 | `workloads/persistence/queries.ts:262` markCancelling — statement 2 runs only when statement 1 matched 0 rows; unbatchable by design (its header says so) |
| independent sweep + atomic take | 1 | `sessions/persistence/oidc-store.ts:29` consume — expiry GC then take-and-delete; atomicity between them is unwanted |
| **true positive** | **1** | `refinery/verbs/submit-manual-rewrite.ts:92-93` — adjacent `insert(refineryRuns)` + `update(refinerySessions)`, same invocation, no intervening effect, no result dependency, cross-table. Legitimately one `db.batch(batchMany([...]))`. Routed as a fix (refinery lane), NOT added to the review inventory — the `REVIEW_FOCUS` rows are prove-the-interleave candidates; this is a 3-line fix-it. |

The 3 "mixed batch+awaited" flags are also clean: `settings/persistence/theme-queries.ts:76` and `tag/persistence/queries.ts:88` are the deliberate two-commit idempotent restore recipe (an update batch + one multi-row insert that needs its own `.returning` count); `world-info/persistence/import-write.ts:155` is three mutually-exclusive arms, one commit each.

Precision ladder: naive 1/12 (8%). Adding branch-disjointness control-flow analysis kills 8 FPs → 1/4 (25%). Adding a cross-table restriction reaches 1/1 — but n=1, and the two surviving FP classes (deliberate sequencing, independent sweeps) are cross-table-capable live idioms, so that zero is population luck, not detector precision. Per the #712 rejection rationale, each would need an escape marker from birth, teaching agents to mark rather than prove.

## Why the premises fail (not noise — design)

1. **"Builders structurally cannot execute writes" contradicts shipped kit law.** `AwaitableBatchStmt` (`packages/db/src/kit/batch.ts:36-45`) deliberately names a statement that is BOTH batchable and directly awaitable — its JSDoc calls this "the honest type of a drizzle query builder handed to a caller UNEXECUTED yet also runnable standalone" and the PD-24 co-statement seam depends on it. Live proof: `finalizeReservedFireStatement` is awaited standalone (`fires.ts:147`) AND batched (`fires.ts:155`). Making builders non-executable at the type level would break that seam; atomicity cannot become a type property here.
2. **"One canonical commit boundary" does not describe the tree and should not.** 89 production commit sites; at least four named commit helpers with different pre/post semantics (`commitChatBatch` import-write.ts:358, `commitFencedChatWrite` chat-lifecycle.ts:125, `commitStatsFencedChatUpdate` roster.ts:128, `commitForkBatch` fork.ts:486); callers consume per-statement typed results (`commitReservedFire` reads its finalized rows; `writeHubScoreRows` sums `.returning` lengths); `distill.ts:310` chunks commits for the libSQL bound-variable cap; `portability-write.ts:64` batches 6 SELECTs read-only for snapshot consistency (legal — the batch.ts:19-26 law forbids SELECT-*before-write*, not read-only batches). A generic canonical helper would have to be identity-typed over heterogeneous statement tuples — i.e., it would be `db.batch` again.

## Completeness boundaries (what any `BatchStmt`-shaped detector cannot see)

- Raw SQL execution (`db.run(sql...)`) — 1 live site today; a future multi-write spelled raw is invisible.
- Writes behind injected ops (`deps.characters.update`, `ctx.audit`) — cross-domain atomicity, where E6's remaining candidates (stats rebuild, backup) actually live, is structurally out of reach of any single-function syntax walk.
- Handed-in builder factories (`...entryStmts(...)`, `await copyBooks(...)`) are opaque — even a SELECT-before-write ordering check inside batch arguments cannot see through a spread, so that sub-law also stays review-tier.

## What the review tier gets (the measured design)

E6 review guidance inherits the measured true-positive signature: flag two-plus mutating statements only when they (a) execute on the same invocation path (not branch-disjoint), (b) have no intervening external effect, (c) carry no result dependency, and (d) span tables. The five false-positive classes above are the reviewer's "looks wrong, is not" checklist. The `REVIEW_FOCUS` E6 rows (`tooling/src/review-mirror/lib/focus.ts:48-70`) stay as the semantic-candidate inventory, unchanged.

## Rejected alternatives

- **Naive two-write gate** — 8% precision; re-confirms #712's "rejected as noisy proxies" with a number.
- **CFG-hardened gate (branch-disjointness + cross-table)** — 25% honest precision on the measurable rule; the 1/1 cross-table variant's cleanliness is n=1 population luck over marker-hungry live idioms. Substantial detector complexity for a family with one real instance per ~1438 files.
- **Builders-only write discipline** (all writes composed as builders, executed only at commit boundaries) — would force 202 correct single-statement direct executions through ceremony that adds zero atomicity (single statements are atomic already) and would fight the deliberate `AwaitableBatchStmt` dual nature.
- **Generated E6 census as review-mirror evidence** (the E7 pattern) — the detector exists (this spike), but its steady-state output is 11 permanent false positives re-reviewed every milestone; noise under a named inventory subtracts signal.
- **Adding the found true positive to `REVIEW_FOCUS`** — wrong semantics; the inventory is for candidates whose safety needs interleave proof, not for known fixable pairs.

## Spin-off findings (routed via the lane report, out of this lane's fence)

1. `discovery/verbs/distill.ts:310-318` — `BatchItem<"sqlite">` typing + raw `as` cast outside `packages/db/src/kit/batch.ts`, the exact drift `batchMany`'s header says it centralizes ("the ONE sanctioned cast"). Fix: type the chunk `readonly BatchStmt[]`, commit via `batchMany(chunk)`. Also narrows the batch.ts:23-25 sweep claim ("every `batchMany` call site batches writes ONLY") back to covering all batches.
2. `refinery/verbs/submit-manual-rewrite.ts:92-93` — the one true positive; batch the pair.

## Proof receipts

- Digest+speaker op (`embeddings/persistence/queries.ts:305-365`) already satisfies the unexecuted-builders + one-commit model in place: `statements: BatchStmt[]` (:345), single `db.batch(batchMany(statements))` (:361), digest identity via the keyed follow-up read (:362-364). No extraction performed — refactoring toward a gate that will not exist is churn (deviation from the issue's "extract or otherwise model", taken on the "otherwise model" arm with these receipts). Behavior anchored by `tests/server/domain/embeddings/verbs/store.int.test.ts` (`:433` speaker-FK failure rolls back the digest upsert — the failure-injection pin; `:386` replacement semantics), `tests/server/domain/embeddings/persistence/queries.int.test.ts`, and `tests/server/db/db-batch-atomicity.suite.int.test.ts` (the batch-primitive all-or-nothing pin).
- Detector controls: baseline 12 flags on the unmodified tree; a planted decoy (two awaited cross-table writes in one function under `packages/server/src`) raises it to exactly 13 with the decoy named; planted pass controls (a `BatchStmt`-returning builder, a single-statement op, a `db.batch(batchMany(...))` commit) land in PASS/batch-only classes, unflagged; probe removed, baseline restored.
