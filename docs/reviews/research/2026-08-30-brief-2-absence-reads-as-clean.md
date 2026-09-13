---
kind: review
status: active
updated: 2026-08-30
---

# Brief 2 — absence reads as clean: the planted-control contract is already machinery; what recurs is not that

Research lane `nate-research` (worktree `wt/nate-research` @ `7f574337a`), 2026-08-30. Read-only. Every
claim carries a `path:line` or command receipt from this session; negatives carry scanned counts.

## 0. The answer in five sentences

1. **The planted-control contract is mechanized at three tiers already**, and every one of the eight
   registered instruments carries both proof classes (18 `@instrument-absence-proof` markers across 8 tool
   dirs; gate `tooling-instrument-proof` REDs a missing one). The doctrine line in `lane-standing-facts.md`
   is not the only enforcer of itself.
2. **The rows filed after #410/#722 are six distinct failure shapes, and only two of them are "absence reads
   as clean."** The others are: a rule that did not exist (#816), a rule that fires on its nearest legitimate
   neighbour (#825, #851, #871), a probe reading `null` as "no" (#797), and an input shape parsed silently
   (#452, #509, #550). No generic harness mechanism catches a rule that does not exist or a rule that is
   imprecise — those are caught by a human looking at a PNG, which the coverage tables already require.
3. **What the fleet does per run is DENOMINATORS, not planted controls** — design-audit's RESULT line carries
   eleven of them — and what it does per commit is the planted proofs. That split is correct: a per-run
   self-check proves the detector; a denominator proves the population; #808 was a denominator judged only
   at zero, and its fix (measure the population twice) is the general form of the lesson.
4. **Two things are still conventions and can become contracts**: (a) the denominator set is per-tool prose
   (each `lib/evidence.ts` decides which zeros refuse) — a shared `printVerdict` that REFUSES a clean
   verdict whose declared denominators are absent, zero, or unstable would make #808/#653's shape
   unrepresentable fleet-wide; (b) argv strictness is per-tool (`_shared/argv.ts` is a helper library, not a
   parse door), so #452's class has no fleet enforcer.
5. **The measurable residue in the tool that produced five of the seven rows**: design-audit has 43 rules in
   8 check files, 42 spelled in some test, 1 never (`landmark-missing`) — and no rule registry, so nothing
   demands a *fires* AND a *nearest-neighbour-silent* fixture per rule. That pair is the #825/#851 shape.

## 1. What exists (receipts)

| Tier | Mechanism | Receipt |
| - | - | - |
| fleet | `EvidenceGap` + `instrumentError` → `EXIT.toolError`, `INSTRUMENT-ERROR` verdict, never PASS/FAIL | `tooling/src/_shared/evidence.ts:17-42` |
| fleet | exit honesty: crash ≠ verdict, pipe drain, no-downgrade lattice; every cli enters `runTool` | `_shared/run-tool.ts:23-56`; enforced by `tooling-shared-plumbing` arm E (`gates/tooling-shared-plumbing.ts:1-8`) |
| fleet | `INSTRUMENT_TOOLS` registry (8 members) × 2 proof classes per member, two-sided, malformed-marker arm, rename tripwire | `_shared/instruments.ts:10`; `gates/tooling-instrument-proof.ts:27-38,132-183`; markers: `/usr/bin/grep -rn "@instrument-absence-proof:" tests/tooling` → 18 lines in ui-audit(9), render-trace, cpu-profile, mutation-probe(2), snap, mutation-arid, wire-tap, motion-audit |
| per tool | evidence modules: ui-audit (readiness / census / thin / reach), motion-audit (apparatus-ordered, quiet-frames honest-empty), cpu-profile (meter + steps), render-trace (spans vs empty list), review-mirror (fail-closed census), snap (`NOT FOUND`/`failed:true`) | `ui-audit/lib/evidence.ts`, `motion-audit/lib/evidence.ts:35-82`, `cpu-profile/lib/evidence.ts`, `render-trace/lib/evidence.ts`, `review-mirror/lib/evidence.ts` |
| per run | design-audit RESULT denominators: `census`, `dom-walk`, `dom-settled`, `reached`, `skipped-offviewport`, `no-probe-frame`, `reveal-budget`, `obscured-scanned`, `obscured-unaskable`, `px-backdrops`, `no-verdict` | `ui-audit/ops/run.ts:166-198` |
| gates | scan health — `scanned === 0` at real-tree scope is exit 2; `ctx.scan({admitted})` owed by ledger gates (ARM D) | `GATE-AUTHORING.md` §1; `verify/ops/structure.ts:125,155` |
| gates | run manifest (#410): written in-flight then complete; `ran === active` reconciled before any 0/1 | `verify/contract/run-manifest.ts`; `structure.ts:63-76,110-159` |
| gates | conformance: every `mustFlag`/`mustPass` through the real dispatcher, on two substrates | `tests/tooling/gate-conformance.int.test.ts` (test tier); the loader validates proof PRESENCE at every load (`verify/lib/loader.ts:50-51`) but EXECUTES proofs only at `tests:node` — `pnpm verify --list` carries no conformance stage in `static` |
| ast | scan ledger epilogue; zero-scan exit 2; flag-shaped positional refuses (#452) | `ast/cli.ts:1-12,49-60`; `ast/lib/ledger.ts` |
| CT | unfed-read RATCHET with a LIVENESS marker: `[routeTrpc] ACTIVE` per registration; an executed file that owes a marker and announced nothing is a REFUSAL, not a clean zero | `verify/ops/ct-flaky-reporter.ts:22-36,244-258,272-285,312-314` |
| e2e-live | a run whose every test skipped fails the reporter | `verify/ops/required-live-evidence-reporter.ts:23-34` |

RESULT-line emitters vs the registry: `printResult("…")` is called by design-audit, snap (+scenario/matrix),
motion-audit, perf-meter, render-trace (`probe-fire`), wire-tap, mutation-probe, mutation-arid — all
registered — plus `record` (screen-record, a recorder, not a verdict) and `review-mirror` (carries its own
fail-closed evidence module but sits OUTSIDE the registry, so nothing obliges it to prove both classes).
Verdict-shaped tools with no RESULT line and no registry row: `stack status` (fresh/stale/unreachable/
unverifiable, #524), `seed`, `model-ab`, `doc-catalog`, `workboard`, `agent-sync` — each honest by its own
convention.

## 2. The recurrences after #410 (Aug 22) and #722 (Aug 26), classified

| Row | What actually lied | Class | Already mechanized where it happened? |
| - | - | - | - |
| #797 (08-29) | `elementFromPoint` returns `null` off-viewport; the probe read null as "another element owns it" and collapsed 44→18 | **NULL-IS-NOT-NO** (probe semantics) | yes, after: per-point frame guard + `extentTruncated` lower bound (`walker/hit-extent.ts:14-26,198-235`) |
| #808 (08-30) | census 22 of 1421 printed clean — `censusGap`/`reachGap` fire only at 0 | **THRESHOLD-AT-ZERO** (a denominator judged only at zero) | yes, after: `censusThinGap` measures the population twice (`lib/evidence.ts:81-116`) |
| #816 (08-30) | 0px-wide label and a 48px sibling overlap — no rule family existed for either | **NO-RULE** | n/a — nothing can refuse on a rule it does not have; caught by "the PNGs, actually looked at" |
| #825 (08-30) | `text-overflow` fired on a correctly-ellipsised title | **PRECISION-NEIGHBOUR** (the nearest legitimate shape not fenced) | yes, after: ellipsis + affordance arms, fixtures both ways |
| #851 (08-30) | `duplicate-action-door` read sibling rows as distinct homes at coarse | **PRECISION-NEIGHBOUR** (identity) | yes, after: `(container,item)` list identity |
| #871 (open) | nine 22×22 hint P1s appeared with #807's text-refusal | **PRECISION-NEIGHBOUR** or a true finding — undecided; the issue itself says "planted control decides" | pending |
| #452 (08-22) | `pnpm ast jsx --name Button` searched for the flag and printed `matches=0` | **INPUT-SHAPE-SILENT** | yes, in `ast` only (exit 3 + did-you-mean) |
| #509 (08-22) | the doc's prescribed spelling loaded a main-less module and exited 0 | INPUT-SHAPE-SILENT (entry) | yes, fleet: `refuseDirectInvocation` on every ops module |
| #550 (08-23) | a bare prose selector parsed as a CSS type chain | INPUT-SHAPE-SILENT | yes, in `snap` only (selector-shape refusal on 19 flags) |
| #653 (08-24) | off-viewport hosts skipped, silence reported clean | **POPULATION-UNREACHED** (no denominator) | yes, after: scrollIntoView + reach denominator + refusal |
| #619 (08-24) | clause C `return []` when the mirror was `.test.ts` | **INERT-ARM** (a code path that structurally cannot fire) | yes, after: refuse on unreadable corpus |
| #637 (08-24) | CT stubs fed `null`, pipelines ran inert, tests green | INERT-ARM (test tier) | yes: the ACTIVE liveness marker + ratchet |

Two facts fall out. First, **five of the seven Aug 29–30 rows are inside ONE instrument** (design-audit),
and four of those five are RULE-level (no rule / imprecise rule) — the instrument was gaining rules at
~2/day and each new rule found its own nearest false neighbour. Second, **every "absence" row was fixed by
adding a denominator or a liveness marker, never by a planted control** — the planted control is what
proves the fix, not what detects the class.

## 3. What a same-invocation planted control would and would not have caught

Take the brief's proposal literally: every instrument run first walks a known-positive fixture (a second
page in the same browser session, ~1–2s) and refuses if its detector does not fire.

| Would catch | Would NOT catch |
| - | - |
| INERT-ARM (#619's shape at the instrument tier — a family that returns `[]`) | NO-RULE (#816) — the fixture only carries the rules the author knew to plant |
| INPUT-SHAPE-SILENT for the walker's own args | THRESHOLD-AT-ZERO / POPULATION-UNREACHED (#808, #653) — those are facts about the REAL page's population, invisible on a fixture |
| a renamed selector/marker that silently stopped matching (the `snap` premise in `tooling-package.md` §4.5) | PRECISION-NEIGHBOUR (#825, #851) — a fixture that fires proves recall, not precision; the neighbour fixture is a SECOND, different plant |
| — | NULL-IS-NOT-NO (#797) — a viewport-geometry fact |

So the per-run self-check buys the two shapes the per-COMMIT proofs already cover (`tooling-instrument-proof`
runs at `tests:node`; every instrument lane's floor ran them: "ui-audit 168/168", "163/163", "171/171" on
the three fixing commits), at a cost paid on every design-audit run by every lane. Not worth defaulting;
worth an opt-in `--self-check` for the day a lane suspects the walker itself.

## 4. What CAN be mechanized fleet-wide, and its enforcer (§2.3)

| Move | What it makes unrepresentable | Enforcer | Cost |
| - | - | - | - |
| **A shared verdict door.** `printResult(tool, pairs)` (`_shared/artifacts.ts:19-23`) is a printer. Add `printVerdict(tool, { verdict, denominators: { name: { value, refuseWhen: "zero" \| "unstable" \| "below" , floor? } }, pairs })` in `_shared/evidence.ts` that (a) prints the RESULT line, (b) REFUSES (exit 2 + `INSTRUMENT-ERROR`) a clean verdict whose declared denominator set is empty, or any member is `-1`/absent, or violates its own `refuseWhen`, and (c) allows an explicit `honestEmpty: <reason>` per denominator (motion-audit's quiet-frames case, `motion-audit/lib/evidence.ts:47-56`) so the honest-empty arm stays honest and SAID. | THRESHOLD-AT-ZERO and POPULATION-UNREACHED, for every present and future instrument — a tool can no longer print `findings=0` beside an undeclared or zero population | gate: `tooling-instrument-proof` gains arm F — an `INSTRUMENT_TOOLS` member whose ops call `printResult(` directly instead of `printVerdict(` is RED (sanctioned-door shape, `no-raw-zustand-persist` precedent) | small: one helper, 8 call-site migrations, one arm, mustFlag/mustPass |
| **Per-family liveness on the RESULT line.** design-audit publishes reach for tap-target/action-door/obscured only; the text, typography, colour, a11y, decor and structure families fold silently. Each family announces `scanned-<family>=N`; a family enabled for the run that reports 0 on a page whose census is non-zero is a REFUSAL (the ct-unfed ACTIVE-marker shape, `ct-flaky-reporter.ts:244-249`). | INERT-ARM at the instrument tier — #619's shape can no longer hide inside one family | the same verdict door: a family denominator is a declared denominator with `refuseWhen: "zero"` | small |
| **A closed rule registry + a per-rule fixture PAIR.** Rule ids are 43 free string literals across 8 check files (`nr-rule-census.py`: 43 rules, 42 spelled in some test, `landmark-missing` in none). Home them as one `as const` table with `family`, `severity`, and the gate `design-audit-rule-proof` requires, per id, a `// @rule-fires(<id>): <plant>` AND a `// @rule-silent(<id>): <nearest legitimate neighbour>` marker in `tests/tooling/ui-audit/**` or the walker CT — two-sided (a marker naming a dead id is RED). | PRECISION-NEIGHBOUR for every rule that exists — #825's ellipsis and #851's sibling rows would each have been a required `@rule-silent` plant at the rule's birth | gate (`tooling-instrument-proof` one level down; same marker grammar) | medium: 43 rules owe a neighbour fixture each — most already have the fires half |
| **Fleet argv strictness.** `_shared/argv.ts` is six helpers (`splitLastEq`, `splitFirstEq`, `splitSelectorEq`, `parseViewport`, `splitPageSuffix`, `parseGotoTarget`); every cli parses its own argv, so an unknown token's fate is per-tool. A shared `parseArgv(spec)` that REFUSES unknown tokens and flag-shaped positionals (exit 3, did-you-mean — `ast/cli.ts:49-60` is the worked shape) + `tooling-shared-plumbing` arm G (a cli.ts that reads `process.argv` outside it is RED). | INPUT-SHAPE-SILENT (#452, #550's class) for every tool | gate arm (the plumbing gate's existing shape) | medium: ~14 cli migrations |
| **Register `review-mirror`.** It has a fail-closed evidence module and no proof obligation. | a verdict tool outside the registry | one row in `INSTRUMENT_TOOLS` (+ its two markers) | trivial |

What stays un-mechanizable, and should be said so: NO-RULE. The coverage tables' row "the PNGs, actually
looked at — RAN" (`docs/reviews/side-eye/2026-08-29-saved-casts-rules.md` §9 row 8) is the instrument for
it, and both Aug-29/30 reviews caught their instrument lies exactly there.

## 5. Two premises in the brief, corrected

- *"It is doctrine, not machinery."* It is both. The doctrine line names the same-INVOCATION plant; the
  machinery implements it as per-run denominators + per-commit plants. The gap is that the denominator
  contract is per-tool prose rather than a shared refusal, which is §4 row 1.
- *"That single change would have caught #452, #509, #550, #653, #808, and #816."* By class: a shared
  verdict door catches #653 and #808; fleet argv strictness catches #452 and #550; `refuseDirectInvocation`
  already catches #509; nothing catches #816.

## 6. Issue-summary paragraph

The planted-control contract is already machinery at three tiers (fleet `EvidenceGap`/exit honesty, the
`tooling-instrument-proof` gate over all 8 registered instruments with 18 absence proofs, gate scan-health +
the #410 run manifest, the CT ACTIVE-marker ratchet). The Aug 29–30 recurrences are six shapes, of which
only two are "absence reads as clean" (#653 population-unreached, #808 threshold-at-zero); the rest are a
rule that did not exist (#816), imprecise rules (#825/#851/#871) and silent input shapes (#452/#550) — and
five of seven live in one fast-growing instrument. The fleet-wide levers that remain are contracts, not
plants: a shared `printVerdict` that refuses a clean verdict over an undeclared/zero/unstable denominator
(enforced as a sanctioned-door arm on `tooling-instrument-proof`), per-family liveness on design-audit's
RESULT line, a closed rule registry with a required fires+neighbour-silent fixture pair per rule (43 rules,
1 currently unpinned), and a shared strict argv door (`tooling-shared-plumbing` arm G). A per-run self-check
fixture is worth an opt-in flag, not a default: it duplicates the per-commit proofs and catches none of the
population or precision shapes.
