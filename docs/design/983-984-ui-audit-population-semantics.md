---
kind: design
status: active
updated: 2026-09-04
---

# UI-audit population semantics (#983 and #984)

> **THE DOOR MOVED (#1315, 2026-09-04).** Every `$ pnpm design-audit …` transcript below names a retired
> command and is a DATED RECEIPT — the command that produced the output printed under it — left
> verbatim for that reason.
> The spelling to TYPE today is `pnpm snap <route> [flags] --design-audit`: same walker, same rule
> engine, same printed blocks, one argv door. Everything this document rules about populations,
> withholding and the rest/driven regimes is unchanged.

Status: implementation contract for the two instrument repairs that must precede #953's appearance
matrix acceptance. #983 lands first as the tap-target population contract. #984 then repairs the six
relational families against that stable reporting vocabulary. Neither issue changes product markup,
WCAG floors, the OKLCH/alpha backdrop resolver, or the content-driven cohort exclusion.

## Ruled boundary

A rendered instance is not automatically an authored decision. Repeating one undersized primitive in
twenty cards is one repair with an affected population, while two controls with different authored
structural homes remain two repairs. Likewise, a relational rule may compare elements only when the
page declares their relation through HTML, ARIA, component slots, state carriers, or a shared platform
surface. Visual proximity and global extrema are not relations.

Every capped family publishes five different facts:

- `candidates`: subjects that entered the family's structural census;
- `judged`: candidates for which the required relation and measurement existed;
- `emitted`: representative sample or finding rows retained after the cap;
- `withheld`: applicable candidates not judged because required evidence was unavailable, partitioned by
  reason, plus judged rows omitted only by the cap;
- `excluded`: candidates reached by the structural census and then proved outside the rule's semantic
  population, partitioned by a closed rule-owned reason.

These are evidence, not finding counts. A clean rule with a partial population must not print like a
complete clean rule.

## #983 chosen architecture: classify, suppress, group, cap

The interactive walker continues to measure every reachable offered target under the existing
fine/coarse floor and hit-extent rules. Each `TapTargetInput` additionally carries facts derived from
the live DOM:

- a per-walk target identity and its nearest interactive ancestor identity;
- an authored target signature from tag, explicit/implicit role, input type, `data-slot`, and declared
  variant attributes;
- an authored structural-home signature: the target's position-free chain to the nearest stable
  `data-slot`, explicit role, or labelled landmark/region. Repeated sibling instances share this
  signature; positional selectors and `nth-of-type` never enter it.

Node-side collection applies `checkTapTarget` first so the existing pointer-dependent floors and
truncation withholding remain the only size verdict. It then:

1. suppresses a failing descendant only when a failing interactive ancestor already owns the same
   floor decision;
2. groups remaining failures by `(authored target signature, authored structural home)`;
3. emits one finding per group with affected/judged totals and a bounded selector list;
4. retains complete structured population evidence on the finding and in the audit artifact.

The representative cap bounds presentation only. It never truncates the judged population and never
changes exit status. A group with zero representatives, affected subjects exceeding judged subjects,
or inconsistent suppressed/capped arithmetic is an instrument error, not a clean result.

Rejected alternatives:

- Outermost-only filtering: it removes nested duplicates but leaves repeated sibling instances, the
  dominant live failure class.
- Selector normalization: `[data-slot=button]` spans unrelated variants and homes; stripping
  `nth-of-type` alone invents equivalence from CSS serialization.
- Grouping on geometry: equal sizes do not prove one authored decision, and one decision can render
  different widths while sharing the same undersized short side.
- Capping raw samples in the walker: that destroys the denominator before the verdict layer sees it.

## #984 chosen architecture: declared relations and explicit accounting

The existing cohort and region walkers stay fact gatherers, but each capped family keeps scanning
after its representative array reaches the cap and returns population accounting.

### Row void

A wide flex/grid row is judged only when its flanks carry an actual label/control binding. Accepted
bindings are HTML `label[for]` to the right-hand control or the control's `aria-labelledby` tokens to
the left label (including a labelled descendant inside the left flank). Text adjacency is never a
binding. This preserves Base UI `Field` rows and rejects a title plus topbar actions.

### Quiet state

ON and OFF extrema are computed inside compatible authored cohorts, never globally. A cohort key joins
the control's author signature, declared variant carriers, nearest structural home kind, and resolved
backdrop. A cohort is judged only when both visible states exist and both fills resolve. This prevents
cross-family, cross-variant, and cross-backdrop comparisons while preserving the current OKLCH and
alpha-composited contrast computation byte-for-byte.

### Empty state

Each visible empty-state root belongs to its nearest declared surface: labelled region, tabpanel,
dialog, landmark, or `main`. Independent labelled regions produce independent samples. An action counts
as a door only when the action slot is visible and contains a visible, enabled, non-inert interactive
control. A hidden or disabled descendant is not a route out.

### Selection idiom

The walker first pairs selected elements with compatible unselected siblings in the same authored
cohort. A signature contains only channels whose selected computed style differs from the twin:
outline, outer shadow, fill, border rail/box, and underline. Absolute base paint is ignored. The rule
then aggregates treatment deltas across the whole surface's declared state vocabulary instead of
partitioning the vocabulary by `checked`, `selected`, `current`, `pressed`, or `active`. Elements with no
compatible twin are explicitly withheld.

### Pane ink

Pane occupancy uses actual designed subjects, not childless text elements. Text is measured from
visible text ranges; media/replaced elements, visible operable controls, and descendants with authored
background/border/shadow paint also contribute their rendered boxes. Layout-only wrappers do not.
The sample reports designed-subject and text-subject counts, and the finding says where designed
content ends.

### Capped relational censuses

`cohort-anatomy`, `row-void`, and `pane-ink` each return candidate/judged/emitted/withheld accounting.
The cap is applied only after the full scan has computed totals. The report prints the accounting and
the JSON receipt retains it. Cap arithmetic is checked before classification so a missing or partial
counter cannot become silence.

Rejected alternatives:

- Product selector tables: they would make the generic instrument pass only the current Config DOM.
- Global state maxima: the comparison is cheap but semantically unowned.
- Classifying any `empty-state-action` descendant as a door: hidden and disabled controls are not
  operable exits.
- Treating any descendant box as pane ink: full-height layout wrappers recreate the original 100%
  false clean.
- Narrowing messages without widening evidence: the shipped rules explicitly promise relational
  verdicts, so silently reducing them to leaf-text observations would preserve the blind spot.

## Coupled-site inventory and ownership

\#983 owns:

- `tooling/src/ui-audit/contract/samples-interactive.ts`
- `tooling/src/ui-audit/contract/findings.ts`
- `tooling/src/ui-audit/ops/walker/census-interactive.ts`
- `tooling/src/ui-audit/lib/checks-a11y.ts`
- `tooling/src/ui-audit/lib/collect.ts`
- `tooling/src/ui-audit/ops/run.ts` and `ops/report.ts` only for structured/printed accounting
- focused CLI fixtures under `tests/tooling/ui-audit/`

\#984 owns:

- `tooling/src/ui-audit/contract/samples-layout.ts` and the `RawSamples` join
- `tooling/src/ui-audit/ops/walker/census-cohort.ts`, `census-region.ts`, and `returns.ts`
- `tooling/src/ui-audit/lib/checks-structure.ts`, `checks-color.ts`, and `checks-quality.ts`
- the same report/artifact accounting door where #983 establishes it
- focused CLI fixtures under `tests/tooling/ui-audit/`

The issue commits are path-isolated from the parked #953 planner files. #953 later consumes the final
population evidence; it does not duplicate grouping or cap logic.

## Red-first and planted-control plan

\#983's real-CLI fixture proves four directions in one family: nested failures collapse to the outer
owner; repeated sibling instances become one population finding; two different authored homes remain
two findings; more than the representative cap prints a bounded selector set while preserving the full
affected/judged totals. A same-size sibling group in a different authored home is the anti-collapse
control. The historical RPG markup shape proves repeated `tracker-value-rest` instances collapse while
card-header, meter-row, condition, and generic-button homes remain separate.

\#984 adds each issue reproduction through the shipped CLI: an unbound topbar stays silent while the
explicitly-bound field twin fires; cross-surface quiet states stay silent while a compatible inverted
pair fires; independent labelled empty regions stay separate and hidden/disabled actions count as no
door; invariant base paint contributes no selection channel while three state kinds' real deltas are
aggregated; each cap exposes full accounting; bottom media/composed controls count as pane ink. Existing
positive fixtures remain the opposite-direction controls.

Focused graduation is the UI-audit CLI integration file plus the owning index/contract tests, scoped
types and static structure, then one live Config Appearance audit and one RPG/card fixture receipt.
Frozen finding counts are forbidden: assertions name populations, decisions, and accounting identities.

## #987 chosen architecture: one population settlement contract

The grouped review found that the vocabulary above exists without one settlement rule at the Node trust
seam. #987 closes that gap. Every rule-owned population row is valid only when every count is a finite,
non-negative integer and these identities hold:

- `candidates = judged + sum(withheld except cap) + sum(excluded)`;
- `affected <= judged`;
- `affected = emitted + withheld.cap + sum(collapsed)`;
- `populations <= affected`, with zero affected forcing zero populations and zero emitted.

`withheld` is reserved for applicable candidates the instrument could not judge and for the presentation-
only `cap`. `excluded` is reserved for candidates whose measured facts close the question by proving the
rule does not apply. Exclusion is complete evidence, never a population gap, but remains printed and
serialized so an N/A cohort cannot silently disappear from the denominator. An exclusion reason may not
stand in for a failed measurement: `unaskable`, unresolved paint, active animation, and a sufficiently
large one-sided state cohort remain withheld and therefore fail loud.

The surface-state axes obey the same polarity, and since #1122 (2026-09-02) they can PROVE an exclusion:
the shell publishes each pane's declaration as `data-panel-available` on the `.shell-panel` aside and
`__orb.shell()` carries `available: boolean | null` per panel row, so a mounted pane whose section declares
it unavailable excludes its whole mode space as `excluded(sectionDeclaresNoPane=N)`, and the focus axis
excludes as `excluded(sectionDeclaresNoPanes=N)` only when BOTH panes are declared absent (the focus toggle
does not render on a pane-less section, so `focus:on` is unreachable by construction). A declaration that
is absent (`null`) is never guessed into `true`: the census refuses the run (exit 2, printed reason). The
"never guess into excluded" ruling survives — its input became a measured fact. On the RESULT line
`NO-VERDICT` belongs to WITHHELD alone; an excluded axis prints `excluded` (its own label — `complete`
would claim the run visited a space with no members), which also corrected the unmounted-shell arm.

`off-grid-text` (Law 4 of the integer-line-box law) carries a closed reason set since #1156 (2026-09-02):
`excluded(srOnly, readingSurface, snapped)` · `withheld(srOnlyUnreadable, unmeasurable)`. `srOnly` is the
second rule-owned reason shared across two families (the typography and caveat rules already emit it) and
is read from ONE in-page predicate (`srOnlyText`, `walker/core.ts`), tri-state: a screen-reader-only node
paints no pixels and is excluded; a node whose box cannot be read is withheld and the run has NO VERDICT;
never a silent drop — `candidates` is unchanged by the exclusion.
An authored target already adjudicated by the same ancestor decision is not unjudged; it is recorded in
a separate `collapsed` reason map. This keeps a legitimate same-owner collapse from turning a complete
audit into a false partial result while preserving exact arithmetic for every rendered target.

Any non-cap withholding makes the rule's verdict incomplete. A run containing such a row prints the full
population evidence and an explicit `NO VERDICT`/instrument error, never `no findings — clean`, and exits
non-clean. Cap withholding remains complete because the full population was judged and only presentation
was bounded. Invalid arithmetic fails before classification; malformed counters cannot be normalized or
silently accepted.

### Previously silent state cohorts

Selection and quiet-state census candidates are authored cohorts, not only successfully paired samples.
A cohort with both compatible sides and resolvable evidence is judged. A one-element selection group is
below the minimum population for any selected/unselected comparison and is explicitly excluded as
`insufficientPopulation`; it is not evidence that a comparison failed. A group with at least two state
carriers but only selected or only unselected members is large enough to assert an authored cohort, so its
missing opposite twin remains withheld. ON-only/OFF-only quiet-state cohorts and unresolvable paint remain
withheld because their rule already has enough population to ask the contrast question but lacks the
opposite state or measurement. Clean negative controls assert the rule-owned partition rather than family-
dispatch totals.

Row-void likewise distinguishes a structural prefilter from the rule population. A wide title/actions
topbar reaches the flank census, but a completed binding search proves it is not a form row; it is recorded
as `excluded.unbound`, not `withheld.unbound`. A label/control pair whose binding exists but whose geometry
cannot be measured would remain withheld. Obscured targets whose centre cannot be asked of the compositor
remain `withheld.unaskable` because they are applicable targets with missing measurement evidence.

Animating cohorts are likewise withheld rather than emitted as samples and later declined by the
classifier. Only animations whose `playState` is `running` or `pending` count as active; retained finished
animations do not permanently blind the cohort.

### Authored-decision aggregation

Nested tap-target suppression requires both DOM ancestry and an equal authored decision key. A distinct
nested action remains a separate finding. Same-owner descendants contribute to `collapsed.sameOwner`,
while the complete affected denominator remains visible.

Duplicate-action-door no longer has a count-shaped off switch. Every distinct authored home is retained;
two through six preserve their existing finding shape, and seven or more remain one bounded population
finding with complete affected, representative, and cap evidence.

`truncated-to-nothing` and `obscured-target` scan their full candidate populations. They group affected
instances by stable authored decision before presentation and cap representative selectors only after
the full census. Obscuration identity includes both the obscured target and the covering target so two
different collision causes in one component are not collapsed. Repeated instances cannot consume the
budget and erase a later distinct authored decision. The existing full backdrop compositing is unchanged.

Rejected alternatives:

- Treating every `withheld` reason as harmless explanation: that preserves evidence but still grants a
  clean verdict over an unmeasured population.
- Removing inapplicable candidates from the denominator: that makes a closed negative arm indistinguishable
  from a walker that never reached the subject.
- Treating every unmatched state carrier as incomplete: a single rendered selected item contains no
  comparison population, so this turns ordinary one-off navigation state into a tool-wide NO VERDICT.
- Exempting nested ownership from arithmetic: it would make the same accounting field mean both
  adjudicated collapse and missing judgment. `collapsed` keeps those facts distinct.
- Raising the duplicate/collision caps: a larger raw-instance cap retains the same order-dependent blind
  spot and only delays it.
- Inferring collision equivalence from selector text or geometry: repeated selectors can contain distinct
  authored causes, and equal boxes do not establish ownership.
- Reusing family dispatch counts as negative-arm proof: dispatch proves a detector was called, not that
  the intended subject entered its census.

## #987 coupled sites and planted controls

The contract fans out through `contract/findings.ts`, `contract/samples-populations.ts`, the selection,
region, cohort, collision, and interactive walkers, their return join, the a11y/quality collectors, and
the report/runner verdict seam. The #953 device-evidence and matrix edits in the shared runner remain
authoritative and are preserved byte-for-byte around the additive population verdict.

Red-first controls cover both sides of each fence:

- negative, fractional, under-settled, and cap-inconsistent counters fail loud; valid capped counters pass;
- a wholly or partly withheld rule prints complete evidence plus `NO VERDICT` and exits non-clean, while a
  cap-only row remains a valid verdict;
- selected-only, unselected-only, ON-only, OFF-only, and unresolvable cohorts are withheld; compatible
  twins are judged;
- a same-decision nested tap target collapses, while a distinct nested action stays visible;
- duplicate doors stay monotonic from six to seven and retain the complete denominator above the cap;
- active animation is withheld and a finished retained animation is judged;
- repeated collision instances collapse to one authored population, a later distinct decision survives,
  and affected/cap totals reflect the full DOM rather than the representative budget;
- every clean precision control asserts rule-owned candidates and judged counts or an equivalent direct
  structured-reach receipt. Fixed family-dispatch counts are removed as proof.

The focused behavioral tier is the UI-audit pure index suite plus the selection, cohort, region,
collision, return-join, and CLI integration fixtures. The orchestrator owns the grouped broad barrier.

## #989 Config live-run instrument repair

The first Config population run alleged three places where the instrument reports rendered instances or
viewport reachability as though they were design facts. Re-derivation confirmed the obscured-target and
typography seams and refuted the quiet-state premise. This addendum is the implementation contract for the
two confirmed repairs and the durable refusal for the third. It preserves #987's settlement identities and changes no product markup,
contrast math, backdrop resolution, WCAG floor, content-driven cohort exclusion, or #953 device/matrix
evidence. The zero-hygiene and planted-positive lessons in
`2026-08-21T15-21-19-gDAF-orbweaver_verification_tooling_and_instrumentation_program.md` apply directly:
every newly complete zero needs an opposite-direction plant that proves the instrument can still withhold
or distinguish a real population.

### Re-derived premises

The exact `2b22adf57` tool was run against the freshness-proven live Config surface before any #989 edit.
The default route returned four findings and complete population evidence. At
`settings:appearance`, 1280x800 returned the same 21 findings as 1280x2000 but three obscured candidates
were `unaskable`; at 1280x2000 none were. The quiet-state row was `candidates=3 judged=1` with one
`unmatchedOn` and one `unmatchedOff` at both heights. A literal singleton gate was then planted at the
resolved backdrop-partition boundary: its dedicated one-member fixture became excluded, while the live
Appearance row did not move at all. Therefore both live one-sided quiet partitions contain at least two
members and their withholding is real under #987; the claimed single-member premise is false on the
served tree. The nine `undersized-ui-text` findings comprised eight positional instances below
`chat-style-cards` and one different `collapsible-trigger` home. F1 and F3 stand; F2 is refused.

### Chosen architecture

1. Obscured-target keeps the collision census's local reveal and exact scroll restoration already proven
   in the shared tree. A centre outside the current probe frame is re-centred once, remeasured, and judged
   when it becomes askable. Only a still-outside centre or a null `elementFromPoint` answer is withheld.
   The exact named withheld subjects remain report and artifact evidence. The cohesive obscured-scan
   evidence shape moves to `contract/samples-evidence.ts` so `contract/samples.ts` returns below the
   tooling source-size ceiling without a suppression.
2. Target identity is concatenated immediately after walker core, before the text census. The identity
   segment's only cross-segment dependency is core's `INTERACTIVE_SELECTOR`; its four helper names have
   no second definition in the walker. Each `TextStyleInput` carries the text element's authored target
   signature and position-free authored home. Node collection evaluates `checkTextStyle` once per sample,
   retains every non-floor finding unchanged, and groups `text-below-ramp` and `undersized-ui-text` rows
   separately by `(authoredTarget, authoredHome)`. Every collected text-style sample is a candidate and a
   judged subject for each floor rule; affected instances are the rows the existing mutually-exclusive
   floor classifier emits. Each authored group gets one finding, at most five selector representatives,
   complete affected/judged/cap evidence, and a settled rule population row.

### Rejected alternatives

- Counting an off-frame centre directly as `unaskable` is the reproduced defect: the count changes with
  viewport height. Treating null hit tests as clean would hide a real compositor refusal.
- Reusing the interactive census's reach budget/accounting after that census has settled would couple two
  independent denominators and obscure exact restoration. The collision-local reveal owns its attempts,
  recentred count, named refusals, and original scroll position.
- The F2 singleton exclusion is refused for this live repair. The exact gate was exercised successfully
  by a singleton fixture but did not classify either live one-sided partition, proving they are not
  singletons. Excluding them anyway would erase real missing-twin evidence; leaving the speculative gate
  in production would be dead code justified only by a refuted premise.
- Grouping typography by selector normalization, font size, or target signature alone merges unrelated
  repair homes. Capping raw text samples destroys the denominator before classification. Giving all
  typography rules population behavior in this repair is unrelated expansion; only the two identical
  type-floor shapes are grouped.
- Moving target identity without a live CLI plant could leave the raw IIFE syntactically valid but the
  text census uninstrumented. The repeated-instance integration fixture is therefore the reorder proof,
  not a source-order assertion alone.

### Coupled sites and planted controls

The F1 contract spans `contract/samples.ts`, `contract/samples-evidence.ts`, the collision walker,
collector assertions, report text, runner artifact/result fields, and collision integration fixtures.
The runner is shared with #953; #989 changes no runner hunk. F2 changes no source or test. F3 spans the sample contract, walker composition and text
census, typography classifier/collector, the public pure index test, and the real-CLI integration file.

The permanent controls are two-sided:

- an off-frame but scroll-reachable obscured target is recentred and judged; a planted null hit-test answer
  remains named, withheld, and exits with NO VERDICT;
- eight repeated undersized text instances in one authored home collapse to one population, while an
  equally undersized instance under a different authored home remains a second finding. The pure
  collector test pins candidates, judged, affected, populations, representatives, and cap arithmetic;
  the CLI fixture proves the reordered shared IIFE actually supplies the identity.

Graduation is the full focused UI-audit suite, graph typecheck, error-level Biome on owned files,
structure, and all three live Config commands at both appearance heights. The live report must show
viewport-invariant obscured `unaskable` and collapsed typography populations. Appearance is expected to
remain `NO-VERDICT`: its two live quiet-state one-sided cohorts are sufficiently populated to require the
missing twin, and selection-idiom independently retains `unmatchedUnselected=1`. A complete verdict is
incompatible with preserving those real #987 withholdings and is not a graduation condition for #989.

### Final live receipts

The served source was freshness-proven against the current shared tree before these cold runs; no stack
restart was needed. The default command exited 1 because it retained one P1 design finding and produced a
complete population verdict:

```text
$ pnpm design-audit config
POPULATION   obscured-target candidates=112 judged=112 affected=0 populations=0 representatives=0 withheld(unaskable=0) excluded() collapsed()
POPULATION   tap-target candidates=44 judged=44 affected=9 populations=1 representatives=5 withheld(extentTruncated=0 cap=4) excluded() collapsed(sameOwner=0)
POPULATION   quiet-state candidates=0 judged=0 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   double-empty-state candidates=0 judged=0 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   duplicate-action-door candidates=4 judged=4 affected=4 populations=2 representatives=4 withheld(cap=0) excluded() collapsed()
POPULATION   truncated-to-nothing candidates=72 judged=72 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   cohort-anatomy candidates=8 judged=8 affected=1 populations=1 representatives=1 withheld() excluded() collapsed()
POPULATION   pane-ink candidates=2 judged=2 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   row-void candidates=2 judged=0 affected=0 populations=0 representatives=0 withheld() excluded(unbound=2) collapsed()
POPULATION   selection-idiom candidates=3 judged=0 affected=0 populations=0 representatives=0 withheld() excluded(insufficientPopulation=3) collapsed()
POPULATION   text-below-ramp candidates=75 judged=75 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   undersized-ui-text candidates=75 judged=75 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
RESULT design-audit stage=live findings=4 p0=0 p1=1 p2=1 p3=2 fail-on=P1 actions=0 actions-failed=0 device-request=desktop device-actual=desktop viewport-actual=1280x800 pointer=fine hover=hover touch=no environment-fails=0 population-verdict=complete tap-candidates=44 tap-judged=44 tap-affected=9 tap-populations=1 tap-representatives=5 tap-collapsed-same-owner=0 tap-withheld-cap=4 dom-walk=470 dom-settled=470 dom-judged=452 dom-skip-head=18 dom-skip-dev=0 dom-inaccessible=0 dom-added=0 dom-detached=0 dom-mutations=0 dom-settle-mutations=1 theme-request=account theme-id=account theme-source=account theme-root=default theme-light=0 theme-dark=452 theme-polarity-unknown=0 reached=44 skipped-offviewport=0 no-probe-frame=0 reveal-budget=ok obscured-scanned=112 obscured-recentred=0 obscured-unaskable=0 px-backdrops=0 no-verdict=0 nav=OK out=<repo>/reports/design-audit/config.json census=347 scanned-a11y=7 scanned-color=3 scanned-decor=2 scanned-media=2 scanned-ornament=4 scanned-quality=7 scanned-structure=8 scanned-typography=3
```

The short Appearance command exited 2. Obscuration is fully askable after one collision-census re-centre,
and nine affected type instances settle into two authored populations. The remaining non-cap withholdings
are the real quiet-state and selection cohorts described above:

```text
$ pnpm design-audit config --goto settings:appearance
POPULATION   obscured-target candidates=112 judged=112 affected=0 populations=0 representatives=0 withheld(unaskable=0) excluded() collapsed()
POPULATION   tap-target candidates=117 judged=117 affected=29 populations=2 representatives=10 withheld(extentTruncated=0 cap=19) excluded() collapsed(sameOwner=0)
POPULATION   quiet-state candidates=3 judged=1 affected=0 populations=0 representatives=0 withheld(unmatchedOn=1 unmatchedOff=1) excluded() collapsed()
POPULATION   double-empty-state candidates=0 judged=0 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   duplicate-action-door candidates=0 judged=0 affected=0 populations=0 representatives=0 withheld(cap=0) excluded() collapsed()
POPULATION   truncated-to-nothing candidates=41 judged=41 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   cohort-anatomy candidates=16 judged=16 affected=1 populations=1 representatives=1 withheld() excluded() collapsed()
POPULATION   pane-ink candidates=2 judged=0 affected=0 populations=0 representatives=0 withheld() excluded(scrolling=2) collapsed()
POPULATION   row-void candidates=38 judged=16 affected=15 populations=15 representatives=8 withheld(cap=7) excluded(unbound=22) collapsed()
POPULATION   selection-idiom candidates=29 judged=3 affected=0 populations=0 representatives=0 withheld(unmatchedUnselected=1) excluded(insufficientPopulation=25) collapsed()
POPULATION   text-below-ramp candidates=98 judged=98 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   undersized-ui-text candidates=98 judged=98 affected=9 populations=2 representatives=6 withheld(cap=3) excluded() collapsed()
RESULT design-audit stage=live findings=14 p0=0 p1=2 p2=11 p3=1 fail-on=P1 actions=1 actions-failed=0 device-request=desktop device-actual=desktop viewport-actual=1280x800 pointer=fine hover=hover touch=no environment-fails=0 population-verdict=NO-VERDICT tap-candidates=117 tap-judged=117 tap-affected=29 tap-populations=2 tap-representatives=10 tap-collapsed-same-owner=0 tap-withheld-cap=19 dom-walk=1082 dom-settled=1082 dom-judged=1064 dom-skip-head=18 dom-skip-dev=0 dom-inaccessible=0 dom-added=0 dom-detached=0 dom-mutations=0 dom-settle-mutations=0 theme-request=account theme-id=account theme-source=account theme-root=default theme-light=4 theme-dark=1060 theme-polarity-unknown=0 reached=117 skipped-offviewport=0 no-probe-frame=0 reveal-budget=ok obscured-scanned=112 obscured-recentred=1 obscured-unaskable=0 px-backdrops=0 no-verdict=0 nav=OK out=<repo>/reports/design-audit/config.json census=749 scanned-a11y=7 scanned-color=3 scanned-decor=2 scanned-media=2 scanned-ornament=4 scanned-quality=7 scanned-structure=8 scanned-typography=3
```

The tall Appearance command also exited 2 with the same 14 findings and the same two real incomplete
cohorts. The obscured census grows with the viewport, but `unaskable=0` is invariant:

```text
$ pnpm design-audit config --goto settings:appearance --viewport 1280x2000
POPULATION   obscured-target candidates=189 judged=189 affected=0 populations=0 representatives=0 withheld(unaskable=0) excluded() collapsed()
POPULATION   tap-target candidates=117 judged=117 affected=29 populations=2 representatives=10 withheld(extentTruncated=0 cap=19) excluded() collapsed(sameOwner=0)
POPULATION   quiet-state candidates=3 judged=1 affected=0 populations=0 representatives=0 withheld(unmatchedOn=1 unmatchedOff=1) excluded() collapsed()
POPULATION   double-empty-state candidates=0 judged=0 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   duplicate-action-door candidates=0 judged=0 affected=0 populations=0 representatives=0 withheld(cap=0) excluded() collapsed()
POPULATION   truncated-to-nothing candidates=78 judged=78 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   cohort-anatomy candidates=16 judged=16 affected=1 populations=1 representatives=1 withheld() excluded() collapsed()
POPULATION   pane-ink candidates=2 judged=1 affected=0 populations=0 representatives=0 withheld() excluded(scrolling=1) collapsed()
POPULATION   row-void candidates=38 judged=16 affected=15 populations=15 representatives=8 withheld(cap=7) excluded(unbound=22) collapsed()
POPULATION   selection-idiom candidates=29 judged=3 affected=0 populations=0 representatives=0 withheld(unmatchedUnselected=1) excluded(insufficientPopulation=25) collapsed()
POPULATION   text-below-ramp candidates=98 judged=98 affected=0 populations=0 representatives=0 withheld() excluded() collapsed()
POPULATION   undersized-ui-text candidates=98 judged=98 affected=9 populations=2 representatives=6 withheld(cap=3) excluded() collapsed()
RESULT design-audit stage=live findings=14 p0=0 p1=2 p2=11 p3=1 fail-on=P1 actions=1 actions-failed=0 device-request=desktop device-actual=desktop viewport-actual=1280x2000 pointer=fine hover=hover touch=no environment-fails=0 population-verdict=NO-VERDICT tap-candidates=117 tap-judged=117 tap-affected=29 tap-populations=2 tap-representatives=10 tap-collapsed-same-owner=0 tap-withheld-cap=19 dom-walk=1082 dom-settled=1082 dom-judged=1064 dom-skip-head=18 dom-skip-dev=0 dom-inaccessible=0 dom-added=0 dom-detached=0 dom-mutations=0 dom-settle-mutations=0 theme-request=account theme-id=account theme-source=account theme-root=default theme-light=4 theme-dark=1060 theme-polarity-unknown=0 reached=117 skipped-offviewport=0 no-probe-frame=0 reveal-budget=ok obscured-scanned=189 obscured-recentred=0 obscured-unaskable=0 px-backdrops=0 no-verdict=0 nav=OK out=<repo>/reports/design-audit/config.json census=763 scanned-a11y=7 scanned-color=3 scanned-decor=2 scanned-media=2 scanned-ornament=4 scanned-quality=7 scanned-structure=8 scanned-typography=3
```

## Amendment — the DRIVE axis and the cohort key (#1059, owner ruling 2026-09-01)

This section amends the two rulings above. Neither is withdrawn: the RULE each states survives verbatim,
and what changed is the INPUT it is applied to.

### 1. A one-sided cohort stays withheld — and a driven run is where its twin comes from

The ruling in "Previously silent state cohorts" holds unchanged: a group with at least two state carriers
but only selected or only unselected members is large enough to assert an authored cohort, so its missing
opposite twin remains withheld and the run is NO VERDICT.

What #1059 adds is that a surface has TWO measurable regimes, and a bare invocation only ever reaches one
of them. The Characters library toolbar carries two `<Toggle>`s ("Group by tag", "Select multiple") that
are both OFF at rest, so at rest there is genuinely no selected twin to judge and the withholding above is
correct. Driving the surface produces the twin in the same mount:

```text
$ pnpm design-audit characters                       # the REST regime — unchanged, still withheld
POPULATION   selection-idiom candidates=3 judged=0 affected=0 populations=0 representatives=0 withheld(unmatchedUnselected=1) excluded(insufficientPopulation=2) collapsed()

$ pnpm design-audit characters \
    --click '[aria-label="Select multiple"]' --click '[data-slot="checkbox-root"]'
POPULATION   selection-idiom candidates=7 judged=2 affected=0 populations=0 representatives=0 withheld() excluded(insufficientPopulation=5) collapsed()
```

BOTH runs are real evidence and neither replaces the other — the bare one is the state a visitor lands on.
So the regime is DECLARED rather than inferred, in the same surface-state accounting the panel and focus
axes already use (`contract/surface-state.ts`'s `DRIVE_STATE_SPACE`): `drive=` on the SHELL STATE line, a
`SURFACE-AXIS drive` row, and `drive-state=`/`drive-axis=` on the RESULT line. It is the one axis that is
never EXCLUDED — the regime is an argv fact the run always knows, even when no shell mounted. A driven
population and a rest population are not comparable, and a report that cannot say which one it holds is
the same "we never looked" silence the panel axis exists to end.

TWO clicks, not one, and the second is not decoration: the first toggle gives the toolbar cohort its twin,
and bulk mode then renders one checkbox per row — a twelve-carrier cohort that is itself one-sided until
one row is checked. Both are pure client state; neither writes a setting.

### 2. `unmatchedUnselected=1` on `settings:appearance` was a GROUPING ARTIFACT, not a missing twin

The graduation paragraph above records that Appearance "independently retains `unmatchedUnselected=1`" and
that a complete verdict there is incompatible with preserving a real #987 withholding. The withholding was
not real. The Background picker ALWAYS has exactly one selected tile — `appearance-background-section.tsx`'s
`selectedTileKey` lights the `none` tile when no background is chosen — so the twin was on screen the whole
time. `census-selection.ts` was the one relational family still keyed on the raw `parentElement`, and
`MediaGrid` renders its cells under one `[data-slot=media-grid-row]` wrapper PER ROW: row 0 paired 1
selected against 7 unselected and was judged, while row 1 held 7 unselected with no twin and was withheld.

The key is now `claim + authoredTargetHome + state`, the same shape `census-region.ts`'s quiet-state
cohorts already use, from the walker's own shared identity module — whose header states the reason
directly: "Selector strings are presentation and contain nth-of-type instance positions; grouping them
would turn one repeated component into N fake repairs." A parent node IS that instance. One authored
cohort now stays one cohort across presentation wrappers:

```text
$ pnpm design-audit config --goto settings:appearance
POPULATION   selection-idiom candidates=10 judged=5 affected=0 populations=0 representatives=0 withheld() excluded(insufficientPopulation=5) collapsed()
```

The `quiet-state` half of that graduation paragraph is untouched and still live
(`withheld(unmatchedOn=1 unmatchedOff=1)`), so Appearance remains NO VERDICT for that separate rule.

Both directions are pinned in `tests/tooling/ui-audit/ops/walker/census-selection.int.test.ts`: a selected
twin in a SIBLING presentation wrapper is one judged cohort, and a cohort that is genuinely one-sided
across those same wrappers is still withheld with `INSTRUMENT ERROR` and exit 2 — §"Previously silent
state cohorts" survives the regrouping intact.

## Amendment — the quiet-state partition and the fill-less cohort (#1068, 2026-09-02)

This section amends the two rulings above the same way #1059 did: the RULE each states survives verbatim,
and what changed is the INPUT it is applied to.

### 3. A partition may not be a restatement of the axis it partitions

`census-region.ts`'s quiet-state census groups carriers into an authored cohort (`claim + authoredTargetHome`,
\#1059's key) and then splits that cohort a second time by RESOLVED BACKDROP, "so the comparison never
crosses paint contexts". The second split was derived from `resolveBackdrop(el.parentElement)` — and on
exactly the components this rule exists for, that context is painted BY THE STATE. So the split restated
the ON/OFF axis and the cohort could only ever come out one-sided, with both twins on screen. Measured on
the isolated stage at `718e97ab3`, replicated with the walker's own `core`+`target-identity`+`resolve`
segments through `snap --eval`:

| Surface | Cohort | Partition backdrop | on / off | Old verdict |
| - | - | - | - | - |
| `settings:appearance` | `span slot=switch-root` under `div@field-control-col` | `15,12,10` | 3 / 7 | judged |
| `settings:appearance` | `span slot=switch-thumb` under `span@switch-root` | `247,127,32` (the ON track) | 3 / 0 | `withheld(unmatchedOn)` |
| `settings:appearance` | same cohort | `44,42,39` (the OFF track) | 0 / 7 | `withheld(unmatchedOff)` |
| `characters` (driven) | `span slot=checkbox-root` under `div@list-row-actions` | `35,20,9` (the selected row tint) | 1 / 0 | `withheld(unmatchedOn)` |
| `characters` (driven) | same cohort | `11,8,7` | 0 / 9 | `withheld(unmatchedOff)` |
| `characters` (driven) | `span slot=checkbox-indicator` under `span@switch-root`-shaped home | own fill `rgba(0,0,0,0)` | 1 / 0 | `withheld(unresolved)` |

A switch thumb's nearest opaque ancestor IS its own track; a bulk-mode row checkbox sits on a
`[data-slot=list-row-root][data-selected]` whose 10%-alpha ember tint is the selection. Neither is a
different paint CONTEXT — both are the same authored surface wearing the state the rule is asking about.

So the partition now resolves the backdrop ABOVE every state carrier in the subject's own ancestor chain
(the context the whole component sits in), while the CONTRAST stays measured against the real resolved
backdrop a user sees, state tint included. §"Previously silent state cohorts" is unchanged and still fires:
the same authored component in two differently-painted panels is still two contexts, and a genuinely
twin-less cohort of two or more carriers is still `withheld` with `INSTRUMENT ERROR` and exit 2.

### 4. No own fill is a closed negative, not a missing measurement

`fillContrast` returned one `null` for two different facts: an element with no own fill (nothing to rank)
and a backdrop that would not resolve (a measurement that failed). Under §"Polarity" only the second is
`withheld`; the first is a candidate "whose measured facts close the question by proving the rule does not
apply", which is `excluded`. A cohort every member of which paints no fill is now `excluded(noOwnFill)`.
A cohort only SOME of whose members paint stays `withheld(unresolved)` deliberately — ranking a measured
loudness against an unmeasured one is the fabricated comparison #987 refuses.

Both surfaces now publish a complete verdict, and Appearance's repaired cohort immediately asked its
question and answered it — the finding below is real product output, not instrument noise:

```text
$ pnpm design-audit characters --click '[aria-label="Select multiple"]' --click '[data-slot="checkbox-root"]'
POPULATION   quiet-state candidates=2 judged=1 affected=0 populations=0 representatives=0 withheld() excluded(noOwnFill=1) collapsed()
population-verdict=complete   (exit 0)

$ pnpm design-audit config --goto settings:appearance
POPULATION   quiet-state candidates=2 judged=2 affected=1 populations=1 representatives=1 withheld() excluded() collapsed()
P2  quiet-state  the OFF state is louder than the ON state … (OFF 12.58:1 vs ON 7.06:1)
population-verdict=complete   (exit 1)
```

The BARE `characters` run is untouched and still NO VERDICT — for `selection-idiom`
(`withheld(unmatchedUnselected=1)`), the rest-regime withholding amendment 1 above ruled correct, never for
`quiet-state` (`candidates=0` at rest). `/` and bare `config` are byte-identical before and after
(`quiet-state candidates=0`, `population-verdict=complete`, findings 3 and 8 respectively).

Four controls pin both directions in `tests/tooling/ui-audit/ops/walker/census-region.int.test.ts`: a
sub-part under its own state-painted carrier folds to one judged cohort, a cohort under a selection-tinted
container folds, a cohort across two genuinely different panel fills still splits and still withholds, and
a fill-less cohort is an exclusion.

## Amendment — the backdrop query and the checked-only part (#1155, 2026-09-02)

Same shape as #1059 and #1068 once more: both rulings survive verbatim, and what changed is the INPUT.
After #1150 repaired `selection-idiom`, `quiet-state` was the LAST reason every Config design-audit
printed `population-verdict=NO-VERDICT`. Measured first, on the live surface
(the retired `pnpm design-audit / --goto settings:appearance --viewport 1280x2200`, 3 of 3 runs):

```text
POPULATION   quiet-state candidates=5 judged=2 affected=0 populations=0 representatives=0 withheld(unresolved=3) excluded() collapsed()
population-verdict=NO-VERDICT
```

The three cohorts were the `theme-collection` picker cells, the `chat-style-cards` picker cells, and the
two `radio-group-picker-item-check` indicators. **None of them was the one-sided-cohort class the row was
filed against.** All three carried the SAME cause, printed by instrumenting the withheld arm: every member
returned `unresolved(paint-layer-over-base)`.

### 5. A backdrop query names a BOX, and the answer is only about that box

`fillContrast` ranks an element's OWN fill, so it must not read that fill as its own backdrop — it asked
`resolveBackdrop(el.parentElement)`. That reads the right colour from the wrong box: the paint-layer veto
is then computed against the PARENT's rect and the PARENT's subtree, so two things that are not backdrops
refuse the measurement.

| The layer | Where it is | Why it is not the carrier's backdrop |
| - | - | - |
| `Radio.Indicator` (`[data-slot=radio-group-picker-item-check]`) | INSIDE the checked cell | painted over the cell's own fill; it cannot be between the cell and the surface under it |
| the `⋯` row menu (`Row absolute top-tight left-tight bg-card/80`, `appearance-looks-section.tsx`) | a FOLLOWING sibling, parked over the cell's corner | auto z-index + later in document order = CSS paints it ON TOP of the cell |

Both are contentless, positioned and painted, which is exactly the (deliberately narrow) paint-layer
census in `resolve.ts`. So the walk now names its two questions: `resolveBackdrop(el)` is unchanged for
every existing caller (text-over-art, contrast, the glow tell), while `resolveBackdropUnder(el)` walks
from the parent but stays measured against EL's box, ignoring layers inside el and layers that paint over
it. `resolveBackdropAt(el)` is the container flavour the paint-context partition KEY uses, so a populated
container is resolvable while its own fill still distinguishes it from a differently-painted one
(§3 above is intact — two panels are still two contexts).

**The withhold arm is unchanged and still bites.** A layer that genuinely sits between the resolved base
and the carrier's box — a scrim PRECEDING the cells — still returns `withheld(unresolved)` with
`INSTRUMENT ERROR` and exit 2, and so does a following layer carrying an explicit `z-index`: resolving a
reordered stack means resolving stacking contexts, which the walker will not guess.

### 6. A one-sided cohort of component PARTS is a closed fact, not missing evidence

The third cohort is the two `Radio.Indicator` spans. #1150 ruled a component part is not a choice, and
`isNestedStatePart` is already in scope here (`ops/walker.ts:117` concatenates SELECTION before REGION).
`quiet-state` reuses the predicate but NOT `selection-idiom`'s blanket exclusion, because the two rules ask
different questions: this one ranks PAINT, and a part mounted in BOTH states paints two real fills —
`Switch.Thumb` keeps its own judged cohort, which §3's committed control requires. What closes is the
ONE-SIDED all-parts case: `Radio.Indicator` defaults `keepMounted:false`, so the OFF twin is never
rendered and no measurement is being waited for. That is `excluded(nestedStatePart)`. A one-sided cohort
containing any real CARRIER is still `withheld` (§"Previously silent state cohorts" / #987, intact).

```text
$ pnpm design-audit / --goto settings:appearance --viewport 1280x2200      # 3 of 3 runs
POPULATION   quiet-state candidates=5 judged=4 affected=0 populations=0 representatives=0 withheld() excluded(nestedStatePart=1) collapsed()
population-verdict=complete   (exit 1 — findings 12/p1=1/p2=6/p3=5, byte-identical to the NO-VERDICT runs)
```

Four new controls in `tests/tooling/ui-audit/ops/walker/census-region.int.test.ts` pin every direction: a
checked cell whose own indicator is a paint layer is judged while that indicator cohort is
`excluded(nestedStatePart)`; a scrim painted between the base and the cells still withholds; a chip that
paints ON TOP of a cell no longer withholds; an explicit z-index keeps the veto.

## Amendment — the reading-measure population and the pseudo-carried route (#1183, #1172, 2026-09-02)

Two rules were reporting complete, well-formed rows over a population or a unit that could not produce the
defect. The counters settled; the semantics under them did not.

### 7. `line-length` — a closed reason set, in the unit the LAW counts

`line-length` carries a closed reason set: `excluded(srOnly, notProseTag, chromeVoice, noRenderedBox,
noTypeSize)` · `withheld(glyphAdvanceUnmeasured, chAdvanceUnmeasured)`.

Two members are new and both are #1183. The first is a UNIT correction, not an accounting one: the rule
compared a 65-75 **law-character** band against a CSS `ch` count. CSS `ch` is the `0` advance (0.6625em in
Geist) while a character of running prose averages 0.42-0.46em, so one `ch` is ~1.5 law-characters (owner
ruling 2026-09-02, #1145) and a 75ch paragraph passed a "75" ceiling at 117 real characters. The rule now
judges by the AVERAGE GLYPH ADVANCE of the element's own text, canvas-measured in its own font, and prints
BOTH numbers in every finding — the two units are the defect, so a row naming one of them cannot be checked
against the token it cites. The two reading measures are two ARMS: the chat transcript
(`[data-slot="message-bubble"]`) keeps `--reading-measure` (75ch) and is judged in `ch` against its own
token, so #464's ruling — an instrument may not indict the ratified measure — survives verbatim in the arm
where 75ch is still ratified; everything else takes `--reading-measure-prose` and is judged against 80
law-characters, ~10% above the token's 67-73. Each arm withholds under its OWN denominator's name, because
"the `0` advance was unreadable" and "the prose advance was unreadable" are different blindnesses.

The second is a POPULATION correction. `notProseTag` was one label over two different facts and covered 55
of 64 candidates on the Home surface, so the rule reported `affected=0` beside a 91-character paragraph.
The prose population is now the prose TAGS plus the app's own prose VOICES (`reading`, `gloss`, `quiet` —
the reading-surface law's teaching copy, glosses and settings-row descriptions, read from the element's own
`data-voice` and never an inherited one), and the remainder splits: `chromeVoice` is an authored claim that
the node is a kicker/label/datum/credit/display line — measured evidence of inapplicability — while
`notProseTag` keeps its original meaning of unlabelled markup this rule cannot claim.

```text
$ pnpm design-audit / --isolated --ref <sha>                                   # Home, same warm stage
BEFORE  POPULATION line-length candidates=64 judged=6 affected=0 withheld() excluded(srOnly=3 notProseTag=55)
AFTER   POPULATION line-length candidates=64 judged=6 affected=1 withheld() excluded(srOnly=3 notProseTag=33 chromeVoice=22)
AFTER   P3 line-length  this line measures 91 characters (65 CSS ch) — past the 80 characters ceiling
```

### 8. `carried` — a route TAG over candidates, outside the settlement arithmetic

`promoted-layer-offset` walked ELEMENTS and called `getComputedStyle` with no pseudo argument, so when the
shell panes moved their glass onto a `::before` fill layer (#1154) the whole cohort left the census in
silence: `candidates=1` became `candidates=0`, which prints exactly like a surface with nothing to promote
(#987's shape, one rule over). The census now has a pseudo arm whose subject is the HOST with the pseudo
named, sharing ONE promotion vocabulary with the element pass.

A cohort that can enter or leave a denominator invisibly needs a name in the row, and neither `withheld`
nor `excluded` can hold it — those are dispositions and every pseudo candidate still receives one. So a
rule-owned population may carry a fifth map, `carried`, counting how many CANDIDATES arrived by a named
non-default route (`pseudo`). It is a TAG: it never participates in `candidates = judged + withheld +
excluded`, and its only settlement rule is `sum(carried) <= candidates`. It prints last and ONLY where a
census has an alternate route — an empty `carried()` on the other rows would read as "this rule has a route
and saw none of it", which is the silence being fixed.

The landing is DERIVED, never guessed: only an absolutely positioned pseudo whose host provably establishes
its containing block has a box the walk can compute (host border box + border width + the pseudo's own
resolved inset). An in-flow pseudo, an `auto` inset or a host that is not the containing block is
`withheld(pseudoBoxUnmeasurable)` — a landing measured off the wrong box is the false-measurement half of
the same lie the missing cohort was.

```text
$ pnpm design-audit / --goto characters --panel list=docked --isolated --ref <sha>
BEFORE  POPULATION promoted-layer-offset candidates=0 judged=0 affected=0 withheld() excluded() collapsed()
AFTER   POPULATION promoted-layer-offset candidates=1 judged=1 affected=0 withheld() excluded() collapsed() carried(pseudo=1)
```

Controls in both directions: `tests/tooling/design-audit-walker.ct.tsx` mounts a pseudo-carried promotion on
a half-pixel host (judged, fires), an element-carried twin (unchanged), and an in-flow pseudo (withheld by
name); `tests/tooling/ui-audit/lib/checks-grid.test.ts` pins the two message shapes, since a pseudo has no
box of its own and "give the layer an integer offset" names a thing nobody can edit.
