---
kind: review
status: active
updated: 2026-09-13
---

# cb-x-hit-geometry — ancestor credit becomes a MEASUREMENT (#2300) + the drifted `::after` prose and the missing `inline` hit pin (#2301)

Lane report for the shared hit-extent geometry: the product `ui-audit` walker
(`tooling/src/ui-audit/ops/walker/hit-extent.ts`), the CT touch-floor kit (now
`tests/support/iso/hit-extent-walk.ts` + `tests/support/browser/touch-floor.ts`), their fixtures, and the
coupled Button hit-test pins.

## 1. The defect, reproduced before the fix

The row's table was reproduced verbatim on the UNMODIFIED tree, with the CT kit's own algorithm replayed
against hand-built fixtures of both shapes (`pnpm snap --file <fixture> --mobile --eval <replay>`; probe
`xhit-probe.html` / `xhit-replay.js`, run slot
`reports/runs/snap/agent-a384c9bc64477f381-3676949-…` and `…-3684000-…`). Coarse pointer, `--mobile`,
resolved floor 55px (`--spacing-touch-target` = `round(up, 2.75rem, 1px)` at that stage's root size).

| shape | real box | old predicate (existence) | new predicate (measured rect) | truth |
| - | - | - | - | - |
| pre-#1843 `data-cta` glyph (ring on `::after`, `pointer-events: none`) | 25x25 | **161x161 — PASSES the 55px floor** | 26x26 — fails | 26x26 |
| post-#1843 glyph, `intent="primary"` (ring `::after` + hit `::before`) | 25x25 | **161x161** | 56x56 | 56x56 |
| post-#1843 glyph, `intent="ghost"` | 25x25 | 161x161 | 56x56 | 56x56 |
| hit pseudo spelled with `transform: matrix(…)` instead of `translate` | 25x25 | 161x161 | 56x56 | 56x56 |
| `inline` arm, full-width `::before` | 127x18 | 161x161 | 128x56 | 128x56 |
| plain box, no pseudo (the #662 stage) | 25x25 | 26x26 | 26x26 | 26x26 |

The old number is 161 whether the answer is 26 or 56: the predicate reported the isolated stage's
400px-wide, 120px-padded WRAPPER, and the only thing it asked about the pseudo was whether one existed.

**Receiving-target receipts** (same run, `elementFromPoint` at +20px from centre, i.e. outside the 25px box):

| shape | at centre | at +20px |
| - | - | - |
| post-fix glyph (either intent) | `self` | `self` — the hit pseudo SELF-REPORTS, so ancestor credit is not even reached |
| pre-fix ringed glyph | `self` | `div:ancestor` — the wrapper, which is exactly what the old clause credited |
| plain box | `self` | `div:ancestor` — refused by both predicates (#662) |

That is the mechanism correction the fix rests on: for every hit-eligible pseudo on this tree the FIRST
ownership clause answers, so geometry-scoped ancestor credit costs the correct shapes nothing.

## 2. What changed

**One rule, two homes, and the reason is stated in both.** The CT-side rule moved to the ISOMORPHIC helper
world (`tests/support/iso/hit-extent-walk.ts`) because it has two consumers in two compiler worlds — the
DOM-world kit and the NODE-world instrument proof, which used to keep a hand-copied THIRD spelling of the
predicate and could therefore report "the two arms agree" while agreeing only with itself. The product
walker stays a separate implementation: it is raw JS inside a template literal, above the test tree in the
layer cake, so neither direction can import the other. The two are pinned EQUAL on shared fixtures by
`tests/tooling/ui-audit/ops/walker/hit-extent.int.test.ts`, which runs the kit's rule inside the page the
walker is judging, in the SAME run.

**The predicate.** A pseudo carries a hit area only when it is generated, out of flow, paintable, ABLE TO
TAKE A POINTER (`pointer-events !== none`), and resolves to a rect that reaches PAST the border box;
ancestor credit is then granted only at points INSIDE that rect (half-open, matching the walker's
`HIT_PROBE_INSET` ruling). The rect is computed from the resolved `left/right/top/bottom` — which for an
absolutely positioned box are the used distances from the containing block's padding edges, so no `width`
read and no `auto` fallback branch is needed — plus the centring shift, which Tailwind v4 spells as the
standalone `translate` property (percentages of the pseudo's own box) and hand-written CSS spells as a
matrix. Anything unstatable (a rotation, a scale, an `auto` inset, a `fixed` pseudo, a static host) is
REFUSED, which under-reports; over-reporting is the direction that hides defects.

**`pointer-events` is load-bearing, not decoration.** The pre-#1843 cascade left the hit-area utilities'
`width`/`height`/`translate` intact (the unlayered ring rule only overrides the properties it declares), so
that pseudo still describes an OUTWARD rect. Geometry alone would credit it. The negative controls below
exist to hold that clause down.

**Node-testable arithmetic.** `readPseudoGeometry` (page) is a dumb reader, `pseudoHitRect` /
`pseudoHitEnvelope` are pure functions of plain data, `walkFrom` (page) walks. That split is also what keeps
each function inside the cognitive-complexity budget without a suppression — one self-contained function
carrying the whole algorithm scores 79 against a budget of 15, and a new `noExcessiveCognitiveComplexity`
suppression would have tripped the `suppressions` policy's EXCEED arm.

## 3. The control matrix (all committed, both pointers)

| control | where | direction | result |
| - | - | - | - |
| pre-#1843 ringed glyph (reconstructed cascade) | `touch-floor.ct.tsx` `#2300` | NEGATIVE — must measure below the floor | see §5 |
| pre-#1843 ringed glyph, judged by the PRODUCT walker | `hit-extent.int.test.ts` (`ringed-glyph`) | NEGATIVE — must be a `tap-target` finding | PASS: `tap-candidates=4 tap-judged=4 tap-affected=2`, `short side 25px` |
| pre-#1843 ringed glyph, kit walk in the SAME run | `hit-extent.int.test.ts` | NEGATIVE — walk must stay under 44 | PASS |
| glyph-sm `intent="ghost"` | `touch-floor.ct.tsx` `#662` | POSITIVE | see §5 |
| glyph-sm `intent="primary"` (ring + hit pseudo) | `touch-floor.ct.tsx` `#1843` | POSITIVE | see §5 |
| `inline` `intent="primary"` (ring overlap) | `touch-floor.ct.tsx` `#1843/#2301` | POSITIVE | see §5 |
| `inline` default + primary + ghost, HIT-TESTED | `button.ct.tsx` `#2301` | POSITIVE + a one-pixel-out NEGATIVE arm | see §5 |
| glyph-xs both intents, hit-tested | `button.ct.tsx` `#1843` (pre-existing) | POSITIVE | see §5 |
| plain box alone in a padded wrapper | `touch-floor.ct.tsx` `#662`, `design-audit-walker.ct.tsx` | NEGATIVE — no wrapper credit | see §5 |
| pseudo-carried control whose ring prose overlaps | `design-audit-walker.ct.tsx` `#807` (tight-row arm) | NEGATIVE — caps below the isolated arm | see §5 |
| a floored value + a bare value | `hit-extent.int.test.ts` (pre-existing) | both directions | PASS |
| the pure geometry: centred rect, matrix spelling, ring, collided ring, unstatable inputs, union | `tests/support/iso/hit-extent-walk.test.ts` | 8 cases, both directions | PASS (8/8) |

## 4. Deviations, with receipts

1. **The `#807` differential fixture was re-pointed, and the old arm now asserts EQUALITY.**
   `WalkerRowWrappedGlyphStory` placed its prose column at the row's `+30px`, which is the geometry
   measured live on Settings→Plugins. With credit scoped to the pseudo's rect, that prose is past the
   glyph's real reach at every root scale, so the row-wrapped arm and the isolated arm now measure the
   SAME — and the gap the old test asserted was the ISOLATED arm's fabricated wrapper credit, not the
   row's loss. Deleting the arm would have deleted a live measurement; weakening it to `<=` would have
   made it vacuous. So the live arm now asserts `inRow === alone` (a real claim: a probe that reports a
   smaller target for a control nothing overlaps is measuring its wrapper), and a THIRD arm
   (`glyph-in-tight-row`, prose at `1.3rem` — inside the pseudo's reach at both root scales) carries
   \#807's discriminating `<`. Without it #807's ruling would have had no arm that can fail.
2. **`eslint.config.js` gained one entry.** `TEST_TREE_PROJECTS` claims to be "every TS program that ROOTS
   a file under tests/\*\*" and was missing `tsconfig.tests-iso.json` — invisible until now because the
   isomorphic helper world was DECLARED (a tsconfig, a dep-cruiser direction rule, a helper-world root)
   and EMPTY. The first module landing there made its sibling test unparseable
   (`Parsing error: … not found in any of the provided project(s)`): an imported helper is pulled into the
   importer's program, a test nothing imports is rooted only by its own world. Approved by the coordinator
   before landing.
3. **The `tsconfig-entry-liveness:tests-iso-helpers` reviewed grant was DELETED.** Its `endsWhen` reads
   "the first tests/support/iso source lands", which is this lane. Measured both ways: with the new files
   untracked the gate was green (`granted 9`) because it reads GIT-TRACKED files; with `git add -N` it
   alarmed `[stale-reviewed-grant] … unused after a complete owner run`; after the deletion it is clean at
   `granted 8`, `0 alarm(s)`. Approved by the coordinator before landing.
4. **A misparented JSDoc block was re-homed.** In `tests/tooling/_ct-stories.tsx` the "PSEUDO-CARRIED
   companion" doc block sat immediately above the `#807` doc block, describing
   `WalkerPseudoCarriedIsolatedGlyphStory` forty lines away — the exact re-parenting an insertion anchored
   on the wrong line produces. It now sits on the function it describes.
5. **Every Button fixture in the touched stages pins `intent` explicitly.** The default is `primary`, which
   stamps `data-cta`; two stages whose names and comments claimed to measure the plain glyph were
   measuring the RINGED one. The ringed arm is now its own stage rather than an accident.

## 5. Verification

Node-side, all green:

- `pnpm test:scoped tests/support/iso/hit-extent-walk.test.ts tests/tooling/ui-audit/ops/walker/hit-extent.int.test.ts` → **10 passed** (8 unit + the 2 instrument-proof arms).
- `pnpm exec biome check <11 files> --diagnostic-level=error` → clean.
- `pnpm exec eslint <11 files>` → clean (after deviation 2; RED before it, with the parse error quoted above).
- `pnpm typecheck --config tsconfig.tests-iso.json --config tsconfig.tests-dom.json --config tsconfig.json --config tooling/tsconfig.json` → 4 runnable, 4 PASS (the four programs the planner named for the touched set).
- `pnpm check:structure --check tsconfig-entry-liveness --check tsconfig-entry-liveness-health --check eslint-grant-liveness` → clean.
- `pnpm check:structure --check dangling-refs` → 2 findings, both PRE-EXISTING and untouched by this lane
  (`docs/architecture/core/Core-Path-Registry.md:146`, backticked `domain/hub` — a domain purged in the
  2026-07-22 hub drop). Filed below.

Browser-side: see the CT section appended at the end of this document.

## LEDGER ROWS (2 rows)

- `ui-audit` · wave n/a · `docs/architecture/core/Core-Path-Registry.md:146` · a living law doc cites the
  backticked path `domain/hub`, purged in the 2026-07-22 hub drop, so `dangling-refs` reports 2 findings on
  a clean tree · class: drifted-doc/pre-existing gate red · state: OPEN, out of this lane's scope ·
  receipt: `pnpm check:structure --check dangling-refs` on this worktree with only hit-geometry files
  modified, run slot `reports/runs/structure/agent-a384c9bc64477f381-3896549-…`.
- `@orb/ui tokens` · wave n/a · `packages/ui/src/tokens/tokens.json` (`spacing.glyph-xs` `$description`) ·
  the token vault still describes the glyph ramp's hit area as "Button's `glyph-*` ::after touch-target
  pseudo"; #1843 moved it to `::before` · class: drifted comment (same class as #2301) · state: OPEN,
  deliberately NOT fixed here — a `$description` edit requires `pnpm --filter @orb/ui tokens:build`, which
  regenerates shared files and is a wider blast radius than a prose sweep should carry · receipt:
  `/usr/bin/grep -n "::after" packages/ui/src/tokens/tokens.json`.

ledger rows OWED: 0

## side-eye owed

Nothing a user sees changed in this lane — the diff is instruments, fixtures and comments, plus one Button
CT that only READS. What a rendered lens is owed AFTERWARDS is the consequence of the walker now telling the
truth: **re-run `pnpm snap <route> --design-audit --mobile` across the RAIL surfaces and triage the
`tap-target` findings that were previously suppressed by fabricated wrapper credit.** Any control whose real
target was being reported as its wrapper's extent is now a genuine finding, and the population that changes
is exactly "a sub-floor control sitting alone inside a padded row" — the shape the old predicate could not
fail. That triage is a UX judgment (which of those are real affordance defects vs. deliberate sub-floor
decorations), not an instrument question, so it belongs to `side-eye` and not to this lane.

## 6. CT receipts (browser slot granted 05:04Z, released after Run C)

Three sequential runs, never two in one worktree (#1581), all `pnpm test:ct <paths>` from this worktree,
no `--workers` flag (the shipped default IS the shared-host cap).

| run | files | result | slot |
| - | - | - | - |
| A — the changed instruments | `tests/support/browser/touch-floor.ct.tsx`, `tests/ui/primitives/button/button.ct.tsx`, `tests/tooling/design-audit-walker.ct.tsx` | **105 passed · 0 failed · 0 flaky** | `reports/runs/ct/agent-a384c9bc64477f381-3918273-2026-09-13T05-05-01-746Z` |
| B — every live consumer of the kit (7 files) | automation `rules-section`, chat `chats-section`, character `character-create-actions`, rpg `rpg-pack-rows` / `rpg-actor-trackers` / `turn-tool-calls-disclosure` / `rpg-context-section` | 248 passed · **1 failed** (see below) | `reports/runs/ct/agent-a384c9bc64477f381-3927456-…` |
| C — the repaired file, re-run | `tests/client/features/rpg/lib/rpg-context-section.ct.tsx` | **143 passed · 0 failed · 0 flaky** | `reports/runs/ct/agent-a384c9bc64477f381-3944464-…` |

Run A settles every "see §5" row of the control matrix in §3: the pre-#1843 ringed glyph measures below the
floor at BOTH pointers, both post-fix glyph intents and the `inline` primary clear it at both pointers, the
box-carried control still fails, the walker's own #662/#807/#1067/#1829 arms all hold with the re-pointed
tight-row arm, and the new `inline` hit-test pins pass in and out.

**The one Run B failure was a PRE-EXISTING red, not a consequence of the fix** — and finding it is what
running the whole consumer set was for. `rpg-context-section.ct.tsx`'s GLYPHFIX floor test asserts a glyph
button's hit area exceeds its box by reading `getComputedStyle(el, "::after").width`; #1843 moved that hit
area to `::before` at `9ad17fb5a` (2026-09-12) and this reader was not swept with it. A ghost glyph has no
`::after` at all, so the read was `parseFloat("auto")` = NaN, `NaN > height` is false, and the poll could
never pass. Causal receipt that it is not this lane's: the value depends only on
`packages/ui/src/primitives/button/variants.ts` + `globals.css`, and
`git diff --name-only main...HEAD | grep -c '^packages/'` = **0**. It is the same class as #2301 — a reader
that still names the old pseudo — so it was fixed here (`78a3da29e`) rather than filed, and Run C proves it.

It also demonstrates the hazard in its own right: this test is in the `--push` tier, so a `pnpm check` green
says nothing about it, and it had been red for a day.

## Integration provenance (2026-09-13)

The three lane commits landed as `815741e6c`, `0b0fa1349`, and `765dcdd71`. Independent source review
accepted the implementation. The two integrated node/instrument files passed 10/10 at `028e278ee`
within `reports/runs/test/main-4058674-2026-09-13T05-33-08-762Z/test-report.json`.
The CT receipts above belong to the lane checkout. Current-main CT verification and the rendered
RAIL tap-target triage remain owed; these node results do not establish either outcome.

## LEG 2 — the pin that was not a pin (rework, 2026-09-13)

`cb-v-hit-geometry` REFUTED this report's claim 1. The refutation is correct and its receipts reproduce:
the fix was right, its PROOF was not. On `DOCUMENT` every hit pseudo SELF-REPORTS, so ownership clause 1
answers and clause 2 — the entire subject of #2300 — never runs; `ringed-glyph` is capped by `hitForwards`
against a 25px wrapper under BOTH predicates. Reverting the walker to the pre-#2300 existence-only
predicate, deleting its `pointer-events` clause, or disabling the kit's credit each left the suite 10/10
GREEN, with two planted controls proving the edits were live. The sentences at
`tooling/src/ui-audit/ops/walker/hit-extent.ts:126-127` and in the kit header asserted a property nothing
held. Both are rewritten to what the pins now prove; neither claims equality of the published extents.

### The red-first matrix (all measured this session, one child process per cut, restored in a `trap`)

| fixture | unmodified | walker reverted to existence-only (probe B) | walker `pointer-events` clause deleted (probe A) | kit ancestor credit disabled (probe C) | kit transform refusal deleted (probe D) |
| - | - | - | - | - | - |
| OLD `DOCUMENT` (the shipped arms) | pass | pass — **the false clean** (cb-v probes, 10/10) | pass | pass | pass |
| `credit-capped` (30px pseudo, 20px box) | pass | **RED** `expected [] to include '[data-slot=credit-capped]'` | pass | pass | pass |
| `credit-unreachable` (60px pseudo, `pointer-events: none`) | pass | **RED** (same empty census) | **RED** `expected ['…credit-capped'] to include '[data-slot=credit-unreachable]'` | pass | pass |
| `credit-clipped` (60px pseudo behind a 30px `overflow: hidden`) | pass | pass | pass | **RED** `expected '30x30' to be '60x60'` | pass |
| envelope equality arm (both homes, same page) | pass | pass | **RED** `credit-unreachable: expected '120,995,180,1055' to be 'null'` | pass | pass |
| unit: scaled-ancestor refusal | pass | pass | pass | pass | **RED** `expected { left: 111.25, …, right: 153.75 } to be null` |

Probe logs: `xhit-l2-probe{A,B,C,D}.log` in this session's scratchpad, each opening with the planted diff.
Baseline after every restore: **13 passed** (`git status --short` showed only the four intended files).

Why each stage can reach clause 2 where the old one could not: the stage is 300x300, textless and holds
ONE control, so a probe that leaves the control lands on an ancestor that CONTAINS it (`hitForwards`
passes, which the 25px wrapper denied); the control is centred with ≥100px of clear space (no rung falls
off the frame); nothing else is offered (`sharedCompositeOwns` cannot be what decided).

### The numbers arm, and the equality I refused

The brief asked for EXACT equality of the two homes' numbers on the same element. **Refused, with the
measurement:** the walker publishes `2 × rung` from the ladder `[11, 12, 16, 22]` and the kit walks 1px at
a time, so on `credit-clipped` the same element is 44 (walker) and 60 (kit) — a difference the two
algorithms are DESIGNED to have and which #1678's header has stated since it was written. Equating them
would mean deleting one of the two algorithms. What is pinned instead, and what "pinned equal" now means
here:

- **the CREDIT ENVELOPE, exactly.** `PSEUDO_ENVELOPE_SOURCE` (composed from the kit's real functions) and
  the walker's own `pseudoHitEnvelope` (evaluated from `WALKER_HIT_EXTENT`, the real product string) run
  on the same elements in the same page, and every pair must be string-identical. This is the #2300 rule
  itself, and probe A shows it catches a one-sided change (`120,995,180,1055` vs `null`).
- **each home's own numbers, exactly**: walker verdicts by selector (2 findings of 4 candidates), kit
  extents `30/60/20/44`. The half-open band makes the count `2r`, not `2r − 1`; the first run answered 30
  where the author had written 29, and the comment now records that it was measured rather than predicted.

### Ledger row 4 (the scale mix) — FIXED, not scoped out

Both homes now REFUSE credit where the coordinate spaces disagree. `getBoundingClientRect` is
post-transform and the resolved insets are local px; the layout box (`offsetWidth`/`offsetHeight`) is
transform-free, so `border` disagreeing with it by more than 0.5px is the tell — from any ancestor, at any
depth, for scale and rotation alike — and an element with no offset box is "cannot tell", which lands on
the same refusal. Refusal rather than conversion because the scale would have to be recovered from a
`Math.round`ed integer, and an approximation inside the credit band is an over-credit waiting to happen; a
transformed control now measures its own box, which is a finding to dismiss rather than a defect nobody
hears about. The unit arm asserts BOTH sides: the exact over-credit the verifier measured
(`{111.25, 111.25, 153.75, 153.75}` for a truth of `{112.5, 112.5, 140, 140}`) is what the old code
answers, and `null` is what the new code answers. `visibility: collapse` and `display: contents` (the same
row's fence-completeness half) are refused too, in both homes.

### Floor

`pnpm test:scoped tests/support/iso/hit-extent-walk.test.ts tests/tooling/ui-audit/ops/walker/hit-extent.int.test.ts`
→ **13 passed** (9 unit + 4 instrument-proof arms; slot
`reports/runs/test/agent-a384c9bc64477f381-104405-2026-09-13T06-15-16-295Z`) · scoped `biome` and
`pnpm exec eslint` on the four touched files → clean ·
`pnpm typecheck --config tsconfig.tests-iso.json --config tsconfig.json --config tooling/tsconfig.json` →
3 runnable, 3 PASS. No CT and no browser run from this leg.

`ledger rows OWED: 0` — this leg CLOSES cb-v rows 1 (the unpinned invariant) and 4 (the coordinate mix,
including the `collapse`/`contents` half). Its rows 2 and 3 (`setting-teach-row.ct.tsx:353-360` and
`params-deck.ct.tsx`'s `|| 0`-blinded reads) are the same #2301 class and are NOT touched here — they are
CT-tier work and this leg was told to run no CT.
