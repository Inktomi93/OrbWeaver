## Lane identity

- Lane: `docs-current`
- Semantic scope: nine assigned root/current-operational documents and their claims of current status, queue, test baseline, or runnable operator truth.
- Snapshot commit: `906d7aa125130e1c4691a7097c6725d8d31d113d` (working-tree read). Assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: the assignment has drifted from 4,802 lines / 387,362 bytes to 4,961 lines / 403,614 bytes. No owned tracked path was dirty at observation; rolling receipt governs.
- Assigned files read: 9 / 9 (100%).
- Assigned lines read: 4,961 / 4,961 (100%).
- Assigned bytes read: 403,614 / 403,614 (100%).
- Dirty assigned paths: 0.
- Exclusions: implementation and test ownership remains with their assigned semantic lanes; this lane used narrow structural receipts only to validate documentation claims.

## Read receipt

`read-receipt.tsv` covers every path in `assignment.txt`, with current hashes. Assignment/receipt drift is disclosed above and in `commands.md`.

## Architecture observed

The current-law hierarchy is explicit: the registry prevails over every operational doc (`docs/architecture/core/Core-Laws-and-Precedents.md:58-62`). The workboard calls itself operational state rather than law (`docs/retro-workboard.md:3-17`). The active test-deletion control is the committed baseline consumed by the `monotonic-tests` gate (`scripts/check/gates/monotonic-tests.ts:1-25,41`; `docs/architecture/core/Core-Enforcement-Active-Gates.md:248`).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Test baseline manifest | 2 | 3 | 4 | 3 | 2 | high | `docs/test-baseline/manifest.json:84,1701`; gate `scripts/check/gates/monotonic-tests.ts:1-25,41`; residual test PASS |
| Retro workboard current-state surface | 2 | 1 | 1 | 1 | 1 | high | `docs/retro-workboard.md:3-17,182-228,580,759-769,1017`; current commit/log receipts |
| Context-panel program status | 3 | 3 | 2 | 2 | 2 | medium | `docs/architecture/Context-Panel-Program.md:60,119,127,359-361`; D119 `Core-Path-Registry.md:321`; `pnpm ast ident RpgHud` |
| Client-smalls card-preview record | 4 | 3 | 0 | 0 | 2 | high | `docs/client-smalls-lane.md:5-20`; `packages/kit/src/content/index.ts:42,987,998`; `speaker-label/index.ts:144` |

## Findings

### DOC-CUR-01 — Test baseline is not a current full inventory

- Severity: P2
- Class: law-drift
- Confidence: high — a fresh generator run or a committed reconciliation would settle the exact intended policy, but cannot change the observed mismatch.
- Evidence rung: R4 for the gate behavior; R3 for current files and generator wiring.
- Scope denominator: all 1,657 manifest entries and all 1,652 runner-suffix test files currently on disk.
- Receipts: `docs/test-baseline/manifest.json:84` lists the deleted `filter-characters.test.ts`; the same path is ledgered at `:1701`; the file is absent while its replacement `tests/client/features/character/lib/character-library-lens.test.ts` exists. The direct inventory found 25 further current tests not listed. The generator promises a fresh full list at `scripts/check/gen-test-baseline-manifest.ts:1-40`; `monotonic-tests` instead permits a missing listed file if ledgered (`scripts/check/gates/monotonic-tests.ts:1-25`).
- Established fact: the JSON is valid and deletion protection is live (the residual suite passed), but its `testFiles` array does not equal the current tracked test surface and internally retains an accounted deletion.
- User or system impact: deletion protection still works for existing baseline rows, but the file's claimed role as a current baseline/inventory is false and the 25 omitted tests are outside that floor until regeneration.
- What remains unverified: whether the omissions were deliberately deferred; the generator documentation says new tests need no immediate manifest edit, so this is a freshness/provenance defect rather than proof of a broken suite.
- Suggested next check or fix: run the documented generator in a deliberate test-floor change, review the 25 additions and retained ledger, then commit the regenerated manifest.

### DOC-CUR-02 — The workboard's declared live state is a stale mixed timeline

- Severity: P2
- Class: operability-gap
- Confidence: high.
- Evidence rung: R3.
- Scope denominator: the single document declared the live board, 1,053 lines.
- Receipts: the board requires current-state-only rewriting and receipts for status claims (`docs/retro-workboard.md:3-17`), but its designated LIVE STATE still says main is `e777c47e5`, red, and blocks all dispatches (`:182-228`). The actual observed HEAD is `906d7aa...`; the board itself later says the live state must be rewritten at close-out (`:580`) and contains 08-14 active/dispatched/done material (`:759-769`). Its last commit is 2026-08-14 01:49 -0600.
- Established fact: this is not a single current operational snapshot; it contains an earlier live-state block plus later timeline entries without reconciling the named live-state header.
- User or system impact: a cold operator following the designated top state can incorrectly stop work, reason from a prior red tree, or apply an obsolete fleet restriction.
- What remains unverified: external fleet/process state was not probed; it is unnecessary to establish the commit mismatch and internal current-state contradiction.
- Suggested next check or fix: rewrite the `LIVE STATE` block against current HEAD/status and explicitly retire or fold the superseded operating instructions.

### DOC-CUR-03 — Context-panel program calls the tracker/takeover build-gated despite a built HUD path

- Severity: P3
- Class: law-drift
- Confidence: medium — the structural path proves a mounted component but not every CP-3/CP-4 behavior from the design.
- Evidence rung: R3.
- Scope denominator: the program's CP-3/CP-4 status claims.
- Receipts: the program calls CP-3 “BUILD-GATED” and says no tracker data exists (`docs/architecture/Context-Panel-Program.md:60,119`), and calls CP-4 a blueprint (`:127,359-361`). D119 records the HUD program H0-H4 complete (`docs/architecture/core/Core-Path-Registry.md:321`). Current code exports `RpgHud` at `packages/client/src/features/rpg/components/rpg-hud.tsx:91`, imports it from `rpg-hud-region.tsx:16`, and renders it at `:27` (`pnpm ast ident RpgHud`, scanned 940).
- Established fact: the program does not distinguish shipped HUD/takeover mechanics from still-unbuilt tracker data, so its status is not current enough to route work safely.
- User or system impact: a follow-up may duplicate already-landed HUD work or misclassify a remaining data-plane gap as a full client rebuild.
- What remains unverified: exact CP-3 tracker completeness and its relevant CT coverage; the test-scope AST query did not complete and supports no absence claim.
- Suggested next check or fix: split completed HUD mechanics from open tracker-data work and cite the current components/tests.

## Proven strengths

- The active `monotonic-tests` residual suite passed 5/5 and exercises the missing-manifest, missing-test, and stale-ledger failure arms (R4). `check:docs` also passed, but that static result is not independently credited as a behavioral strength.

## Declared versus completed

| Declared surface | Strongest current evidence | Assessment |
| - | - | - |
| Test baseline protects deletions | R4 gate residual suite; R3 consumer/generator | implemented, but baseline inventory stale |
| Board is current operational truth | R3 contradictory commit/state facts | not currently trustworthy as a snapshot |
| CP-3/CP-4 unbuilt/built-gated | R3 HUD export/import/render and D119 completion | stale or insufficiently partitioned status |
| Speaker preview normalization | R3 declaration/import/call | implementation remains wired; no fresh test claim made |

## Tests and gates

`pnpm check:docs` passed. `pnpm vitest run tests/tooling/monotonic-tests.residual.test.ts` passed 5/5 and proves the missing-manifest, missing-test, and stale-ledger gate arms. It does not test generator freshness, which is the gap in DOC-CUR-01. The source-level AST tool was read through its bare usage surface and used only for positive structural receipts; no negative conclusion relies on the interrupted test-scope command.

## Cross-lane edges

- `verification-harness`: DOC-CUR-01 — decide whether the baseline generator should be run now; its current omission of 25 tests weakens the test-floor provenance but does not disable the current deletion arm.
- `ui-rendering` / `ui-content`: DOC-CUR-03 — reconcile shipped `RpgHud` mechanics with the current status of the CP-3 tracker data/CTs.
- Synthesis: DOC-CUR-02 is a documentation/operability finding, not evidence of the actual fleet state.

## Tool receipts

`commands.md` records all commands, AST denominators, exact test/inventory counts, one non-verdict timeout, and exclusions.

## Lane verdict

All nine assigned current documents were read and receipt-hashed on their current bytes. The baseline's gate is live but the baseline is stale as an inventory. The workboard contains useful current material but its named LIVE STATE is no longer a reliable single snapshot. The context-panel program needs a status split between shipped HUD mechanics and remaining tracker work. No P0/P1 finding was established in this documentation-only lane.
