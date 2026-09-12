---
kind: review
status: active
updated: 2026-09-12
---

# v-additions-wave — fresh-context verification of the 2026-09-12 evening fold (lane `cb-v-additions-wave`)

Subject: the eight commits folded onto `main` at `a7d88287b`, plus the warm fix commit `bba5101db` and the
scope add `5ee1149a9`. Fresh-context Opus verifier in its own worktree. **Every post-fix number below was
measured on `3166664f5`** (main's tip when the lane rebased); every pre-fix number names the sha its bytes
came from. The box was NOT quiet (primary's `pnpm verify --push` plus five lanes); no run of mine exited 2,
was killed or timed out, so none of them is a non-verdict on that account.

## VERDICTS

| row | verdict | receipt I produced |
| - | - | - |
| #2184 `policy-refusal-coverage` | **REFUTED at `575e48d5a`, CONFIRMED at `bba5101db`** | at `575e48d5a`'s bytes the module drew TWO blocking `hard`/`error` findings from its own family (below); at the tip both are ZERO, its 3+4 proof rows run green in the whole conformance pass, and its live class is 62 findings |
| #2185 `policy-fixture-substrate` | **REFUTED at `575e48d5a`, CONFIRMED at `bba5101db`** | the bracket twins `process["cwd"]()` and `import.meta["dirname"]` were ACQUITTED (0 findings) pre-fix with their dotted controls at 1; post-fix all three twins report. The inverted predicate holds in both directions |
| #2186 `ops/**` prefix member | **CONFIRMED** | zero `ops/` import declarations across the gate corpus (1539 top-level `import` lines, 0 matches); the arm's four new rows — the `ops/debt.ts` red, the fail-closed unresolvable red, the `lib/ops/reader.ts` false-positive guard — all execute green in the whole conformance pass |
| the `reports`-literal fix | **CONFIRMED** | `tooling-artifact-path-home` over `tooling/src/verify/ops/*.ts` (49 files): 0 findings; POSITIVE CONTROL with `575e48d5a^`'s `structure-delta.ts` swapped in: 1 finding at `:114:30`, token `"reports"` |
| #2198 `css-length-tokens` | **CONFIRMED** | `verifyGateProofs([gate])` (tmpdir substrate, not the planter): 5 `mustFlag` + 2 `mustPass`, **0 failures**. §4.1 CUT with both guards removed in a scratch sibling module (each anchor asserted to occur exactly once): **1 failure, `mustPass` "expected NO finding but got 4"** — the control is not vacuous. The trimmed fixture still carries `100vh`, `100dvh`, `100dvw`, `0px` ×5 |
| #2196 waiver deletion | **CONFIRMED** | the census holds exactly one row for `biome-rule-liveness.ts` (line 168, markerLine 164), never one at 303/307; the suite's two authority arms PASS (`every site identity is unique…`, `the live policy population is exactly the census's unproven rows, and no waiver is stale or over-broad`). Its third arm is red for an unrelated later commit — see the ledger |
| #2191 `sub-floor-ok` homonym | **CONFIRMED** | all three coordinates live and correct (`turn-tool-calls-disclosure.tsx:93`, `checks-a11y.ts:26` `RULED_SUB_FLOOR`, `…ct.tsx:388`); row width 8 pipes, matching both neighbours |
| #2205 `unbound-trivia` → `stale` | **CONFIRMED** | 20/20 green at the tip. §4.1 CUT (the downgrade pass neutered in a `cp`-backed copy): **1 failed / 19 passed**, and the failure is exactly the regression pin — `expected [ 'matched', 'unbound-trivia' ] to deeply equal [ 'matched', 'stale' ]` — while the anti-collapse arm and all 18 pre-existing pins stay green. Containment re-read at the code: `downgradeUnreachableUnbound` mutates only `outcome`, and its `claimed` set is built from `waiverIds` indexed by finding, the same index `reachable` carries |
| #2127 suppressions pointer | **CONFIRMED** | `diagnostic-legibility` over the 304-module corpus: 0 findings on `suppressions.ts`. CONTROL with the doc pointer cut from `MESSAGE`: **3** findings, at `:169` `message`, `:171` `unreadableMessage`, `:191` `message` — the same three sites the commit names (its line numbers predate its own header edit) |
| #2128 manifest | **CONFIRMED** | 132 `deletions` entries (131 + the new one) and 2660 listed paths, intersection EMPTY (`comm -12`); every named artifact absent on disk; the successor spec exists |
| #2135 `fileSiteList` | **CONFIRMED** | 9/9 green at the tip. CONTROL with `localeCompare` re-introduced: **1 failed / 8 passed**, and the failure is exactly `file sites are named in NUMERIC line order, never in rendered-string order` |
| #2137 legacy SHA | **CONFIRMED** | `d23150315` IS `a33b2e339`'s parent; `02382639e` resolves and is the commit the conversion message names |
| #2139 census correction | **REFUTED (one number)** | measured at `d23150315`: `RATIFIED_RULES` = **46** source rows, not the 45 the correction states (46 distinct keys, 46 `kind:` values, `uniq -d` empty). `RATIFIED_TEST_RULES` = 7 is right, and the live surface is right: 65 `policyId: "suppressions"` grant rows, 46 `operation: "source"`, 19 `operation: "tests"` |
| #2140 doc Ledger line | **CONFIRMED** | all four retired artifacts absent |
| #2199 spelling twins | **CONFIRMED, with one unpinned acquittal (ledger row)** | `gate-contract-origin` 2/2, `policy-descriptor-read` 14/14, `tenancy-scope-family` 7/7, `policy-soundness-family` 13/13. The namespace ACQUITTAL behaves correctly (owner-scoped namespace write, dotted and bracketed: 0 findings; unscoped: 1) — but NO committed row holds it: see the ledger |
| #2200 `gate-ignore-grammar` cleanup | **PARTIAL — read only, one instrument note** | the planter is the orchestrator's, so I did not run it. The derivation is correct by reading and no stray `__g_` path exists in my worktree; the new test's SECOND assertion is a tautology (see the ledger) while its third (`toContain("tooling")`) is the real one |
| #2202 `callableDeclarations` | **CONFIRMED, reclassified** | 2/2 green. Single cut of `getNonNullableType()`: CLEAN. Single cut of the union split: CLEAN. **JOINT cut: RED** (`expected false to be true`) — §4.1 MUTUALLY REDUNDANT, not two independently enforced clauses as the commit message implies |
| #2190-chunks | **CONFIRMED** | nine headers hand-read; every field TRUE (below) |
| #2008 `deferredRosterDrift` | **CONFIRMED** | 28 rows derived, drift EMPTY on the tree; PLANTED CONTROL (a scratch root whose `dangling-refs` row has `PROMOTED` stripped, with the gate module present): reds by name — `fired … \`dangling-refs\` reads as not-yet-ported and tooling/src/verify/gates/dangling-refs.ts is on the tree\` |
| #2211 `execNicedSync` maxBuffer | **PARTIAL — mechanism CONFIRMED, premise NOT REPRODUCIBLE** | the discovery child completes and a planted 4 KiB ceiling REFUSES LOUDLY (`spawnSync nice ENOBUFS`), never truncating — that is the property the fix rests on. But the payload is **441,956 bytes** against node's 1,048,576-byte default, and the call with NO `maxBuffer` SUCCEEDS returning byte-identical output, so the stated defect does not reproduce through that door at this tree size. Missing completion pin is #2212, noted not failed |

## THE TWO REFUTATIONS, measured on both sides

Driven with the family's own real-corpus method (`getWorkspace` over `gates/*.ts` + `tests/tooling/verify/gates/*.ts`,
then `runPolicyPass`), which is what the suite itself does — plus SOLO drives so each count is attributable to
one policy rather than to the join.

- **At `575e48d5a`'s bytes** (both the module and the family test restored to that sha by `cp`-backed probe,
  restored after, `git status` empty): **2 findings on `policy-refusal-coverage.ts`, both `severity=error`** —
  `policy-waiver-spelling` at `:215:3` token `fix`, and `policy-waiver-identity` at `:255:3` token `mustPass`.
- **At the tip:** 0 and 0, both in the family drive and in the solo drives.
- **An intermediate run worth recording**, because it prices the fix: with the OLD module and the NEW family
  test, `policy-waiver-identity` is already satisfied (1 finding, not 2) — the test-side arm alone discharges
  §4.2, and the `fix` spelling is the only half that needs the module.
- **The instrument that hid them:** the suite's real-corpus arm asserted findings for four of its eight members.
  The rebuilt completeness check is real — I falsified it: a scratch COPY of the suite with one member removed
  from `closedAtZero` fails with `AssertionError: expected [ 'policy-waiver-spelling' ] to deeply equal []`
  (1 failed / 12 passed), so a member in neither list cannot ride along. The §4.2 discrimination test passes
  in both of its directions (correct position suppresses with `authorityAlarms` empty; a dead position alarms).

## HAND-READ RECEIPTS

### #2190 — the nine §5b.5 headers (react-origin 5, tenancy-scope 4)

- **FAMILY** — every module imports the reader its header names: `REACT_TYPE_HOMES` (`no-context-provider`),
  `reactExportVisitors` (`no-forward-ref`, `no-use-context`), `createReactExportMatcher`
  (`no-effect-on-shared-selection`, `registry-context-via-mint`) from `lib/react-origin.ts`; the four tenancy
  members read `lib/tenancy-scope.ts` (+ `lib/tenancy-read.ts`).
- **LEGACY SHA** — `7ed48eca8^` = `a4ec5c1b6`: all three react descriptors declare NO `scanRoot` there, exactly
  as claimed. `47fc0ae01^` = `256682e4a`: `scanRoot: (p) => p.includes("packages/client/src/features/")` and
  `scanRoot: (p) => p.startsWith(CLIENT_SRC) && p !== MINT_HOME` with
  `MINT_HOME = "packages/client/src/lib/create-registry-context.tsx"` — both quoted correctly. `b54b2c34e^` =
  `40223a091`, the sha all four tenancy headers name: `p.includes(SERVER_SRC)` with
  `SERVER_SRC = "packages/server/src/"`, and `p.includes(SCHEMA_DIR)` with
  `SCHEMA_DIR = "packages/db/src/schema/"`.
- **POPULATION PORT** — each states a correction with its reason, and the anchoring claims re-derive exactly on
  this tree: `packages/server/src/` **1560 contain / 1560 begin with**; `packages/db/src/schema/` **30 / 30**;
  `packages/client/src/features/` **1006 / 1006**. Declared populations match the code in all nine.

## WHAT I RAN

Measured on `3166664f5`, from the lane worktree, scoped and niced throughout.

1. `pnpm check:policy-conformance` (whole, once): **250 final policies · 2967 proof rows · 7 refusal rows ·
   0 failures · 206 grant rows · 0 invalid · 38.5 s · corpus 304 modules (54 legacy proven by gate-conformance)** —
   the roster's 304 and the fix commit's 250/2967/0, re-derived.
2. `pnpm test:scoped` batch 1 — `policy-soundness-family.repo.int` (13), `enforcement-registry-parity.int` (12),
   `lib/gate-contract-origin` (2), `lib/policy-descriptor-read` (14): **41 passed, 0 failed**.
3. `pnpm test:scoped` batch 2 — `lib/ordinary-waiver` (20), `lib/reviewed-grant-findings` (9),
   `caught-failure-ownership.repo.int` (3), `tenancy-scope-family` (7): **38 passed, 1 failed** — the failure is
   `caught-failure-ownership`'s census-equality arm, attributed below to `5ee1149a9`, not to any commit in scope.
4. Five `runPolicyPass` / `verifyGateProofs` probes over real and virtual corpora (the policy-soundness family;
   `policy-fixture-substrate` in eleven arms; `owner-scoped-writes` in four; `diagnostic-legibility`;
   `tooling-artifact-path-home`), each with its opposite-direction control.
5. Six `cp`-backed cut controls, each restored with `git status --short` verified empty afterwards:
   `ordinary-waiver.ts`, `reviewed-grant-findings.ts`, `tenancy-read.ts` (twice), `gate-contract-origin.ts`
   (three cuts), `suppressions.ts`, `structure-delta.ts`; plus two scratch modules created and removed
   (`cbvaw-prefix-substrate.ts`, `cbvaw-css-cut-1.ts`) and one scratch suite copy
   (`cbvaw-completeness-probe.repo.int.test.ts`). All inside THIS worktree; nothing on the shared tree.
6. `deriveCaughtFailurePopulation` and `deferredRosterDrift` driven directly; the `execNicedSync` discovery door
   driven at three ceilings.

## STRUCTURE LEG

**Slot `agent-a4eb1bde16ee4316a-2968382-2026-09-12T21-14-45-630Z`** (started 21:14:45Z, finished 21:20:52Z;
single-pass 150.8 s + final-pass 209.7 s). Exit 1 — the standing #1584 violations red, not a tool error.

**It is a VERDICT, and its own artifact says so:** `verdict: "verdict"`, `nonVerdictReason: null`,
`complete: true`, **`concurrent: []`**, `ran 304/304` (54 legacy + 250 final). **0 tool error(s) · 0
withheld · 0 scanAlarms · 0 populationAlarms · 0 authority alarms.** Grep for `__g_`/`__dc_` across the
whole artifact: **0 matches** — no planter overlapped it. It completed before the owner lifted primary's
hold, so it did not share the box with the three re-released lanes.

`final policies: 250 ran · raw 1716 = waived 1199 + granted 206 + effective 311 (245 error, 66 warning) ·
total 300 · ok false`.

**The nine touched policies** (`raw · waived · granted · ok`), all three slots agreeing:

| policy | pre-fix `main-1454018` | tier `main-473101` | mine `2968382` |
| - | - | - | - |
| `policy-refusal-coverage` | 62 · 0 · 0 · ok | 62 · 0 · 0 · ok | **62 · 0 · 0 · ok** (all 62 are warnings; `ordinary`/`warning` contributes 0 to `blocking`) |
| `policy-fixture-substrate` | 0 · 0 · 0 · ok | 0 · 0 · 0 · ok | **0 · 0 · 0 · ok** |
| `policy-waiver-identity` | 0 · 0 · 0 · ok | 0 · 0 · 0 · ok | **0 · 0 · 0 · ok** |
| `policy-waiver-spelling` | 0 · 0 · 0 · ok | 0 · 0 · 0 · ok | **0 · 0 · 0 · ok** |
| `policy-legacy-imports` | 5 · 0 · 0 · RED | 5 | **5** (the `contract/gate.ts` migration set, red by design) |
| `policy-binding-resolution` | 23 | 23 | **23** (red by design) |
| `policy-soundness` · `policy-proof-expectations` | 0 · ok | 0 · ok | **0 · ok** |
| `owner-scoped-writes` / `-reads` / `-upserts` | 0 raw · waived 32 / 26 / 0 | same | **same** |
| `css-length-tokens` · `suppressions` · `tooling-artifact-path-home` · `config-anchor-in-registry` · `persist-partialize-and-total-migrate` | ok (granted 65 / 1 / 2) | same | **same** |

**Per-gate delta, tier `main-473101` → mine: ZERO differing gates over all 304.** My worktree is
gate-identical to the tier's whole-tree pass, so this leg independently reproduces that slot rather than
merely agreeing with its summary. Against `main-1454018` exactly **one** gate differs — `tooling-size`
22 → 23 raw (total 299 → 300), which is the interval's own commits, not this wave's.

**No verdict in this report changes.** Two things the leg adds:

- **`policy-refusal-coverage`'s 62 findings are all `warning` and `ok: true`** — the transitional tier is
  behaving exactly as #2184's ruling describes, and the burn-down count is readable off the artifact, which
  is what makes its stated flip condition checkable.
- **Neither `main-1454018` nor `main-473101` is a PRE-fix tree.** `bba5101db` landed 19:59Z and the earlier
  slot started 20:02Z, so BOTH baselines already carry the fix; that is why `policy-waiver-spelling` and
  `-identity` read 0 in all three. My pre-fix numbers come from the module's own bytes at `575e48d5a`, and
  no structure slot exists for that tree.

## LEDGER ROWS (11 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `policy-refusal-coverage` | v-additions-wave `:1` | an ORDINARY policy whose `fix` names no `@orb-waive` spelling — `policy-waiver-spelling` (`hard`/`error`) reports it, so `575e48d5a` landed a BLOCKING finding invisible to its own floor | other (§5b.3) | **CLOSED at `bba5101db`** | driven at both shas over the real corpus: 1 finding at `policy-refusal-coverage.ts:215:3` token `fix` severity `error` pre-fix, 0 post-fix, solo drive and family drive agreeing |
| `policy-refusal-coverage` | v-additions-wave `:2` | no §4.2 positive identity arm anywhere — `policy-waiver-identity` (`hard`/`error`, entire-population) reports it; a second blocking finding from the same commit | §4.2 identity | **CLOSED at `bba5101db`** | 1 finding at `:255:3` token `mustPass` with BOTH files at `575e48d5a`; 0 at the tip. With the old module and the NEW test it is already 0, so the test-side arm is what discharges it |
| `tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` | v-additions-wave `:3` | the real-corpus arm asserted findings for 4 of 8 members, so two live blocking reds sat inside the family at 12/12 green — an arm that measures what changed but not the surface it changed on | other (instrument) | **CLOSED at `bba5101db`** | the rebuilt completeness check FALSIFIED by me: a scratch copy with one member dropped from `closedAtZero` fails `expected [ 'policy-waiver-spelling' ] to deeply equal []` |
| `policy-fixture-substrate` | v-additions-wave `:4` | Shape A twin blindness in a brand-new module: `isCwdCall`/`isImportMetaRoot` keyed on `PropertyAccessExpression`, so `process["cwd"]()` and `import.meta["dirname"]` were acquitted — the same class `a7d88287b` fixed in four modules four hours earlier | instrument / #2199 Shape A | **CLOSED at `bba5101db`** | pre-fix bytes in a scratch sibling: twins 0/0 with dotted controls 1/1; post-fix 1/1/1. The fs-namespace bracket verb (`fs["writeFileSync"]`) was NEVER blind — `resolveModuleMemberOrigin` already covered it |
| `tooling/src/_shared/proc.ts` · `docs/reviews/caught-failure-ownership/population.json` | v-additions-wave `:5` | `5ee1149a9` added 5 lines above two census sites and did not re-derive the ledger, so `ledgers:fresh` (a STATIC `pnpm check` stage) and `caught-failure-ownership.repo.int`'s census arm are RED on main | ledger freshness | **OPEN** | generator driven directly: 598 rows both sides, totals identical, symmetric difference exactly two — `::error::2` committed 234/231 derives 239/236, `::settle::1` committed 382/381 derives 387/386. Suite: 1 failed / 2 passed. Fix is the barrier regen |
| `docs/reviews/gate-runtime/exception-authority-census.md` | v-additions-wave `:6` | the #2139 correction states `RATIFIED_RULES` held **45** source rows at `d23150315`; it held **46** — an off-by-one inside the correction whose point was that the old figure did not survive re-derivation | roster row | **OPEN — acknowledged in the refutation ledger by `56ae6a8cf` ("the landed sentence says 45 — off by one"), the census CELL itself still says 45 at `:172`** | at that sha: 46 distinct top-level keys, 46 `kind: "` values, `sort \| uniq -d` empty. Live surface (46 `source` / 19 `tests`) is correct, so the true story is 46 → 46 and 7 → 19 |
| `owner-scoped-writes` · `owner-scoped-upserts` · `owner-scoped-reads` | v-additions-wave `:7` | `predicatesTableColumn`'s receiver-by-TEXT acquittal — the half `a7d88287b` says "moved with the accusing side" — is enforced by NO committed row | §4.1 narrowing | **OPEN** | cut it back to an Identifier-receiver test: `verifyPolicyProofs` over all three policies reports **0 failures**, while a correctly scoped `eq(schema.characters.ownerId, callerId)` write (dotted AND bracketed) becomes a cross-tenant WRITE-hole accusation. Fix: one `mustPass` with the owner-scoped namespace write |
| `tooling/src/verify/lib/gate-contract-origin.ts#receiverConstituents` | v-additions-wave `:8` | the commit presents the non-nullable receiver and the per-constituent split as two load-bearing halves; against the committed control they are MUTUALLY REDUNDANT | §4.1 classification | **OPEN (informational)** | each single cut leaves `gate-contract-origin.test.ts` 2/2 GREEN; the JOINT cut reds it (`expected false to be true`). Recorded so a later lane does not read a clean single cut as an unenforced fence |
| `tests/tooling/gate-ignore-grammar.repo.int.test.ts` | v-additions-wave `:9` | the new cleanup test's second assertion compares `CLEAN_ROOTS` against a re-evaluation of its own defining expression — it cannot fail | other (instrument) | **OPEN** | read, not run (the planter is the orchestrator's). `expect(CLEAN_ROOTS.toSorted()).toEqual([...new Set(PLANT_DIRS.map(...))].toSorted())` is the tautology; the first (`strayFixtures()` empty) and third (`toContain("tooling")`) assertions are real |
| `docs/test-baseline/manifest.json` · `monotonic-tests` | v-additions-wave `:11` | four baselined specs no longer exist with no `deletions` entry, so `monotonic-tests` is RED at 4 on every structure run — and THREE of them are the tenancy family's own specs, deleted by the very conversion (`b54b2c34e`) whose §5b.5 headers this wave verified | ledger freshness | **OPEN (pre-existing, not this wave)** | my slot, `main-473101` and `main-1454018` all carry `monotonic-tests` raw 4: `tests/tooling/verify/gates/owner-scoped-{reads,upserts,writes}.test.ts` (deleted `b54b2c34e`, 2026-09-11) and `tests/tooling/verify/ops/structure-mixed.int.test.ts` (deleted `cc2d6bfac`). Same class #2128 closed for one file; the fix is the same `deletions` shape |
| `tooling/src/verify/ops/eslint.ts` · `tooling/src/_shared/proc.ts` | v-additions-wave `:10` | `5ee1149a9`'s stated defect — the discovery child dying ENOBUFS at current repo size — does not reproduce through that door in this checkout | premise | **OPEN (see #2212)** | payload **441,956 B** vs the 1,048,576 B default; the un-ceilinged call SUCCEEDS with byte-identical output. The fix's own property does hold: a planted 4 KiB ceiling throws `spawnSync nice ENOBUFS` rather than truncating. The completion pin #2212 should assert the HEADROOM, not only completion |

## WHAT I DID NOT COVER

- **The four planting suites** (`check-gates.repo.int`, `gate-ignore-grammar.repo.int`,
  `gate-conformance.repo.int`, `gate-spelling-twins.int`) — orchestrator-only. So #2200's cleanup fix is verified
  by READING plus a stray census in my worktree, never by the suite; and the `gate-spelling-twins` ledger row for
  `policy-fixture-substrate` is reproduced WITHOUT the planter (the twins' transform re-applied by hand to the
  module's own founding fixtures), not by re-running it.
- **`pnpm lint:eslint` end to end** for #2211 — I drove the discovery door directly and did not run the
  whole-repo tier, so "the tier verdict is obtainable again" is not something I measured.
- **`ledgers:fresh` as a stage** — I ran its two derivations as functions (the caught-failure census and the
  deferred roster) and read `ops/ledgers-fresh.ts`; I did not run the stage.
- **Chunk B's #2127 line numbers as authored** (`:162`/`:164`/`:184`): my control reproduces the three sites at
  `:169`/`:171`/`:191` after the same commit's header edit, so the coordinates differ from the commit message
  while the sites are the same three.
- **The BEHAVIOURAL tier for every commit in the wave** — no product node suite, no CT, no e2e. `pnpm check`
  as a whole (beyond the one structure leg and the one conformance pass) is likewise unrun by me.
- **The structure leg is ONE slot on ONE tree.** It says nothing about a tree with any of my probe edits in
  place (all were restored before it ran) and nothing about `main` after the three lanes the owner
  re-released, which landed no commits before my run finished but may since.
- Anything about the OTHER lanes' work on main tonight beyond the commits named in my brief.
