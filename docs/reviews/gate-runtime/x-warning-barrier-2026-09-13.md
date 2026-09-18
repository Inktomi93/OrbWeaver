---
kind: review
status: active
updated: 2026-09-13
---

# cb-x-warning-barrier — the warning-`workItem` liveness barrier (#2070)

Lane `cb-x-warning-barrier`, isolated worktree `agent-a413f153774cb57e9`, base `ce8e5174f`. One commit:
`8ebe65dc3`. No push, no rebase, no `work:item` write, no agent spawned, no main/catalog/ledger edit.

## 1. The collision, stated first because it shaped the build

`pnpm work:item show 2070 2156` (read-only, this session) reports **#2156 — "board-referencing citations are
unchecked (ledger closure #N, **policy workItem openness**, roster #N): one barrier verb that reconciles them
against the board, exit 2 offline" — Status `Running`, Lane `p-barrier`.** Its body names three citation
classes and its class 2 is this row verbatim, citing #2070 by number, and it prescribes the same shape my
brief prescribes: one verb, one board read, exit 1 on a crossed citation, **exit 2 unreachable**, planted
controls including "a closed workItem", run at the barrier beside `ledgers:fresh`.

So #2070's barrier is a strict SUBSET of a verb a live sibling lane owns. Arms priced, stated to the
orchestrator mid-run with a default, and **arm B taken**:

| Arm | Cost |
| - | - |
| A — a second verb (`check:workitem-liveness`) | two barrier doors for one job; guaranteed 3-way conflict with `p-barrier` on `package.json`, `contract/verbs.ts`, `cli.ts`, `lib/verb-tail.ts`, `lib/registry.ts`; a rename-or-retire door the day #2156 lands |
| **B — the judgment as an injectable-reader `lib/`, no front door** | `p-barrier` wires it in one import; the orchestrator can promote it to its own verb in one commit; zero collision surface |
| C — carriers only | leaves the measured defect unbuilt |

**REGISTRY DECISION: no `package.json` row, no `VERIFY_VERBS` member, no `lib/registry.ts` row in this
commit.** If the orchestrator rules arm A instead, the row belongs in `MANUAL_ONLY_STAGES`, not in `STATIC` —
the exact precedent is `structure:ledger-claims`, *"the BARRIER check … `manual` BY NATURE rather than by
cost"*. This check needs the network and `gh` auth; the commit bar must stay offline-capable, and the
owner-approved forge ruling on #2070 says "run at the quiet barrier beside `ledgers:fresh`", which is a
manual barrier act, not a tier.

## 2. What landed

`tooling/src/verify/lib/workitem-liveness.ts` — the judge. `tooling/src/verify/lib/workitem-board-reader.ts`
— the one network door. `tests/tooling/verify/lib/workitem-liveness.test.ts` — 7 arms.

**The derivation is the LOADER.** `warningWorkItems(policies)` filters `severity === "warning"` off the
descriptor union; the caller supplies `loadMixedGateCorpus(root).final` (never `loadPolicyCorpus`, which
refuses a corpus holding any of the 44 legacy modules). No hand roster anywhere — the founding defect GREW
while a list would have looked complete (#2070's body knows only about `over-art-plate-arm`; the second
carrier was found by adjudication a day later).

**The three-outcome contract** (`_shared/exit-contract.ts` values; `workItemLivenessExit` returns 0 or 1 only,
and the exit-2 class is always a THROW so no caller can read it as a verdict):

| Outcome | Exit | Shape |
| - | - | - |
| every `workItem` OPEN | 0 | report names each citation and its state, denominators first |
| any `workItem` CLOSED | 1 | the line reads "\<policy> carries workItem: N and #N is CLOSED on the board — the debt has no live owner", plus both settlements (repoint, or `hard`/`error` + drop `workItem` at zero effective count) |
| could not measure | 2 (throw) | reader threw (offline / unauthenticated / rate-limited / row not found), corpus empty, or the control did not report CLOSED |

**The same-invocation positive control.** Every failure mode of a board reader — unparsed payload, defaulted
field, stubbed call — produces `OPEN` for every row, which reads exactly like a clean bar. So each run also
asks about `CLOSED_CONTROL_ISSUE = 1` (*"Migrate documentation into an evidence-backed control plane"*,
CLOSED/COMPLETED — the repository's first row, chosen for being the least reopenable on the board), asks it
FIRST, and REFUSES the whole run when it is not CLOSED, naming the constant to move. Deliberately
one-directional: a reader stuck on `CLOSED` reds every carrier at once, which is loud; a reader stuck on
`OPEN` is silent, and silence is what the control buys.

**The reader reuses the workboard's own door.** `boardIssueState` calls `fetchIssueContext` through
`#workboard` (Core-Tooling-Law §4.2 front door) — no second `gh` spelling, and it inherits the one `gh`
failure translator (`workboard/ops/gh.ts`, which turns both rate-limit shapes into operator instructions).
One targeted GraphQL walk per issue, right for a population of three plus the control; #2156's superset
should read the board once through `work:item list` instead, which is why the reader is a PARAMETER.

## 3. Red-first receipts

All on `ce8e5174f`, driven through the real judge and the real board by a scratchpad runner standing in for
the front door this lane did not mint (`.../scratchpad/cbx-warning-barrier-run.mjs`, lane-unique, untracked).

**Founding case — exit 1, both closed carriers named, control CLOSED in the same run:**

```
workitem-liveness — 3 warning citation(s) over 267 final policy(s); 2 name(s) a CLOSED row · control #1 reported CLOSED in this run
  over-art-plate-arm: workItem #2024 — CLOSED
  policy-family-readers: workItem #2187 — OPEN
  policy-refusal-coverage: workItem #2184 — CLOSED
  over-art-plate-arm carries `workItem: 2024` and #2024 is CLOSED on the board — the debt has no live owner. …
  policy-refusal-coverage carries `workItem: 2184` and #2184 is CLOSED on the board — the debt has no live owner. …
```

**Refusal — exit 2, with the reader throwing:** `TOOL ERROR gh: could not resolve host: api.github.com`.

**Committed arms** (7/7, `pnpm test:scoped tests/tooling/verify/lib/workitem-liveness.test.ts`):

1. the population is derived by a REAL `loadMixedGateCorpus` over a planted two-module fixture corpus — a
   warning policy naming a closed row is reported, the error policy contributes no citation;
2. every citation OPEN is exit 0 **and the control was asked in the same invocation** (asserted off the
   reader's call log — the anti-bare-zero arm: delete the control from the judge and only this fails);
3. a CLOSED citation is exit 1 and the report names policy, number and both settlements;
4. a reader that cannot answer throws out of the judge (offline, and a row that resolves to nothing);
5. the control's own failure arms: a control that comes back OPEN refuses naming `CLOSED_CONTROL_ISSUE`; an
   empty corpus refuses **before the board is asked at all** (the call log is empty);
6. `warningWorkItems` keeps corpus order and reads the number off the warning arm only;
7. the PRODUCTION door refuses rather than guessing — with an emptied `PATH` (`vi.stubEnv`, the house route;
   `noProcessEnv` is an error rule and no suppression was added) `boardIssueState` throws `ENOENT` instead of
   returning `OPEN`. Its positive half is the real-board drive above, where the same function returned both
   `CLOSED` and `OPEN`.

## 4. Per-carrier disposition — an OWNERSHIP FORK, both instances

**The promotion arm is unavailable for both.** Bounded measurement, `pnpm check:structure --check
over-art-plate-arm --check policy-refusal-coverage --check policy-family-readers`, exit 0, slot
`agent-a413f153774cb57e9-611485-2026-09-13T07-31-48-791Z`:

```
final policies: 3 ran · raw 32 = waived 0 + granted 0 + effective 32 (0 error, 32 warning) · 0 alarm(s) · 0 tool error(s) · 0 withheld
```

per policy: **over-art-plate-arm 4 · policy-refusal-coverage 17 · policy-family-readers 11**. The ruled flip
condition is an effective count of ZERO; none is zero, so no promotion is legal today.

| Carrier | `workItem` | Board | Disposition |
| - | - | - | - |
| `over-art-plate-arm.ts:160` | 2024 | CLOSED 2026-09-12T04:26Z | **no live successor exists** — see below |
| `policy-refusal-coverage.ts:423` | 2184 | CLOSED 2026-09-12T21:11Z | **no live successor exists** — see below |
| `policy-family-readers.ts:263` | 2187 | OPEN | correct, untouched |

- **#2024** closed on the *repoint* half plus the conversion receipt, while its own body calls it *"the live
  owner for the four surfaces"* and all four still fire — real a11y defects at
  `packages/client/src/styles/globals.css:306:30` (`[data-slot="composer"]`, measured 3.30:1) and `:419:49`,
  `:423:54`, `:427:51` (`[data-slot="message-bubble"]` plate arms). #2025, the warning-promotion fork it
  sequenced against, is CLOSED too. #1730 is about the design-audit instrument's blindness on a wallpapered
  room — a different subject.
- **#2184** closed on the module LANDING ("Pending cb-v-additions-wave"), while the module's own header
  states the flip as an event: *"flip to `hard` + `error` (and drop `workItem`) in the commit that takes THIS
  POLICY'S OWN EFFECTIVE COUNT TO ZERO"*, re-measured 60 → 17 after the #2274 reader repair, *"17 is the real
  remaining debt"*. #2109 is adjacent (the three #1977/E4 coupled sites) but does not own this drain.

**Repointing either at an adjacent row would be the crossed-citation defect #2156 class 1 exists to catch**,
and waiving measured a11y findings is what guide §4.4 forbids in terms. So:

**DEFAULT TAKEN AT THE TIME: both `workItem` literals left UNCHANGED, and the barrier's founding red left
standing as the correct verdict — it NAMES the two missing owners. SUPERSEDED IN LEG 2 (§6): the orchestrator
minted #2326 and #2327 from these receipts and both pointers were repointed at `c40752560`.** Two rows to mint were handed to the orchestrator (it owns
`work:item`); each repoint is then a ONE-LINE edit with **no coupled fixture**: a grep of
`tests/tooling/verify/` for `2024`/`2184` returns only prose comments —
`over-art-plate-arm.int.test.ts:138` explicitly records that the literal assertion was REMOVED at #2053
because pinning the number is what rotted, and `policy-soundness-family.suite.repo.int.test.ts` mentions both
numbers only in comments.

Proposed rows (verbatim in the mid-run note):

1. `over-art-plate-arm's four unpaired plate surfaces are still live warning debt (2 MEASURED contrast failures) — #2024 closed on the repoint, not on the work`.
2. `policy-refusal-coverage burn-down: 17 derived-population consumers still carry no mustRefuse row or family refusal pin — the flip-to-error event #2184 closed without`.

## 5. Deviations, with receipts

**Both LEG-1 deviations were closed by LEG 2 and are kept because the reasoning is the record.**

- **No front door and no registry row** (LEG 1) — §1. The brief asked for "a `check:*` script … registry/command
  integration ONLY if the barrier structurally needs it; say which": it did not need one to be correct, and a
  live sibling lane appeared to own the door. **CLOSED in LEG 2** (§6.6): the orchestrator's recovery sweep
  found no dispatched #2156 implementation, handed this lane the row, and the front door landed as ONE verb
  covering all three classes — `structure:board-citations`, manual tier.
- **The carriers were not repointed** (LEG 1) — §4. Neither settlement the brief offered was available: no
  live successor existed and neither count was zero. **CLOSED in LEG 2** (§6.1) at `c40752560`, once #2326 and
  \#2327 were minted from these receipts.
- **The scratchpad runner is not a deliverable.** It exists so the three outcomes could be driven against the
  real tree and the real board without minting a competing verb; its content is in §3.

## 6. LEG 2 (#2156) — the one production front door

The orchestrator's recovery sweep found no dispatched #2156 implementation (69 worktrees / 107 refs / 66
metadata files, `/tmp/codex-2156-recovery.md`) and handed this lane the row, so the collision in §1 resolved
by TAKEOVER rather than by coordination: **arm A after all, but as ONE verb covering all three classes**
rather than the second door arm B was avoiding.

### 6.1 The carriers, settled

The two rows §4 said had to be minted exist: **#2326** (over-art-plate-arm's four plate surfaces) and
**#2327** (the policy-refusal-coverage 17-consumer burn-down). Repointed at **`c40752560`** —
`over-art-plate-arm` 2024 → 2326, `policy-refusal-coverage` 2184 → 2327 — each header rewritten to name the
new owner and to say the pointer has now rotted twice, each flip condition UNCHANGED and restated as a
COUNT rather than a date. #2187 untouched. Neither policy was promoted: the counts are 4 and 17, and the
ruled flip needs zero.

Two-sided receipt, real board:

| Arm | Result |
| - | - |
| before the repoint | exit **1** — "2 name(s) a CLOSED row" (#2024, #2184) |
| after the repoint | exit **0** — "3 warning citation(s) over 267 final policy(s); 0 name(s) a CLOSED row · control #1 reported CLOSED in this run" |
| re-close probe (`cp`/`mv`, pointer put back to #2024, restored) | exit **1** again, naming `over-art-plate-arm` and #2024; `git status --short` clean after the restore |

### 6.2 The three class populations, and what each grammar actually claims

Every population is DERIVED — the loader for policies, the document text for cells and rows. No hand
roster, no duplicated list. Counts from the real run below.

| Class | Population | Source | The claim, and why |
| - | - | - | - |
| `policy-workitem` | **3** | `loadMixedGateCorpus(root).final` → the `warning` arm of the descriptor union | **OPENNESS.** Guide §12.5 ties unresolved debt to a live `workItem` and the policy flips to `hard`/`error` at a zero count, so a CLOSED row means the debt has no owner. Exit 1. |
| `ledger-closure` | **362** over 515 state-bearing rows | the refutation ledger's `state` cells, found by COLUMN NAME per table (its sections do not share a schema), under the `## THE LEDGER` fence | **TRACKING, not closure.** The playbook's own minting sentence: *"the orchestrator flips in its reconcile edit, each cell naming the sha and `(board #NNNN)`; the barrier check on #2195 asserts every cited id EXISTS"*. The SHA carries the closure. So HARD = resolution; state disagreement = ADVISORY. |
| `roster-reference` | **312** | every table cell of `Core-Enforcement-Active-Gates.md` + `Core-Enforcement-Deferred-Dropped.md` | **ORIGIN, not lifecycle** — openness REFUSED, see §7.3. Resolution only. |

### 6.3 The class-3 refusal, with its receipts (orchestrator-ruled 2026-09-13)

"A roster `#N` must be closed (or open)" is refuted by the roster's own text:

- **292 citations across 149 distinct ids in `Core-Enforcement-Active-Gates.md`, ALL in the `Enforces`
  column**, naming the issue the gate IMPLEMENTS — *"issue #935 — the 41 Appearance schema leaves…"*.
- **70 point at not-Done rows, 40+ of them the LIVE program epic #1584.** A closed-rule would red on the
  work in progress; the mirror rule would red on every historical row.
- The roster header states **no citation contract** (read in full: the `>` blurb, the philosophy block, the
  fast-lane block, Layers 1-3).
- `Core-Enforcement-Deferred-Dropped.md` is the same shape: **20 trigger-cell citations, 19 of them
  `#2008`/`#2217`** — the rows that MADE those cells correct, i.e. history, not an unfired condition.

**What ships instead is a real contract:** every roster `#N` must RESOLVE to a board row. A number nobody
minted is wrong under every reading of the grammar, and the founding examples (#2153's L5/L11) were exactly
that shape. **0 findings, 0 off-board ids today**, so it ships green behind a planted-absent-number control.
What resolution CANNOT see — a real id belonging to a different defect — is stated in the module header
rather than implied.

> **LANDED 2026-09-13 (`c38d396a9`+1, lane `cb-x-barrier-repair`) — THE SENTENCE ABOVE IS FALSE AND IS
> CORRECTED HERE RATHER THAN REWRITTEN.** #2153's L5/L11 were **NOT** "a number nobody minted": both wrong
> ids EXISTED (#2114 and #2116 are real board rows; `gh issue view` on each, 2026-09-13). Resolution
> therefore reports **zero** on the founding defect — proved by planting #2153's exact pair back into the
> real ledger and running the pre-repair judge: `ledger citations: 362 | crossed: 0`. The claim that
> resolution "was exactly that shape" was the reasoning that made closing #2156 look defensible; it was
> wrong. §6.9 below is the arm that actually catches it.

### 6.4 The exit contract, and the per-class control receipts

| Outcome | Exit |
| - | - |
| every citation resolves and every openness claim holds | **0** |
| a crossed citation — a CLOSED `workItem`, or an id that names no row — named with class · site · id · state | **1** |
| the run could not measure: the board read threw, a cited document is not on the tree, the snapshot is empty, or a control did not fire | **2** (always a THROW; `boardCitationsExit` returns 0 or 1 only) |

**LANDED 2026-09-13 (`c38d396a9`+1, lane `cb-x-barrier-repair`) — the table above is INCOMPLETE, not wrong.**
Exit 1 also names a ledger citation whose target declares a SAME-WAVE, different-row subject, and an id that
exists but is an item of no project. Exit 2 also covers a truncated or malformed board page, a repeated
cursor, a duplicated issue number, a wire `state` outside `OPEN`/`CLOSED`, a configured ledger/roster whose
grammar this run cannot read, and a subject join that matched nothing. §6.9.

The controls run in the SAME invocation as the verdict, one per class, against the REAL snapshot, and a
control that does not fire throws. Verbatim from the run:

```
  control [policy-workitem] #1 reported CLOSED, so this run can tell a closed row from an open one
  control [ledger-closure] a planted CLOSED cell tracking OPEN #13 was censused, and a citation of absent #2328 was reported
  control [roster-reference] a planted citation of absent #2328 was reported
board-citations — 677 citation(s) over 2327 board row(s): policy-workitem 3 · ledger-closure 362 · roster-reference 312 · 0 crossed · 72 advisory disagreement(s) · 5 cell(s) whose verdict claims nothing
```

`pnpm check:board-citations` → **exit 0**. The fourth control — the board being unreachable — cannot be
self-inflicted inside the op (the reader either answers or throws), so it is pinned at the production door
in `tests/tooling/verify/ops/board-citations.test.ts` with an emptied `PATH`; the throw is what the runner
turns into exit 2. The control-failure arms are pinned too: a snapshot where #1 reads OPEN refuses naming
`CLOSED_CONTROL_ISSUE`, and a snapshot with no OPEN row at all refuses rather than skipping the advisory
control.

### 6.5 The bulk board door

`fetchIssueStates()` — a paged `repository.issues { number state }` walk, exported from `#workboard`, its
one home for every `gh` call. ~24 pages for 2327 rows against ~300 targeted walks; it REFUSES an empty first
page (a map with nothing in it answers "unknown" to every citation and reads as a clean board). **GitHub
`OPEN`/`CLOSED` is authoritative and the Project `Status` field is used in NO verdict** — the two disagree
on this tree (#2181's work landed while its row sits `Running`), and a citation's claim is about the issue.
Paging and the empty-page refusal are pinned in `tests/tooling/workboard/ops/project.test.ts` against a fake
`gh` speaking the real wire protocol: a dropped second page would report every id on it as dangling.

> **LANDED 2026-09-13 (`c38d396a9`+1, lane `cb-x-barrier-repair`) — THAT PIN DID NOT PROVE WHAT THIS
> PARAGRAPH CLAIMED.** The committed paging arm supplied THREE WELL-FORMED pages and asserted they merge;
> nothing exercised an incomplete one. Measured against the unmodified reader: `hasNextPage: true` with a
> null `endCursor` returned the prefix as a complete board, an `endCursor: ""` and a repeated cursor both
> LOOPED FOREVER (two runs killed at 300 s), and a wire `state` of `"STALE"` landed in the map and satisfied
> an openness claim. All of it is now validated at the door and pinned; §6.9 carries the receipts.

### 6.6 Registry decision

`structure:board-citations` is a **`MANUAL_ONLY_STAGES`** member — the `structure:ledger-claims` precedent,
`manual` BY NATURE rather than by cost. It needs the network and `gh` auth; a tier row would make the commit
bar depend on GitHub being up and turn every offline `pnpm check` into an exit-2, and the owner-approved
forge ruling on #2070 already places it "at the quiet barrier beside `ledgers:fresh`", which is an operator
act. `pnpm verify --list` (exit 0) prints it under `manual (never auto-run)`. Coupled sites landed:
`package.json` (`check:board-citations`), `contract/verbs.ts`, `cli.ts` (import · per-verb `--help` · dispatch),
`lib/verb-tail.ts` (`NO_TAIL`), `verify/index.ts`, `lib/registry-manual.ts`.

### 6.7 THE 62/72-ROW CENSUS, verbatim for root

The rejected class-2 predicate ("a CLOSED cell's cited row must be closed") produced **62 reds** counting
only each row's FIRST cited id, and **72 counting every id in the cell** — which is what the shipped
ADVISORY census reports, because an advisory that under-reports is worse than one that over-reports. It is
printed by the verb on every run and exits 0. Reconciling it is a ledger/board pass, not a code edit, and
this lane correctly refuses to sweep a shared multi-lane file:

```
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:315 [CLOSED] #2010 is OPEN on the board
    **CLOSED — #2010 / #2047 (lane `p-ledger-bus-brand`)**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:357 [CLOSED] #2319 is OPEN on the board
    **CLOSED** — #2000 bounded spec: c97de9d2f / ef044b12e contain Tier 2b/2c, Tier 3 ruling and both carve-outs. Authority-cohort review ran 20 parity tests plus 2…
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:371 [OPEN] #1968 is CLOSED on the board
    **OPEN — deliberately left by lane `p-hooks-wave-refute`.** It is not one of the two readers' modules, its `messageIncludes` is a WHOLE-MESSAGE assertion rather…
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:448 [OPEN] #2068 is CLOSED on the board
    **OPEN — narrowed by 007c8b837 (#2068).** The inert-escape predicate (format.ts:196-205) covers `\_`mid-word and`~`only;`#`, `\[`and`\*` still escape, and the c…
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:483 [CLOSED] #2181 is OPEN on the board
    **CLOSED** at `e7e3f083b` (board #2181, via #2101 arm 3): `STRUCTURAL_CLASS_FILES`, the last of the 16 count-bearing rows, narrowed from `(file → count)` to 13 …
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:507 [CLOSED] #2115 is OPEN on the board
    **CLOSED — #2115, lane `p-roster-as-data`**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:703 [CLOSED] #2181 is OPEN on the board
    **CLOSED** — `156609ccd` (board #2181 row 14): the 1919 → 1921 line states both sides and why they differ (cb-v-css-train-3)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:707 [CLOSED] #2182 is OPEN on the board
    **CLOSED** — `a97454714` (board #2182): the token-removal ratchet survives as a provider reading the merge-base vault, driven live; the module's malformed-vault…
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:713 [OPEN] #2229 is CLOSED on the board
    **OPEN** (board #2229)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:715 [OPEN] #2233 is CLOSED on the board
    **OPEN** (board #2233)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:716 [CLOSED] #2285 is OPEN on the board
    **CLOSED** — `509d1d56a` (board #2234): legacy `runPass` `ok` is a two-term verdict; a throwing gate reads ok:false with the failure named (cb-v-verify-lib-4); …
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:722 [CLOSED] #2286 is OPEN on the board
    **CLOSED** — `badc14944` (board #2236): all four header claims now true (one inverted survivor is #2286) (cb-v-wave-9a)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:723 [CLOSED] #2286 is OPEN on the board
    **CLOSED** — `badc14944` (board #2236): all four header claims now true (one inverted survivor is #2286) (cb-v-wave-9a)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:724 [CLOSED] #2286 is OPEN on the board
    **CLOSED** — `badc14944` (board #2236): all four header claims now true (one inverted survivor is #2286) (cb-v-wave-9a)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:725 [CLOSED] #2288 is OPEN on the board
    **CLOSED** — `badc14944` (board #2237): all 16 spellings resolve, successor sections checked (the dangling-refs reach is #2288) (cb-v-wave-9a)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:726 [CLOSED] #2287 is OPEN on the board
    **CLOSED** — `badc14944` (board #2240): both residues repaired (the §3.1 survivor is #2287) (cb-v-wave-9a)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:731 [CLOSED] #2287 is OPEN on the board
    **CLOSED** — `badc14944` (board #2240): both residues repaired (the §3.1 survivor is #2287) (cb-v-wave-9a)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:732 [CLOSED] #2286 is OPEN on the board
    **CLOSED** — `badc14944` (board #2236): all four header claims now true (one inverted survivor is #2286) (cb-v-wave-9a)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:778 [OPEN] #2067 is CLOSED on the board
    **OPEN** (board #2067)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:779 [OPEN] #2067 is CLOSED on the board
    **OPEN** (board #2067)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:780 [OPEN] #2068 is CLOSED on the board
    **OPEN** (board #2068)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:781 [OPEN] #2068 is CLOSED on the board
    **OPEN** (board #2068)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:786 [OPEN] #2210 is CLOSED on the board
    **OPEN** (board #2210)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:797 [OPEN] #2273 is CLOSED on the board
    **OPEN** (board #2273)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:800 [OPEN] #2273 is CLOSED on the board
    **OPEN** (board #2273)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:810 [CLOSED] #2228 is OPEN on the board
    **CLOSED** — `cce850dc1` (board #2228, in-fence half): the 46 line coordinates stripped, the residual count reconciled — the out-of-fence 69-row residual stays …
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:812 [CLOSED] #2228 is OPEN on the board
    **CLOSED** — `cce850dc1` (board #2228, in-fence half): the 46 line coordinates stripped, the residual count reconciled — the out-of-fence 69-row residual stays …
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:820 [OPEN] #2279 is CLOSED on the board
    **OPEN** (board #2279)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:822 [OPEN] #2280 is CLOSED on the board
    **OPEN** (board #2280)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:828 [OPEN] #2233 is CLOSED on the board
    **OPEN** (board #2233)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:830 [OPEN] #2232 is CLOSED on the board
    **OPEN** (board #2232)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:831 [OPEN] #2232 is CLOSED on the board
    **OPEN** (board #2232)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:832 [OPEN] #2232 is CLOSED on the board
    **OPEN** (board #2232)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:835 [OPEN] #2233 is CLOSED on the board
    **OPEN** (board #2233)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:846 [OPEN] #2248 is CLOSED on the board
    **OPEN** (board #2248)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:847 [OPEN] #2248 is CLOSED on the board
    **OPEN** (board #2248)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:872 [CLOSED] #2182 is OPEN on the board
    **CLOSED** — `2dabae9ce` (board #2182): the nine-row table became nine reviewed grants, raw 9 = granted 9 (cb-v-css-train-3); the surviving private parser is #2…
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:889 [OPEN] #2297 is CLOSED on the board
    **OPEN** (board #2297)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:891 [OPEN] #2297 is CLOSED on the board
    **OPEN** (board #2297)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:892 [OPEN] #2297 is CLOSED on the board
    **OPEN** (board #2297)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:893 [OPEN] #2297 is CLOSED on the board
    **OPEN** (board #2297)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:894 [OPEN] #2297 is CLOSED on the board
    **OPEN** (board #2297)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:896 [OPEN] #2297 is CLOSED on the board
    **OPEN** (board #2297)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:898 [OPEN] #2297 is CLOSED on the board
    **OPEN** (board #2297)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:906 [OPEN] #2301 is CLOSED on the board
    **OPEN** (board #2301)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:907 [OPEN] #2301 is CLOSED on the board
    **OPEN** (board #2301)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:916 [OPEN] #2302 is CLOSED on the board
    **OPEN** (board #2302)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:917 [CLOSED] #2304 is OPEN on the board
    **CLOSED — SOURCE-CONFIRMED** (board #2304)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:918 [CLOSED] #2304 is OPEN on the board
    **CLOSED — SOURCE-CONFIRMED** (board #2304)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:927 [CLOSED] #2187 is OPEN on the board
    **CLOSED — VERIFIED ON MAIN** (board #2187)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:936 [FIXED] #2299 is OPEN on the board
    **FIXED — #2299** (`54b98560d`)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:937 [FIXED] #2299 is OPEN on the board
    **FIXED — #2299** (`54b98560d`)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:939 [FIXED] #2267 is OPEN on the board
    **FIXED — #2267** (`26315e791`)
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:964 [PARTIAL] #2305 is CLOSED on the board
    **PARTIAL — SUCCESSOR ARMS VERIFIED; #2305 PROSE OPEN**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:965 [PARTIAL] #2305 is CLOSED on the board
    **PARTIAL — #2305 RESIDUE OPEN**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:983 [OPEN] #2314 is CLOSED on the board
    **OPEN — #2314; B assigned**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:984 [OPEN] #2314 is CLOSED on the board
    **OPEN — #2314; B assigned**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:985 [OPEN] #2294 is CLOSED on the board
    **OPEN — #2294 (Ready)**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:986 [OPEN] #2315 is CLOSED on the board
    **OPEN — #2315; B assigned**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:987 [OPEN] #2294 is CLOSED on the board
    **OPEN — #2294 (Ready)**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:994 [OPEN] #2311 is CLOSED on the board
    **OPEN — #2311; Codex owned**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:999 [OPEN] #2313 is CLOSED on the board
    **OPEN — #2313; Codex owned**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1005 [OPEN] #2305 is CLOSED on the board
    **OPEN — #2305; B assigned**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1006 [OPEN] #2305 is CLOSED on the board
    **OPEN — #2305; B assigned**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1007 [OPEN] #2305 is CLOSED on the board
    **OPEN — #2305; B assigned**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1008 [OPEN] #2305 is CLOSED on the board
    **OPEN — #2305; B assigned**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1009 [OPEN] #2305 is CLOSED on the board
    **OPEN — #2305; B assigned**
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1117 [OPEN] #2000 is CLOSED on the board
    **OPEN, systemic.** Wave 9 names the consequence: it is the mechanical blocker for #2000's §4.6 differential — no module records a SHA to replay against
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1118 [OPEN] #1971 is CLOSED on the board
    **OPEN as WARNING DEBT.** MECHANIZED: `policy-waiver-spelling` (#1971) reports its own worklist on the commit bar. Confirmed still open on a sample: `fk-ondelet…
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1122 [OPEN] #2014 is CLOSED on the board
    **OPEN ON THE SERVER AND BUS PLANES ONLY.** Re-censused 2026-09-11 (`v-ledger-sweep`): every `home-client` module now carries `messageIncludes: "CANNOT be estab…
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1123 [OPEN] #1999 is CLOSED on the board
    **OPEN and MEASURABLY SMALLER.** Wave 6's 25 → ~1 (`2aba9c0ed`/#1999 landed 15 pinned-fence rows, `a54394df6`/#1990 the third answers); wave 5's 33 → 10 (`8ad41…
docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1123 [OPEN] #1990 is CLOSED on the board
    **OPEN and MEASURABLY SMALLER.** Wave 6's 25 → ~1 (`2aba9c0ed`/#1999 landed 15 pinned-fence rows, `a54394df6`/#1990 the third answers); wave 5's 33 → 10 (`8ad41…
```

### 6.8 Remaining gaps, stated honestly

- **Resolution cannot see a CROSSED-BUT-REAL id.** #2153's L5 cited #2114 for work #2116 owns; both numbers
  exist, so both resolve. Closing that needs a subject match (does the row's title/body name this defect?),
  which is a text-similarity judgement this lane will not fake with a heuristic. Filed as the gap, not built.
  **LANDED 2026-09-13 (`c38d396a9`+1, lane `cb-x-barrier-repair`): BUILT, and it needed no text-similarity
  judgement** — the verifier ingress already writes a machine-readable `**Where:** <wave> L<n> · <path:line>`
  line into the issue body, so the join is string equality over parsed keys. §6.9.
- **The advisory census is not adjudicated.** 72 rows are printed with no verdict; nothing yet
  distinguishes "the board row legitimately spans several cells" from "this cell is stale".
  **LANDED 2026-09-13: still true, and the count is now 81** (the board moved, not the rule).
- **One ledger is read.** `LEDGERS` is a one-element tuple by design (a glob over `docs/reviews/**` would
  start judging prose); a second document written under the same grammar joins that tuple by hand.
- **`ledger-closure` reads only tables with a `state` column.** A section that renames the column
  contributes zero citations — visible in the printed per-class denominator, but nothing reds on it.
  **LANDED 2026-09-13: it reds now.** `assertLedgerSource` runs on the CONFIGURED document and throws
  (CLI exit 2) when it loses its fence, its post-fence `state` column, or its citations; `assertRosterSource`
  is the same non-vacuity for each configured roster. §6.9.

### 6.9 THE FOUR REPAIRS (lane `cb-x-barrier-repair`, 2026-09-13, on codex-primary's independent review)

Codex's review REFUTED this document's closure claim with four confirmed fail-closed defects. All four are
repaired; **the commit that repairs them does NOT close #2156** — see the residue at the end of this section.

**F1 — the barrier validated issue-number EXISTENCE, not #2156's filed citation join.** Repaired by
`tooling/src/verify/lib/citation-subject.ts`, a deterministic join with no keyword heuristic in it. Both
sides carry the same authored key: the ledger row's is the leading segment of its `wave`/`lane` column up to
the first `·`; the board row's is the leading segment of the `**Where:**` line in its BODY, which the
verifier ingress already writes (61 rows on the board carried it, every one spelling the row label
`L<digits>`). A key splits into FAMILY + ROW. **Same family, different row is CROSSED (exit 1)**; a different
family is an ADVISORY census; a cited row that declares nothing is a COUNTED residue.
*Red-first, against the unmodified judge with #2153's exact pair planted back into the real ledger
(`:507` → #2116, `:508` → #2114, restored via `cp`/`mv`):* `ledger citations: 362 | crossed: 0`.
*Green after, same planted ledger:* `crossed: 2`, both named by `path:line` and by the subject each row
declares. *Live tree, restored:* `matched 54 · crossed 0 · cross-family 4 · unkeyed 1 · undeclared 303`.

**F2 — renaming the production ledger's `state` column erased the whole class and still exited 0.** The
synthetic control document kept its own header, so every control still fired. Repaired by `assertLedgerSource`
/ `assertRosterSource`, run in `runBoardCitations` over the CONFIGURED documents and printed as a source
receipt; the pin at `tests/tooling/verify/ops/board-citations.test.ts` renames `state` on the REAL document's
bytes and expects the throw, and passes the untouched real documents in the admitting direction.
`assertSubjectJoinMeasured` is the same principle for the join's own denominator.

**F3 — an incomplete paginated response was accepted as a complete snapshot**, and **F4 — the GraphQL
payload was CAST rather than validated.** Both repaired at the production door
(`tooling/src/workboard/ops/project.ts`): the page shape, `hasNextPage`, the `endCursor` relationship, a
repeated cursor, `number`, `state`, `title`, `body` and Project membership are all checked, and every refusal
is the caller's exit-2 class. *Red-first, the new pins against the unmodified reader:* **8 failed / 1 passed**,
and the two pins that are not in that count (`EMPTY-STRING cursor`, `REPEATED cursor`) **HUNG the unmodified
reader** — two runs killed at 300 s, which is the infinite loop itself.

**The residue, and why #2156 STAYS OPEN.** The join covers the 59 ledger citations whose target declares a
subject. **303 citations over 133 distinct board rows declare none**, and they are not a backlog to grind
through: a large part of them are THEMATIC rows one ledger row cannot name — **#2041 is cited by four rows
across waves 8-10, #1978 by five** — so a mandatory one-subject-per-issue key would be FALSE for them. The
backfill contract, if it is ever ruled for: append a `**Where:**` line naming the wave label, then the
`path:line`, to the body of each of the 133 rows — the grammar 61 board rows already carry, spelled
`**Where:** cb-v-parity-instruments L4 · path:line`. Written by the ORCHESTRATOR via
`gh issue edit --body-file` (lanes make no `gh` writes);
~133 board edits plus the expensive half, adjudicating which ledger row each older thematic issue subsumes.
**Orchestrator ruling 2026-09-13: do NOT backfill.** So this implementation is the **resolution + openness +
declared-subject** barrier, not #2156's closure, and the residue is a ledger row below.

**The four cross-family citations, listed because a later reader will ask why they are not verdicts** — each
one is the ledger closing a row by pointing at the earlier board row of the same defect family, which the
grammar supports:

| ledger row | cites | the cited row declares | why it is not a finding |
| - | - | - | - |
| `:521` `cb-v-fix-wave-1 L3` | #2086 | `cb-v-unaudited-finals L10` | the row re-adjudicates #2086's own fix (`FIXED — #2086 … first attempt REFUTED by this wave, then re-fixed`) |
| `:554` `cb-v-mirror-suppressions L15` | #2103 | `cb-v-authority-census L10` | the cell says "board #2103 re-derived: still true after `aecbc6c6c`" |
| `:765` `cb-v-wave-8a L3` | #2101 | `cb-v-authority-census L7` | the defect IS "#2101's cardinality ruling names four modules; three are done and this one…" |
| `:782` `cb-v-wave-8c L5` | #2150 | `cb-v-fix-wave-1 L1` | the defect IS "a NEW instance of #2150's family" |

Plus one `unkeyed`: `:818` `cb-v-wave-9b` cites #2136 (declares `cb-v-mirror-suppressions L10`) — the citing
row's own label carries no `L<n>`, so neither side can be compared and the grammar says so rather than guessing.

**The real barrier run, verbatim, after the repair (`pnpm check:board-citations`, exit 0):**

```
  control [policy-workitem] #1 reported CLOSED, so this run can tell a closed row from an open one
  control [ledger-closure] a planted CLOSED cell tracking OPEN #13 was censused, and a citation of absent #2332 was reported
  control [roster-reference] a planted citation of absent #2332 was reported
  control [ledger-subject] #2077 declares `cb-v-unaudited-finals L1`: a row citing it under that subject was SILENT, and a sibling row citing it as `cb-v-unaudited-finals L999999` was reported crossed
  source [ledger] docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md admitted with 362 state-cell citation(s)
  source [roster] docs/architecture/core/Core-Enforcement-Active-Gates.md admitted with 292 citation(s)
  source [roster] docs/architecture/core/Core-Enforcement-Deferred-Dropped.md admitted with 20 citation(s)
board-citations — 677 citation(s) over 2331 board row(s): policy-workitem 3 · ledger-closure 362 · roster-reference 312 · 0 crossed · 81 advisory disagreement(s) · 5 cell(s) whose verdict claims nothing
  subject join (class 2) — matched 54 · crossed 0 · cross-family 4 · unkeyed 1 · undeclared 303
```

**What the repair still does NOT cover, stated rather than implied:** a crossed citation whose target is one
of the 303 undeclared rows (invisible — the residue above); a crossed citation across two WAVES (advisory by
measurement, since all four such rows on today's tree are legitimate); a declared key in a spelling other than
`<family> L<digits>` (counted `unkeyed`, and the join's non-vacuity guard only proves that SOME key still
parses, not that every spelling does); a row appended under this report's own `## LEDGER ROWS` header, whose
subject column is spelled `Where` rather than `wave`/`lane` and therefore carries no key at all until the
integrator normalises it; and the `caught-failure-ownership` population ledger, which this
commit re-stales by one line in `tooling/src/workboard/ops/project.ts` (a new import above its `markerLine`)
and which the barrier re-derives on the merged tree.

### 6.10 THE SECOND REPAIR PASS (lane `cb-x-barrier-repair`, 2026-09-13, on `cb-sec-barrier-review`)

The independent security review of `376f64337`
(`docs/reviews/gate-runtime/sec-barrier-review-2026-09-13.md`) CONFIRMED F1-F4 by driving the production
door in both directions against a fake `gh` replaying the real 2332-row board, and filed six new rows. This
section is what landed for them. **Every count in §6.9 above was true of `376f64337` and is superseded
here:** the fence repair removes the rollup section's citations, so on this tree the barrier now reads
`356 ledger citations · 671 total · 76 advisory · 4 verdictless · undeclared 297`, with
`matched 54 · crossed 0 · cross-family 4 · unkeyed 1` UNCHANGED — the join reads exactly what it read
before, over a population that no longer contains prose.

**N1 — the fence was a START marker with no END.** `ledgerSpan` now bounds it at the next `## `, both ends
exclusive, and the 0-based/1-based off-by-one is gone with it. The owed control did not exist and now does:
`tests/tooling/verify/lib/citation-sources.test.ts` plants the SAME table byte-for-byte on both sides of
the closing heading and asserts only the in-fence one is read.

**N2 — every non-vacuity guard was a floor of ONE.** Admission is now by SCHEMA (`defect` + `state`), and
an in-fence table carrying exactly one of the pair THROWS naming it — so the evasive partial rename that
admitted 150 of 399 citations at exit 0 is refused, in BOTH rename directions, with no baseline number and
no threshold. The five synthetic fixtures and BOTH planted control documents were moved to the production
schema: a control document the real admission rule would reject proves nothing about the real ledger.

**N5 — the `gh` door declared no stdout ceiling.** 16 MiB, declared, named in its own refusal, and NOT
printing the response. The pin plants a 1024-byte ceiling and asserts the sentinel body does not appear in
the message.

**N4 — the wire contract, adjudicated rather than thresholded.** The review's suggested fix was an
implausible-off-board-FRACTION refusal; that is REFUSED here, because an empty membership population is
legitimate data on a repository that uses no project and a threshold would be a number nobody can derive.
What is provable is repaired instead: a payload carrying BOTH `data` and a GraphQL `errors` array refuses
(GraphQL's own contract allows a field-level failure to null its field and report why beside `data`, and
keying on `data !== undefined` accepted that half-answer); a null `repository` already refused and is now
pinned; and `projectItems` carries its own `pageInfo` so a TRUNCATED membership page is UNDECIDED rather
than off-board. **What remains is a source-integrity assumption, listed as one below, not a defect closed.**

**N6 — this report's own `## LEDGER ROWS` block** declared four rows and carried three: the fourth was
appended after a blank line with a remark-escaped leading pipe, so it serialised as a PARAGRAPH
(`reportLedgerRows` → `{"rows":3,"declared":4}`). It is a real table row now, and the heading counts the
seven rows the block actually carries.

**N3 — NOT a code change, and the reason the no-backfill ruling is load-bearing.** The hard subject arm
("same family, different row = crossed") collides with class 2's own premise that one board row legitimately
spans several ledger cells. The review measured the collision: **8 board rows are each cited by 2-5 ledger
rows of the SAME wave** (#2106, #2148, #2236, #2240, #2217, #2067, #2218, #2228) and **all 8 declare no
`**Where:**` subject today**, which is the only reason the arm is silent. Backfilling them — the closure
path §6.9 describes — would produce **13 false crossings** with no exemption grammar and no way to answer
them except editing a board body, and #2153's real crossing is byte-for-byte the same shape as a legitimate
two-cell pointer, so there is no discriminator in the data. The subject check is NOT weakened for it and the
backfill is NOT performed: the constraint is recorded on #2156 instead, as its own ledger row above.

#### 6.10.1 Confirmed defects REPAIRED in this pass

1. **N1** the ledger fence annexed every later section (`lib/citation-sources.ts`) — closed, with its control.
2. **N2** partial input loss was invisible where total loss refused (`lib/citation-sources.ts`) — closed, schema-driven.
3. **N5** the `gh` stdout ceiling was undeclared and its refusal dumped issue bodies (`ops/gh.ts`) — closed.
4. **N4a** a GraphQL payload carrying `data` AND `errors` was accepted as a complete read (`ops/gh.ts`) — closed.
5. **N4b** a truncated `projectItems` page read as honestly off-board (`ops/project.ts`, `lib/queries.ts`) — closed.
6. **N6** this report declared four ledger rows and carried three — closed.

#### 6.10.2 SOURCE-INTEGRITY ASSUMPTIONS — not defects, and not closable with a control

These are inputs where successful-looking data is indistinguishable from honest data at this boundary. Each
one is stated because a control cannot be written for it, not because it was judged unimportant. **None of
them is a false exit 0:** each produces a false exit 1 (a finding an operator must adjudicate) or is bounded
by a refusal above it.

1. **A fabricated empty `projectItems.nodes` with `hasNextPage: false`** for an issue that IS on the board is
   indistinguishable from an honest off-board issue — nothing in the protocol separates them. Effect: one
   false "an item of NO project" finding per affected row, exit 1. Bounded, not closed: the snapshot-level
   "NOT ONE is on Project 1" refusal covers total loss, the truncation arm covers the `first: 10` fence, and
   a scope/permission error nulls the field, which already throws. A fraction threshold was considered and
   REFUSED — see N4 above.
2. **A page that stops early while claiming `hasNextPage: false`** is a complete-looking snapshot by
   construction. The review caught its own instance INCIDENTALLY (no declaring row survived in the prefix,
   so the subject control could not be planted → exit 2), which is luck, not coverage.
3. **A partially nulled `body` field** shrinks the subject join's `matched` denominator silently; only zero
   refuses. The ledger has no `defect`/`state`-style invariant on the board side to key a schema clause off.
4. **An in-fence ledger table whose `defect` AND `state` headers BOTH drift** is indistinguishable from
   prose — there is no in-band invariant left. Stated in the module header rather than thresholded.
5. **The subject join trusts the issue BODY as authored data, not as a credential.** Anyone with write
   access can edit a `**Where:**` line. It is an integrity check on our own documentation, never
   tamper-evidence.

## LEDGER ROWS (7 rows)

| Family | Where | Defect | Class | State | Receipt |
| - | - | - | - | - | - |
| warning debt | cb-x-warning-barrier · `tooling/src/verify/gates/over-art-plate-arm.ts:169`, `tooling/src/verify/gates/policy-refusal-coverage.ts:429` | BOTH warning carriers named CLOSED rows and neither was settleable: the ruled promotion needs a zero effective count and the measured counts were 4 and 17, while no OPEN row owned either debt (#2024 closed on the repoint receipt with all four a11y surfaces still firing; #2184 closed on the module landing with 17 consumers still to drain) | other (warning debt ownership) | **CLOSED** — `c40752560` (board #2070; owners #2326 / #2327 minted from these receipts) | `pnpm check:structure --check over-art-plate-arm --check policy-refusal-coverage --check policy-family-readers` exit 0: `effective 32 (0 error, 32 warning)`, 4 · 17 · 11; judge drive before/after: exit 1 (2 closed) → exit 0, and a `cp`/`mv` re-close probe back to #2024 → exit 1 again |
| board citations | cb-x-warning-barrier · `docs/architecture/core/Core-Enforcement-Active-Gates.md` (whole roster) | #2156's class 3 as filed — "every roster `#N` must resolve to a CLOSED row" — is REFUTED by the roster's own text: all 292 citations / 149 distinct ids sit in the `Enforces` column and name the issue the gate IMPLEMENTS, 70 point at not-Done rows and 40+ of those are the LIVE epic #1584; the deferred roster's 20 are the #2008/#2217 rows that made those cells correct. Shipping the filed rule would have been ~89 day-one false positives | other (premise refuted) | **CLOSED** — `beea8b1f4` (board #2156; orchestrator-ruled 2026-09-13, resolution-only shipped instead, green with a planted-absent control) | the counts above, re-derived on `ce8e5174f` with `markdownTables` over both rosters; `pnpm check:board-citations` exit 0, `roster-reference 312 · 0 crossed` |
| board citations | cb-x-warning-barrier · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` (72 cells, listed in `docs/reviews/gate-runtime/x-warning-barrier-2026-09-13.md` §6.7) | 72 ledger state cells and the board rows they track DISAGREE (a `**CLOSED**` cell tracking an OPEN row, or the reverse). Under the grammar this is not automatically a defect — the `(board #N)` is a tracking pointer and the sha carries the closure — but nothing has adjudicated them, and at least the #2010 / #2115 / #2181 cells read as a board that never caught up | other (ledger/board reconciliation) | **OPEN** (board #2156 — a ledger/board pass; the lane is fenced out of sweeping a shared multi-lane file) | `pnpm check:board-citations` exit 0 prints the census every run: `362 ledger citations · 0 crossed · 72 advisory disagreement(s) · 5 cell(s) whose verdict claims nothing` |
| board citations | cb-x-barrier-repair · `tooling/src/verify/lib/citation-subject.ts` · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` (297 citations over 131 distinct board rows) | #2156's filed contract — "every `#N` in a ledger state cell resolves to a row whose title or body names the row's module and wave" — is only COVERED for the 59 citations whose cited row declares a `**Where:** <wave> L<n>` subject. The other 297, over 131 distinct rows, declare none, and a mandatory one-subject-per-issue key would be FALSE for the thematic rows among them (#2041 is cited by four ledger rows across waves 8-10, #1978 by five). The barrier therefore ships as resolution + openness + declared-subject and #2156 is NOT closed by it | other (citation) | **OPEN** (board #2156 — the backfill contract and its cost are stated in `docs/reviews/gate-runtime/x-warning-barrier-2026-09-13.md` §6.9; orchestrator ruled 2026-09-13 NOT to backfill) | `pnpm check:board-citations` exit 0 prints the residue every run: `subject join (class 2) — matched 54 · crossed 0 · cross-family 4 · unkeyed 1 · undeclared 297`; red-first with #2153's pair replanted in the real ledger: unmodified judge `crossed: 0`, repaired judge `crossed: 2` |
| board citations | cb-x-barrier-repair L2 · `tooling/src/verify/lib/citation-sources.ts:82-91` | the `## THE LEDGER` fence was a START marker with no END, so every table row from the heading to EOF entered the class-2 population — the `## CLASS ROLLUP` cross-cutting table's PROSE mentions ("#2000's §4.6 differential") were judged for resolution and BOARD MEMBERSHIP like real `(board #N)` pointers, and the first unminted or off-board number in a rollup sentence would have been a hard exit 1 on a non-citation. The comparison was also 0-based `findIndex` against 1-based `row.line`, admitting the row immediately ABOVE the heading. The ledger's own §4 and the sibling `lib/gate-program-docs.ts#ledgerSections` both define the fence as `## THE LEDGER` → the next `##` | other (population fence) | **CLOSED** — this commit (board #2156; found by `cb-sec-barrier-review` L1) | span-bounded reader on the configured ledger: `ledger-closure 362 → 356`, total `677 → 671`, advisory `81 → 76`, verdictless `5 → 4`, `matched/crossed/cross-family/unkeyed` unchanged at 54/0/4/1; `pnpm check:board-citations` exit 0. Red-first with the end bound removed: the span arm and the below-the-rollup control both red, 6 other arms stay green |
| board citations | cb-x-barrier-repair L3 · `tooling/src/verify/lib/citation-sources.ts:160-196` | every non-vacuity guard was a floor of ONE, so PARTIAL loss of a configured input was invisible where TOTAL loss refused: renaming `\| state \|` in only the tables holding no declaring row admitted 150 of 399 citations, printed a serene source receipt and EXITED 0 with 249 unread. Admission is now SCHEMA-driven (`defect` + `state`, the sibling reader's `isLedgerRowTable` rule) and an in-fence table carrying exactly one of the pair THROWS naming it, so the rename is caught in BOTH directions with no baseline number and no threshold | other (fail-open residue) | **CLOSED** — this commit (board #2156; found by `cb-sec-barrier-review` L2) | the partial rename now throws "in-fence defect-row table(s) with NO state column", driven both on a production-shaped fixture and on the REAL ledger's bytes in `tests/tooling/verify/ops/board-citations.test.ts`; measured on the configured ledger: 63 in-fence tables, all carrying both, zero carrying one |
| board citations | cb-x-barrier-repair L4 · `tooling/src/workboard/ops/gh.ts:53-92` · `tooling/src/workboard/ops/project.ts:263-289` | three wire-contract holes at the `gh` door, all of them successful-looking data becoming a verdict: (a) no `maxBuffer`, so node's implicit ~1 MiB applied and `execFileSync` KILLED the child, with `ghFailure` then building its message from the captured stdout — the refusal read as "GitHub returned garbage" and spilled every issue body in the page into stderr; (b) `graphql()` keyed only on `data !== undefined`, accepting a payload carrying BOTH `data` AND a GraphQL `errors` array as a complete read; (c) `projectItems(first: 10)` could TRUNCATE, and a truncated membership list read as an honest "on no board", which the judge turns into a hard finding | other (wire contract) | **CLOSED** — this commit (board #2156; found by `cb-sec-barrier-review` L5 + the N4 adjudication) | a declared 16 MiB ceiling named in its own concise refusal (pinned with a 1024-byte planted ceiling asserting the sentinel body is NOT printed); an `errors`-beside-`data` refusal capped at the first message; `projectItems.pageInfo.hasNextPage` on the wire and an UNDECIDED-membership throw. Red-first against `376f64337`: exactly those four new arms red, all 12 pre-existing arms green |

ledger rows OWED: 0 — **and the reconciliation the previous footer owed:** the seven rows above are NEW
rows for the integrator to APPEND (`## LEDGER ROWS (N rows)` is the append block, and the integrator asserts
N), while `ledger rows OWED` counts EXISTING cells whose flip this lane owes. This lane flipped no existing
cell and edited no ledger, so both statements are true at once — the earlier report said `OWED: 0` beside one
append row and read as a contradiction because it never said which of the two it meant.

## 7. Proposed lessons (report text — no memory write from this lane)

- **`board-citation-grammar-is-tracking-not-closure`** — In this repo a `(board #N)` beside a sha is a
  TRACKING pointer, not a closure claim: one board row spans many ledger cells and legitimately outlives
  them. An instrument that turns that disagreement into a red lands 62 unadjudicated findings on its first
  run and gets bypassed. Check RESOLUTION hard; census state disagreement as advisory. Hook: the playbook's
  own minting sentence, "each cell naming the sha and `(board #NNNN)` … asserts every cited id EXISTS".
- **`roster-issue-refs-are-origin-not-lifecycle`** — `Core-Enforcement-Active-Gates.md`'s `#N`s are all in
  the `Enforces` column and name the issue the gate IMPLEMENTS; 70 of 292 point at not-Done rows, 40+ of
  them the live epic. Before building a "citation must be closed" rule anywhere, count what the citations
  are FOR.
- **`workitem-liveness-control-is-a-closed-row`** — A board-reading barrier's positive control must be a
  known-CLOSED row asked in the SAME invocation: every way a board reader breaks yields `OPEN`/`unknown` for
  everything, which is byte-identical to a clean bar. The reverse control is not owed — a reader stuck on
  CLOSED reds everything at once and is self-announcing.
- **`closed-on-the-receipt-not-on-the-work`** — Three warning-debt carriers in a row pointed at rows that
  closed on a RECEIPT ("verification evidence: `<sha>`", "the repoint half stands") while the work the row
  named was still live. Before citing a row as a debt owner, read what its closing comment closed.
- Minor: a `Record<number, …>` literal key carrying a numeric separator (`424_242`) trips biome's
  `useNamingConvention`, and dropping the separator trips `useNumericSeparators` — a named const plus a
  computed key is the only shape that satisfies both.

## 8. Commits

| sha | what | stat |
| - | - | - |
| `8ebe65dc3` | the #2070 judge + its pins | 3 files, +330 |
| `c40752560` | the two carrier repoints | 2 files, +20 −5 |
| `beea8b1f4` | `check:board-citations`: the three-class verb, the bulk board door, the registry row, 4 pins | 17 files, +898 −245 |
