---
kind: review
status: active
updated: 2026-09-12
---

# cb-v-suite-honesty — adversarial verification of 91d9a2ab7 (+ 90bbeb04f)

Fresh-context verifier, own isolated worktree at main's tip (`90c7be9e7`). Every number below came from a
run in THIS session; nothing is re-quoted from the lane's commit message. `pnpm check:structure` was HELD
per the brief — the structure evidence is read from the newest published main slot, named below.

## Verdict per row

| Row | Verdict | Receipt |
| - | - | - |
| #2043 integer-line-boxes, 4 markers translated | CONFIRMED | 4 waives on the tree; the published structure slot reports `waived: 5` (4 TS + the pre-existing CSS one), `alarms: []`, each marker consumed exactly once |
| #2064 no-hardcoded-model-prose, 15 live + 1 dead | CONFIRMED | 15 waives across 5 files (1+5+1+2+6); the slot reports `waived: 15`; the de-markered contracts file carries no marker and draws no finding |
| #2044 exemption count derived | CONFIRMED | the constant now sums both tables (6 + 4 = 10, was a literal 7); `gate-conformance.repo.int` green in my tree |
| #2031 spelling twins over the mixed corpus | CONFIRMED | `gate-spelling-twins.int` 3/3 green (117.8 s), both planted controls included — the suite the lane could not run |
| #1985 repair 1 (premise dead) | CONFIRMED | the 180 s scaled budget was already present at `91d9a2ab7^`; the vitest config's own default is a scaled budget |
| #1985 repair 2 (cgroup denominator) | CONFIRMED | live in this session: physical 24, cgroup cpu.max 800000/100000, `effectiveCpuCount()` = 8; quiet arms byte-identical, loaded arm 60 s → 120 s |
| #2052 probe corpus owns its legacy fixture | CONFIRMED | the fixture descriptor is authored source with no corpus import; `structure-mixed.suite.int` 9/9 green |
| #2053 over-art literal | CONFIRMED as scoped / **new defect** | the literal is gone and the suite is green — but the gate's declared debt owner is a CLOSED issue again (row L1) |
| #1969 derived proof-row counts | CONFIRMED | counts read off the shimmed policies; `policy-conformance-stage.int` 4/4 green |
| #2054 nine cites rewritten | CONFIRMED | `dangling-refs.repo.int` still red with exactly 20 findings, every one under this directory, none in the two core law docs |
| #2056 eslint misuse routes | CONFIRMED | live: exit 3 and the message names the scoped door; that door then runs clean on a real file |
| #2059 both doors admit this tree | PARTIAL | both doors proven on a planted file — but only when TRACKED (row L3), and the widening escapes prose identifiers (row L2) |

## What I ran (all in my worktree, all read in full)

- `pnpm test:scoped` batch A — `structure-mixed.suite.int`, `over-art-plate-arm.int`,
  `policy-conformance-stage.int`, `conformance.int`, `grant-liveness-family`, `origin-verdict`,
  the two shared load-budget suites (unit + int): **8 files / 52 tests passed, exit 0**, 196 s.
- `pnpm test:scoped` batch B — `gate-conformance.repo.int`, `gate-spelling-twins.int`,
  `gate-ignore-grammar.repo.int`: **3 files / 29 tests passed, exit 0**, 308 s. These are the four the lane
  declared NOT RUN; all four are green here.
- `pnpm test:scoped tests/tooling/verify/gates/dangling-refs.repo.int.test.ts`: **3 failed / 3 passed,
  exit 1** — the declared residue, quantified below.
- `pnpm check:ledgers-fresh`: exit 0, all four derivations fresh (2644 / 596 / 123 / 13).
- `pnpm check:docs` and `pnpm format:docs` against a planted file, in both tracked and untracked states.
- Marker reconciliation from the published main structure slot
  `main-2930600-2026-09-12T13-42-50-932Z` (started 13:42:50Z, finished 13:48:17Z — after the commit):
  1197 ordinary markers, every one `count: 1`, `authority.alarms: []`, `waiverCarrierRefusals: []`,
  `withheldPolicyIds: []`, 297/297 modules ran. Legacy census at the pre-conversion parents: 4 legacy
  markers for the line-box policy and 16 for the prose policy, versus 4 and 15 waives plus 1 de-markered
  today — `current <= legacy` on both, with the single drop classified as the dead one.

## LEDGER ROWS (3 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `over-art-plate-arm` | cb-v-suite-honesty L1 · `over-art-plate-arm.ts` `workItem: 2024` | the warning debt points at a **CLOSED** issue again (#2024 closed 2026-09-12T04:26:03Z, three hours before the commit that pointed at it), and its own done-when was unmet — the published slot still shows the policy reporting the composer surface and three message-bubble surfaces at warning. **#2053's repair removed the only witness**: dropping the `workItem` literal from the suite is sound about the TYPE (the warning arm requires a positive number) but positivity is all anything checks, so the rot is now UNWITNESSED rather than witnessed-and-stale | other (debt owner) | **OPEN — #2070, lane `p-enforcer-and-render`** | validate OPENNESS where positivity is validated |
| the widened docs formatter | cb-v-suite-honesty L2 · `#2059` | the emitter escapes `_` `#` `~` `[` `*` in PROSE, which was always true but #2059 pointed it at the design and review trees — **the corpus agents grep**. Measured on that commit's own doc diff: **377 escapes added against 16 removed** (`~` 142, `[` 99, `_` 70, `#` 27). Reproducible counterexample: a literal search for the OIDC hint parameter in `docs/reviews/board-rederive/scout-D2-oidc-infra.md` returned **6 hits at `91d9a2ab7^` and returns 3 now** | other (instrument) | **OPEN — #2059 refuted, lane `p-doc-formatter-lossy`** | fix spec: leave `_`/`#` unescaped where they cannot start markup (both inert mid-word, `#` inert unless followed by a space), OR state the tradeoff in the formatter header so the next lane greps both spellings. **Silent is the one option that costs a search** |
| both doc doors | cb-v-suite-honesty L3 · `formatTargets` | resolving through `git ls-files` makes an UNTRACKED `.md` neither checked nor formatted — **an undeclared NARROWING against the old glob**, which covered untracked architecture docs. Planted control both directions: unformatted file left untracked → bare `check:docs` exits **0** ("351 file(s) formatted"); same bytes staged → exits **1** naming it; `format:docs` then rewrites it. **#2059's own positive control therefore holds only for the tracked half** | other (instrument) | **OPEN — #2059 refuted, lane `p-doc-formatter-lossy`** | fix spec: state it in the formatter header beside the tracked-corpus rationale, or union the tracked list with untracked `.md` inside the living trees |

*Table transcribed 2026-09-12 by the orchestrator (claude-b) from the ledger section this report seeded, so the reconciler in `ledgers:fresh` holds the two against each other; the three subsections below are the verifier's original findings and fix specs.*

### L1 — the over-art warning debt points at a CLOSED issue AGAIN, and #2053 removed the only witness

`over-art-plate-arm` declares `workItem: 2024`. Issue #2024 is CLOSED (2026-09-12T04:26:03Z), three hours
before this commit, and its own "done when" required the two measured contrast failures to be fixed and the
three structural ones measured first. They are not: the published slot shows the policy still reporting the
composer surface and three message-bubble surfaces at warning severity. So the live debt has no live owner —
the exact condition #2024 was minted to end, one pointer later.

`#2053`'s repair (drop the `workItem` literal from the suite) is sound reasoning about the TYPE system —
the warning arm of the policy contract does require a positive number — but positivity is all anything
checks. Nothing on the tree asks whether the number names an OPEN row, so this rot is now completely
unwitnessed rather than witnessed-and-stale.

**Fix spec (enforcement, not a re-pinned literal):** either give the four surfaces a live successor row and
repoint the field, or add the openness check where the number is validated so that a closed owner is a
structural refusal. A literal in a suite is what rotted twice; the third instance should be a rule.

### L2 — the widened docs formatter escapes prose identifiers, and literal grep is how this repo navigates

The formatter escapes `_`, `#`, `~`, `[` and `*` in prose. That was already true; #2059 pointed it at the
design and review trees, so it now rewrites the corpus agents grep. Measured over this commit's own doc
diff: 377 escape characters on the added side against 16 on the removed side (`~` 142, `[` 99, `_` 70,
`#` 27).

Reproducible counterexample: in `docs/reviews/board-rederive/scout-D2-oidc-infra.md`, a plain literal
search for the OIDC hint parameter returned 6 hits at `91d9a2ab7^` and returns 3 now — three occurrences
became the backslash-escaped spelling. Issue numbers take the same treatment (a backslash before the hash: 78 sites across 42 files under this review tree today, 27 of them introduced by this commit's diff). Rendered output is
unchanged; the loss is entirely to the readers this corpus is written for.

**Fix spec:** either teach the emitter to leave `_`/`#` unescaped where they cannot start markup (both are
inert mid-word and `#` is inert unless followed by a space), or state the tradeoff in the formatter's
header so the next lane greps for both spellings. Silent is the one option that costs a search.

### L3 — both doc doors are blind to an UNTRACKED document, which the previous glob was not

`formatTargets` now resolves through `git ls-files`, so an untracked `.md` is neither checked nor
formatted. Planted control, both directions, in my worktree: an unformatted file under this directory left
untracked → bare `pnpm check:docs` exits **0** ("351 file(s) formatted"); the same bytes staged → exits
**1**, naming the file; `pnpm format:docs` then rewrites it ("formatted 1/352"). The issue's own positive
control ("a planted unformatted file must red the bare command") therefore only holds for the tracked half.

The old glob covered untracked architecture docs, so for that tree this is a narrowing, not just a
widening. It is defensible — the header argues a draft is not a document — but it is undeclared as a
tradeoff and it changes what a lane's pre-commit sees for a doc it has not yet added.

**Fix spec:** state it in the formatter header beside the tracked-corpus rationale, or union the tracked
list with untracked `.md` files inside the living trees.

## Two cuts on the dangling-refs escape width (the rider skip #2054 rides past)

The rider skip is whole-LINE and keyed on vocabulary anywhere in that line
— the alternation is rider, truth-audit, purged, dead, died, and three "the former / the old / there is no" openers. Measured over the
169 catalogued living homes: **396 lines are escaped, and 116 of them carry backticked path or CONST
tokens** that the path arm therefore never examines.

- **Cut 1 — the escape is line-scoped where the sibling convention is span-scoped.** Struck-through prose
  is masked span-by-span; the rider convention swallows the whole line, so a live cite that happens to
  share a line with a historical one is unenforced. Real instances today in the D-ledger: rows whose lines
  escape while citing live homes (the credentials/connection contract split, the preset guided-action
  home, the macro engine home). None is currently a phantom — the point is that none is checked either.
- **Cut 2 — the vocabulary is ordinary English.** "dead", "purged" and "rider" appear in prose that is not
  making a historical claim at all, and any such line silently takes the whole exemption. The narrowing
  that costs nothing: mask the historical SPAN (the sentence or the parenthetical) the way strikethrough is
  masked, rather than dropping the line.

Not filed as a defect row: no phantom is currently hiding behind the escape that I could prove. It is a
width finding, and the fix belongs to whoever next opens that gate.

## WHAT I DID NOT COVER

- `pnpm check:structure` — HELD per the brief. Every structure claim here is read from the published main
  slot named above, not from a run of mine; if that slot predates any later merge, re-read it.
- The whole `pnpm check` battery, `--push`, and every product suite. Nothing outside the tooling test tree
  plus the two doc doors was executed.
- The 65 reformatted documents were not read for content change beyond the escape census; I verified the
  round-trip on a planted file carrying both hazard shapes (a code span holding a backtick, and pipes
  inside a GFM table cell) and both survived byte-correct.
- The three still-red arms of the dangling-refs suite were not triaged beyond confirming all 20 findings
  live under this directory and none in the two law docs #2054 repaired.
- I did not re-derive the lane's "4 of 54 escapes lossy" classification; my own census (L2) measured the
  commit's whole doc diff instead and found the loss to be grep reach, not rendering.
