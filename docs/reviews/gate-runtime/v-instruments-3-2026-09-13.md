---
kind: review
status: active
updated: 2026-09-13
---

# cb-v-instruments-3 — the six instrument-debt rows of `cb-x-instruments-batch`, re-derived per row

Every number below is a run from THIS worktree at the base sha. Nothing is quoted from the lane's report
except where it is named as the claim under test. Logs live in the session scratchpad
(`cb-v-instruments-3-*.log`).

## 1. Base

`e417baa5bb562de23d4a33e0b52cc05391c6847f` — worktree
`/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-ac90b2611ab775180`, clean at
start and at finish. Commits under test: `a5f33a0e1` (#2226 #2218 #2192), `68e2851d2` (#2228),
`1d97b71df` (#2194 #2193).

Box during every run: `loadavg1 10.2 · cpuCount 16 · throttle 5346/462343`. Measured budget factor at that
reading: **1.0116** (`budget(1000)=1012 · budget(5000)=5059 · budget(10000)=10117 · budget(15000)=15176`,
`cb-v-instruments-3-budget.mjs` against `tooling/src/_shared/load-budget.ts`). That single number decides
two of the six verdicts, so it is stated first.

## 2. Verdicts

### #2226 — the corpus CT's four inert pipelines — **CONFIRMED**

- `pnpm test:ct tests/client/features/discovery/components/corpus-search-results.ct.tsx` → **EXIT 0**,
  `CT SUMMARY — PASS · 19 passed · 0 failed · 0 flaky · 0 skipped`, no `UNFED-READ RATCHET` block
  (`cb-v-instruments-3-ct-green.log`). Silence IS the clean verdict here, not a missing arm:
  `ops/ct-flaky-reporter.ts:259-264` judges the ratchet on every run with a suite and prints only when
  `violations.length > 0 || refusals.length > 0` ("a silent ratchet on a clean run is the point").
- **My control (I planted it, one feed removed, not the lane's):** `cp` the CT file, deleted the single
  line `"discovery.topKeywords": [],` from `CORPUS_AMBIENT_ROUTES`, re-ran, `mv` back. → **EXIT 1**,
  `UNFED-READ RATCHET — 1 violation(s) · 0 refusal(s)` naming `discovery.topKeywords`, and
  `CT SUMMARY — FAILED · 18 passed · 1 failed`, the ONE failure being
  `corpus-search-results.ct.tsx:641 … #2226 the ambient fixture FEEDS every pipeline the mounted section
  requests` (`cb-v-instruments-3-ct-cut.log`). So the in-file pin, not just the whole-tree ratchet, is what
  catches a dropped feed at lane scope — which is the claim.
- **No waiver, no baseline widening:** `tooling/src/verify/ops/ct-unfed-reads.baseline.json` is `{}` — the
  whole file, zero rows. The fix is a real feed.
- **Does the pin stand still?** The barrier is sound by construction, and I read the mount rather than
  trusting the report: the four `useQuery` calls (`workloads.list`, `discovery.topKeywords`,
  `discovery.unusedCharacters`, `discovery.modelRouting`) are made in
  `packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx:153-167`, ABOVE the
  `if (state.phase === "empty") return <EmptyState … title="Nothing in your library yet" />` at `:194-208`
  — the SAME component. The barrier text can only be in the DOM after the render that ran those hooks. One
  honest limit, recorded as an observation and not charged as a defect: `expect.poll(() =>
  trpc.unstubbed()).toEqual([])` adds no settle time, because `unstubbed()` only ever GROWS — the poll
  passes on its first tick or never. All robustness therefore rests on the barrier; the residual window is
  "commit painted, passive effects not yet flushed", and my planted control reddened deterministically
  through it.

### #2218 — the four census arms' "missing" load scaling — **REFUTED**

The change is a semantic no-op, and the file now asserts in a comment the very premise the row's own author
retracted.

- **Positive control, planted by me** (`cb-v-instruments-3-cfg.mjs`, run with `ORB_BOX_LOAD="48/16"` so the
  factor is 3): the RESOLVED root config prints `testTimeout: 15000` (= `budget(5000) × 3`) and the
  `tooling` project prints `extends: true · own testTimeout: undefined`. The four arms therefore ALREADY
  inherited a load-scaled 5 s budget; `scaledBudget(5000)` is `budget(5000, readBoxLoad, FACTOR_CAP)`
  (`tests/tooling/_load-budget.ts:scaledBudget`) and the config default is `budget(5000)` with those exact
  defaults (`tooling/src/_shared/load-budget.ts:379`). Same formula, same reader, same cap — the only
  difference is WHEN it is sampled (parent at config load vs worker at collection).
- **And the empirical half says the same, harder.** Under real contention (three files in one
  `pnpm test:scoped`, `cb-v-instruments-3-node1.log`) the four census arms passed easily — 2298 ms / 16 ms /
  23 ms / 360 ms against a 5059 ms budget — and the file went RED on the FIFTH test, the one that already
  carried `scaledBudget(15_000)`: `Test timed out in 15174ms`. Solo re-run: EXIT 0, census 1281 ms, fifth
  test 8745 ms (`cb-v-instruments-3-eslint-solo.log`). So the in-tree claim at
  `tests/tooling/eslint-tests-coverage.int.test.ts:32` — *"these four were the reason the file could red on
  load alone"* — is false on this box's own evidence.
- **The row's one live item was not done.** The retraction kept exactly one thing: the inline *"the whole
  census (~2700 files) resolves in ~1s regardless"* claim at `:50`, to be measured and then pinned or
  stripped of the word "regardless". It survives verbatim, and is now contradicted inside its own file by
  the lane's new comment ("the `tests/**` walk 1.45 s").
- **Fix spec.** (a) Either revert the four `{ timeout: scaledBudget(CENSUS_BASE_MS) }` options and delete
  `CENSUS_BASE_MS`, or keep them and rewrite the constant's comment to say what is true: *the arms already
  inherited `budget(5000)` from `vitest.config.ts:90`; this makes the same budget explicit and samples it in
  the worker*. The sentence "these four were the reason the file could red on load alone" must go either
  way. (b) Replace "~1s regardless" at `:50` with the measured number and no "regardless" (1281–1453 ms on a
  quiet 16-core fence), or delete the sentence. (c) The real defect this file exposes belongs to #2206: the
  fifth arm is the one that dies, at a factor of 1.0116.

### #2192 — the D53 ReDoS watchdog's flat 10 s budget — **PARTIAL**

- **Implemented as the row asked, and the seam is right.** Base unchanged at `10_000`; the spelling is the
  bare `budget()` from `@orb/tooling/_shared/load-budget`, which is the `tests/server` idiom — precedent
  confirmed at `tests/server/infra/plugin-host/sandbox.test.ts:31`
  (`const ALLOCATION_BOMB_TIMEOUT_MS = budget(10_000)`), and three other `tests/server` files import the
  same door. `scaledBudget` genuinely lives in the vitest-tooling seam (`tests/tooling/_load-budget.ts`) and
  would have been the wrong import here. Unlike #2218 this IS a real change: the old `{ timeout: 10_000 }`
  literal OVERRODE the scaled default, so the arm was the one place in the file that did not scale.
- **But the stated goal — "one contended run away from a red" — is not met, and I reproduced the red.** In
  the same three-file scoped run: `Test timed out in 10117ms` (= `budget(10_000)` at the measured load), the
  test having consumed the whole budget. Solo re-run: EXIT 0 · 5770 ms (`cb-v-instruments-3-chat-solo.log`).
  The method is read before the charge: this arm builds the real composition root and seeds through the real
  regex + chat verbs, so it is genuinely slow-and-contended, not hung — which is exactly the class the
  scaling was supposed to absorb, and 1.2 % does not absorb it. That is #2206's curve (`max(1,
  loadavg/cores)` = 1.00 across the whole sub-saturation band; the throttle arm supplied the entire 1.2 %).
- **Second, smaller observation, not charged:** the elapsed ceiling moved from `seconds < 1` (a hard
  1000 ms) to `elapsedMs < budget(1000)`, which at the factor cap is 8000 ms. The watchdog throws at ~52 ms,
  so the refutation survives; the header says so.
- **Fix spec.** Nothing to revert. Route the residual to #2206 with this file as the second worked case
  (the first is #2218's fifth arm), and do not raise the literal — an unscaled larger number has the same
  defect one load class later.

### #2193 — `scripts/ts7.cjs` freshness pin — **CONFIRMED**

- `pnpm test:scoped tests/tooling/ts7-freshness.int.test.ts` → **EXIT 0 · 1 passed · 1527 ms**
  (`cb-v-instruments-3-node1.log`).
- **Planted break reproduced by me** (announced by SendMessage before and after; `cp scripts/ts7.cjs
  scripts/ts7.cjs.bak`, one command per call, `withoutIncremental` bypassed by replacing the single call
  site `const args = withoutIncremental(process.argv.slice(2));` — asserted to occur exactly once — then
  `mv` back, `git status --short` EMPTY afterwards): → **EXIT 1**, and the failing assertion is exactly the
  one the lane named — `AssertionError: the wrapper strips --tsBuildInfoFile, so the requested cache must
  never appear on disk: expected true to be false` at `ts7-freshness.int.test.ts:114`
  (`cb-v-instruments-3-ts7-broken.log`). The green/red/green triple stayed green under the break (the run
  reached line 114), which is what the file's header already states.
- **The argv half is not duplicated.** `tests/tooling/_shared/concurrency-profile.test.ts:333-367` owns
  every `--incremental`/`-i`/`--tsBuildInfoFile` spelling plus the malformed-refusal cases through the
  `spawnSync` capture; the new file asserts none of it.
- **Honest limit, stated by the file itself and confirmed here:** because the wrapper strips the cache
  request, no run in the triple is warm, so the triple is a FENCE and the build-info assertion is the
  falsifiable arm. The file says this in its header and my break agrees, so it is labelled correctly rather
  than being a green-before test wearing a receipt's clothes.

### #2194 — `zod-error-issues-home`'s unreachable fail-closed arm — **PARTIAL**

The half the lane did is sound and independently falsified; the row's second half is untouched and is not
in the lane's own "did NOT do" list.

- `verifyPolicyProofs([gate])` over the real module → **0 failures** (`cb-v-instruments-3-proofs.log`).
- **My §4.1 cut, in a sibling scratch module in the same directory** (`gates/cb-v-instruments-3-probe.ts`,
  deleted immediately; both anchors asserted to occur exactly once before patching): reverting the two
  fail-closed answers (`declarations.length === 0 → "other"`, unresolved origin → `"other"`) →
  **exactly 1 failure**, `arm mustFlag · exampleIndex 4 · "expected at least one effective finding but got
  0"` (`cb-v-instruments-3-cut.log`). The new row dies without the arm, and no other row depends on the
  widening. The `messageIncludes` is load-bearing exactly as claimed: with the arm cut the fixture produces
  ZERO findings, so the arm is the only producer for that fixture.
- **Real tree, driven through `runPolicyPass` over `projectCtx(root).project`** with the whole project as
  `requestedPaths` (`cb-v-instruments-3-realtree.mjs`): `population 3386 source files · raw 8 · granted 8 ·
  waived 0 · effective 0 · 0 tool errors · 0 withheld`. Every one of the 8 carries the ORDINARY message
  ("a hand-flattened zod `issues` read…"); none is the UNREADABLE arm, so the widening costs zero real-tree
  findings and the before/after identity the lane claims holds by construction. (The 575 authority alarms
  in that run are an artifact of a single-policy `knownPolicies`, which turns every other policy's ordinary
  waiver into "unknown policy" — not a finding about this module.)
- `pnpm check:policy-conformance` whole → **EXIT 0** — `250 final policies · 2985 proof rows · 9 refusal
  rows · 0 failure(s) · 206 grant rows · 0 invalid · 45750 ms` (`cb-v-instruments-3-conf.log`).
- **What is missing.** #2194's row text ends: *"Also its #2097 site at `:81` (`symbol?.getDeclarations()`)
  is in `p-binding-readers`' list — one lane, one commit."* The chain is still there, now at
  `tooling/src/verify/gates/zod-error-issues-home.ts:111`
  (`return homeVerdict(symbol?.getDeclarations() ?? []);`), the lane's report does not mention it in its
  "What this lane did NOT do" list, and the edit MOVED it, so
  `docs/reviews/gate-runtime/policing-surface-audit-2026-09-12.md:517`'s `…:81` citation is now stale.
- **Fix spec.** Either land the `:111` chain on the shared binding reader in the same family as
  `p-binding-readers` (`policy-binding-resolution` reports it today), or state in the row why it is deferred
  to that lane; and repair `policing-surface-audit-2026-09-12.md:517` to `:111` in whichever commit moves it.

### #2228 — the `contract/**` half of the knip red — **PARTIAL** (the residual is a ruled outcome, not the defect)

- **The residual is accurately reported and `pnpm knip` EXIT 1 is expected.** Fresh run
  (`cb-v-instruments-3-knip.log`): **EXIT 1 · Unused exports (65) · Unused exported types (4)** — byte-equal
  to the lane's post-rebase figure ("65 + 4"). Exactly ONE `contract/**` row survives,
  `isGateResourceDemandKind  function  tooling/src/verify/contract/resource-declaration.ts:93`, which is the
  deliberate one (a dead FUNCTION, out of a types-only subject). The four type rows are
  `config-static-read.ts:17 ExtractRequest`/`RowExtraction`, `show-artifact.ts:46 LegacyGateView` (main's,
  not this lane's) and `ops/eslint-discovery.ts:60 EslintDiscoveryWire` — matching the residual list.
- **The two deletions removed nothing live.** `contract/readers.ts`: the only surviving importers of that
  module are `lib/bus-coverage.ts:21`, `tests/tooling/verify/lib/bus-coverage.test.ts:1` and
  `tests/tooling/verify/gates/bus-fact-health.test.ts:256-259`, all three for `BusCoverageSpec`, which
  stays; no importer of any of the fourteen forwarded bus names exists.
  `SelectedGateFact` has zero occurrences anywhere on the tree outside the lane's own report prose.
  `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json --config tsconfig.tests-dom.json`
  → **EXIT 0**, 3 runnable programs all PASS (`cb-v-instruments-3-tsc.log`) — which also clears the JSDoc
  hazard on 27 comment-only edits.
- **The `@public` reasons are TRUE in substance and FALSE in their coordinates.** Spot-read substance:
  `SchemaFactStatus` really is the `status` field of `SchemaFactReceipt`; `StaticClassUnresolved`/`Opaque`
  really are the `unresolved`/`opaque` fields of `StaticClassWalk`; `TupleVocabularySymbol` really is the
  `symbol` field of `TupleVocabularyFact`. But every reason NAMES ITS SITE BY LINE and the inserted comment
  shifted the target: an audit of all 34 `(line N)` citations in `contract/*.ts` that name a resolvable
  exported declaration found **33 wrong, 1 right** (`cb-v-instruments-3` python audit, printed above in the
  ledger row's receipt). Worked examples: `schema-fact.ts:6` cites `SchemaFactStatus` at "line 9" — it is at
  12, and 9 is the tuple the comment is attached to; `static-authored-value.ts:6` and `:14` cite the SAME
  union `StaticAuthoredValue` at "line 33" and "line 31" — it is at 35 in both cases.
  The whole justification of the idiom, in the lane's own words, is *"every tag NAMES the site it is
  reachable from, so a tag whose reason stops being true reads as stale"*; a coordinate that was never true
  cannot rot into a signal.
- **Fix spec.** Re-derive the cited line for every `(line N)` in `tooling/src/verify/contract/*.ts` AFTER
  insertion — or, better and in the house's own §5b idiom (#2109 item 3, *"write it as a mechanism, not a
  coordinate"*), name the target by SYMBOL only and drop the parenthetical line. Also correct the residual
  header in `x-instruments-batch-2026-09-13.md` from "68 rows" to the measured 69 (65 + 4).

## LEDGER ROWS (6 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `eslint-tests-coverage.int` | cb-v-instruments-3 L1 · `tests/tooling/eslint-tests-coverage.int.test.ts:26-33,59,74,86,99` | `a5f33a0e1` adds `{ timeout: scaledBudget(CENSUS_BASE_MS) }` to four arms that ALREADY inherited `budget(5000)` from `vitest.config.ts:90` (`extends: true`, no own `testTimeout`) — same function, same reader, same cap, so the change adds no scaling — and the new constant's comment asserts *"these four were the reason the file could red on load alone"*, the premise #2218's own author RETRACTED | no-op fix + false claim planted in the tree (advertised prose over unchanged behaviour) | **OPEN** | resolved config under `ORB_BOX_LOAD="48/16"`: root `testTimeout: 15000`, tooling project `extends: true · own testTimeout: undefined`; contended 3-file run: the four arms 2298/16/23/360 ms green, the file RED on the FIFTH (already-scaled) arm — `Test timed out in 15174ms` |
| `eslint-tests-coverage.int` | cb-v-instruments-3 L2 · `tests/tooling/eslint-tests-coverage.int.test.ts:50` | the inline *"the whole census (~2700 files) resolves in ~1s regardless"* — the ONE item #2218's retraction kept ("measure it and either pin the number or delete the word") — survives verbatim, and is now contradicted inside its own file by the new `CENSUS_BASE_MS` comment's measured 1.45 s | unmeasured performance assertion in a comment (same class as a census that looks derived and is not) | **OPEN** | quiet solo run: `tests/**` walk 1281 ms (`cb-v-instruments-3-eslint-solo.log`); the lane's own comment says 1.45 s; `sed -n '50p'` on the file still reads "~1s regardless" |
| `chat.int` D53 tripwire | cb-v-instruments-3 L3 · `tests/server/entry/compose/chat.int.test.ts:85-96,135` | the row's goal — a tripwire no longer "one contended run away from a red" — is unmet: `budget()` returns 1.0116 at this box's real load, so the flat 10 000 became 10 117 and the arm STILL times out under ordinary lane contention. The seam and the base are correct; the CURVE is the defect (#2206) | insufficient scaling / curve shape, not a wrong fix | **OPEN** | three-file `pnpm test:scoped`: `Test timed out in 10117ms`; solo re-run EXIT 0 at 5770 ms; measured `budget(10000)=10117` at `loadavg1 10.2 · cpuCount 16 · throttle 5346/462343` |
| `contract/**` `@public` reasons | cb-v-instruments-3 L4 · `tooling/src/verify/contract/schema-fact.ts:6,10` · `static-authored-value.ts:6,14` · (+31 more) | `68e2851d2`'s 57 reasons each NAME their reachable site by `(line N)`, and the inserted comment shifted the target: **33 of 34** resolvable citations point at the wrong line (off by 1-8, both directions). The idiom's whole staleness mechanism is a coordinate that was never true | wrong coordinate in a live reason (§5b legibility; #2109 item 3's "mechanism, not a coordinate") | **OPEN** | scripted audit over `tooling/src/verify/contract/*.ts`: `checked 34 good 1 bad 33`; e.g. `schema-fact.ts:6` cites `SchemaFactStatus` "line 9" (actual 12), `static-authored-value.ts:6,14` cite `StaticAuthoredValue` "line 33"/"line 31" (actual 35 for both) |
| `zod-error-issues-home` | cb-v-instruments-3 L5 · `tooling/src/verify/gates/zod-error-issues-home.ts:111` | #2194's second half — the #2097 `symbol?.getDeclarations()` chain, *"one lane, one commit"* — is untouched, is absent from the lane's own "did NOT do" list, and the edit MOVED it from `:81` to `:111`, staling the audit's citation | unfixed half of a claimed-complete row + stale coordinate in a live audit | **OPEN** | `/usr/bin/grep -n 'getDeclarations' gates/zod-error-issues-home.ts` → `111:`; `policing-surface-audit-2026-09-12.md:517` still reads `…/zod-error-issues-home.ts:81` |
| `x-instruments-batch` report | cb-v-instruments-3 L6 · `docs/reviews/gate-runtime/x-instruments-batch-2026-09-13.md:88` | the residual header says "**68 rows**, none in this lane's fence" while the same document's later paragraph records the post-rebase measurement 65 + 4 = 69, and one of the listed rows (`isGateResourceDemandKind`) IS inside `contract/**` | stale count in a landed report (pre-rebase number left in the header) | **OPEN** | fresh `pnpm knip`: EXIT 1 · `Unused exports (65)` · `Unused exported types (4)`; the `contract/**` row is `resource-declaration.ts:93` |

ledger rows OWED: 6

## WHAT I DID NOT COVER

- **No structure leg.** No `pnpm check`, `pnpm verify`, `pnpm check:structure`, and none of the four
  planting suites — all banned by the brief. So no whole-corpus verdict, and #2194's real-tree numbers come
  from a hand-driven `runPolicyPass` over `projectCtx(root)`, not from a published structure slot.
- **`pnpm knip` was run once, at tip only.** I did not re-derive the pre-commit 80 + 62 figure, so the
  lane's "before" numbers are unverified; the "after" is mine.
- **I read the substance of ~8 of the 57 `@public` reasons**, not all 57. The line-citation audit covers the
  34 that name a resolvable exported declaration; ~23 tags whose reason names a field or uses different
  phrasing were not machine-checked.
- **The #2226 pin was exercised twice (clean + one-feed-cut), not repeatedly under planted load.** The
  passive-effect race window described in §2 is argued from the mount's source, not measured with
  `--repeat-each`.
- **The #2192 / #2218 contention reds are from a three-file scoped run on a 16-core fence at loadavg ~10.**
  I did not characterise the curve across load classes; that is #2206's work.
- **I did not re-run the corpus CT after the probe restore** — the restore is proven by an empty
  `git status --short`, and the clean run preceded the probe.

## PROPOSED LESSONS

**Index line:** `- [inherited timeout is already scaled](vitest-inherited-testtimeout-is-already-load-scaled.md) — a test with no timeout option is NOT unscaled; the root config's default is budget()`

**Body:** `vitest.config.ts` sets `testTimeout: budget(5000)` / `hookTimeout: budget(10_000)` at the ROOT,
and every project carries `extends: true` with no own `testTimeout` (except `repository`, which sets
`budget(30_000)`). So a test body with NO `timeout` option inherits a LOAD-SCALED budget, and
`scaledBudget(5000)` from `tests/tooling/_load-budget.ts` is the identical call (`budget(base, readBoxLoad,
FACTOR_CAP)`) — adding it to such a test changes nothing but the sampling moment. **Why:** two agents in a
row (the row's author, then the fixing lane) read "no timeout option in the test body" as "no load scaling"
and filed/implemented against it; the author retracted, the lane shipped the retracted premise anyway with a
comment asserting it. **How to apply:** before charging a suite with "flat wall clock", print the RESOLVED
config under a planted `ORB_BOX_LOAD` (`import vitest.config.ts`, read `test.testTimeout` and the project's
own value) — an EXPLICIT literal `{ timeout: 10_000 }` is the only shape that actually defeats the scaled
default.

**Index line:** `- [factor 1.0116 is the whole uplift](load-budget-uplift-is-one-percent-in-the-band.md) — budget() gives ~1% under normal lane contention; "take scaledBudget" does not make a wall clock robust`

**Body:** On a 16-core cgroup fence at loadavg ~10, `computeLoadFactor` returns EXACTLY 1 (the whole band
`0 < loadavg < cores`) and the throttle arm supplied 1.0116 — measured `budget(10000)=10117`,
`budget(15000)=15176`. Two arms timed out at precisely those numbers in one three-file `pnpm test:scoped`
and both passed solo. **Why:** a row that prescribes "take `scaledBudget`" reads like a robustness fix and
delivers ~1 % in the exact band where lanes actually run; the fix's receipt must therefore be a CONTENDED
re-run, not a solo green. **How to apply:** any budget row closes only with (a) the measured factor at the
time and (b) a red-or-green under real contention; otherwise route it to #2206's curve.

**Index line:** `- [a reason that cites a line cites the pre-insertion line](jsdoc-reason-line-citations-shift-by-their-own-comment.md) — inserting the comment moves the target it names`

**Body:** A `@public knip type-face false positive` reason (or any JSDoc that names a coordinate) is written
against the file as read, then INSERTED above the thing it describes — so the cited line is short by the
comment's own height, and in a multi-tag file each tag is wrong by a different amount. Measured on
`68e2851d2`: 33 of 34 checkable citations wrong. **Why:** the idiom's stated value is "a tag whose reason
stops being true reads as stale"; a coordinate that was never true can never rot into a signal, and it reads
as authoritative. **How to apply:** name the target by SYMBOL, never by line (the house rule from #2109 item
3, "write it as a mechanism, not a coordinate"); if a line must be cited, re-derive every one AFTER the
whole insertion pass and diff the file, not the plan.

## Issue summaries

**#2226.** CONFIRMED. `pnpm test:ct <the corpus CT>` EXIT 0, 19 passed, ratchet silent (silence is the clean
verdict — `ct-flaky-reporter.ts:259-264` prints only on violations/refusals). My own control — one feed
(`discovery.topKeywords`) deleted in a cp-backed copy — reddened EXIT 1 with the ratchet naming that read AND
the new in-file pin as the single failing test (`:641`). Baseline file is `{}`: no waiver, no widening. The
barrier is sound: the four `useQuery` calls sit above the `EmptyState` return in the SAME component
(`corpus-home-surface.tsx:153-208`). No defects.

**#2218.** REFUTED. The four arms already inherited a LOAD-SCALED `budget(5000)` (`vitest.config.ts:90`,
tooling project `extends: true`, own `testTimeout: undefined` — proven with `ORB_BOX_LOAD="48/16"`, resolved
root `testTimeout: 15000`), and `scaledBudget(5000)` is the identical call. The change adds no scaling, and
the new comment asserts the premise the row's author retracted. Under real contention the four arms passed
(max 2298 ms) and the file died on the FIFTH, already-scaled arm (15174 ms). The retraction's one kept item
("~1s regardless" at `:50`) is untouched. 2 ledger rows.

**#2192.** PARTIAL. Correctly implemented: base 10_000 unchanged, bare `budget()` is the right `tests/server`
seam (`sandbox.test.ts:31`), and unlike #2218 the old flat literal really did defeat the scaled default. But
the goal is unmet — at this box's load the factor is 1.0116, so 10_000 became 10_117 and the arm STILL timed
out in a three-file scoped run (`Test timed out in 10117ms`; solo EXIT 0 at 5770 ms). Method read first: the
arm builds the real composition root and does real db work, so it is slow-and-contended, not hung. Route the
residual to #2206. 1 ledger row.

**#2193.** CONFIRMED. `pnpm test:scoped tests/tooling/ts7-freshness.int.test.ts` EXIT 0 (1 passed, 1527 ms).
I reproduced the planted break myself (cp-backed `scripts/ts7.cjs`, `withoutIncremental` bypassed at its one
call site, restored, `git status --short` empty): EXIT 1 on exactly the named assertion — "the wrapper strips
\--tsBuildInfoFile, so the requested cache must never appear on disk" at `:114` — with the green/red/green
triple still green, as the file's own header states. The argv half lives in
`_shared/concurrency-profile.test.ts:333-367` and is not duplicated. No defects.

**#2194.** PARTIAL. The arm is genuinely reachable and pinned: `verifyPolicyProofs([gate])` 0 failures, and my
own §4.1 cut in a sibling scratch module (both fail-closed answers reverted) killed exactly `mustFlag[4]`
("expected at least one effective finding but got 0") and nothing else. Real tree via `runPolicyPass` over
`projectCtx(root)`: population 3386 · raw 8 = granted 8 + effective 0, all 8 the ordinary message, so the
widening costs nothing. `check:policy-conformance` EXIT 0 (250 policies, 2985 rows). Missing: the row's #2097
half (`symbol?.getDeclarations()`, moved `:81`→`:111`), unfixed and unreported. 1 ledger row.

**#2228.** PARTIAL, and the residual is a ruled outcome, not a defect. Fresh `pnpm knip` EXIT 1 · 65 + 4 —
byte-equal to the lane's post-rebase figure, with exactly one `contract/**` row surviving on purpose
(`resource-declaration.ts:93`). Both deletions are safe: nothing imports the fourteen forwarded bus names
(only `BusCoverageSpec`, which stays) and `SelectedGateFact` occurs nowhere; typecheck EXIT 0 on three
programs. The reasons are true in substance but 33 of 34 cite the WRONG line — the inserted comment shifted
its own target. 2 ledger rows.
