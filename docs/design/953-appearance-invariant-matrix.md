---
kind: design
status: active
updated: 2026-09-01
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
- \#976's exact subject-accounting and requested/resolved theme proof;
- \#977's requested/applied/actual device, viewport, screen, user-agent, DPR, touch, pointer, and
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
   declaration order breaks ties. The completed seed is only a candidate: rows and twin sides remain
   semantic membership obligations, so minimization may replace that completion with any cell that still
   contains the required partial assignment.
3. While a reachable pair remains uncovered, seed the lexicographically first pair and greedily
   complete the row by the same rule.
4. Walk non-mandatory cells in reverse insertion order and delete a cell only when every reachable
   pair, mandatory row, and twin remains covered.
5. Recompute the receipt from the final cells and refuse if any obligation disappeared.

Null axes, empty value sets, duplicate identities, unreachable mandatory requirements, uncovered
pairs, nondeterministic output, or a same-count replacement that drops semantic membership are
`INSTRUMENT ERROR`. The planner has no null padding and no fallback value. A changing live contract
must change the exact expected cell-count assertion through review.

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

The old message-prop observable pointed at a hidden `appearance-message-carrier` output that exists only
in a CT story. That is not a live carrier. Each mounted real `MessageRow` now registers the exact
appearance props it received in a dev-only client registry; unmount removes that instance, and a tokened
unregister cannot erase a newer registration for the same virtualized row. The existing
`appearanceMatrixContract()` bridge samples this registry for message-prop rows while retaining the real
`[data-slot="message-row"]` selector for geometry. Absence, stale-unmounted state, multiple mounted rows,
and actual nested values are planted controls. A hidden DOM output, a tooling-owned message roster, and
production data attributes carrying serialized settings were rejected because each would let the test
fixture or the instrument claim a value the live prop thread did not render.

The existing two-arm client CT matrix remains a carrier-liveness test. It is not duplicated or renamed
as the representative runtime matrix.

### 3. Theme and environment evidence remain actual

Extend the existing shared theme resolver to retain the actual `settings.listThemes` catalog and
classify every resolved theme as seed/custom plus effective light/dark/mid polarity. Required seed,
custom-light, and custom-dark capabilities are discovered from that catalog. If a rated fixture lacks a
required capability, the matrix refuses; it never invents a theme id or judges a misspelled name.

The cold rated Snap and design-audit arms may provision those two custom capabilities only after
`--isolated`, `--dirty`, or `--ref` has selected Snap's throwaway staged database. One shared
`_shared/rated-theme-fixture.ts` authority drives the real owner-scoped
`settings.createTheme` procedure, records the exact returned ids, and removes those exact ids in a
`finally` block through `settings.removeTheme`; a final authenticated catalog read must prove both ids
absent. Shared-base runs never mutate an account and loudly refuse a missing capability. A killed run
can leave rows only in the disposable stage database. Reusing the multi-user fixture as a permanent
theme catalog, mutating the operator's account and fabricating catalog rows in the shim were rejected:
the first makes fixture state drift, the second crosses the ownership boundary, and the third does not
exercise the theme engine or custom CSS at all.

The exact two returned entries also flow into both thin planners as the preferred custom-light and
custom-dark representatives. Each planner joins those ids back to the authenticated discovery catalog
and refuses a missing id, wrong polarity, or missing custom CSS. It never sorts the whole staged custom
catalog and selects an older cached row: cleanup ownership and rated evidence must name the same themes.
The seed representative remains derived from the authenticated seed capability because the fixture does
not own seed rows. A stale lexicographically earlier custom-theme plant proves it cannot displace either
minted id; a counterfeit preferred id fails loud.

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
semantics do not change except for the owner-ruled Base UI height-lifecycle classification below. The rated interaction reaches the current Appearance pane with
`--goto settings:appearance` and measures its primitive-owned “Customize this look”
`[data-slot="collapsible-trigger"]`; the retired shell settings trigger is not a subject. One
matrix-only exception is explicit: the exact reduced-app + reduced-OS
mobile entry cell may report `STATIC-EXPECTED` when it produces no frame because the required full-app
and full-OS mobile interaction control proves the same route/window/throttle apparatus sees a nonzero
frame population. Every other zero-frame arm retains #409's `INSTRUMENT ERROR` law.

The cold six-cell receipt intentionally does not turn product reds into matrix debt. The disclosure
interaction's height/layout work is the exact #824 stock Base UI Collapsible finding, accepted by the
owner unless physical-device jank is measured. The no-click desktop entry arm's 0.183331
non-virtualized shift is owned by open Config responsive/performance closeout #982, whose post-matrix
composition receipt explicitly includes the advanced fold. Both remain ordinary red cell verdicts;
neither is suppressed or relabelled as instrument failure.

### 5. Attribute Base UI lifecycle motion without a blanket exemption

The active-animation bridge currently loses the evidence needed to distinguish the owner-accepted
\#824 Collapsible recipe from an application-authored or unattributed layout animation: it reports only a
target label, keyframe properties, and compositor cleanliness. The tracked authored client/UI census is
19 `data-starting-style` and 17 `data-ending-style` literals across 1,596 TS/TSX/CSS files (13/13 live
Tailwind variant tokens; the remainder are explanatory comments). The 825 tracked tooling TS/TSX/CSS
files contain no reference to either attribute or either camel-case state name. Base UI's vendored
animation contract owns those two attributes as the initial/final state for cancellable CSS transitions,
and uses the element's live animations to delay unmount.

The first browser implementation derived attribution from those attributes at the *end* of the audit
window. A real 100ms Appearance disclosure probe refuted that design: Chromium still reported the
active height `CSSTransition`, but Base UI had already removed `data-starting-style`, so the bridge
misclassified the stock lifecycle as application-owned. The attribute is launch provenance, not a
sampling-time identity. Raising the sample rate or retaining an attribute for an arbitrary grace period
would replace one race with a timing threshold.

`AnimationRecord` therefore keeps the target's two live state booleans as diagnostic truth and adds a
separate launch-state observation. The dev bridge installs one document-scoped recorder before the
audit interaction. A mutation observation records the exact Base UI state transition; the subsequent
`transitionrun` binds that observation to the actual `CSSTransition` object returned by the target. The
pending target observation is consumed immediately after binding, while the animation-keyed evidence
lives in a `WeakMap` for exactly that browser animation object's lifetime. Final sampling can thus report
both “the attribute is gone now” and “this animation launched from starting-style” without a timeout,
selector roster, or permanent product marker.

The explicit attribution is:

- `base-ui` only for an actual CSS transition bound at `transitionrun` to exactly one observed Base UI
  starting/ending lifecycle state; its mechanism is the matching starting- or ending-style phase;
- `application` for a CSS transition or CSS animation without that lifecycle proof;
- `unattributed` for WAAPI/unknown animations or effects without a live element target.

The tooling type keeps these fields optional only because `--ref <old-sha>` can legitimately read a
pre-attribution bundle. Missing fields are classified as unattributed, never clean. A record claiming
`base-ui` while its mechanism/launch-state tuple disagrees is an evidence gap rather than a budget pass.
The live state may legitimately be false/false by the final sample and never substitutes for the bound
launch observation.

The raw active and non-compositor-clean counts remain unchanged. A separate classified count removes
from the dirty budget only an exact Base UI lifecycle CSS transition whose sole animated property is
`height`, matching the owner-accepted stock Accordion/Collapsible recipe. Every other Base UI dirty
property, every application-owned dirty animation, and every unattributed/legacy dirty animation remains
an ordinary failure. The machine line prints raw dirty, sanctioned library-owned, and budgeted dirty
counts so the exception cannot erase the observed population.

Rejected alternatives:

1. Treat every target carrying a Base UI state attribute as clean. That would silently excuse unrelated
   paint/layout properties added to a popup, drawer, or toast under the same lifecycle.
2. Hard-code component selectors in motion-audit. The browser already observes the vendor-owned live
   lifecycle and animation mechanism; a selector roster would be a second, stale product table.
3. Stamp a new production owner attribute on every primitive. That duplicates a live vendor state signal
   solely for the instrument and fans a policy change through unrelated product wrappers.
4. Infer ownership from `height` alone. An application-authored height transition is exactly the negative
   control and must remain red.
5. Classify from the state attributes at the final audit sample. The live 100ms control proved those
   attributes can settle before the corresponding `CSSTransition` ends.
6. Keep a recently-seen target or time-window allowance. That can leak attribution into a later
   application transition on the same element; consuming the launch observation and binding the actual
   animation identity gives the required lifetime without a guessed clock.

The planted controls are: a Base UI starting/ending height transition that preserves raw dirty count but
leaves zero budgeted dirty animations; an application-owned height transition; an unattributed legacy
record; an unsupported Base UI dirty property; and a counterfeit Base UI owner/mechanism/state tuple.
Only the first is sanctioned. A browser-level control exercises the real `CSSTransition` constructor,
removes the state attribute before sampling, and then starts a second same-target application transition
to prove the consumed observation cannot leak. The pure counterfeit omits or contradicts launch evidence
even when its final-state booleans look plausible.

Three cold Snap cells once surfaced Chromium's native `TimeoutError: Transition was aborted because of
timeout in DOM update` while their app-ready path was blocked for 6.282–9.252 seconds. The common arm
was desktop + OS reduced motion, not an Appearance/theme value. Two exact seed-cell replays (all 36
Appearance assignments plus actual OS/transparency identity) completed with zero page errors after the
stage warmed. That lead is therefore retracted as non-reproduced cold Vite/main-thread starvation, not
silenced in the verdict; the final cold matrix must still prove the population again.

## Mandatory Snap rows

These seven rows come from the CSS census and are coverage obligations, not screenshot names:

1. compact density × portal surface × carried ThemeScope;
2. effective dark polarity × name/time chrome × short bubble;
3. Light or a legal custom mid-light theme × art/scrim × full-transparency glass/elevation;
4. mobile/coarse-pointer descriptor × compact density × large text/document;
5. hover actions × short bubble × fine/hover, with a coarse/focus delta twin;
6. compact-to-comfortable preview × portal × registered command dialog;
7. OS scheme crossed against the opposite application polarity × prepaint-to-hydrated state.

They participate in pair coverage and minimization. They are not appended after planning and cannot be
silently skipped because a fixture failed to reach the named subject.

R5 preserves the actual pointer contract in both directions: fine/hover starts at `opacity:0` with no
pointer events and reveals to `1/auto`; coarse/no-hover starts at `1/auto` and remains there through the
named focus drive. Both endpoints must retain the same footprint and judge the same short bubble.

## Exact expected population and runtime

Against the current live contracts the implementation must assert:

- Snap: 16 cells;
- design-audit: 13 cells;
- motion-audit: 6 cells;
- total: 35 cells.

The implementation supersedes the preliminary 19/10 estimate with source truth: 36 derived executable
Appearance axes, five dependencies, every mandatory historical row/twin, zero uncovered pairs, and
unique deterministic cell identities minimize to 16 Snap and 13 design-audit cells without freezing the
first exact completion of a semantic obligation. Snap grew from 14 to 15 when the R5 pointer twin was
corrected to require the same short `readingBodyScale=0.8`, `readingLineHeight=1.2` message subject in both
directions: without that semantic membership, the mobile arm could make every visible header sticky or
leave no ordinary action bubble in the viewport and judge a different population. This is a mandatory
twin correction, not a generic count target. It grew from 15 to 16 when R3's glass obligation was bound
to full transparency: reduced transparency intentionally makes the surface solid and therefore cannot
judge a glass-winner invariant. The 35-cell total remains
inside the authority's ruled
31–37 representative range. The expected cold runtime is
10–14 minutes and warm runtime is 6–9 minutes. These numbers are source assertions derived by the
planner tests, not magic runtime padding. A new carrier or changed legality rule must produce a test red
and a reviewed expectation change.

## Invariant joins and verdicts

### Construction correction after the #933 cold audit

The representative planner and the three execution loops are necessary but not sufficient: a cell exit
is not an appearance verdict unless the cell also returns its subject evidence to the owning aggregate.
Snap therefore keeps its public numeric `snap`/scenario CLI contract and adds an internal detailed run
door whose result contains that same code plus the in-memory capture and invariant receipts. The matrix
consumes that door directly; it must never recover truth by parsing a just-written JSON artifact or by a
process-global callback.

The thin Snap consumer derives selectors and signals from the live Appearance/theme carrier contract and
adds policy only for the seven historical rows below. Each policy row declares the exact carrier,
cascade, pixel, and relational samples it owes. One evaluator reconciles every declared subject as
sampled or as one explicit closed classification (`skipped` with reason, `occluded`, or `off-viewport`).
Required historical subjects do not become clean merely because their classification is closed: absence,
occlusion, off-viewport, an unreadable sheet, or an unsampled required floor still reddens the strict cell;
an accounting remainder is an instrument error.

Dead/empty CSS remains Snap capture evidence, but its receipt grows the sheets/rules/defined/used/
unreadable populations and the monotonic post-settlement flagger-drain generation. Ordinary Snap and
scenario verdicts consume the finding counts directly. Matrix cells additionally compare identities, not
only totals, so a same-count replacement cannot pass. Cascade capture remains the official DevTools SDK
rail and the unchanged merge bridge: the matrix supplies bounded queries before browser launch, then
checks the expected Active winner and owning source. No specificity approximation or second cascade
engine is permitted.

The official SDK observer must also preserve the cell's requested media after it detaches. Inspector
teardown can clear emulated media after the SDK query has already returned, so an immediate equality
read is not sufficient. The shared runtime reapplies the exact media slate and requires it to remain
byte-equivalent through a bounded post-detach stability window; a delayed clear forces another apply,
and exhausting the bounded attempts is an instrument error.

The remaining historical floors are direct browser observations, not a generic whole-page audit:
carrier signal resolution; composited framebuffer samples for attribution/timestamp, panel ink, and
theme ink; owned rect containment/overflow/touch/stacking; and the existing `__orb.motion()` layout-shift
receipt. Structural art/scrim layers are geometry and cascade subjects rather than fake text-contrast
targets. Their declared/reached/sampled populations land in the same cell receipt and therefore the same
strict exit. The aggregate reconciles subject declarations, candidate/reached/skipped populations,
sampled/occluded/off-viewport dispositions, pixel declarations/samples, and nonzero cascade receipts.

### Scenario composition remains a distinct evidence mode

Before #953, `--matrix --scenario <json>` was a supported composition: the same scenario ran once per
matrix environment. The rated rewrite accidentally made the old `runScenarioDetailed` branch unreachable
by adding a parser refusal. The capability remains valid, but scenario checkpoints cannot honestly claim
the R1–R7 receipts: their routes, actions, and subjects belong to the input JSON rather than to the seven
literal drives.

The restored mode therefore uses the same live contract discovery, rated-theme fixture, derived
Appearance assignments, full device/media assignments, planner cells, and per-cell output naming as the
ordinary rated matrix, but carries a different evidence discriminator:

- `route-invariants` requires the exact R1–R7 row/twin population and the appearance aggregate below;
- `scenario-checkpoints` marks R1–R7 `not-applicable: scenario-owned-drive` and requires each cell's
  detailed scenario receipt to name a nonzero declared checkpoint population, capture every declared
  checkpoint exactly once in order, retain actual browser/settings evidence, and retain the per-cell JSON
  manifest path whenever `--json` was requested.

The matrix receipt records the discriminator and the per-cell applicability. A zero checkpoint
population, declared/captured mismatch, missing cell receipt, missing requested manifest, or accidental
R1–R7 appearance receipt in scenario mode is `INSTRUMENT ERROR`; a scenario's own navigation, assertion,
CSS, console, page, request, or environment red remains an ordinary cell violation. The aggregate reports
scenario cells and declared/captured checkpoints instead of publishing zero-valued appearance
denominators as if they had been measured.

Rejected alternatives:

1. Remove the dead branch and permanently refuse the composition. That regresses a shipped CLI
   capability proven at `daafa3e55^` and discards the legitimate use of one behavioral journey across
   the derived environment/Appearance cells.
2. Pass every cell's R1–R7 rows into `runScenarioDetailed`. An unrelated checkpoint could then satisfy a
   selector by coincidence, or fail a row whose required drive never ran, while the aggregate falsely
   advertised rated historical coverage.
3. Re-open the per-cell JSON after each run. The detailed scenario result already owns the in-memory
   checkpoint receipt and manifest path; reparsing artifacts would duplicate the callback/JSON bus that
   the detailed-run architecture deliberately removed.

### High-risk drives are reusable tapes, not another matrix loop

The shipped `orb-app.json` scenario is a route census. It does not preserve the two behavioral journeys
that repeatedly expose the seven historical Appearance rows, so restoring `--matrix --scenario` alone
would leave the rated-scenario obligation nominal rather than reusable. #953 therefore ships two named
JSON presets on the existing scenario rail:

- `appearance-shell-config` boots the shell first (so the opposite-OS/app prepaint arm remains a real
  boot observation), reaches the art-bearing shell, lands directly on the live `appearance.sizing`
  subcategory, and exercises the registered command-dialog close/reopen path without mutating settings;
- `appearance-chat` acquires the stage's latest chat and walks the short-header, mobile-document, and
  action-row surfaces without inventing hover input for a coarse device.

Checkpoint names are the client contract's seven historical row ids. A contract test parses the real
JSON, requires exact one-to-one membership with the live contract, requires every checkpoint to contain
a real navigation or interaction action, and refuses persistent-setting verbs. This membership proves
that an agent can replay the named high-risk journeys with one scenario invocation and one browser
lifetime per derived cell. It does **not** upgrade scenario mode into an R1–R7 verdict: the matrix receipt
continues to publish `not-applicable: scenario-owned-drive`, while route mode remains the only owner of
the literal subjects, winners, pixels, geometry, fine/coarse hover twin, and isolated density mutation.

The preset catalog is one tuple used by help and scenario path resolution; names are derived from that
tuple and the JSON supplies the ordered checkpoints. No second matrix, selector table, or copied
Appearance-axis roster is introduced.

Both named tapes owe the composed proof, not only a standalone smoke. The cold graduation receipts were:

- `appearance-shell-config --matrix`: 16/16 cells, 64 declared checkpoints, 64 captured checkpoints,
  16 requested manifests, zero failed cells, zero uncovered pairs;
- `appearance-chat --matrix`: 16/16 cells, 48 declared checkpoints, 48 captured checkpoints,
  16 requested manifests, zero failed cells, zero uncovered pairs.

Both receipts carry `scenario-checkpoints` and `not-applicable: scenario-owned-drive`. The standalone
4/4 and 3/3 tape smokes prove the JSON journeys themselves; they do not replace these composed
denominators. Route mode remains the only R1–R7 verdict owner.

Rejected alternatives:

1. Treat `orb-app.json` as the high-risk tape because it visits Home, Config, and Chat. That file proves
   route reach only; it neither closes/reopens the live portal nor names the seven obligations.
2. Add cell-conditional branches to scenario JSON so a fine cell can hover and a coarse cell can avoid
   it. The current format is ordered argv by design; such a branch language would duplicate the matrix
   planner and make the tape's behavior depend on a second environment interpreter.
3. Synthesize mouse hover in the coarse arm or persist a density choice from the tape. Both would make a
   superficially active scenario dishonest: the former contradicts the applied pointer contract and the
   latter can poison later cells. The existing route-mode twin and stage-local mutation guard own those
   proofs.

### Cold graduation receipts

The final staged runtime receipts use source-derived populations rather than preliminary estimates:

- Snap route matrix: 16/16 cells, zero failed cells, zero uncovered pairs, six mandatory rows, two
  mandatory twins, zero instrument errors, and zero Appearance violations. Accounting reconciles
  156 candidates as 148 reached plus eight closed skips; the 148 reached subjects reconcile as 85
  sampled plus 63 off-viewport, with zero occluded. It records five declared/five sampled composited
  pixels, 54 cascade receipts, two merge-required receipts, eight direct-carrier N/A receipts, and 61
  declared historical subjects across ten historical receipts.
- Design-audit matrix: 13/13 cells, zero failed cells, zero uncovered pairs, three required rows, two
  required twins, 17 reached contract subjects, and exact requested/applied/actual theme, viewport,
  device, pointer, hover, and touch identity. The existing P3 all-caps-body finding remains visible;
  non-required off-viewport pixel rows remain explicit NO VERDICT rather than being counted as samples.
- Motion-audit matrix: six cells, zero instrument errors, zero uncovered pairs, three required twins,
  and one exact `STATIC-EXPECTED` reduced-mobile candidate paired to its nonzero full-motion mobile
  control. Five ordinary product violations remain visible: four Appearance-disclosure style/layout
  LoAF cells owned by the #824 disclosure family and the #982 desktop-entry non-virtualized CLS
  `0.1833` cell. The matrix does not suppress or relabel either family.

The mounted bridge proof is seven CTs with zero failures; the appearance prepaint integration is five
tests with zero failures. The bridge lock retains the only `globalThis.__orb` assignment and both
compiler-exhaustive capability/ring registries in `agent-bridge.ts`; the appearance reader is the only
cohesive extraction.

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

A same computed value from the wrong rule or source is red. `Overloaded` source evidence is an exact
policy obligation where the shell elevation fill must lose to the active glass panel rule. Merge is
required only on the real configured merge call paths; directly carried R3/R5/R6/R7 subjects record
`merge-not-applicable: direct-carrier` with their source owner. A fake unrelated global merge receipt
cannot satisfy a subject. No local specificity approximation can override or substitute for the official
SDK result.

### Theme, art, and geometry

Every theme cell proves requested/resolved/root/subject identity, source, and polarity. A fake
`data-theme`, late swap, unknown catalog source, or carried-scope misattribution is instrument error.

Art and scrim composition uses a real visible ink subject sampled from the framebuffer over those
layers, not CSS-color arithmetic through translucency. Geometry uses relational invariants between owned
subjects; it does not compare arbitrary whole-screen pixels. R2 additionally reconciles bubble/name/
attribution/timestamp populations; R6 proves only the preview token vector changes while outer scope and
dialog-popup vectors remain byte-stable.

The #866 Config source no longer has a settings overlay. R1/R6 therefore enter the real Appearance group,
activate its `Sizing & motion` subcategory, and use the registered command dialog as the portal/popup
subject. R1 samples it once. R6 samples the dialog and preview, Escape-closes it, toggles the opposite real
density control without saving, reopens that same dialog, and then compares preview, outer-scope, and popup
tokens. This preserves the portal-isolation obligation without resurrecting a retired product surface or
inventing a hidden test carrier. Both rows are explicitly assigned to the full mobile/coarse-pointer
descriptor and land directly in the supported subcategory; mobile reach is a contract obligation rather
than a planner coincidence. R3 remains desktop-only because its subject is the desktop list-panel art
carrier, not Config sizing.

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
add both-direction contrast and reduced-transparency mismatches. Prepaint controls reject a missing
pre-document sample, an intermediate/default theme, a late swap, and recorder overflow. Motion controls
cross application and OS reduced-motion independently: `STATIC-EXPECTED` requires requested/applied/live
app carrier identity (`reached=1`, exact `samples=["true"]`), exact reduced OS and full mobile identity,
nonnull motion/trace evidence, zero raw/classified/budgeted frames with null percentages, zero active
animations/page/step/reach failures, and green LoAF/CLS/style budgets. Its paired full-motion control must
carry exact `samples=["false"]`, execute the selector, and observe trace events plus nonzero frames.
Counterfeit identity or an empty control is instrument error; a control budget breach stays a violation;
a candidate that produces frames keeps the ordinary verdict.

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
- literal R1–R7 policy lives only in `packages/client/src/lib/appearance-invariant-manifest.ts`; Snap's
  `appearance-invariant-*.ts`, structured contrast receipt, and prepaint reconciler consume that live
  bridge contract rather than copying selectors.

Design-audit leg:

- add `tooling/src/ui-audit/ops/matrix.ts`;
- update its contract, parser, runner, CLI, and owning integration tests;
- touch `tests/tooling/design-audit-walker.ct.tsx` only if the reached-subject contract requires it.

Motion-audit leg:

- add `tooling/src/motion-audit/ops/matrix.ts`;
- add the narrow `matrix-contract.ts` and `matrix-verdict.ts` policy doors;
- update its contract, parser, detailed runner, pure report evaluation, CLI, and owning tests while
  preserving the numeric single-run wrapper and ordinary zero-frame law.

Documentation leg:

- this design document plus the generated D139 catalog receipt only;
- no product CSS, token values, seed themes, custom theme records, or custom-CSS behavior changes.

## Build and commit sequence

A. Shared planner, live bridge contract, theme catalog, and environment fields with pure and browser
controls.

B. Post-settlement dynamic-class drain generation and barrier.

C. Snap's 16-cell consumer with dead/empty, merge, cascade, theme, art, and accounting verdicts.

D. Design-audit's 13-cell thin consumer.

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
