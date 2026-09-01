---
kind: design
status: active
updated: 2026-09-01
---

# UI-audit population semantics (#983 and #984)

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
