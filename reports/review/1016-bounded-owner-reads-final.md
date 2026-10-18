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
- Waiver budget, defect fixed: the candidate stopped judging a policy's budget whenever it had any analysis gap. `owner-scoped-reads` always has UNKNOWNs under D328, so its budget went unjudged and the growth alarm went silent.
  - Ruled rule: a marker whose liveness a gap defers excuses nothing, yet it keeps its budget slot. A walked policy is judged as excused findings plus deferred markers against its budget, in both directions.
  - Mechanism: `reconcile` returns `{ alarms, deferred }`; `deferred` counts each completed policy's deferred markers (`tooling/src/verify/lib/ordinary-waiver.ts`). `waiverRatchet` adds them to the excused count (`tooling/src/verify/lib/waiver-ratchet.ts`). The alarm message names the deferred markers it counted.
  - Effect: a new marker on an UNKNOWN anchor, or a file waiver that excuses more findings, raises the alarm. So does an unrecorded fall.
  - Report label: a gapped policy is now judged, so the "walked only part of it or did not complete" line again describes every unjudged policy.
  - Red-first: `an analysis gap keeps the budget judged: a deferred marker holds a slot, and a rise or a fall each red` fails on the previous commit (the gapped policy is `unjudged`) and passes now. `waiver-ratchet.test.ts` 12 of 12; `ordinary-waiver.test.ts` 27 of 27.
- Permissions are not carried over. The qualification run must show `owner-scoped-reads` judged at excused plus deferred equal to its row of 56.

## Item 5: security self-review

Assumptions:
- The owned query-only read lease owns its connection and transaction, and its selected generation is immutable while the lease is open.
- `StoredInventoryPartition` objects are stable per reader, and `indexes` is cleared only on dispose.
- Borrowed connections are mutable live storage.
- No authentication, credential or crypto code changed.

Findings:

1. Medium, fixed: waiver-budget growth was silenced by analysis gaps (item 4).
2. Medium, fixed: owner terms failed open. Any operand that was neither a call nor an imported column counted as an owner restriction, so a const column alias, a column ternary branch and a hoisted subselect all read as scoped.
   - Fix (`tooling/src/verify/lib/tenancy-direct-read.ts`, `bindingValue`): a binding is judged by its declaring syntax, with no Type reads. A destructuring pattern resolves to the parameter or variable that declares it.
     - A parameter, or a name destructured from a parameter, is a plain value.
     - A const binding, or the iterable of a `for…of`, is judged by its source:
       - A literal is plain.
       - `await` and non-Drizzle call results are data.
       - A Drizzle alias call, an imported table or column, or a member of one is column-valued.
       - A query-builder chain, or an object, array, conditional or other construction, makes the predicate unknown.
     - A name bound straight from a call or `await` is unknown; a destructured or member-read holder of that result is data.
     - A local root counts as data only as a parameter or a const holder of fetched data. No further hop is followed.
   - A conditional operand is split per branch, and every branch owes the restriction.
   - A table whose only owner term is column-valued is UNKNOWN, never clean. A plain owner term beside it still scopes the read.
   - Controls in `tests/tooling/verify/gates/owner-scoped-reads.test.ts`: const-column alias, column ternary, main's P01 (hoisted subselect) and P02 (const seat column in a join), and a direct column-valued owner. Each asserts its exact token, reason and `supported` count. All failed before the fix and pass after.
   - P02 shifts from UNJOINED (main's finding) to UNKNOWN. It is still never clean, and its control turns red if a change makes it clean.
   - Second review round (Low): five `owner_id = owner_id` shapes read as clean because any destructured binding counted as plain and object, array and conditional holders fell through to data. The shapes:
     - `const {ownerId: own} = personas`
     - `const [t] = [personas]`
     - `for (const {ownerId: own} of [personas])`
     - `const t = {ownerId: personas.ownerId}`
     - `const t = flag ? personas : personas`
   - Each now asserts its exact token and UNKNOWN reason. All five failed on `e46d7478cd` (each read as a clean supported read).
   - A positive control keeps parameter destructuring, data destructured from a parameter and a fetched row's member supported.
   - Stated limit under D328 (ruled): a parameter typed as a column, such as `own: typeof personas.ownerId`, is a plain value, because the gate does not check an owner term's type.
   - Final review round (Low): `callValue` treated every `await` and every non-Drizzle, non-builder call as data, so wrapping a table laundered its columns. Seven shapes read as clean:
     - `const t = await personas`
     - `const {ownerId: own} = await personas`
     - `const [t] = await Promise.all([personas])`
     - `const t = pick(personas)`
     - `const {ownerId: own} = pick(personas)`
     - `const t = [personas].at(0)!`
     - `for (const t of pick([personas]))`
   - Fix: `carriesSchema` checks the awaited operand and every call receiver and argument. It finds an import-bound table or column, a member chain rooted in one, or an array literal holding one. Any hit makes the result unknown. An awaited query-builder chain yields rows, so it stays data.
   - All seven controls assert token and UNKNOWN, and all failed on `3e5d4f0aaa`. The parameter and fetched-row positive controls stay green.
   - Law (ruled): Spine §2b now also says the gate treats a value bound from a call or an `await` as data and does not inspect what the call returns. That covers a call that gets the table from elsewhere, the same class as the typed-parameter limit.
3. Medium, fixed: 12 false positives on main's product code.
   - 11 are post-fetch owner compares main accepted. `directOwnerRead` now calls the existing `hasPostFetchFilter` (one function body) before reporting a naked read.
   - Control: a rejecting compare scopes the read, and a logging-only compare stays a finding. It failed before the fix.
   - The forbidden-capture controls still prove that no callable capture runs.
   - The 12th, `packages/server/src/domain/search/persistence/source.ts:121`, has a column-valued owner term (`chatParticipants.userId`), so it is now UNKNOWN.
   - Ruled: no waiver, and the budget row stays 56, because `tooling/src/verify/lib/waiver-budget.ts` forbids raising a row to admit a finding.
4. Low, fixed in law: Spine §2b overclaimed the gate. `docs/law/Spine-Identity-and-Auth.md` §2b now states the bounded claim (D328), the UNKNOWN forms, the unchecked owner-term type, and that the cross-tenant sweep and verb gates hold the class pin rules. The stale "one hop deep ... needs a waiver that names the chain" sentence is deleted because it described pin enforcement the gate no longer does. Stated limit: an `any`-typed data member such as `body.ownerId` is a plain value.
3. Info, verified safe: the warm full-catalog replay skip. Under an owned lease, `drizzleEvidence` replays the full catalog's nested spans only when it first retains the catalog. Every later call replays the identity catalog, which epoch-checks every roster source against the caller's project. `schemaCatalogColumns` requires `full.sources` to equal `identity.sources` before columns are cached. So every file that holds a full-catalog span is epoch-checked on every call.
4. Info: returned identities are isolated. `structuredClone` covers identity facts and selected column values. The raw-reuse control poisons returned table, identity and projected keys, then confirms later answers are clean.

Also from review:
- The weak delivery assertions in `tests/tooling/verify/ops/native-tenancy-pin-delivery.int.test.ts` now assert the exact `supported` count and each anchor's line, token and reason. The `unsafe` read's own verdict ("table is not a directly imported schema binding") is now asserted separately from the raw-SQL UNKNOWN on the same line.
- `StructureAnalysisCoverage.supported` keeps its artifact name. Its TSDoc and both CLI views now read "judged (finding or out of scope)", through one formatter, `analysisCoverageText` in `tooling/src/verify/lib/show-policy.ts`.
- `tooling/src/verify/lib/tenancy-pin.ts` and `native-tenancy-pin.ts` are imported only by `native-tenancy-pin-delivery.int.test.ts`, which uses them as negative frame guards. Flagged for deletion with that test rework: the bounded owner reader does not consume them under D328.
- The EveryOwner authority checks moved to `tooling/src/verify/lib/tenancy-every-owner.ts` unchanged. The read-chain shape helpers (`imported`, `callsAround`, `predicateColumns`, `statementGap`, `filterArguments`) moved unchanged to `tooling/src/verify/lib/tenancy-read-chain.ts`. Both moves keep the owner-read files under the size cap.

Needs independent review: the one-hop owner-value classification (finding 2), the post-fetch arm (finding 3), the ratchet rule (finding 1) and the pinned schema reuse.

## Other inherited red found

`tests/tooling/verify/lib/reviewed-grants.test.ts`, case `the four actual non-row execution identities license only their exact column, never an unclassified row reference`, fails with `declared fact failed: drizzle-schema-data: create: native type fact context is unavailable`. It fails identically with all 21 candidate `tooling/src` files at main's bytes. Not addressed in this lane.

## Qualification readiness

The source is frozen at this lane's commit. Admission:
- Command: one unchanged `pnpm check:structure --check=owner-scoped-reads` on that commit, whole repository, default 16 GiB heap, no timeout or population change.
- Expected peak, from the retired bounded run: controller about 11.0 GiB and native worker about 1.5 GiB, observed separately.
- The decode fix removes the sampled hot path (repeated `readDrizzleGraph` decoding). Wall time is not measured; the earlier bounded run was retired at 1,404 s with no verdict.
- Read the complete artifact: supported, flagged, waived and UNKNOWN counts; the `owner-scoped-reads` budget judgment; tool errors; withheld policies.
- Measured on the reviewed commit `34eba3079a`: 1:59 wall, 5.66 GB peak, 39 raw findings (27 waived, 12 effective), 1,182 UNKNOWN, budget not judged.
- The review round fixes those 12 effective findings (11 post-fetch, 1 column-valued UNKNOWN) and the unjudged budget. The rerun needs the same command on the new commit.

## Review-round floor

Final review round:
- Red-first: the seven laundering controls fail on `3e5d4f0aaa` and pass now. The five-shape binding test is split in two so each test stays inside the default timeout on a loaded box.
- Gate family floor:
  - In the four-file batch, both native owner delivery integrations passed 15 of 15 and 38 of 40 cases passed. The two proof-row conformance cases timed out at their 14 s budget while load was 17 to 18 on 24 cores.
  - Rerun alone, both passed in 7.7 and 8.0 s, so the batch timeouts were contention.
  - A clean full rerun of `owner-scoped-reads.test.ts` and `tenancy-scope-family.suite.test.ts` passed 25 of 25 (`reports/runs/test/agent-a5b507cf43168bf04-72337-2026-10-18T20-29-30-177Z/test-report.json`).
- Biome and direct HARD and ordinary ESLint are clean on the changed files. `tenancy-direct-read.ts` is 405 lines.
- Typecheck: tooling passes. Root keeps exactly main's 39 diagnostics.
- `pnpm check:docs` passes. `pnpm check:agents` shows only the three gitignored `design.md` report links a worktree lacks.

Second review round:
- Red-first: the five binding-shape controls fail on `e46d7478cd` and pass now.
- Gate family, gate tests and both native owner delivery integrations: 37 of 37 (`reports/runs/test/agent-a5b507cf43168bf04-4109251-2026-10-18T20-06-58-730Z/test-report.json`).
- Biome, plus direct HARD and ordinary ESLint, are clean on the three changed files. `tenancy-direct-read.ts` is 378 lines and `tenancy-read-chain.ts` 93.
- Typecheck: tooling passes. Root keeps exactly main's 39 diagnostics.

First review round:

- Red-first: 5 new owner-read controls fail on `34eba3079a` and pass now. The new ratchet control fails on `34eba3079a` and passes now.
- `pnpm test:scoped` across the owner gate, gate family, waiver, authority and render tests, plus both native owner delivery integrations: 89 of 89 (`reports/runs/test/agent-a5b507cf43168bf04-3983968-2026-10-18T19-44-37-423Z/test-report.json`).
- Biome on the 15 changed TypeScript files: no errors. Direct HARD and ordinary ESLint: 15 of 15 admitted, both exit 0. `gate-authority.ts` stays at 450 lines and `ordinary-waiver.ts` at 446, both within the cap.
- Typecheck: `tooling/tsconfig.json` passes. Root keeps exactly main's 39 diagnostics.
- `pnpm check:docs` passes. `pnpm check:agents` reports only three `docs/plans/test-foundation/design.md` links to gitignored `reports/review` files that exist in main's checkout but not in a worktree.

## Deferred

Whole-tree checks, the corrected-policy rerun (expected: 0 effective product findings, `owner-scoped-reads` budget judged at 56), independent re-review, the `tenancy-pin` deletion, and the three inherited `max-lines` errors.
