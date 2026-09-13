---
kind: review
status: active
updated: 2026-09-13
---

# cb-sec-barrier-review — independent security review of the board-citations barrier repair (`376f64337`)

Lane `cb-sec-barrier-review`, isolated worktree `agent-a4b69f1f571a23d58`. Read-only against the author's
tree: their five commits were CHERRY-PICKED onto this worktree's `main` tip (`b1a23e534`, 47 commits newer
than their base `db6e5bbd6`) and everything below was driven THERE, so every number is against
**current main + the stack**, not against their base. The cherry-pick was conflict-free
(`ad7ac3da4` · `8546a488d` · `942a42983` · `9313c04ad` · `6822d3ac5` = their `8ebe65dc3` · `c40752560` ·
`beea8b1f4` · `c38d396a9` · `376f64337`). No push, no rebase, no `work:item`, no `gh` write, no edit to
main, the ledger, the catalog or the author's worktree.

## 1. Verdict

**F1–F4 are REPAIRED and each one is CONFIRMED by driving the production door in both directions, and none
of the six new defects below re-opens any of them. Integrate `376f64337` with N1 and N6 fixed in the same
landing** (N1 is ~10 lines and zero pin churn; N6 is one un-escaped table row), and file N2–N5 as rows.
\#2156 stays OPEN, correctly.

**The no-false-exit-0 claim is SCOPED, and N2 is the exception — stated here rather than in a footnote.**
For the four input classes codex's refutation names — a crossed-but-existing citation, TOTAL loss of a
configured document's grammar, a truncated or malformed board page, and an unvalidated wire value — I could
construct no input that exits 0: every one of them came back 1 (crossed) or 2 (could not measure), driven,
in §3. **N2 IS a false exit 0** and I measured it: a PARTIAL `state`-column loss on the real ledger admitted
**150 of 399** citations, printed a serene source receipt and **exited 0** with 249 citations unread. It is
the F2 class one notch down and the F2 repair does not reach it. N4 is the same shape wearing the other
exit: a PARTIAL membership loss becomes 712 false findings at exit 1 rather than the exit 2 it owes. So the
honest summary of the exit contract is: **TOTAL loss of any input refuses; PARTIAL loss of the same input is
either invisible at exit 0 (N2) or a false exit 1 (N4)** — *every non-vacuity guard in this design is a
floor of ONE*.

## 2. Method, and the two board reads it cost

- **The scoped floor on the merged tree:** `pnpm test:scoped` over the five named specs — **40/40 pass**
  (`board-citations` 15 · `citation-subject` 5 · `workitem-liveness` 3 · `ops/board-citations` 6 ·
  `workboard/ops/project` 11). Wiring suites too (`verify/lib/registry`, `registry.int`, `cli.int`,
  `stage-budget`) — **57/57**. `pnpm verify --list` exit 0 with `structure:board-citations` under
  `manual (never auto-run)`. `pnpm exec biome check <8 sources> --diagnostic-level=error` 0;
  `pnpm exec eslint <12 files>` 0; `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json`
  PASS 2/2 (`11 discovered, 2 runnable`).
- **One live production run** — `pnpm check:board-citations`, **exit 0**: four controls fired, three sources
  admitted, `714 citation(s) over 2331 board row(s): policy-workitem 3 · ledger-closure 399 ·
  roster-reference 312 · 0 crossed · 38 advisory · 8 verdictless`, `subject join — matched 54 · crossed 0 ·
  cross-family 5 · unkeyed 1 · undeclared 339`. (Their receipt read 362/72/303 against the older ledger on
  their base; the ledger grew on main. The DENOMINATORS in this report are current-main numbers.)
- **One snapshot dump** through the same production door (`fetchIssueStates()` via `#workboard`) — 2332
  rows, 216 OPEN, 2332 on Project 1, 62 declaring a `**Where:**` subject. Everything else was then driven
  OFFLINE against a **fake `gh` replaying those real bytes**, page for page, through the real subprocess
  door — so each arm below is the production CLI (`pnpm check:board-citations` → `runBoardCitations` →
  `boardStates` → `fetchIssueStates` → `gh`), with only the wire mutated. The faithful replay reproduces the
  live receipt exactly (2332 rows), which is the harness's own control.
- **Real-file probes** (this worktree only, `cp`/`mv`, one command per call): the refutation ledger and
  `lib/board-citations.ts`. Both restored; `git status --short` EMPTY before this commit.

## 3. F1–F4 — one verdict line each

| # | Verdict | Receipt (driven unless marked) |
| - | - | - |
| **F1** subject join | **CONFIRMED** | #2153's pair replanted in the REAL ledger (`:508` `cb-v-parity-instruments L11` → #2116, `:509` `L5` → #2114; both ids exist) → CLI **exit 1, `2 crossed`**, each named by `path:line`, by its own key and by the key the cited row declares. Untouched ledger → **exit 0, `0 crossed`, `matched 54`**. |
| **F1** discriminating cut | **CONFIRMED (two layers)** | With the subject arm in `crossings()` cut (`if (false && …)`), the same planted ledger reads **`crossed 0 / exit 0` at the judge** — so the arm, not something else, is what catches it — while the **CLI still exits 2**, because the same-invocation subject control notices it stopped firing (`matched 1 (expected 1) and crossed 0 (expected 1)`). The blindness is fail-closed at the verb. |
| **F1** family/row semantics | **CONFIRMED** | Same family + different row = crossed; cross-family = advisory; undeclared/unkeyed counted, never verdicts. The `L1` vs `L11` substring trap returns `crossed` in both directions (keys are parsed, not compared as text). Adversarial arms: a blockquoted or indented `**Where:**` reads `undeclared`; a case-shifted family degrades to `cross-family` (advisory), never to a false `matched`; a malformed key degrades to `unkeyed`. 0 board rows carry two `**Where:**` lines today. |
| **F1** non-vacuity | **CONFIRMED** | `assertSubjectJoinMeasured` throws at `matched === 0`; driven for real by the partial-drift arm below (drift removed every declaring row's table → `matched 0` → **exit 2**). |
| **F2** ledger grammar | **CONFIRMED** | `\| state \|` → `\| status \|` on the REAL ledger bytes → **exit 2**, "no post-fence table with a `state` column". Renaming the real `## THE LEDGER` heading → **exit 2**, "carries no fence". Untouched documents are admitted with a printed source receipt (`399` / `292` / `20`). |
| **F2** roster grammar | **CONFIRMED** | Both configured rosters, real bytes: ids stripped → throw; alignment rules stripped (the tables stop being tables) → throw; untouched → 292 and 20. |
| **F2** residue | **NEW DEFECT N2** | The guard is a floor of ONE, so PARTIAL drift passes: renaming `\| state \|` in only the tables that carry no declaring row admitted **150 of 399** citations and the run **exited 0** with a serene source receipt. |
| **F3** pagination | **CONFIRMED** | `hasNextPage: true` + `endCursor: null` → exit 2 ("the snapshot is TRUNCATED"); `endCursor: ""` → exit 2; a repeated cursor → exit 2 ("the cursor it already followed") and it **terminates** — the run completed in normal time, no kill needed; a non-boolean `hasNextPage`, a duplicate issue number and an empty map are pinned and pass. A three-page walk merges (pin) and the 24-page real walk merges (my replay). |
| **F4** wire validation | **CONFIRMED** | `state: "STALE"` on **#2326** (a live warning-debt owner, so the value would otherwise have SATISFIED the openness claim) → **exit 2** naming the field. Positive/negative number, missing title, non-string body, non-list `projectItems` are pinned; `body: null` is accepted as "absent" by design. |
| **F4** Project membership | **CONFIRMED, with NEW DEFECT N4** | Total membership loss refuses (`NOT ONE is an item of Project 1` → exit 2). A PARTIAL loss that spares the three rows the controls are planted against produces **exit 1 with 712 false findings**, not exit 2. |
| Exit contract | **CONFIRMED** | `runTool` maps any non-`UsageError` throw to 2 with no downgrade (`_shared/run-tool.ts:43-66`); every exit-2 arm above came back 2 from the real `pnpm check:board-citations`. A `gh` that fails (non-zero, stderr) → exit 2 with the translated message. PATH-less door → throw (`ENOENT`) is committed-pin driven and passed in my floor run. |
| Carriers | **CONFIRMED CURRENT** | `c40752560` changes only header comments and two `workItem` literals. Live board 2026-09-13: **#2326 OPEN · #2327 OPEN · #2187 OPEN**, all three items of Project 1. Driven negative: with #2326 forced CLOSED on the wire, the barrier is **exit 1** naming `over-art-plate-arm`. |

### 3.1 The control table

| Control | Expected | Observed | Exit |
| - | - | - | - |
| faithful replay of the real board | matches the live run | `714 citations · 2332 rows · 0 crossed`, 4 controls, 3 sources | 0 |
| #2153's pair replanted (real ledger) | crossed 2 | crossed 2, both named with declared subject | 1 |
| …with the subject arm cut | judge blind, control catches it | judge `crossed 0`; CLI refuses on the control | 2 |
| ledger `state` column renamed (all) | refuse | "no post-fence table with a `state` column" | 2 |
| ledger `## THE LEDGER` heading renamed | refuse | "carries no `## THE LEDGER` fence" | 2 |
| ledger `state` renamed in the declaring-row tables only | refuse | `matched 0` → "the subject join matched ZERO citations" | 2 |
| ledger `state` renamed AWAY from the declaring rows | **refuse** | **admitted 150 of 399, clean report** | **0 (N2)** |
| roster ids stripped / tables de-ruled | refuse | "ZERO table-cell citations" (both rosters) | throw |
| `hasNextPage: true`, `endCursor: null` | refuse | "the snapshot is TRUNCATED" | 2 |
| `hasNextPage: true`, `endCursor: ""` | refuse | same | 2 |
| repeated cursor | refuse and TERMINATE | "the cursor it already followed", no hang | 2 |
| wire `state: "STALE"` on #2326 | refuse | names #2326 and the field | 2 |
| `gh` exits non-zero | refuse | the translated `gh` message | 2 |
| walk stops early but claims `hasNextPage: false` (12 of 24 pages) | undetectable in principle | caught INCIDENTALLY: no declaring row survived in the prefix, so the subject control could not be planted | 2 |
| `projectItems` empty on every row | refuse | "NOT ONE is an item of Project 1" | 2 |
| `projectItems` empty EXCEPT #1, #13, #2077 | refuse | **all four controls fire; 712 crossed** | **1 (N4)** |
| a page payload over node's ~1 MiB stdout ceiling | refuse readably | refuses — with ~1 MiB of raw JSON as the message | **2 (N5)** |
| #2326 CLOSED on the wire | crossed 1 | names `over-art-plate-arm` and the settlement | 1 |

## 4. New findings

### N1 — MEDIUM — the ledger fence is a START marker with no END, so `## CLASS ROLLUP` rows enter the class-2 population

**Confirmed on the real bytes.** `lib/board-citations.ts:185` takes `lines.findIndex(startsWith("## THE
LEDGER"))` and `:199` admits every table row at or after it, to end of file. The ledger's own maintenance
section states the real law two ways — `refutation-ledger-2026-09-12.md:121-122`: *"EVERY APPEND GOES ABOVE
`## CLASS ROLLUP`, INSIDE THE `## THE LEDGER` FENCE (#2166). The fence is `## THE LEDGER` → the next `##`"*
— and the sibling implementation already does exactly that (`lib/gate-program-docs.ts` `ledgerSections`:
*"The fence is the ENCLOSING `##`: sections after it (the class rollup, the ranked list) carry tables of
their own, and counting those as defect rows is how the total goes wrong in the direction nobody checks"*).
So the module header's claim that it uses "the same fence `lib/gate-program-docs.ts` uses" is false: it uses
the opening half.

**Measured today (current main):** 70 tables in the ledger carry a `state` column — 1 pre-fence legend
(correctly excluded), 68 in-fence (all carrying `defect` too), and **1 after `## CLASS ROLLUP`**
(`| class | modules affected | state |`, lines 1149-1155) whose rows contribute **6 citations over 5 rows**
into the 399 denominator, **5 of the 38 advisory disagreements**, and 1 of the 8 verdictless cells. There is
also an off-by-one: the comparison is `row.line >= fenceIndex` where `fenceIndex` is 0-based and `row.line`
is 1-based, so a table row on the line immediately ABOVE the heading is admitted too (blank today).

**Why it is a defect and not cosmetics.** Those cells are PROSE mentions (`"#2000's §4.6 differential"`,
`"policy-waiver-spelling (#1971)"`), not `(board #N)` tracking pointers. They are judged for RESOLUTION and
for BOARD MEMBERSHIP like real citations, so the first rollup sentence that names a number nobody minted —
or an issue that is not a Project item — becomes a hard **exit 1 on a non-citation** at the barrier, with no
exemption grammar to answer it. The denominator and the advisory census are wrong today in the direction
that reads as more coverage than exists.

**The repair, with ownership.** In `tooling/src/verify/lib/board-citations.ts`, function `ledgerCitations`
(and the same span in `assertLedgerSource`): compute the section span once — `## THE LEDGER` (1-based) to
the next line starting `## ` — and admit only `span.start < row.line < span.end`. ~10 lines, one new private
`ledgerSpan(lines)` helper. **Driven in this worktree** (probe applied, measured, restored):

| | today | after the span repair |
| - | - | - |
| `ledger-closure` citations | 399 | **393** |
| total citations | 714 | **708** |
| advisory disagreements | 38 | **33** |
| verdictless cells | 8 | **7** |
| `undeclared` | 339 | **333** |
| `matched` / `crossed` / `cross-family` / `unkeyed` | 54 / 0 / 5 / 1 | unchanged |
| planted #2153 pair | crossed 2 | **crossed 2** |
| the five named specs | 40/40 | **21/21 in the two affected specs — no pin changes** |

**Coupled sites: NONE for that repair** — I ran `tests/tooling/verify/lib/board-citations.test.ts` and
`tests/tooling/verify/ops/board-citations.test.ts` against it: 21/21 green. What the repair OWES is its own
control, which does not exist today: a pin that plants a `state`-bearing table BELOW `## CLASS ROLLUP` in a
production-shaped fixture and asserts it contributes zero citations (both directions — above the rollup it
must contribute). Without that pin the fix has no falsifier.

**A stronger variant I also measured and do NOT recommend for this landing:** additionally admitting only
tables whose schema names BOTH `defect` and `state` (the private `isLedgerRowTable` predicate in
`gate-program-docs.ts`, which the ledger satisfies in all 68 in-fence tables and in none outside), plus a
refusal when an in-fence table has `defect` and no `state`. It closes N2 as well and produces the same 393,
but it breaks **5 committed pins** (`board-citations.test.ts`: the "column- and fence-aware" arm and both
`assertLedgerSource` refusal arms; `ops/board-citations.test.ts`: the healthy-controls arm and the
configured-documents arm) because the synthetic fixtures and BOTH planted control documents in
`ops/board-citations.ts` are `| module | state |`-shaped with no `defect` column. That is a real repair with
real churn; it belongs to N2's row, not to this landing.

### N2 — MEDIUM — every non-vacuity guard is a floor of ONE, so partial input loss is invisible

`assertLedgerSource` requires ≥1 admitted table and ≥1 citation; `assertRosterSource` ≥1 citation;
`assertSubjectJoinMeasured` ≥1 matched. Total loss refuses (F2, confirmed). **Partial loss does not.**
Driven: renaming `| state |` → `| status |` in the ledger's lines 560-1054 — leaving the tables that hold the
declaring rows alone — dropped the class from **399 to 150** citations, and the barrier printed
`source [ledger] … admitted with 150 state-cell citation(s)` and **exited 0**. 249 citations went unread with
no signal. The same shape applies to the other two inputs: a `body` field nulled for part of the walk
shrinks `matched` silently (only zero refuses), and N4 is the membership instance.

**Minimal fix, in the repo's own idiom:** make the ledger admission SCHEMA-driven rather than count-driven —
a post-fence table that carries `defect` and no `state` is drift and must throw, naming the first such line
(this is the stronger variant measured in N1; it refused my evasive drift with *"carries 40 in-fence
defect-row table(s) with NO `state` column"*). That needs no baseline number and no threshold. The roster and
body halves have no equally deterministic invariant available; state them as known-uncovered rather than
inventing a threshold.

### N3 — MEDIUM (LATENT) — the hard subject arm contradicts the module's own "one board row spans several cells" premise

`crossings()` reds any ledger citation whose target declares a subject in the SAME family and a DIFFERENT
row. But class 2's whole justification (module header, and the reason state disagreement is advisory) is that
*"one board row legitimately spans several ledger rows"*. Those two rules collide exactly when several rows
of ONE wave are tracked on ONE board row — and that is not hypothetical:

**Measured: 8 board rows are each cited by 2-5 ledger rows of the same family** — #2106 (L1+L2), #2148
(L2+L3), #2236 (L1+L2+L3+L11), #2240 (L5+L10), #2217 (L5+L6+L7+L8+L9), #2067 (L1+L2), #2218 (L1+L2), #2228
(L4+L6). **All 8 declare no `**Where:**` subject today**, which is the only reason the arm is silent: today
`crossed 0` and `same-family-multi-cited-with-a-declared-subject = 0`. The moment any of those rows gains a
`**Where:**` line — which the verifier ingress writes automatically on new rows, and which is precisely the
BACKFILL the report offers as #2156's closure path — the barrier reds. If all 8 were backfilled today:
**13 false crossings**, with no exemption grammar and no way to answer them except editing a board body.

I could not find a discriminator in the data: #2153's real crossing (#2114 cited by both the L4 row that owns
it and the L5 row that does not) is byte-for-byte the same shape as a legitimate two-cell pointer. So this is
not a bug to fix in `citation-subject.ts` — it is a **constraint on the backfill**, and it must be recorded
where the backfill decision lives. The orchestrator's 2026-09-13 "do NOT backfill" ruling is therefore load
bearing for the barrier's greenness, not only for cost.

### N4 — MEDIUM — a PARTIAL Project-membership failure is exit 1 with hundreds of false findings, not exit 2

The fail-open cover is `fetchIssueStates`'s snapshot-level *"NOT ONE is an item of Project 1"* — the weakest
possible non-vacuity for a PER-ROW property. Driven at the production door: a wire that returns
`projectItems: {nodes: []}` for every row except #1, #13 and #2077 — the three rows the closed control, the
advisory control and the subject control happen to be planted against — passes all four controls and prints
**`714 citation(s) … 712 crossed`**, every one reading *"the issue exists but is an item of NO project"*.
Exit **1**. (When the same breakage hits a control row it becomes exit 2 by accident: my first, cruder
variant tripped the subject control.)

**Live likelihood is low and should be stated as such:** all 2332 repository issues are Project-1 items
today, GitHub returns a *null* field on a permission/scope error (which `wireObject` already turns into
exit 2), and the `projectItems(first: 10)` fence only truncates for an issue in >10 projects. The exposure is
a silently-empty nodes list. **Minimal fix:** judge the membership population, not its existence — refuse
when the off-board fraction is implausible (today: 0 of 2332), rather than emitting one finding per row.

### N5 — LOW/MEDIUM — the bulk query tripled the `gh` payload and the door still declares no stdout ceiling

`execNicedSync` takes no `maxBuffer` at the `gh` door (`_shared/proc.ts:165-178`), so node's implicit ~1 MiB
applies and, per that file's own comment, **`execFileSync` KILLS the child at the ceiling rather than
truncating**. `beea8b1f4`+`376f64337` grew the selection from `number state` to `number state title body
projectItems`. Measured on the real snapshot: **largest page 313.5 KiB — 30.6% of the ceiling**, largest
single body 13 KiB. So it works today with ~3× headroom, and grows with the board.

Driven at the production door with a 1.55 MiB page: **exit 2** (fail-closed, good) **but the operator
message is ~1 MiB of raw JSON** — `ghFailure` builds its detail from the captured stdout, so the refusal
reads like GitHub returning garbage rather than "our own stdout ceiling killed the read", and it spills
every issue body in that page into stderr/CI logs. **Minimal fix, with house precedent** (~15 sites declare
one, and `ops/ledger-claims.ts:240` / `ops/eslint.ts:116` even name the ceiling in the refusal): pass an
explicit `maxBuffer` on the `graphql()` path and translate the overflow into a named refusal; or drop the
page size to `first: 50`.

### N6 — LOW — the author's report declares `## LEDGER ROWS (4 rows)` and carries 3

`376f64337` bumped the heading from `(3 rows)` to `(4 rows)` and appended the fourth row after a BLANK LINE
with an escaped leading pipe (`\| board citations | …`), so it is a paragraph, not a table row — the exact
remark-escaping incident `lib/markdown-tables.ts:48-53` documents. Driven:
`reportLedgerRows(x-warning-barrier-2026-09-13.md)` → **`{"rows":3,"declared":4}`**. It is dormant only
because no ledger section cites this report yet; the moment the integrator appends the section,
`ledgers:fresh` (`ops/ledgers-fresh.ts:226-237`) reds twice — `self … heading says (4 rows) and its table
carries 3`, and a `rows` mismatch against the appended section. **Fix:** move the row INTO the table (no
blank line, no `\|`).

## 5. Per-commit verdicts

| sha (theirs) | verdict | receipt |
| - | - | - |
| `8ebe65dc3` | **SOUND AS A STEP** | the judge + the one network door + 7 pins; its `boardIssueState` reader and most of its body were replaced by the bulk door in `beea8b1f4`, so it is reviewed through its successor. The one durable thing it contributes — `CLOSED_CONTROL_ISSUE = 1` asked in the SAME invocation — is load-bearing and I drove it: #1 is CLOSED on the live board, and a snapshot where it reads OPEN refuses. |
| `c40752560` | **CONFIRMED** | comments + two literals only (`git show` read in full). #2326 / #2327 / #2187 all OPEN and on Project 1 on the live board today; forcing #2326 CLOSED on the wire reds the barrier at exit 1 naming the policy. No `mustFlag`/`mustPass`/authority/severity/population change. |
| `beea8b1f4` | **CONFIRMED AS AMENDED** | the verb, the three classes, the registry row and the bulk door. Its fail-open halves are the four codex found; all four are repaired in `376f64337`. Registry wiring re-verified on current main: `verify --list` shows the stage under `manual`, and the registry/CLI suites are 57/57. |
| `c38d396a9` | **CONFIRMED WITH CORRECTIONS ALREADY IN PLACE** | the 475-line report. Its two false proof claims (#2153 was a dangling-id case; the paging pin proved truncation refuses) are corrected in place by `376f64337` at `:222-228` and `:262-268`, dated and quoted rather than rewritten — that is the right form. |
| `376f64337` | **CONFIRMED — the repair does what it says** | F1-F4 driven above. It introduces N6 (the escaped ledger row). It does NOT introduce N1 (the fence half is `beea8b1f4`'s) nor N5's ceiling (the ceiling was always absent; this commit made the payload 3× bigger). Its own "what the repair does NOT cover" paragraph is honest and matches what I measured, except that it does not name N3. |

## 6. The three specific questions asked

- **`lib/board-citations.ts` at 430/450 (`tooling-size`): a split is not owed today, and I recommend taking
  it WITH N1 anyway.** N1 adds ~10 lines → ~438, which is 12 lines of headroom on a module that is still
  accreting arms; the near-cap file then traps the next edit. The seam is obvious and one-directional: the
  document READERS and their grammar constants (`ISSUE_REF`, `LEDGER_VERDICT`, `LEDGER_FENCE`,
  `SUBJECT_COLUMN`, `ledgerCitations`, `ledgerTableCitations`, `rosterCitations`, `assertLedgerSource`,
  `assertRosterSource`) move to `lib/citation-sources.ts`; the judge, the censuses and the report stay. That
  is ~150 lines out, and the pins import by name so the churn is import lines.
- **`LEDGERS` / `ROSTERS` newly exported: the right door.** They are the op's configuration, the op is their
  one home, and the pin at `tests/tooling/verify/ops/board-citations.test.ts:86-95` must read the SAME
  constant or it silently stops testing the configured documents — which is the exact class of blindness F2
  was. It is not a test-only leak: `runControls` is exported on the same grounds, and `verify/index.ts`
  deliberately re-exports only the two run functions, so the public surface did not grow.
- **The grown query's new failure modes at the door:** rate limit → `gh` non-zero → translated refusal →
  exit 2 (driven); a GraphQL field error that nulls `projectItems` or `repository` → `wireObject` throws →
  exit 2; a partial page → the pageInfo/cursor arms → exit 2. The two that are NOT covered are N5 (the
  stdout ceiling, whose message is unusable) and one source-only note: `graphql()` accepts a payload that
  carries BOTH `data` and an `errors` array (`workboard/ops/gh.ts:66-70`) — it keys only on `data !== undefined`.
  With `gh` exiting non-zero on GraphQL errors that is unreachable today; if that ever changes, per-field
  validation is the only thing standing between a half-answered page and a verdict, and it covers every
  field this reader uses. None of these reads as exit 0.

## 7. What I did NOT cover

- I did not run whole-tree checks (`pnpm check` / `verify --push` / `check:structure`) — out of scope by the
  brief, and red-by-construction under the #1584 exception.
- I did not re-derive the class-3 (roster) refusal from the rosters' full text; I re-measured only its counts
  (292 + 20, unchanged) and accepted codex's CONFIRMED verdict on the reasoning.
- I did not adjudicate the 38 advisory disagreements, and I did not verify the 62 → 81 → 38 history; I
  measured only today's 38 and which 5 of them come from the rollup (N1).
- I did not exercise a REAL rate limit, a real auth failure, or a real GitHub 5xx — all three are modelled by
  the non-zero-`gh` arm, which is the same code path.
- The subject join's reach is bounded by data I did not audit: 370 of 399 citing rows carry a subject key, 54
  citations match, and **339 citations over 147 distinct board rows declare nothing** — those are invisible to
  the hard arm, and that residue is why #2156 stays open. I confirmed the residue exists; I did not sample it
  for hidden crossings.
- I made no `gh` write, no board transition, and no edit outside my own worktree.

## LEDGER ROWS (6 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `lib/board-citations.ts` | cb-sec-barrier-review L1 · `tooling/src/verify/lib/board-citations.ts:185,199` | the `## THE LEDGER` fence is a START marker with no END, so every table row from the heading to EOF enters the class-2 population. Measured on the real ledger: the `## CLASS ROLLUP` cross-cutting table (`\| class \| modules affected \| state \|`, lines 1149-1155) contributes 6 citations over 5 rows to the 399 denominator, 5 of the 38 advisory disagreements and 1 verdictless cell. Those cells are PROSE mentions, not `(board #N)` pointers, and are judged for resolution and board membership like real citations — the first unminted or off-board number in a rollup sentence is a hard exit 1 on a non-citation. The ledger's own §4 (`refutation-ledger-2026-09-12.md:121-122`) and the sibling `lib/gate-program-docs.ts#ledgerSections` both define the fence as `## THE LEDGER` → the next `##`; the module header claims to use that fence and uses half of it. Also off by one: a 0-based `findIndex` is compared against 1-based `row.line` | other (population fence) | **OPEN** (board #2156 — repair and driven denominators in `docs/reviews/gate-runtime/sec-barrier-review-2026-09-13.md` §4 N1) | probe in the reviewer's worktree (`cp`/`mv`, restored, `git status` clean): span-bounded reader → `ledger-closure 399 → 393`, total `714 → 708`, advisory `38 → 33`, verdictless `8 → 7`, `matched/crossed` unchanged, #2153's replanted pair still `crossed 2`, and both affected specs 21/21 with NO pin edits |
| `lib/board-citations.ts` | cb-sec-barrier-review L2 · `tooling/src/verify/lib/board-citations.ts:223-256,261-267` | the F2 repair's non-vacuity guards are floors of ONE, so PARTIAL loss of a configured input is invisible where TOTAL loss refuses. Driven through `pnpm check:board-citations`: renaming `\| state \|` in the ledger's lines 560-1054 only — sparing the tables that hold the declaring rows — admitted 150 of 399 citations, printed `admitted with 150 state-cell citation(s)` and exited 0, with 249 citations unread and no signal. The same shape covers a partially nulled `body` field (shrinks `matched` silently; only zero refuses) | other (fail-open residue) | **OPEN** (board #2156 — minimal fix: admit by SCHEMA, refusing any in-fence table that carries `defect` and no `state`; measured to refuse the same drift with "carries 40 in-fence defect-row table(s) with NO `state` column", at the cost of 5 committed pins and both planted control documents) | the two runs above, same worktree, same board replay: full rename → exit 2; evasive partial rename → exit 0 at 150/399 |
| `lib/citation-subject.ts` | cb-sec-barrier-review L3 · `tooling/src/verify/lib/board-citations.ts:309-319` | the hard subject arm ("same family, different row = crossed") contradicts class 2's own premise that one board row legitimately spans several ledger cells, and the collision is latent only because the two populations are currently disjoint. Measured: 8 board rows are each cited by 2-5 ledger rows of the SAME wave (#2106, #2148, #2236, #2240, #2217, #2067, #2218, #2228) and all 8 declare no `**Where:**` subject; backfilling them — the closure path #2156's own report describes, and the shape the verifier ingress writes automatically on new rows — would produce 13 false crossings with no exemption grammar. #2153's real crossing is byte-for-byte the same shape as a legitimate two-cell pointer, so there is no discriminator in the data | other (citation) | **OPEN** (board #2156 — records a CONSTRAINT on the backfill rather than a code fix; the orchestrator's 2026-09-13 no-backfill ruling is load-bearing for the barrier's greenness, not only for cost) | `ledgerCitations` × the real board snapshot, grouped by cited id and citing family: same-family multi-cited with a declared subject = 0 today, without = 8 |
| `workboard/ops/project.ts` | cb-sec-barrier-review L4 · `tooling/src/workboard/ops/project.ts:308-312` | the Project-membership fail-open cover is a snapshot-level "at least one row is on the board", which is the weakest non-vacuity for a per-ROW property. A PARTIAL `projectItems` failure that spares the three rows the same-invocation controls are planted against (#1, the lowest OPEN row, the lowest declaring row) passes all four controls and yields exit 1 with 712 false "an item of NO project" findings instead of the exit 2 the class owes. Live likelihood is low (2332 of 2332 issues are Project-1 items; a scope error nulls the field, which already throws), so the exposure is a silently-empty nodes list or a >10-project truncation | other (fail-open residue) | **OPEN** (board #2156 — minimal fix: judge the off-board POPULATION, refusing an implausible fraction, rather than emitting one finding per row) | driven at the production door with a fake `gh` replaying the real 2332-row snapshot with membership stripped except #1/#13/#2077: `714 citation(s) … 712 crossed`, exit 1, four control receipts printed above it |
| `workboard/ops/gh.ts` | cb-sec-barrier-review L5 · `tooling/src/workboard/ops/gh.ts:53-59` · `tooling/src/_shared/proc.ts:165-178` | the `gh` door passes no `maxBuffer`, so node's implicit ~1 MiB applies and `execFileSync` KILLS the child at the ceiling; `beea8b1f4`/`376f64337` grew the page selection from `number state` to `number state title body projectItems`, measured at 313.5 KiB on the largest of 24 pages (30.6% of the ceiling) and growing with the board. Driven with a 1.55 MiB page: exit 2 (fail-closed) but the operator message is ~1 MiB of raw JSON, because `ghFailure` builds its detail from the captured stdout — the refusal reads as "GitHub returned garbage" and spills every body in that page into stderr | other (subprocess ceiling) | **OPEN** (board #2156 — minimal fix per the house precedent at `ops/ledger-claims.ts:240` and `ops/eslint.ts:116`: declare the ceiling on the `graphql()` path and name it in the refusal, or halve `first: 100`) | page-size census over the real snapshot (313.5 KiB max, 13 KiB largest body) plus the 1.55 MiB replay through `pnpm check:board-citations` |
| `docs/reviews/gate-runtime/x-warning-barrier-2026-09-13.md` | cb-sec-barrier-review L6 · `docs/reviews/gate-runtime/x-warning-barrier-2026-09-13.md:565-571` | `376f64337` bumped the heading to `## LEDGER ROWS (4 rows)` and appended the fourth row after a blank line with an escaped leading pipe, so it serialises as a PARAGRAPH — the remark-escaping incident `lib/markdown-tables.ts:48-53` documents. The report therefore declares 4 rows and carries 3, and `ledgers:fresh` reds twice (`self` plus a `rows` mismatch) the moment a ledger section cites this report | other (report hygiene) | **OPEN** (board #2156 — fix: move the row into the table, no blank line, no `\|`) | `reportLedgerRows(x-warning-barrier-2026-09-13.md)` → `{"rows":3,"declared":4}` |

ledger rows OWED: 0 — the six rows above are NEW rows for the integrator to append; this lane flipped no
existing cell and edited no ledger.

### Proposed updates to the four rows the author's report already declares

1. **Row 1 (warning debt, `c40752560`)** — stands. Add the independent confirmation: #2326 / #2327 / #2187
   all OPEN and Project-1 items on the live board 2026-09-13, and a driven negative (wire-CLOSED #2326 →
   exit 1 naming `over-art-plate-arm`).
2. **Row 2 (class-3 roster refusal)** — stands; counts re-derived unchanged on current main (292 + 20).
3. **Row 3 (the advisory census)** — the count is stale twice over: the row says 72, §6.9 says 81, and the
   measurement on current main is **38**. Restate it as a DERIVED count that the barrier prints every run
   rather than a number in prose, and note that 5 of today's 38 are N1's rollup rows and disappear with the
   fence repair.
4. **Row 4 (the declared-subject residue)** — must be un-escaped into the table (N6), and its numbers are
   base-specific: on current main it is **339 citations over 147 distinct board rows**, not 303 over 133.
   Add the N3 constraint to it: the backfill it describes is not merely expensive, it would red the barrier
   on 8 multi-cited rows.

## 8. Commit receipt

This document is the lane's ONE commit — a single ADDED file,
`docs/reviews/gate-runtime/sec-barrier-review-2026-09-13.md`, committed with
`git -c core.hooksPath=/dev/null commit` under the standing #1584 exception, with the scoped floor named in
the message. `git status --short` was EMPTY before the commit and after every probe restore
(`docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` and
`tooling/src/verify/lib/board-citations.ts`, both `cp`/`mv`, both in this worktree only). The
`git show --stat` line with the commit's sha and insertion count is in the lane report to the orchestrator:
a stat of its own commit cannot be written into the file it commits without being stale by construction.

## 9. Proposed lessons (report text — this lane writes no memory)

- **`fence-start-marker-without-an-end`** — A section fence implemented as `findIndex(startsWith(heading))`
  with no end bound silently annexes every later section of the document. It reads as a fence in review and
  in the module header. Hook: the sibling reader in the SAME package (`gate-program-docs.ts#ledgerSections`)
  already bounded it at the next `##` for the same document, and the document's own maintenance section
  states the law — check the sibling before writing the second reader of one file.
- **`non-vacuity-floors-are-blind-to-partial-loss`** — "≥1 admitted table, ≥1 citation, ≥1 matched, ≥1
  on-board row" refuses TOTAL input loss and passes PARTIAL loss of the same input; measured three times in
  one instrument (150 of 399 ledger citations silently unread; 712 false findings from a partial membership
  read; a shrinking `matched` from partially nulled bodies). Where a deterministic schema invariant exists,
  admit by SCHEMA; where it does not, say the magnitude is unguarded rather than implying a floor covers it.
- **`same-invocation-controls-catch-cuts-but-only-where-their-rows-sit`** — the planted controls in this
  barrier caught a cut subject arm, a total membership failure and a truncated tail. They caught the tail
  only because every declaring row happens to live in it. A control planted against "the lowest OPEN row" or
  "the highest number + 1" measures the part of the snapshot those rows occupy, not the snapshot.
- **`a-bulk-read-owes-its-stdout-ceiling`** — enlarging a `gh`/`git` selection is a subprocess-buffer change:
  `execFileSync` KILLS the child at ~1 MiB and the thrown error carries the truncated payload as its message,
  so the refusal is unreadable and spills content into the log. Declare `maxBuffer` and name it in the
  refusal (`ops/ledger-claims.ts` / `ops/eslint.ts` are the house shapes).

## Recheck (`3a7021d99`) — 2026-09-13

The security owner's grouped repair, cherry-picked into THIS worktree as `8d2766f25` (conflict-free, on top
of the five-commit stack on current main; their tree untouched). Everything below is re-driven with the same
harness — a fake `gh` replaying the real 2332-row snapshot in the NEW wire shape (`projectItems` now carries
its own `pageInfo`), plus real-file `cp`/`mv` probes restored and verified byte-identical.

**Floor on the merged tree:** the six specs **49/49** (`board-citations` 11 · `citation-sources` 8 ·
`citation-subject` 5 · `workitem-liveness` 3 · `ops/board-citations` 6 · `workboard/ops/project` 16) ·
`biome` 0 on 12 files · `eslint` 0 on 11 files · `pnpm typecheck --config tooling/tsconfig.json --config
tsconfig.json` PASS 2/2 · `pnpm check:docs` 0. Sizes under the 450 cap and matching the claim:
`board-citations.ts` 292 · `citation-sources.ts` 229 · `project.ts` 349 · `gh.ts` 122 ·
`ops/board-citations.ts` 236.

### The verdicts

| Item | Verdict | Receipt on THIS base |
| - | - | - |
| **N1** fence END + off-by-one | **CONFIRMED REPAIRED** | `ledgerSpan` is 1-based and exclusive at both ends. Real barrier run: **`ledger-closure` 393 · total 708 · advisory 33 · verdictless 7 · undeclared 333**, `matched 54 / crossed 0 / cross-family 5 / unkeyed 1` unchanged — the exact shape §4 N1 predicted for my base. (The author's 356/671/76/4/297 are THEIR base's ledger; both are right, and the difference is 47 commits of ledger growth, not a disagreement.) |
| **N1** the owed control | **CONFIRMED, and re-driven on the REAL document** | Their pin (`citation-sources.test.ts:49`) moves the same table byte-for-byte across the closing `##` and asserts `[1584]` vs `[1584, 9001]` — a real two-direction control, not a fence. Independently: planting one `defect`+`state` table citing absent **#99999** into the real ledger reads **394 citations, #99999 read once** when it sits above `## CLASS ROLLUP` and **393, read 0 times** when it sits below it. |
| **N1** #2153 still caught | **CONFIRMED** | The pair replanted in the real ledger (`cp`/`mv`, restored): CLI **exit 1, 2 crossed**, both named with the subject each cited row declares. |
| **N1** the arm is still what catches it | **CONFIRMED (both layers survive)** | Judge with `crossings()`' subject arm cut: **exit 0 / crossed 0** on the same planted pair; the CLI with the same cut: **exit 2**, the subject control naming `matched 1 (expected 1) and crossed 0 (expected 1)`. |
| **N2** schema admission | **CONFIRMED REPAIRED** | The exact bytes that admitted **150 of 399 and exited 0** now exit **2**: *"carries 40 in-fence defect-row table(s) with NO `state` column — first at line 572, columns `module \| wave · path:line \| defect \| class \| status \| receipt`"*. The MIRROR direction refuses too (`defect` → `finding`, same 40, names the missing `defect`). Untouched: ledger 393, rosters 292 and 20 admitted. Fence loss still refuses by name. |
| **N4** the three provable arms | **CONFIRMED REPAIRED** | Driven through `fetchIssueStates`: a truncated `projectItems` page (`hasNextPage: true`, Project 1 not in the prefix) → throw naming #2326 and "UNDECIDED"; a non-boolean `projectItems.pageInfo` → throw; `data` beside `errors` → throw quoting only the first message; `repository: null` → throw. No fraction threshold was introduced, which is the right call. |
| **N5** ceiling + named refusal | **CONFIRMED REPAIRED** | A **17.29 MiB** page through the production door → throw of **363 characters** naming `16777216-byte stdout ceiling`, `GH_MAX_BUFFER_BYTES`, ENOBUFS and "the response is deliberately NOT printed" — where the pre-repair door returned ~1 MiB of issue bodies as its message. The ceiling is a defaulted parameter so the pin can plant 1024 bytes and assert a sentinel body is absent. Today's largest page is 313.5 KiB = **1.9%** of the new ceiling. |
| **N6** report rows | **CONFIRMED REPAIRED** | `reportLedgerRows(x-warning-barrier-2026-09-13.md)` → **`{"rows":7,"declared":7}`**; zero escaped leading-pipe lines in the file. |
| **The split** vs `tooling-size` | **CONFIRMED** | 292 / 229 / 349 / 122 / 236, all under 450; one direction only (`board-citations.ts` imports `citation-sources.ts`, never the reverse). |
| **F1–F4 re-run** | **CONFIRMED — nothing re-opened** | Faithful replay → exit 0 with the receipt above. `hasNextPage`+null cursor → 2 · empty-string cursor → 2 · repeated cursor → 2 (terminates) · `"STALE"` on #2326 → 2 · wire-CLOSED #2326 → **exit 1** naming `over-art-plate-arm` · roster ids stripped → throw · subject-join-zero → 2. |
| **N3** | **UNCHANGED BY DESIGN, and correctly recorded** | Still 8 board rows cited by 2–5 ledger rows of one wave, all still declaring no subject, so `crossed 0` holds only because the populations stay disjoint. The repair records it as a #2156 constraint rather than pretending to fix it, which is the honest disposition. |

### The five source-integrity assumptions — two of them ARE controllable

The list is honestly written and correctly separated from the confirmed defects. Three of the five hold as
stated; **two claim "no control possible" where a cheap in-band control exists**, and both are verified live
against this repository (read-only, 2026-09-13):

1. **A fabricated empty `projectItems.nodes` with `hasNextPage: false` (indistinguishable from honest
   off-board)** — **PARTLY REFUTED.** Indistinguishable *in that response*, yes; not unmeasurable. The
   project side answers the same question independently:
   `user(login:"Inktomi93"){ projectV2(number:1){ items(first:1){ totalCount } } }` → **2334**. A walk that
   marked 3 rows on-board against a project holding 2334 items is a contradiction, not a threshold. Re-driven
   post-repair, this arm still produces **706 false findings at exit 1** (was 712; the 6 fewer are N1's rollup
   citations), so the cost of leaving it is real. Cheapest honest form: one extra query, and refuse when the
   on-board count is a small fraction of the project's own `totalCount`.
2. **An early-stopping page claiming `hasNextPage: false`** — **REFUTED as "no control possible".** The same
   connection already exposes the denominator:
   `repository(...){ issues(first:1){ totalCount } }` → **2334**. Adding `totalCount` to
   `ISSUE_STATES_QUERY` and refusing when `rows.size` is SHORT of the first page's `totalCount` turns the one
   truncation shape nothing else can see into a hard exit 2, deterministically and with no flake on a
   concurrent mint (a mint during the walk makes the walk LONGER, never shorter). This is the strongest
   single addition still available to this reader.
3. **A partially nulled `body` shrinking `matched` silently** — **HOLDS.** A null body now only survives a
   response with no `errors`, and there is no in-band invariant separating "legitimately empty" from
   "nulled"; a magnitude guard would need a committed baseline, i.e. a ratchet. Correctly declared.
4. **An in-fence table with BOTH headers drifted reads as prose** — **HOLDS as stated, with a cheap
   narrowing available.** The owner's own measurement (63 in-fence tables, all carrying both, zero carrying
   neither) means "an in-fence table naming NEITHER column" is today an empty population, so refusing it
   would cost nothing and close the last silent under-read. It needs one owner judgment — whether a future
   non-defect table inside the fence is legitimate — which is why I do not call it a defect.
5. **Issue BODIES are authored data the join trusts** — **HOLDS, and it is the right boundary.** Anyone who
   can edit a board row's body can move its declared subject. The blast radius is bounded and worth stating
   in one line: it can manufacture a false CROSS (exit 1, loud) or mask a subject mismatch, and it cannot
   produce a false clean of the resolution or openness arms, which read only `state` and Project membership.

**One new observation, not a row:** `ISSUE_REF` is `/#(\d{2,5})/g`, so a six-digit `#123456` parses as
**#12345** — a silently mis-read citation rather than a refusal. Latent only: `#[0-9]{6,}` occurs **0 times**
across all three configured documents today, and the board is at 2334. It is worth a `(?!\d)` when the file is
next touched; it is not worth a landing.

### Proposed state cells for the six rows above — REPAIRED, not flipped

The `## LEDGER ROWS (6 rows)` table above is left exactly as filed: these are the cells the INTEGRATOR
substitutes once the repair lands on main and its own sha exists. No row is closed here.

| Row | Proposed `state` cell |
| - | - |
| L1 fence END | **REPAIRED at `3a7021d99`** — the integrator substitutes the merged sha (board #2156): `ledgerSpan` bounds the section at the next `## `, both ends exclusive, with the two-direction control this row asked for; independently re-driven at 393/708/33/7 on current main |
| L2 floors of ONE | **REPAIRED at `3a7021d99`** for the LEDGER half (board #2156): admission is by the `defect`+`state` schema and half a pair throws, so the 150-of-399 false exit 0 is now exit 2 in both rename directions. The ROSTER and BODY halves remain floors of one and are declared as such in the module |
| L3 multi-cell collision | **OPEN** (board #2156) — unchanged and correctly so; recorded as a constraint on any `**Where:**` backfill, verified still latent (8 rows, all undeclared, `crossed 0`) |
| L4 partial membership | **REPAIRED at `3a7021d99`** for the DECIDABLE half (board #2156): a truncated `projectItems` page, a non-boolean membership `pageInfo`, a null `repository` and `data`-beside-`errors` all throw. The FABRICATED-empty half stays open as a source-integrity assumption — and see the recheck's assumption 1: `projectV2.items.totalCount` (2334, live) is an available independent oracle |
| L5 stdout ceiling | **REPAIRED at `3a7021d99`** (board #2156): a declared 16 MiB `GH_MAX_BUFFER_BYTES`, a 363-character refusal naming the ceiling and printing none of the response, and a plantable ceiling so the refusal has a pin |
| L6 report rows | **REPAIRED at `3a7021d99`** (board #2156): `reportLedgerRows` → rows 7 / declared 7, no escaped leading-pipe row |

### Verdict

**INTEGRABLE.** The six-commit barrier stack (`8ebe65dc3` · `c40752560` · `beea8b1f4` · `c38d396a9` ·
`376f64337` · `3a7021d99`) is sound on this tree: F1–F4 stay closed, N1/N2/N4-decidable/N5/N6 are repaired
with two-direction controls, N3 is recorded rather than papered over, and every refusal I could construct
lands on exit 2 or a named exit 1. The two assumption corrections above (`repository.issues.totalCount` and
`projectV2.items.totalCount`) are follow-on rows, not integration blockers. #2156 stays OPEN.
