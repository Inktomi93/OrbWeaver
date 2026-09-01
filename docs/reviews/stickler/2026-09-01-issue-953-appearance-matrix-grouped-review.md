---
kind: review
status: active
updated: 2026-09-01
---

# Issue #953 appearance-invariant matrix — grouped cold review

Range reviewed: `3f2661ce3..23a964757` at attestation HEAD `23a96475715...`; content commit
`78788014d89708280ccd527abaf1044513ff58b9` is an ancestor of that HEAD. Intent authority:
GitHub issue #953 and `docs/design/953-appearance-invariant-matrix.md` at SHA-256
`35041300c6e73581434944ccb0166958ff948f6f522c4a4bc983debd44dcd755`.

Verdict: **three confirmed findings; severity ceiling P1**. The shared matrix planner, Snap route/scenario
joins, live custom-theme identity, DevTools cascade/pixel/merge evidence, and motion matrix identity are
otherwise coherent and non-vacuous in the inspected source and retained cold receipts. The train is not
clean because one animation can receive counterfeit Base UI launch provenance, one rated-theme failure
path leaks stage rows, and UI13 turns no-verdict cells into product violations.

## Findings

### P1 — Base UI launch provenance is attached to every running transition on the target, not the transition that launched

**Defect — `packages/client/src/lib/motion-animation-record.ts:132-145`:** one `transitionrun` consumes a
pending Base UI lifecycle observation by iterating `event.target.getAnimations()` and writing that same
state to *every* running `CSSTransition` on the element. The event's newly launched transition is not
identified. `tooling/src/motion-audit/lib/animations.ts:37-44` then accepts any such attributed sole
`height` transition as the sanctioned library exception.

**Concrete failure:** an application-owned long `height` transition is already running on an element. A
later Base UI lifecycle mutation launches a compositor-clean `opacity` transition on that same element.
The opacity `transitionrun` labels both objects `base-ui/starting-style`; the still-running application
height transition now leaves the dirty budget. Motion-audit can print raw dirty `1`, sanctioned library
`1`, budgeted dirty `0` and return a false-clean animation budget.

**Evidence produced this session:** I bundled the exact reviewed client module and drove it in Chromium
with a concurrent same-target application height transition plus a later Base UI opacity launch:

```text
pnpm exec esbuild packages/client/src/lib/motion-animation-record.ts \
  --bundle --format=iife --global-name=MotionAnimationRecord --platform=browser \
  --outfile=reports/stickler/scratch/motion-animation-record.bundle.js
pnpm tsx reports/stickler/scratch/repro-motion-launch-binding.ts

before later launch: height attribution=application lifecycle=null
after later launch:  height attribution=base-ui/starting-style
animationTotals: { rawDirty: 1, sanctionedLibrary: 1, budgetedDirty: 0, gaps: [] }
```

The existing browser control at `tests/client/lib/motion-animation-record.ct.tsx:71-100` cancels every old
animation before starting its second same-target transition. It proves that a consumed target marker does
not leak into a *later* launch, but cannot catch contamination of a transition that is still active when
the Base UI transition launches. The focused CT batch nevertheless passed 28/28, confirming this is an
unplanted branch rather than a baseline failure.

**Authority conflict:** the design requires the subsequent `transitionrun` to bind the observation to
"the actual `CSSTransition` object" and says `base-ui` is allowed only when exactly one lifecycle state is
bound to that actual transition (`docs/design/953-appearance-invariant-matrix.md:206-220`). Its rejected
alternative explicitly forbids attribution leaking to another transition on the same element
(`docs/design/953-appearance-invariant-matrix.md:247-249`), and the dirty-budget exception is restricted
to the exact Base UI lifecycle height transition (`:228-233`).

### P2 — a failed post-create theme catalog read leaks both rated fixture rows

**Defect — `tooling/src/_shared/rated-theme-fixture.ts:91-126`:** the cleanup catch covers only the two
`settings.createTheme` calls. The first post-create `listThemes` call is at line 118, after that catch and
before the function returns a cleanup owner. If that catalog request fails or returns unreadable JSON,
both exact minted IDs remain in the isolated stage and no caller can remove them.

**Concrete failure:** both custom polarity rows are successfully created, then
`settings.listThemes` returns HTTP 500. `provisionRatedStageThemes` throws `INSTRUMENT ERROR`, so Snap or
UI13 correctly refuses the current run, but the stage retains both rows. Repeated failures contaminate a
warm cached stage with orphaned `orb-matrix-*` themes and violate the lifecycle's exact-ID cleanup
contract.

**Evidence produced this session:** a local HTTP fixture used the reviewed module unchanged and failed
only the first post-create catalog request:

```text
pnpm tsx reports/stickler/scratch/repro-rated-theme-list-failure.ts

thrown: INSTRUMENT ERROR: rated theme settings.listThemes failed (HTTP 500): planted post-create catalog failure
listCalls: 1
leaked ids: theme_fixture_01, theme_fixture_02
```

The shipped tests cover shared-mode non-mutation, successful exact-ID removal, and a server that lies
about removal (`tests/tooling/_shared/rated-theme-fixture.test.ts:80-104`). They do not plant a failure
after both creates but before the cleanup function is returned. The focused unit suite passed 3/3 while
the exact failure injection above left the two rows behind.

**Authority conflict:** the module header makes the returned lifecycle responsible for the exact minted
IDs and says temporary rows "must never" survive the tool-owned stage
(`tooling/src/_shared/rated-theme-fixture.ts:1-3`). The #953 design likewise requires run-local exact
custom-theme capabilities rather than ambient cached rows and calls cleanup failure an instrument error;
the absent cleanup owner on this path does neither.

### P2 — UI13 matrix aggregation downgrades per-cell instrument errors to product violations

**Defect — `tooling/src/ui-audit/ops/matrix.ts:146-168`:** every nonzero cell code is collapsed into one
`failures` count and the aggregate unconditionally returns `EXIT.violations`. It never counts or preserves
`EXIT.toolError` from `runUiAudit`.

**Concrete failure:** any one of 13 cells has a browser-environment mismatch, a failed DOM walk, missing
readiness/settings evidence, zero/partial census evidence, or a population-accounting gap. Ordinary
UI-audit correctly returns code 2/no verdict for those branches, but the matrix writes the cell code and
returns code 1 as if it had observed a product violation. Automation receives the wrong recovery signal,
and the aggregate claims a verdict over an evidence-less cell.

**Evidence produced this session:** the complete control-flow sweep found the only cell runner and
aggregate. `runCells` stores the exact numeric result at `tooling/src/ui-audit/ops/matrix.ts:105-113`;
`runUiAudit` returns `EXIT.toolError` for browser/walk/readiness gaps at
`tooling/src/ui-audit/ops/run.ts:128-156` and for population gaps at `:228-233`; the aggregate at
`matrix.ts:151-155` tests only `code !== EXIT.clean` and emits `EXIT.violations`. The house contract says
code 2 means "the run is NOT a verdict" (`tooling/src/_shared/exit-contract.ts:1-7`) and its runner law is
explicitly never-downgrade (`docs/architecture/core/Core-Tooling-Law.md:66-69`). Structural search
reported this single live UI matrix aggregation path across 2,592 scanned TS files. The matrix test file
contains only parser/refusal coverage (`tests/tooling/ui-audit/ops/matrix.test.ts:1-17`); the focused suite
passed those two tests and therefore supplied no contrary aggregation control.

The analogous Snap suspicion was actively refuted. A route appearance receipt whose evaluation is
`instrument-error` promotes the aggregate to `EXIT.toolError`; a thrown or receipt-less detailed cell is
also an instrument error. Snap's environment red remains an ordinary violation by its pre-existing
public contract, and scenario mode explicitly preserves navigation/assertion/CSS/console/page/request/
environment reds as ordinary cell violations. Motion6 separately counts effective tool errors before
aggregating.

## Verified clean

### Authority and complete-range inspection

- Read `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`, and
  `docs/architecture/core/Core-Laws-and-Precedents.md` in full before judging the diff. Read issue #953
  body/comments and the 620-line design in full. Read `Core-Tooling-Law.md` and `Spine-Testing.md` in
  full, plus the theming, CSS source-order, ThemeScope, motion, and path-registry rulings the train invokes.
  `Core-Path-Registry.md` is an index and was queried by the relevant D42/D44/D54/D70/D71/D123/D128/
  D139/D144 entries rather than treated as prose.
- Inspected all 123 touched files. All changed TypeScript modules, ordinary test files, scenario JSON, and
  the design were read in full. The two multi-thousand-line story registries were first outlined with
  `ast-grep outline`, then every changed declaration and every region that imports, mounts, or interacts
  with the new stories was read; unrelated story bodies were not linearly reread. Generated
  `catalog.json`, design receipts, caught-failure population, and test baseline were parsed end-to-end
  with `jq empty`, and every changed generated entry plus its source receipt was inspected. No other
  touched region was excluded.
- Confirmed HEAD and range existence, verified the content commit is an ancestor of the attestation, and
  recomputed the design hash from both the worktree and `git show 78788014d...`; both equal
  `35041300c6e73581434944ccb0166958ff948f6f522c4a4bc983debd44dcd755`.

### Static and behavioral verification

- Ran `pnpm check` and read the full result. `reports/verify.json` records `tier=static`, `scope=whole`,
  `ok=true`, `failed=0`: all 17 stages passed, including full structure, ledger freshness, dependency
  cruise/knip, and docs format/catalog.
- Focused pure/tooling batch: 12 files, 45/45 tests, zero type errors. This covered the shared planner,
  appearance contract reconciliation, theme fixture, all three consumer planners, motion static verdict,
  Snap R1-R7 evaluator/prepaint, and same-count identity plants.
- Focused parser/integration/browser-instrument batch: 10 files, 124/124 tests, zero type errors. This
  covered Snap and motion CLI parsing/refusals, appearance shim/prepaint, DOM subject accounting, pixel
  contrast including an occluded same-count negative twin, the official DevTools SDK cascade producer
  including zero-declaration and media-stability controls, and ordinary Snap failure paths.
- Focused client CT batch: 28/28 passed, 0 failed/flaky/skipped. It covered the bridge lock surface,
  appearance carrier/message registry, lifecycle animation records, and the motion flagger/drain path.
- The planner additionally survived a 1,000-spec constrained fuzz pass with no duplicate cells. I
  refuted the initial minimizer suspicion because a replacement cell cannot equal a remaining cell while
  still covering an obligation missing from the remaining set.

### Structural and runtime receipts

- `ast-grep --inspect summary` scanned 5,068 TS and 1,331 TSX files for the bridge assignment: one live
  production `globalThis.__orb` assignment remains in `agent-bridge.ts`; the TSX hit only clears the bridge
  in a CT fixture. The existing `agent-bridge-lock` gate passed in `pnpm check`.
- Full call-site sweeps across 2,592 TS files found exactly three production planner consumers (Snap,
  UI13, motion6), two rated-theme fixture consumers (Snap/UI13), three live contract discovery consumers,
  and one production lifecycle-recorder install. A Node-environment execution of the shared planner tests
  passed 5/5, confirming the planner modules stay DOM-less; DOM code is confined to serialized browser
  programs such as prepaint capture.
- Retained Snap route receipt `reports/snaps/953-snap-matrix-final-matrix.json` is internally coherent:
  16/16 cell codes are zero; 42 axes, 3,526 reachable pairs, 0 uncovered pairs; exact R1-R7 membership is
  six single rows plus two twins (10 receipts); every receipt status is `ok`; aggregate accounting is
  61 declared/61 subjects, 156 candidates, 148 reached, 85 sampled, 8 skipped, 0 occluded, 63 off-viewport,
  5/5 pixel samples, and 54 cascade queries. The apparent off-viewport population is explicitly closed
  and the strict evaluator still requires each policy-owned singleton/sample floor; there are zero
  evaluator errors/violations.
- Those 54 official-SDK cascade receipts are all `ok`; their Active source population is 37 client-global,
  14 inline, and 3 owner-custom-css, with the required shell Overloaded evidence present. Five contrast
  subjects have real framebuffer samples and pass their ratios. The 10 row receipts reconcile two
  merge-required owners plus eight explicit `merge-not-applicable: direct-carrier` owners. The live
  custom-CSS token is Active from `owner-custom-css`, consistent with the unlayered owner-CSS-last
  doctrine, and carried ThemeScope rows retain their declared direct-carrier semantics.
- Retained UI13 receipt `reports/design-audit/953-ui-matrix-final-matrix.json` has 13/13 zero cell codes,
  38 axes, 2,886 reachable pairs, zero uncovered pairs, and complete per-cell population artifacts. Its
  two custom theme IDs exactly equal the discovery fixture IDs; no older cached custom row was selected.
  This retained green run does not exercise the finding's tool-error branch.
- Retained motion6 receipt `reports/motion-audit/root-matrix.json` has six exact identities, 24/24 pair
  obligations, three required twins, no browser mismatches, and nonzero trace populations. Five cells are
  mapped product violations. The reduced mobile cell's raw ordinary code 2 is reclassified only by the
  exact `STATIC-EXPECTED` candidate/control join; effective aggregate instrument errors are zero. Its
  live animation population was empty, so it neither confirms nor refutes the P1 concurrent-transition
  defect; the independent Chromium reproduction above does.
- Both reusable scenario receipts are green and explicitly separate from R1-R7. Shell/config is 16/16,
  64 declared/64 captured checkpoints, 16 manifests; chat is 16/16, 48/48 checkpoints, 16 manifests.
  Every cell records `mode=scenario-checkpoints`, `appearance=not-applicable`,
  `reason=scenario-owned-drive`, zero R1-R7 receipts, applied settings, and zero browser mismatches. The
  preset catalog is one source for help and resolution and contains both exact shipped filenames.
- The final successful runs used different run-local custom theme IDs for UI13, both scenarios, and Snap;
  each consumer's requested custom IDs exactly match its own discovery catalog. That refutes cached-row
  selection on successful runs. It does not refute the P2 failure-path leak.

### Failure, suppression, and doctrine audit

- Reviewed every added `@orb-gate-ignore`/Biome suppression and its downstream owner. The generated
  caught-failure population parses cleanly with 428 sites, 425 enforced, zero reported, and zero unproven.
  No newly added TODO/FIXME or deferred #953 obligation was found. The UI13 finding is a direct numeric
  downgrade after a returned instrument code, not a hidden catch, so that gate cannot detect it.
- Verified requested/applied/runtime browser identity checks, matrix denominator refusals, exact row-ID
  multiset joins, scenario declared/captured order, JSON-manifest presence, custom-theme exact-ID selection,
  cleanup-after-success, cleanup refusal when removal lies, DevTools media reapplication after detach,
  merge winner/conflict evidence, custom CSS source ownership, carried-scope ownership, and source-order
  expectations. Apart from the three findings above, the failure/refusal/cleanup paths examined fail loud.
- No schema migration, token source, dependency, authn/authz, secret, or external egress contract was
  changed by the #953 implementation. No security-specific pass is required for the reviewed scope.

## Unconfirmed suspicions

None retained. The Snap exit-code analogue, planner-duplicate concern, scenario-mode R1-R7 applicability,
hover checkpoint conditionality, optional old-ref message registry, and same-count cascade concerns were
all refuted against source authority, exact call sites, focused controls, or cold receipts.

## Durable lesson candidate

**Index entry:** Matrix exit aggregation — preserve `EXIT.toolError` from every cell; counting all nonzero
codes as one failure population silently converts “no verdict” into a product verdict.

**Body:** A matrix owner must aggregate exit codes monotonically (`toolError` outranks `violations`, which
outranks `clean`) or consume a typed per-cell verdict. A test must plant at least one clean cell, one
violation cell, and one tool-error cell and assert both the aggregate code and the per-class denominators.
Parser tests and all-green runtime receipts cannot exercise this failure mode.

## Issue summary

Cold grouped review of `3f2661ce3..23a964757` for #953 confirmed **3 findings (ceiling P1)**: same-target
concurrent CSS transitions can receive counterfeit Base UI launch provenance and hide an application
height transition from the motion dirty budget; a post-create theme catalog failure leaks both exact rated
fixture rows; and UI13 downgrades per-cell tool errors to ordinary violations. Shared planner/Snap/scenario/
DevTools/ThemeScope joins and retained Snap16, UI13, motion6, and both 16-cell scenario receipts otherwise
reconciled. Full report: `docs/reviews/stickler/2026-09-01-issue-953-appearance-matrix-grouped-review.md`.

## Post-review disposition

Commit `9dc7bc0b6` fixes all three findings without altering the reviewed planner, Snap, scenario, or
appearance-invariant policies:

- lifecycle provenance now binds only the `CSSTransition` whose `transitionProperty` equals the observed
  `transitionrun.propertyName`; the real-browser plant keeps an older application height transition active
  while a Base UI opacity transition launches on the same target and proves their owners remain distinct;
- rated-theme provisioning owns cleanup across creation and the post-create catalog proof, removes both
  exact minted IDs before rethrowing the primary failure, and preserves primary plus cleanup errors when
  the server also refuses removal; and
- UI13 aggregates child exits monotonically (`toolError` over `violations` over `clean`) and reports
  instrument-error and violation populations separately.

Red-first receipts: the concurrent transition CT failed 0/1 before the property-specific binding; the
post-create list plant retained two rows; and mixed UI13 child exits `[0, 1, 2]` aggregated to `1`. After
the repair, the focused browser CT passed 1/1, the theme/UI matrix unit batch passed 8/8 with zero type
errors, graph and tests-DOM typechecks passed, and the normal commit hook passed all 17/17 static stages
in 310.84 seconds. The regenerated caught-failure census records 429 sites with zero unproven ownership.
