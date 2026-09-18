---
kind: review
status: active
updated: 2026-09-18
---

# The four irreducible `structure:full` findings — design and disposition (2026-09-18)

Subject: the four blocking findings every other #1584 drain lane refused because they need a design
decision rather than a mechanical fix. Measured on worktree base `3f27ec4a8` (main tip at dispatch), run
`agent-a0c354fb6113d2798-3634274-2026-09-18T15-21-07-658Z`: `38 blocking = 409 effective − 374 warning +
3 alarms`. Of those, this record owns exactly four: one `caught-failure-ownership` finding, one
`policy-waiver-identity` finding, and the two `[ordinary-waiver]` authority alarms. The design was written
before any edit; the "Built" section at the end is the receipt.

## 1. `caught-failure-ownership` at `tooling/src/snap/ops/heap-capture.ts:79:12`

### Mechanism (re-derived, not remembered)

`lib/ordinary-waiver.ts#evaluateMarker` narrows a marker's candidates TWICE: first by carrier containment
(`carrierContains` walks from the comment's carrier node up to the first statement boundary and asks
whether that node's span holds the finding), then by exact token (`finding.token === marker.position`).
A marker above the outer `try` has the whole `TryStatement` as its carrier, and that span holds every
`catch` nested inside the `finally` block. All four catches bind `error`, so the outer marker sees four
`error` candidates and reports `over-broad` — which suppresses none, by design (`ordinary-waiver.test.ts`
"one marker matching multiple findings is over-broad"). The file's own 10-line comment records four
measured placements, all over-broad, and concludes the site is unwaivable. That conclusion was reached
without asking why the tokens collide.

The reader's header (`lib/caught-failure.ts`, "The anchor is the position") claims the binding name is
unique inside the carrier because one `TryStatement` holds one catch clause. True per try statement;
false for a marker whose carrier CONTAINS nested try statements. That sentence is the premise the
"unwaivable" verdict rested on, and it is the thing to correct.

### Chosen design

1. The three cleanup catches bind DISTINCT names — `disableError`, `detachError`, `streamError` — and
   their three existing markers name those positions. The outer catch keeps `error` and receives the
   fourth marker, immediately above the outer `try`, with the reason the retired comment already stated
   (the primary failure is retained and `combineCaptureFailures` always rethrows it, alone or inside the
   `AggregateError`). Each of the four absorbs is now independently waivable with its own reason, which
   is what the gate's door exists for: a deliberate retain-and-recombine cleanup absorber.
2. The reader header's uniqueness sentence is corrected to state the containment rule and the
   consequence (a nested catch must bind a distinct name), naming `heap-capture.ts` as the live shape.
3. The policy's `fix` gains the fixer-facing sentence: a catch nested inside another guarded try binds a
   name of its own, because the outer marker binds by containment and a shared token is over-broad.
4. A `mustPass` row (`nested-cleanup`) pins the nested-distinct shape: three catches, three markers, zero
   effective findings, zero alarms. Its planted break — rename every binding back to `error` — reds the
   row through the over-broad alarm; that break is run and recorded below.
5. `docs/reviews/caught-failure-ownership/population.json` is re-derived in this isolated worktree
   (`baseline caught-failure-population`); the diff must be confined to the four heap-capture rows
   (one flips `unproven` → `deliberate-absorb`, three change `siteId`/line).

### Rejected

- Extract each inner try/catch into a named helper. Also yields distinct carriers, but adds three
  one-line helpers whose own catches still owe markers; the rename is strictly smaller and the resulting
  names are more descriptive than the indirection.
- Restructure to remove the outer catch (`Promise.allSettled` over the capture body). Contorts a clear
  transaction to dodge the gate; the outer catch IS the documented "outer-engine absorber" shape the
  door is for. The doctrine forbids restructuring real code to silence a checker.
- Change the engine to bind a marker to the NEAREST carrier only. Changes semantics for every ordinary
  policy; the conservative containment rule is deliberate (a marker above an `if` legitimately covers
  the one catch inside it) and the standing law forbids a second resolver. One live instance does not
  justify an engine change.
- Leave the site as a reported `unproven` row ("the honest state"). It was honest under the false
  premise; with distinct names the premise is gone and the row is a real red on every structure run.

### Coupled sites

`tooling/src/snap/ops/heap-capture.ts` · `tooling/src/verify/lib/caught-failure.ts` (header) ·
`tooling/src/verify/gates/caught-failure-ownership.ts` (`FIX`, new `mustPass`) ·
`docs/reviews/caught-failure-ownership/population.json` (regenerated) ·
`tests/tooling/verify/gates/caught-failure-ownership.repo.int.test.ts` (the behavioral tier: census
bijection, live == unproven, waived == deliberate-absorb, zero alarms).

## 2. `policy-waiver-identity` at `tooling/src/verify/gates/ledger-symbol-liveness.ts:176:3`

### Mechanism (re-derived)

`ledger-symbol-liveness` is `ordinary` with `population: { of: "none" }` and resources
`ledger:core-path-registry` + `tracked-files`. The ordinary door is real for a resource-only policy:
`lib/policy-pass.ts#ordinaryWaiverAcquisition` demands every effective resource path of an ordinary owner
as a text carrier, `ops/resource-host.ts#ordinaryWaiverCarriers` serves the markdown ones, and the engine
binds an HTML-comment marker to the FOLLOWING line (`followingResourceCarrier`; pinned by
`policy-pass.test.ts` "ordinary resource waivers bind through Markdown HTML comments"). Three resource-only
ordinary siblings already prove their identity arm with an in-module `mustPass` over a CSS carrier
(`over-art-plate-arm`, `no-raw-color-in-css`, `motion-token-purity`). The ledger gate simply never wrote
its arm. The finding is correct.

There is a second defect underneath it: `lib/policy-descriptor-read.ts#MARKER_LINE_RE` admits the openers
`//`, `/*` and `{/*` only, while the engine's `commentBody` also reads an HTML comment (markdown) and a
`--` line comment (SQL).
A truthful markdown identity arm would therefore stay INVISIBLE to `policy-waiver-identity`, and the
finding would survive the fix. The recogniser and the engine must read one opener set.

### Chosen design

1. Authority stays `ordinary`. The header documents a real false-positive class — an illustrative path in
   a D-entry that was never a file — whose only remedy is a waiver; the standing law (§5) admits
   `ordinary` exactly when the central marker door is intended, and the door works (carrier proven).
2. The in-module positive identity arm: a `mustPass` (mode `resource`) whose ledger fixture carries an
   HTML-comment marker reading `@orb-waive ledger-symbol-liveness(<the cited path>): …` on the line
   directly above the D-entry that backticks that path (this record does not spell the comment opener
   around it: every tracked Markdown file is a carrier for that policy, so the spelling would be a live
   marker here — the item 3 class). The fixture produces exactly one finding and the marker consumes it.
   Planted break: move the marker to a dead position — the row reds on the dead-position alarm.
3. `MARKER_LINE_RE` learns the HTML-comment and `--` openers, with the comment naming the engine's `commentBody` as the
   opener set it mirrors; `policy-descriptor-read.test.ts` pins both spellings; `policy-waiver-identity`
   gains a `mustPass` for the resource-carrier in-module shape, whose break is the un-widened regex.
   Red-first receipt: with the ledger row present and the regex unfixed, the real-corpus pass still
   reports the ledger gate; with the regex fixed it reports nothing.
4. The gate's `fix` spells the exact door (the HTML comment on the line above, position = the backticked
   path as written) — §7.3 — and its header records the carrier-demand mechanism that item 3 turns on.

### Rejected

- Flip to `hard`. Honest only when no door exists; here it exists and a documented false-positive class
  needs it. It would also strand the header's stated remedy. The one real cost of staying ordinary — the
  carrier demand below — is small and was ruled by design for the analogous `native-config` case (#1947).
- Add a source population so a marker has a TypeScript home. The subject is ledger prose; a source
  population would be an inert extension (`policy-soundness` accuses exactly that) and the marker would
  sit in a file the finding is not in.
- Exclude resource-only populations from `policy-waiver-identity`. Resource-only ordinary policies have a
  working door (three CSS siblings prove theirs), so excluding them would hide the unproven-door defect the
  gate exists to catch — the ledger gate is the instance.
- A family-test arm instead of the in-module row. Valid, but the in-module row is the smaller complete
  shape and the one the three siblings use; the family test dir has no test naming this gate today.

### Coupled sites

`tooling/src/verify/gates/ledger-symbol-liveness.ts` · `tooling/src/verify/lib/policy-descriptor-read.ts`
· `tests/tooling/verify/lib/policy-descriptor-read.test.ts` ·
`tooling/src/verify/gates/policy-waiver-identity.ts` (header + `mustPass`) ·
`tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts` (the real-corpus family pass,
the behavioral tier) · the `structure:policy-conformance` stage (declared rows).

## 3. The two `[ordinary-waiver]` alarms in `docs/reviews/gate-runtime/v-conversions-2026-09-13.md`

### Mechanism

`tracked-files` publishes every tracked path (`ops/resource-tracked.ts`, `paths: repoPaths`), and
`lib/resource-declaration.ts#resolveResourceDeclarations` folds a fact's paths into the owner's effective
resource population. `ledger-symbol-liveness` is the one ORDINARY policy declaring it, so every tracked
`.md/.css/.json/.jsonc/.sql` file is a waiver carrier on every structure run (the same demand receipts the
tracked symlink `.codex/agent-doctrine.md` as an `unresolved` carrier every run). The review doc quotes a
marker inside a live HTML comment twice: `:117:2` is a WELL-FORMED marker naming `d-citation-integrity`,
which is `hard`, so the engine reports `wrong-authority` — a true verdict about that text, which would
tell a reader the hard policy is waivable; `:418:85` spells the opener with nothing after it, so it is
`malformed`. Neither sentence is a marker; both are prose that reads as one.

### Chosen design

Respell both sentences so no `@orb-waive` sits inside an HTML-comment span, without changing what they
claim (an HTML-comment marker of that policy at that position was planted in a FIXTURE and consumed).
The engine only reads HTML comments in markdown, and the identity/spelling recognisers only read
TypeScript string literals, so a bare `@orb-waive …` in prose is inert. The edit re-attests the doc's
catalog receipt (content commit, then the receipt commit).

### Rejected

- Narrow the carrier demand so an ordinary policy demands only paths it can anchor on. A real design
  question about the engine, ruled out of this lane: the demand is the same one #1947 kept for
  `native-config`, and the wide demand is what surfaced two misleading spellings in a normative doc.
- Delete the two sentences. They are a verifier's receipt of a mechanism; the claim is right, only the
  spelling is live.

## Inherited, not owned (same run, same tree)

`[stale-reviewed-grant] depcruise-grant-liveness:quickjs-wasm-url`; `dangling-doc-cite` (1:
`tests/tooling/stack/ops/engines-compose.int.test.ts:4:18`); `depcruise-grant-liveness` (1);
`tooling-argv-front-door` (1); `tooling-size` (30); `d-citation-integrity` shown ✗ with 0 findings (one of
the two tool errors / the withheld owner); 374 warnings including `policy-refusal-coverage` on this
gate's `resources` and the real-corpus-liveness-pin warnings on both gates touched here. `docs:catalog` is
red on the untouched tree ("generated catalog is stale") — so this lane hand-authors its receipt rows and
does NOT regenerate `catalog.json` over main's drift; the barrier owns that regen.

## Verification floor (planned; the Built section records what ran)

Scoped biome + ESLint on every touched file; `pnpm typecheck --config` for the tooling and tests-tooling
programs; `pnpm test:scoped` on `policy-descriptor-read.test.ts`, `ordinary-waiver.test.ts`,
`policy-soundness-family.suite.repo.int.test.ts`, `caught-failure-ownership.repo.int.test.ts`;
`pnpm check:policy-conformance`; `pnpm check:ledgers-fresh`; `pnpm gate:contract`; `pnpm check:docs` with
both docs named explicitly; a second `pnpm check:structure` proving the four findings are gone.

## Built

Every step above landed as designed; the receipts below were read off the runs, not inferred.

- Item 1. `heap-capture.ts` binds `disableError` / `detachError` / `streamError` in its finally block and
  carries four markers (the outer one at the line above `try`). The reader header sentence is corrected and
  the policy's `fix` names the nested-catch rule. `caught-failure-ownership` declared proofs through
  `verifyPolicyProofs`: 0 failures with the `nested-cleanup` row; the planted break (all three bindings
  renamed to `error`) failed that one row with `AUTHORITY ALARM [ordinary-waiver] over-broad ordinary
  waiver at tooling/src/probe/nested-cleanup.ts:4:3 matched 3 findings and suppressed none`, then restored
  from the scratch copy. `baseline caught-failure-population` regenerated: 602 sites, 0 unproven (was 601 +
  1\); the diff is exactly the four heap-capture rows and the totals. Behavioral tier:
  `caught-failure-ownership.repo.int.test.ts` + `ordinary-waiver.test.ts` — 29/29.
- Item 2. `ledger-symbol-liveness` keeps `ordinary`; its identity row consumes the markdown marker (0
  failures on its proofs); the planted break (position moved to `illustrative-only.tsx`) failed that one row
  with `names a dead position`. Found and fixed in the same module: its two pre-existing clean-ledger
  `mustPass` rows were failing conformance with `policy receipt refused: population "path-cites-checked"
  resolved zero members` — the receipt counted what was FOUND; it now receipts `ledger-lines-scanned`. The
  recogniser: red-first with the row present and `MARKER_LINE_RE` unwidened, the real-corpus
  `policy-waiver-identity` pass still reported `ledger-symbol-liveness.ts:199:3 mustPass`, the identity
  gate's new markdown row failed its own conformance, and the two new unit expects failed; after widening,
  real-corpus EFFECTIVE=0, `policy-waiver-identity` proofs 0 failures, `policy-descriptor-read.test.ts`
  37/37. ESLint also surfaced two pre-existing `??` on `match.index` in the gate (dropped).
- Item 3. Both sentences in `v-conversions-2026-09-13.md` respelled; `check:docs` on both docs: formatted.
- Static floor: biome clean on all seven touched TS files; ESLint clean; `pnpm typecheck --config
  tooling/tsconfig.json` and `--config tsconfig.json` (the program `tests-membership` names for the edited
  test) PASS; `pnpm gate:contract` 0 findings across 341 modules; `pnpm check:ledgers-fresh`: the
  caught-failure population is fresh (the read-first-costs rows 5b/6 and the refutation ledger's rollup
  are stale on the untouched tree — inherited, not regenerated here).
- Whole-corpus `pnpm check:policy-conformance` (341 policies, 3925 rows): my three gates pass every row;
  the run is EXIT=2 on 11 inherited rows — eight are `337112ede`'s parenthesised report tokens
  (`policy-proof-expectations.ts:257,263`, `policy-waiver-spelling.ts:68`; the report door refuses a
  token containing `(`), plus `dialog-via-composite`/`-debt` (2) and `playwright-lane-outside-fast-check`
  (2). Reported to the orchestrator mid-run; not touched here.
- `policy-soundness-family.suite.repo.int.test.ts`: 110/112. The two reds are the same inherited rows
  (the family-wide `verifyPolicyProofs(FAMILY)` test) and the real-corpus test's
  `expect(importOpinion.length).toBeGreaterThan(0)` guard, which reds because `policy-legacy-imports` has
  zero live sites — already 0 on the pre-change structure run, no import line in this diff, and the
  comment directly under that assertion says the class is drained.
- Post-change `pnpm check:structure` (run `agent-a0c354fb6113d2798-4012168-2026-09-18T16-44-48-228Z`):
  `34 blocking = 407 effective − 374 warning + 1 alarm`, against `38 = 409 − 374 + 3` before. The delta
  is exactly this record's four: the two error findings are gone (35 → 33), both `[ordinary-waiver]`
  alarms are gone (the surviving alarm is the inherited stale reviewed grant), and waived findings rose
  1800 → 1801 for the new heap-capture marker. Tool errors (2) and the withheld owner (1) are unchanged
  and inherited.
