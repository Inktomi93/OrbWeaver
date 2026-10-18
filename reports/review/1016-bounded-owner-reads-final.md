# 1016 bounded owner reads: final lane report

Outcome: the D328 candidate `d0d0bd8135` is integrated with main `1c5fb4ab55`. One waiver-budget defect in the candidate is fixed red-first. One missing borrowed-reader control is added red-first. The mixed shape/schema case passes under an owner-ruled completion allowance. Source and resource admission are settled for the corrected-policy qualification run. That run is not started.

## Integration

- Branch `wt/agent-a5b507cf43168bf04`: reset to `d0d0bd8135`, then merge commit `93b5154cd1` of `1c5fb4ab55`.
- No path conflicts. Main changed 58 paths and the candidate 30; the intersection is empty.
- Main's change to `tests/tooling/floor/compiler/native-inventory-fixture.ts` adds `writeNativeInventoryFixtureFile` and `initializeNativeInventoryFixture` only. `nativeInventoryFixture` is unchanged.
- Merge hook: `lint:biome` passed. `types:native` failed on root `tsconfig.json` only: 39 diagnostics in `scripts/probes/**` and `tests/legacy/**/_support.ts`. The same 39 `file:line:col:code` diagnostics reproduce with `tsc -p tsconfig.json` on an extraction of main `1c5fb4ab55`. The merge commit bypassed the check hook for that inherited red only.

## Item 1: mixed shape/schema timeout

Case: `existing shape demand and native schema consumers publish the final catalog partition in one generation` (`tests/tooling/floor/code-facts/native-drizzle-identities.test.ts`).

The timeout was inherited and the candidate does not cause it.

| Tree | Result |
| - | - |
| Merged tree (candidate plus main) | 69.3 s, timeout at 60 s |
| Merged tree with the three `floor/code-facts` files at main's bytes | 82.0 s, timeout at 60 s |

The control's import closure reaches no other candidate file: ast-grep found 289 `tooling/src/floor` files and 1,795 imports, with 0 imports of `verify/` or the structure contract. A literal rg search also returned 0. Load was 10.85 on 24 cores, so the budget factor was 1.

Attribution: a scratch driver ran the exact case body with `--cpu-prof` in every process. The fixture took 74.5 to 89.8 s; the reader took 25 to 34 ms.

| Cost | Time | Source |
| - | - | - |
| 8 native partition workers | 51.5 s | `demandShapePartitions` to `buildPartition` to `runInventoryPartitionWorker` |
| 67 cold implementation-replay processes | 26.5 s | `partitionImplementationsCurrent` to `inventoryRuntimesCurrent` to `replayInventoryRuntime` |
| Reader, including the candidate's pinned schema reuse | 25 to 34 ms | `drizzleEvidence`, `shapePair` |

Worker sequence: membership for db, server and root `tsconfig.json`; facts for db and server; pairs for db, server and root.

Owner ruling: let the case run to completion under a completion allowance. The case now uses `scaledBudget(LONG_TEST_TIMEOUT_BASE_MS * 5)` from `@orb/tooling/floor/testing/test-tags`, a 150 s quiet-box base. A one-line reason cites D308 and the measured 69 to 102 s. Assertions, population, checks and shared publication code are unchanged. The case stays in its file because every case there shares one `setup` over the same native child fixture. Moving one case would split that setup into a second home.

Evidence: the full file passed 16 of 16 (report `reports/runs/test/agent-a5b507cf43168bf04-3495040-2026-10-18T18-22-38-807Z/test-report.json`). The mixed case took 101.8 s there. That run's exit 1 came from the working-tree guard naming my two waiver-ratchet files, which I edited during the run. A clean rerun of the mixed case alone passed in 60.4 s with exit 0 (`reports/runs/test/agent-a5b507cf43168bf04-3563327-2026-10-18T18-32-19-955Z/test-report.json`).

### Board item proposal: remove the redundant consumer facts worker in shape demand

- What: in `demandShapePartitions` (`tooling/src/floor/code-facts/semantic-inventory.ts`), build only the catalog owners' facts before `plan.prepare`. Fold every other descriptor's base families into its pair-stage acquisition.
- Why: the server facts worker (`shape-4`, 11.6 s, about 13 s with its implementation checks) is always superseded by the server pairs worker (`shape-6`) after the catalog rebuilds with pairs. The final partitions and their atomic publication stay the same.
- Remaining cost: 67 cold implementation replays (26.5 s). Each one is a deliberate uncached currentness check (`semantic-inventory-runtime-current.ts`), so D328 keeps them.
- Expected result: the case lands at roughly 56 to 77 s. It still won't reliably fit 60 s, because the replay checks and seven necessary workers remain.
- Done: the mixed case requests seven workers with an unchanged final generation and pair coverage, and the existing atomic-publication controls pass.

## Item 2: lease and currentness controls

Selected existing controls, through `pnpm test:scoped`: 13 of 13 passed (`reports/runs/test/agent-a5b507cf43168bf04-3440729-2026-10-18T18-15-12-904Z/test-report.json`).

- `semantic-inventory.test.ts`: pinned invocation metadata and mutable caller plans; corrupt unread query rejection; owned snapshot retention across fresh publication and external corruption; normal and exceptional corpus release.
- `native-invocation-delivery.test.ts`: historical lease pin; owned closure reuse with fresh borrowed metadata; raw bindings validated once; borrowed savepoint, unfinished write and DDL freshness; overlay lease closed before storage removal.
- `semantic-inventory-implementation-inputs.test.ts`: parent-only executable drift; replay-only source drift; historical shape handoff refusal for another generation; fixed-plan pair coverage and disposal.

New red-first control: `borrowed reader rereads both schema catalogs after a warm column read`. No existing control proved this boundary. The existing borrowed corruption case corrupts only before the first successful read, so it would pass even if borrowed readers cached.

- Planted defect 1: cache identity and full catalogs for borrowed readers. The control failed: the corrupted read did not throw.
- Planted defect 2: cache only the full catalog. The control failed at the full-catalog cut (line 230), proving the second cut discriminates on its own.
- Restored source: the control passes in the 16 of 16 run.

Native owner delivery: `native-owner-schema-delivery.int.test.ts` 2 of 2 and `native-tenancy-pin-delivery.int.test.ts` 13 of 13. Report: `reports/runs/test/agent-a5b507cf43168bf04-3575192-2026-10-18T18-33-46-276Z/test-report.json`.

## Item 3: lint

- Biome on the 31 files (the candidate's 30 plus `tests/tooling/verify/lib/waiver-ratchet.test.ts`): exit 0, no errors.
- Direct driver (`readEslintFileAdmissions` then `typedNativeCompilerConfigs`, no cache):
  - HARD: 31 of 31 admitted, untyped profile, empty suppressions, no inline config, exit 0.
  - Ordinary: 31 of 31 admitted. The 9 files in the root plus DOM plus ISO contexts pass. The 22 files in the tooling context report 3 `max-lines` errors.
- The 3 errors are inherited. Main's bytes produce the same 3 errors on the same rule: contract 994, queries 1,120, reader 1,019 lines against 450. The candidate adds 1, 4 and 57 lines. No suppression row exists for these files.
- `pnpm lint:eslint-scoped`: exit 1. It widens to dependency-wide stages before the exact files: 598 untyped, 323 tooling, 436 root, 131 DOM and 31 ISO.
  - The exact-file stage reports only the same 3 inherited `max-lines` errors.
  - The widened stages report 277 errors in 33 unchanged files: 248 `vitest/no-standalone-expect`, 7 `orb/brand-in-name-position`, 4 `orb/test-fixture-imports`, and smaller counts of other rules.
  - Only `tooling/src/verify/ops/policy-conformance.ts` directly imports a candidate-changed module, and its one error is `max-lines` (828 lines, unchanged file).
  - The type-aware `strict-boolean-expressions` errors are in `tooling/src/verify/ops/config-snapshot.ts`, whose nine imports reach no candidate file.
  - Not reproduced on parent bytes: the widened selection derives from the changed set. The evidence for inheritance is the unchanged files plus the import-closure check above.
- Typecheck: `tooling/tsconfig.json` passes. Root `tsconfig.json` keeps exactly main's 39 diagnostics.

## Item 4: waiver liveness

- Ordinary markers: an UNKNOWN defers only the `stale` or `unbound-trivia` judgment of a marker with the same policy, file and token, whose carrier binds the gap's position (`tooling/src/verify/lib/ordinary-waiver.ts`, `reconcile`).
  - It never matches, waives or counts a finding.
  - Only TypeScript carriers defer; resource-text markers keep their verdicts.
  - Existing controls pass: `ordinary-waiver.test.ts` 27 of 27 and `owner-scoped-reads.test.ts` 5 of 5 (UNKNOWN, a concrete violation and an unrelated stale marker together; full member-table tokens).
- Reviewed grants: the candidate passes no gap into grant reconciliation, so grant staleness is unchanged.
- Waiver budget, defect fixed: the candidate marked a policy `unjudged` whenever it had any analysis gap (`tooling/src/verify/lib/waiver-ratchet.ts`). That silenced the growth alarm too.
  - Scenario: `owner-scoped-reads` always has UNKNOWNs under D328. With budget 56, a 57th `@orb-waive owner-scoped-reads(...)` excusing a new naked-ID finding passed with no budget alarm.
  - Fix: a gapped policy stays in `unjudged` for the fall direction, because a deferred stale marker can lower the live count. A count above the budget still raises "fix the new finding".
  - Red-first: `an analysis gap leaves a fall unjudged but still reds a new excuse` failed on the candidate (no alarm, count 2 against budget 1) and passes after the fix. `waiver-ratchet.test.ts` passes 12 of 12.
- Permissions are not carried over. Which of the existing `owner-scoped-reads` markers stay live against the bounded detector, and whether the budget row of 56 matches, is known only from the complete policy artifact. The qualification run must read it.

## Item 5: security self-review

Assumptions:
- The owned query-only read lease owns its connection and transaction, and its selected generation is immutable while the lease is open.
- `StoredInventoryPartition` objects are stable per reader, and `indexes` is cleared only on dispose.
- Borrowed connections are mutable live storage.
- No authentication, credential or crypto code changed.

Findings:

1. Medium, fixed in this lane: waiver-budget growth was silenced by analysis gaps (item 4).
2. Low, open, needs a human decision: Spine §2b overclaims the gate.
   - `docs/law/Spine-Identity-and-Auth.md` §2b says the `owner-scoped-reads` gate enforces the class-pin rules: plain values must be string-id typed, column- and subselect-valued owner terms need a pinned table, and membership tables pin on own id or chat FK.
   - The bounded detector does not enforce them. An owner restriction is any non-column `eq` or `inArray` operand on `table.ownerId` (`tenancy-direct-read.ts`, `columnRestriction`). Subselect, helper and SQL-carrier predicates are UNKNOWN. Non-ownerId tables are not judged.
   - Scenario: `db.select().from(personas).where(and(eq(personas.id, id), eq(personas.ownerId, body.ownerId)))` with `body: any` is supported with no finding. Spine §2b calls that operand untyped and not plain. `predicate` refuses only call and tagged-template operands, so a property access passes. The runtime owner successors and `fetchOwned` remain the authority.
   - Minimal fix: a law edit under D328 that records these lost static guarantees and names the bounded claim.
3. Info, verified safe: the warm full-catalog replay skip. Under an owned lease, `drizzleEvidence` replays the full catalog's nested spans only when it first retains the catalog. Every later call replays the identity catalog, which epoch-checks every roster source against the caller's project. `schemaCatalogColumns` requires `full.sources` to equal `identity.sources` before columns are cached. So every file that holds a full-catalog span is epoch-checked on every call.
4. Info: returned identities are isolated. `structuredClone` covers identity facts and selected column values. The raw-reuse control poisons returned table, identity and projected keys, then confirms later answers are clean.

Needs independent review: the bounded detector's finite claim against the old gate's guarantees (finding 2), the ratchet semantics change (finding 1), and the pinned schema reuse.

## Other inherited red found

`tests/tooling/verify/lib/reviewed-grants.test.ts`, case `the four actual non-row execution identities license only their exact column, never an unclassified row reference`, fails with `declared fact failed: drizzle-schema-data: create: native type fact context is unavailable`. It fails identically with all 21 candidate `tooling/src` files at main's bytes. Not addressed in this lane.

## Qualification readiness

The source is frozen at this lane's commit. Admission:
- Command: one unchanged `pnpm check:structure --check=owner-scoped-reads` on that commit, whole repository, default 16 GiB heap, no timeout or population change.
- Expected peak, from the retired bounded run: controller about 11.0 GiB and native worker about 1.5 GiB, observed separately.
- The decode fix removes the sampled hot path (repeated `readDrizzleGraph` decoding). Wall time is not measured; the earlier bounded run was retired at 1,404 s with no verdict.
- Read the complete artifact: supported, flagged, waived and UNKNOWN counts; the `owner-scoped-reads` budget judgment; tool errors; withheld policies.

## Deferred

Whole-tree checks, the corrected-policy qualification run, independent security review, the Spine §2b law decision, and the three inherited `max-lines` errors.
