---
kind: review
status: active
updated: 2026-09-01
---

# Stickler review: UI-audit population train (`daafa3e55^..532200fce`)

## Verdict

**Eight confirmed findings, severity ceiling P1.** The #983 tap-target population repair fixed the
dominant repeated-sibling noise class, and #984 materially improved relational pairing, color
normalization, backdrop compositing, and capped-population receipts. The train is nevertheless not yet a
trustworthy base for #953: incomplete relational populations can still print and exit as clean, the
relational counter guard accepts arithmetically impossible receipts, two state-pairing families silently
discard unmatched subjects, and several current rules still cap per-instance findings before preserving
the authored decisions or denominator.

## Confirmed findings

### P1 — Relational population arithmetic is not actually checked fail-loud

`tooling/src/ui-audit/lib/collect.ts:85` — `cappedRelationalFindings` checks only
`census.judged === items.length` (`:91-93`). It never establishes that counts are non-negative integers,
that `candidates >= judged`, or that `candidates === judged + sum(non-cap withheld)`, even though the
implementation contract says cap arithmetic is checked before classification so partial counters cannot
become silence (`docs/design/983-984-ui-audit-population-semantics.md:112-117`).

Concrete failure: a walker regression can say `candidates=10, judged=0, withheld={}`, or even publish
negative/fractional counters, and collection accepts the row as valid population evidence. The current
walker constructors happen to increment sane integer counters; this finding is specifically the missing
planted fail-loud guard at the trust seam, not a claim that the current constructor naturally emits these
values.

Evidence produced this session:

```text
pnpm exec tsx -e '<collectAudit with deliberately malformed relationalAccounting>'

cohort-anatomy: candidates=10 judged=0 withheld={}
pane-ink:       candidates=0.5 judged=0 withheld={}
row-void:       candidates=-3 judged=0 withheld={unbound:-3}
```

All three were returned without an instrument error. By contrast, tap-target has a real settlement guard
at `tooling/src/ui-audit/lib/checks-a11y.ts:164-167`.

### P1 — A wholly withheld population is still labelled and exited as clean

`tooling/src/ui-audit/ops/report.ts:116` and `tooling/src/ui-audit/ops/run.ts:160` — the runner prints
population accounting first, then `printFindingsTable([])` unconditionally prints `no findings — clean`
(`report.ts:132-135`). `failed` considers navigation, action failures, and emitted findings only
(`run.ts:160-162`); withheld candidates never affect the verdict. This directly violates the active
contract that a partial clean must not print like a complete clean
(`docs/design/983-984-ui-audit-population-semantics.md:22-30`).

Concrete failure: a 500px pane is a candidate, but scrolling or insufficient text withholds its only
pane-ink verdict. The operator receives an exit-0 clean even though the instrument judged none of the
candidate population.

Evidence produced this session:

```text
pnpm exec tsx -e 'printPopulationAccounting({pane-ink: ...}); printFindingsTable([])'

POPULATION   pane-ink candidates=1 judged=0 affected=0 populations=0 representatives=0 withheld(scrolling=1)

no findings — clean
```

### P1 — Selection and quiet-state pairing silently drop unmatched subjects

`tooling/src/ui-audit/ops/walker/census-selection.ts:77` and
`tooling/src/ui-audit/ops/walker/census-region.ts:164` — selection returns immediately for a cohort missing
either selected or unselected members (`census-selection.ts:101-104`), and quiet-state emits only cohorts
where both ON and OFF resolved (`census-region.ts:189-195`). Neither family has a population row:
`RelationalPopulationAccountingInput` contains only cohort-anatomy, pane-ink, and row-void
(`tooling/src/ui-audit/contract/samples-populations.ts:13-17`). This is a direct selection-contract breach:
unmatched elements are promised as explicitly withheld
(`docs/design/983-984-ui-audit-population-semantics.md:95-102`), and the same omission makes one-sided or
unresolved quiet-state cohorts indistinguishable from a fully judged clean.

Concrete failure: a selected card with no compatible unselected twin, or an OFF switch whose ON twin is
not rendered/resolvable in this state, contributes no finding, no candidate, no judged count, and no
withheld reason. An appearance-matrix cell can therefore report clean without having performed the
relational comparison.

Evidence produced this session through the real composed walker in headless Chromium:

```text
selected-only DOM -> selectionIdioms=[]
                     relationalAccounting={cohort-anatomy:0,row-void:0,pane-ink:0}

OFF-only DOM      -> quietStates=[]
                     relationalAccounting={cohort-anatomy:0,row-void:0,pane-ink:0}
```

### P1 — Seven distinct duplicate-action homes disable the rule entirely

`tooling/src/ui-audit/lib/checks-quality.ts:133` — `DOOR_GROUP_MAX` treats every group above six as a
false-positive grid and returns no finding (`:200-205`). That conclusion is inferred from count, not from
the already-available list/item relation; seven distinct non-list structural paths are seven authored
homes, and no accounting row records that the rule declined them.

Concrete failure: the same named action offered from seven independent toolbar/surface paths returns zero
findings and can make the audit clean, while the identical first six paths correctly produce a
`duplicate-action-door` finding.

Evidence produced this session:

```text
pnpm exec tsx -e '<checkDuplicateDoors over unique non-list paths>'

6 homes -> one `6x button "manage"` finding
7 homes -> []
```

### P1 — Cohorts declined for animation are recorded as judged-clean, including finished animations

`tooling/src/ui-audit/ops/walker/census-cohort.ts:79` and
`tooling/src/ui-audit/lib/checks-structure.ts:78` — the walker marks a cohort `animating` whenever
`getAnimations().length > 0` (`census-cohort.ts:79-81`), still pushes the sample and increments `judged`
(`:142-156`), then the classifier declines it (`checks-structure.ts:79-82`). Thus accounting reports a
fully judged zero where the verdict explicitly says it did not judge. The predicate is wider than the
comment too: a finished CSS animation with `fill-mode: forwards` remains in `getAnimations()`.

Concrete failure: a cohort with a material 16px/32px divergence and a retained finished animation is
permanently reported as `candidates=1 judged=1 affected=0 withheld={}`.

Evidence produced this session:

```text
Chromium after a 1ms `animation-fill-mode: forwards` animation:
[{"state":"finished","current":1,...}]

collectAudit(animating divergent cohort, census candidates=1 judged=1):
findings=[]
accounting={candidates:1,judged:1,affected:0,populations:0,emitted:0,withheld:{}}
```

### P2 — Nested tap suppression ignores whether ancestor and descendant are the same authored decision

`tooling/src/ui-audit/lib/checks-a11y.ts:74` — `tapTargetDecisionKey` exists, but
`nestedOwnedTargets` suppresses any failing descendant with any failing ancestor ID (`:80-88`) and never
compares their decision keys. That is weaker than the ruled condition: suppress only when the ancestor
owns the **same** floor decision (`docs/design/983-984-ui-audit-population-semantics.md:45-52`).

Concrete failure: an undersized clickable-card wrapper containing a separately-authored undersized icon
menu action produces only the card finding; the independent menu-button repair is counted as
`nestedOwner=1` and hidden. The existing planted control covers a nested target with the same
`authoredTarget` and home (`tests/tooling/ui-audit/index.test.ts:560-586`), so it does not protect the
distinct-decision arm.

Evidence produced this session:

```text
pnpm exec tsx -e '<two failing nested targets with different authoredTarget/authoredHome>'

findings: [outer only]
accounting: candidates=2 judged=2 affected=1 withheld.nestedOwner=1
```

### P2 — The collision families still spam instances, then hide everything after hard walker caps

`tooling/src/ui-audit/ops/walker/census-collision.ts:38` — `truncated-to-nothing` stops collecting after 40
raw element rows (`:45,60`), while `obscured-target` stops the entire candidate walk after 20 affected
rows (`:110,147`). The latter also stops incrementing `obscuredCandidates`, so even its printed denominator
is truncated. The return carries only those arrays and the shortened obscured count
(`tooling/src/ui-audit/ops/walker/returns.ts:70-72`); collection maps each retained instance directly to a
finding (`tooling/src/ui-audit/lib/collect.ts:137,183`).

Concrete failure: forty repeated zero-width labels from one component consume the entire truncation
budget and emit forty versions of one authored repair, while a distinct erased label later in DOM order
vanishes. Twenty repeated collisions do the same for `obscured-target`, and the artifact cannot tell the
reader that later candidates were never visited.

This defect predates the requested range (introduced by `75ddfdff6`), but it is a confirmed current
UI-audit defect and the direct answer to “are any other checks naive like tap-target used to be?” It was
not introduced by #983/#984.

### P2 — Several passing controls call a detector dispatch a “judged zero”

`tests/tooling/ui-audit/cli.int.test.ts:1119` — the uniform-cohort, adjacent-row, single-selection-idiom,
full-pane, and single-empty-state controls use `scanned-structure`/`scanned-quality > 0` as proof that the
specific population was judged (`:1124-1126`, `:1179-1180`, `:1245-1246`, `:1295-1296`, `:1372-1373`).
But `familyScans` counts detector **dispatches**, not candidates or samples: `runArray` increments once
even for an empty array (`tooling/src/ui-audit/lib/collect.ts:123-125`), and the empty bundle is explicitly
expected to report `structure=8`, `quality=7` (`tests/tooling/ui-audit/index.test.ts:1779-1789`).

Concrete failure: a walker regression that stops emitting the relevant passing sample leaves these
“non-vacuity” assertions green. The positive fixtures still prove each rule can fire somewhere; the
defect is narrower and load-bearing—the negative arm does not prove that its precision neighbour entered
the rule's judged population, despite saying it does. The new per-rule population rows should be the
assertion surface where they exist; selection/quiet first need the missing accounting from the P1 above.

## Verified clean

- `wt/cb-audit-layout` commit `74acc5071` is not an ancestor of HEAD, but no valuable behavior from it is
  absent. `git show --stat 74acc5071` names only the CLI test and the cohort/region walkers. The test content
  is byte-present in main; `git diff 74acc5071..69e2cec4d` differs only where main strengthened the branch:
  selection fill uses `parseRgb`/alpha instead of string spelling, and quiet-state uses the shared
  `resolveBackdrop` stack rather than stopping at the first opaque ancestor. #984 then replaced absolute
  selection paint with selected/unselected deltas and added the cohort/home/backdrop relation.
- Quiet-state's current color math is sound for the reviewed contract: it normalizes browser-understood
  colors through `parseRgb`, resolves the full backdrop stack, composites alpha with `compositeOver`, and
  keys pairs by authored target, structural home, and resolved backdrop
  (`tooling/src/ui-audit/ops/walker/census-region.ts:124-193`). The existing real-CLI plants cover OKLCH,
  alpha, loud-OFF, and quiet-OFF directions (`tests/tooling/ui-audit/cli.int.test.ts:1377-1430`).
- The current declared-relation boundaries are materially better than the imported first draft: cohorts
  are scoped to one parent and author slot/role claim; row-void requires a real label/control binding;
  quiet-state includes author/home/backdrop in its key; empty states use the nearest declared surface and
  require an operable action; selection uses a same-parent author/state twin and computed paint deltas.
- Capped cohort-anatomy, row-void, and pane-ink scans continue after the representative cap and preserve
  full affected counts when their supplied census is valid. Tap-target sibling grouping and representative
  capping preserve affected/judged counts in the ordinary same-decision case.
- Finding evidence is generally actionable in the reviewed families: row-void retains the label text,
  cohort-anatomy retains mode/outlier counts and selector, quiet-state retains both ratios, selection
  retains mechanism signatures, pane-ink retains designed/text subject counts, and capped tap findings
  retain representative selectors.

## Verification log and coverage

- Read in full: `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`, the touched D-ledger/tooling
  authority, `.claude/rules/browser-and-instruments.md`, `.claude/rules/gates-and-tooling.md`,
  `.claude/rules/lane-standing-facts.md`, and
  `docs/design/983-984-ui-audit-population-semantics.md`.
- Read every current HEAD source and test file touched under `tooling/src/ui-audit/**`,
  `tests/tooling/ui-audit/**`, and `tests/support/ui-audit-relational.ts` by
  `daafa3e55^..532200fce` (29 files), including the 1,458-line CLI integration file and 1,824-line pure
  index suite. The dirty #953 working-tree versions were not used as authority; files dirty for #953 were
  read with `git show HEAD:<path>`.
- Read the adjacent current collision census and hit-extent implementation in full because the task
  explicitly asked whether other checks still cap or group naively.
- Inspected commit intent with `git log --reverse daafa3e55^..532200fce`; inspected #983/#984 issue bodies
  and comments read-only; compared `74acc5071` to both `69e2cec4d` and current HEAD.
- Ran focused, read-only `pnpm exec tsx -e` probes for malformed relational counters, partial-clean
  reporting, distinct nested tap decisions, the six-versus-seven door discontinuity, and animating cohort
  accounting.
- Ran focused headless-Chromium probes through the real composed walker for selected-only and OFF-only
  state populations, plus the finished-animation behavior. The first animation probe was a non-verdict
  because `tsx -e` rejected top-level await; the async-IIFE reruns completed and produced the receipts
  quoted above.
- Did **not** run `pnpm check`, broad suites, live Config Appearance, snap, or #953 matrix work. The parent
  explicitly requested focused cheap probes only, and the shared tree contains a large dirty #953 train;
  broad/live results would not isolate the landed range. No product/tooling file or dirty #953 file was
  edited.
- Outside coverage: semantic quality of the 51-rule fleet predating the reviewed train, except the
  directly adjacent cap/grouping seams identified above; visual taste of the Config surface; performance
  and matrix completeness. Those need their owning review lanes after instrument trust is repaired.

## Unconfirmed suspicions

None retained. Every item above was reproduced or directly established from current HEAD control flow.

## Issue summary

Stickler review of the landed UI-audit population train confirmed 8 findings (severity ceiling P1): relational arithmetic is not validated, partial populations still print/exit clean, unmatched selection/quiet cohorts vanish, seven duplicate-action homes disable the rule, animated cohorts are recorded judged-clean, distinct nested tap decisions collapse, collision rules still cap per-instance rows without full denominators, and several “judged zero” tests assert only family dispatch. The branch comparison found no valuable `74acc5071` behavior missing from main; current color/alpha/backdrop logic is stronger. Full report: `docs/reviews/stickler/2026-09-01-ui-audit-population-train.md`.
