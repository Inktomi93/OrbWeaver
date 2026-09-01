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

Every capped family publishes four different facts:

- `candidates`: subjects that entered the family's structural census;
- `judged`: candidates for which the required relation and measurement existed;
- `emitted`: representative sample or finding rows retained after the cap;
- `withheld`: candidates not judged, partitioned by reason, plus judged rows omitted only by the cap.

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
