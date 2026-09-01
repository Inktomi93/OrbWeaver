---
kind: design
status: active
updated: 2026-08-31
---

# Appearance invariant matrix (#953)

Status: implementation contract for #953 after the #974 authority reconciliation. This document owns
the one shared representative-matrix mechanism and its three thin verdict-tool consumers. It does not
redefine the token contract, theme engine, custom-CSS ownership, or motion budgets. #933 remains the
umbrella reconciliation item and must not grow a second matrix or another appearance roster.

## Ruled boundary

The matrix is a proof instrument, not a screenshot gallery. It must derive axes from live carriers,
cover every legally reachable value pair plus the census's explicit high-risk triples, and judge
expected invariant and winner deltas. A nonzero screenshot count is not evidence when a subject was
unreached, a stylesheet was unreadable, a theme did not resolve, a browser descriptor did not apply,
or a cascade winner came from the wrong source.

The live sources of truth are:

- `packages/client/src/lib/appearance-carrier-manifest.ts`: 41 carrier rows. Thirty-six carry
  executable `requiredDistinctArms`; five background identity/catalog rows are dependencies rather
  than invented value axes.
- `APPEARANCE_CARRIER_OBSERVABLES` and `THEME_CARRIER_OBSERVABLES`: the observable DOM contract.
- the existing settings shim and theme catalog resolver in `tooling/src/_shared/appearance.ts` and
  `tooling/src/_shared/theme.ts`;
- the full Playwright descriptor and runtime evidence rail in `tooling/src/_shared/browser.ts` and
  `tooling/src/_shared/browser-environment.ts`;
- `@orb/kit/dead-css` for selector tokenization and marker authority;
- Snap's official DevTools SDK cascade path. #975 established Active/Overloaded classification and
  winner-source evidence; this program consumes it rather than implementing another evaluator;
- #976's exact subject-accounting and requested/resolved theme proof;
- #977's requested/applied/actual device, viewport, screen, user-agent, DPR, touch, pointer, and
  hover proof.

The implementation follows the prior instrument lessons indexed in `MEMORY.md` and
`rollout_summaries/2026-08-22T00-31-31-CdVc-orbweaver_tooling_plan_and_frame_drop_proof_audit.md`:
requested inputs are not runtime evidence, and a zero is not clean until a planted positive proves
the lens can bite.

## Chosen architecture

### 1. One policy-neutral planner

Add `tooling/src/_shared/variant-matrix.ts`. It knows nothing about CSS, themes, Snap, design-audit,
or motion. Its input is:

- ordered typed axes, each with ordered values carrying a stable id and tool-owned payload;
- a sparse legality predicate over partial or complete assignments;
- mandatory partial rows for high-risk triples;
- mandatory same-neighbour delta twins for invariants whose evidence depends on changing exactly one
  axis while all others remain fixed.

Its output is a deterministic list of fully assigned cells and a proof receipt containing the axes,
values, legally reachable pairs, covered pairs, mandatory rows and twins, impossible obligations, and
stable cell ids.

The algorithm is deterministic and never materializes the Cartesian product:

1. Validate nonempty, uniquely named axes and values. Validate every mandatory row and twin against
   the declared values and legality predicate.
2. Seed mandatory rows and both sides of every delta twin. Complete partial rows greedily: for each
   unassigned axis choose the legal value that covers the most currently uncovered reachable pairs;
   declaration order breaks ties.
3. While a reachable pair remains uncovered, seed the lexicographically first pair and greedily
   complete the row by the same rule.
4. Walk non-mandatory cells in reverse insertion order and delete a cell only when every reachable
   pair, mandatory row, and twin remains covered.
5. Recompute the receipt from the final cells and refuse if any obligation disappeared.

Null axes, empty value sets, duplicate identities, unreachable mandatory requirements, uncovered
pairs, nondeterministic output, or a same-count cell replacement are `INSTRUMENT ERROR`. The planner
has no null padding and no fallback value. A changing live contract must change the exact expected
cell-count assertion through review.

Rejected alternatives:

1. Extend Snap's current eight-cell loop. That loop is a fixed desktop/mobile × OS scheme × OS motion
   product. It cannot derive appearance carriers, cannot serve the narrower audit axes, and calls OS
   media-query arms `light`/`dark` without proving the application palette.
2. Generate the full Cartesian product and filter it. The 36 carrier arms plus theme/environment axes
   make that both expensive and structurally misleading; coverage obligations are sparse pairs and
   ruled triples, not every arbitrary combination.
3. Keep a hand-maintained tooling copy of Appearance. That would create a second schema which can
   silently lag the actual Config controls and carrier manifest.
4. Introduce `cva` or a generalized product-variant framework. This is runtime verification planning,
   not component class composition, and no other product need justifies that abstraction.

### 2. Derive appearance axes through the live bridge

Expose a serializable `__orb.appearanceMatrixContract()` through the existing self-describing agent
bridge. The result is derived directly from the client carrier manifest and observables. It reports:

- every carrier key and `requiredDistinctArms`;
- dependencies for background/theme identity rows;
- observable selectors/attributes and expected owner/source classes;
- reached carrier subjects on the current surface.

Tooling must not import the client package or parse TypeScript source. The browser bridge is already the
live boundary for rendered evidence, so it is the correct way to transfer the contract and to prove the
current app implemented it. Client tests assert that a new manifest arm changes the bridge contract and
therefore invalidates a stale exact matrix count.

The existing two-arm client CT matrix remains a carrier-liveness test. It is not duplicated or renamed
as the representative runtime matrix.

### 3. Theme and environment evidence remain actual

Extend the existing shared theme resolver to retain the actual `settings.listThemes` catalog and
classify every resolved theme as seed/custom plus effective light/dark/mid polarity. Required seed,
custom-light, and custom-dark capabilities are discovered from that catalog. If a rated fixture lacks a
required capability, the matrix refuses; it never invents a theme id or judges a misspelled name.

Every theme-rated cell records requested and resolved id/name, catalog source, root source, subject
source, and whole computed `color-scheme` polarity. Carried `ThemeScope` subjects use their nested
observable rather than inheriting a root label.

The browser contract extends #977's existing evidence rather than adding a second launcher. The added
axes are OS color scheme, OS reduced motion, contrast, and reduced transparency. Playwright's installed
surface must be feature-probed before use. Where the Playwright context API lacks a field,
Chromium's `Emulation.setEmulatedMedia` is permitted only with actual `matchMedia` evidence and a
both-direction planted control. Requested/applied values never count as actual by themselves.

### 4. Thin per-tool consumers

Each tool owns only its axis projection, mandatory rows, expected invariants, execution, and verdict.
There is no shared appearance matrix loop.

Snap uses the full 36 executable appearance axes plus manifest dependencies, actual theme/catalog
source and polarity, carried scope, OS scheme, application and OS reduced motion, contrast, reduced
transparency, full desktop/mobile environment, and reached shell/portal/art/message subjects. The old
matrix ids become explicit `os-*` ids so an OS scheme cannot masquerade as an application theme.

Design-audit projects only full environment/viewport, actual theme, the 36 executable appearance axes,
and pointer/hover. It preserves #976's exact subject accounting and adds actual environment evidence.

Motion-audit projects only scenario, application reduced motion, OS reduced motion, and full
desktop/mobile environment. Its existing performance budgets, trace window, and reduced-motion
semantics do not change.

## Mandatory Snap rows

These seven rows come from the CSS census and are coverage obligations, not screenshot names:

1. compact density × portal surface × carried ThemeScope;
2. effective dark polarity × name/time chrome × short bubble;
3. Light or a legal custom mid-light theme × art/scrim × glass/elevation;
4. mobile/coarse-pointer descriptor × compact density × large text/document;
5. hover actions × short bubble × fine/hover, with a coarse/focus delta twin;
6. compact-to-comfortable preview × portal × overlay;
7. OS scheme crossed against the opposite application polarity × prepaint-to-hydrated state.

They participate in pair coverage and minimization. They are not appended after planning and cannot be
silently skipped because a fixture failed to reach the named subject.

## Exact expected population and runtime

Against the current live contracts the implementation must assert:

- Snap: 19 cells;
- design-audit: 10 cells;
- motion-audit: 6 cells;
- total: 35 cells.

This sits inside the authority's ruled 31–37 representative range. The expected cold runtime is
10–14 minutes and warm runtime is 6–9 minutes. These numbers are source assertions derived by the
planner tests, not magic runtime padding. A new carrier or changed legality rule must produce a test red
and a reviewed expectation change.

## Invariant joins and verdicts

### Denominator honesty

Every cell reports declared, reached, sampled, explicitly skipped, occluded, and off-viewport subjects.
Declared and reached must be nonzero. Every declared required subject is either sampled or assigned one
closed classification; any unexplained remainder is `INSTRUMENT ERROR`. A late retry cannot replace a
failed colder denominator.

### Dead and empty CSS

Extend Snap's existing dead-CSS path with explicit sheets/rules/defined/used/unreadable denominators.
`@orb/kit/dead-css` remains tokenizer and marker authority. Expected cell-to-cell deltas are declared by
the thin consumer. An unexplained added or removed dead/empty selector is red even when the total count
is unchanged.

`motionFlaggersSettled()` remains the initial-scan promise. Add a monotonic post-settlement drain marker
for later style/class mutation batches. The matrix waits for the marker associated with its own drain;
it cannot interpret the initial promise as proof that a late injection was classified.

### Merge and cascade truth

Consume #949 merge receipts and assert expected loser-to-winner changes rather than selector presence.
Consume #975's official DevTools SDK Active/Overloaded result and exact winner/source changes for:

- ThemeScope inline tokens;
- grid and portal background owners;
- custom theme and owner custom CSS;
- scrims;
- glass/elevation;
- dialog popup/stacking variables;
- carried scopes;
- dialog-avatar-over-art composition.

A same computed value from the wrong rule or source is red. No local specificity approximation can
override or substitute for the official SDK result.

### Theme, art, and geometry

Every theme cell proves requested/resolved/root/subject identity, source, and polarity. A fake
`data-theme`, late swap, unknown catalog source, or carried-scope misattribution is instrument error.

Art and scrim verdicts use composited pixel evidence, not CSS-color sampling through translucent
layers. Geometry uses relational invariants between owned subjects; it does not compare arbitrary
whole-screen pixels.

## Red-first and planted controls

The shared planner suite must first fail for a missing reachable pair, impossible mandatory triple,
duplicate axes/values, nondeterministic declaration order, accidental full-product expansion, and a
same-count cell replacement. Its positive fixture produces exactly the expected minimized cells.

Theme controls cover OS-light with dark application theme, fake root `data-theme`, unknown catalog
entry, carried override, a late theme swap, and an accepted custom mid-light polarity.

Dead/empty CSS controls cover a used selector mislabeled dead, an empty rule that becomes used, expected
versus unexpected deltas, an unreadable sheet that must stay explicit, a late-defined class that clears,
and a never-defined class that remains red. A 97-node mid-drain plant prevents a time-threshold or
single-mutation implementation from passing.

Cascade controls include a wrong-winner/same-computed-value twin, custom CSS on/off, and the exact
scrim/art/portal/grid source transitions. Browser controls retain #977's viewport-only counterfeit and
add both-direction contrast and reduced-transparency mismatches. Motion controls cross application and
OS reduced-motion independently and preserve every existing budget.

## Coupled-site ownership

Shared/client leg:

- new `tooling/src/_shared/variant-matrix.ts` and its tests;
- `tooling/src/_shared/appearance.ts`, `browser.ts`, `browser-environment.ts`, and `theme.ts`;
- `packages/client/src/lib/appearance-carrier-manifest.ts`, `agent-bridge.ts`, and
  `motion-dead-class-flagger.ts`;
- `tests/client/lib/appearance-carrier-manifest.test.ts`, `agent-bridge.ct.tsx`, and
  `motion-flaggers.ct.tsx`;
- `tests/tooling/_shared/browser.int.test.ts` and focused shared tests.

Snap leg:

- replace `tooling/src/snap/ops/matrix.ts`;
- add narrow `tooling/src/snap/ops/matrix-contract.ts` and `matrix-verdict.ts` only if their logic
  would otherwise mix planning, execution, and verdict in one file;
- update `contract/types.ts` and `ops/capture.ts`, `dead-css.ts`, `manifest.ts`, `report.ts`, `run.ts`,
  `scenario.ts`, and `verdict.ts`;
- update `tests/tooling/snap/index.test.ts`, `cli.int.test.ts`, and
  `cascade.suite.int.test.ts`; add `matrix.test.ts` for pure planning/contract controls.

Design-audit leg:

- add `tooling/src/ui-audit/ops/matrix.ts`;
- update its contract, parser, runner, CLI, and owning integration tests;
- touch `tests/tooling/design-audit-walker.ct.tsx` only if the reached-subject contract requires it.

Motion-audit leg:

- add `tooling/src/motion-audit/ops/matrix.ts`;
- update its contract, parser, runner, report, CLI, and owning integration tests.

Documentation leg:

- this design document plus the generated D139 catalog receipt only;
- no product CSS, token values, seed themes, custom theme records, or custom-CSS behavior changes.

## Build and commit sequence

A. Shared planner, live bridge contract, theme catalog, and environment fields with pure and browser
controls.

B. Post-settlement dynamic-class drain generation and barrier.

C. Snap's 19-cell consumer with dead/empty, merge, cascade, theme, art, and accounting verdicts.

D. Design-audit's 10-cell thin consumer.

E. Motion-audit's 6-cell thin consumer.

F. Cold rated matrix, Side-eye review for the user-visible evidence surface, one stable-tree normal hook,
and D139 content-then-attestation cycle.

Each leg is a separate commit and runs the focused behavioral suite that owns it. The full-tree battery
belongs to the orchestrator. The normal hook runs once after the shared tree is stable. Because D139's
`verifiedCommit` must name the exact committed design blob, the final design/catalog state uses the
approved honest two-phase content commit followed by a normal-hook attestation commit; no SHA is invented
before the content exists.

## #953 versus #933

All remaining implementation above belongs to #953. #933 owns only final program reconciliation:
validate the landed child SHAs, run the grouped barrier at one stable commit, record residuals, and close
the umbrella. It must not add another generator, axis list, cascade evaluator, or token gate.

There is no unresolved architecture fork. Any discovered need to change theme-engine semantics, custom
CSS precedence, product token values, or the ruled 31–37 population is a stop-and-escalate event rather
than an implementation convenience.
