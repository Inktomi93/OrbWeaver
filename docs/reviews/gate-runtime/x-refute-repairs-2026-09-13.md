---
kind: review
status: active
updated: 2026-09-13
---

# cb-x-refute-repairs — the CONDITIONAL repairs the closure review demanded on #2197 #2259 #2270 #2288

Lane `cb-x-refute-repairs` (claude-b executor), worktree
`/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-ac47f44db1be8dba4`, branch
`wt/agent-ac47f44db1be8dba4`, base `204607e84` (main's tip; `git rev-list --left-right --count main...HEAD`
\= `0 0` at start). Subject: every "ACCEPT WITH CORRECTION" clause in
[`adj-closure-review-2026-09-13.md`](adj-closure-review-2026-09-13.md) §2 for those four rows.

Every receipt below is a run this lane made in this session. Where I inherited a measurement I say so and
name whose it was; where I could not measure I say UNMEASURED and name who owns the measurement.

## 0. Two premise deltas, both accepted by the orchestrator mid-run

1. **None of the four rows is CLOSED.** The brief opened *"four CLOSED board rows … these rows stay Done"*.
   `gh issue view` at 08:52Z: **#2197 OPEN** (5 comments), **#2259 OPEN / Ready** (0 comments),
   **#2270 OPEN / Verify**, **#2288 OPEN / Verify**. They are closure CANDIDATES; the work is identical
   (make each proposal true) but the orchestrator, not this lane, owns the lifecycle flip.
2. **Historical planter results are available** — see §1c. They show completed passing runs, but do not establish the source revision, quiet-box condition, or controlled causality required for #2197 closure.

## 1. #2197 — the stderr-capture row

### (a) PRESERVE the repaired ARM B — done, and its citation was stale

**No edit.** ARM B is on the tree and has since been EXTENDED by #2325, so the review's coordinates
`no-loose-id-cast.ts:30-44,:105` no longer resolve to it. Corrected coordinates at `204607e84`:

| what | where |
| - | - |
| the unwrap helper | `tooling/src/verify/gates/no-loose-id-cast.ts:33-39` (`unwrapParentheses`, recursive) |
| the contract header (`#2197, #2325`) + DECLARED LIMIT | `:41-54` |
| call sites | `:56` (the anchor) · `:104` (the semantic read) |
| the `mustFlag` row whose `why` names the parenthesized operand | `:121-126` (`expect: { count: 1, token: "async " }`) |

**Receipt (mine):** `pnpm check:structure --check dangling-doc-cite --check dangling-refs --check
no-loose-id-cast` → exit 0, `✓ no-loose-id-cast · final ordinary/error · population 3387 source · waived 6`,
whole run `raw 6 = waived 6 + granted 0 + effective 0 · 0 tool error(s) · 0 withheld`. The row's original
symptom was this policy going `owner.status: incomplete` and **withheld** on two tool errors; `0 withheld`
is the direct negation of that state on the real tree.

### (b) RETRACT the false "nothing exercises `runCommandWithBudget`" claim — done, in code

The claim exists in three places. Two are documents I do not own (§5 proposes their exact replacement
cells); the third was a code-adjacent silence, and that is what I repaired.

**The truth, re-derived here, not inherited:**

```
/usr/bin/grep -an 'runCommandWithBudget' tests/tooling/_load-budget.ts
  125:function runCommandWithBudget(run: CommandBudget): string {
  167:  return runCommandWithBudget({ command: "node",  … });   // runNodeWithBudget
  172:  return runCommandWithBudget({ command: "pnpm",  … });   // runPnpmWithBudget
positive control  /usr/bin/grep -arl 'scaledBudget' tests/ | wc -l  →  143
```

and the error path is pinned: `tests/tooling/load-budget.int.test.ts:82-86` drives
`process.stdout.write('partial'); process.stderr.write('fatal'); process.exit(2)` through
`runNodeWithBudget` and asserts `FATAL_EXIT_RE = /exit 2.*fatal/su` (`:32`) against the THROWN message — an
assertion that can only pass if the child's stderr reaches the message. Row 770's stated receipt
(*"returns nothing"*) does not reproduce, and the file it names predates the row by seven commits
(`git log --follow` → first landing `67c708a4d`, `tooling(verify): load-honest test budgets (#606)`).

**What changed:** `tests/tooling/_load-budget.ts`, the `CommandBudget` JSDoc — a new
`WHERE THE COMMITTED PINS ARE` paragraph naming all four outcome arms by line (`:54-65` kill, `:67-70`
finish, `:76-80` exit-1, `:82-86` exit-2) and stating the row's false claim so the next verifier does not
re-derive the absence. It also carries the DECLARED LIMIT, which is the part that keeps the retraction
honest: **the exit-2 arm pins the THROW's text, not the `stdio` triple above it.**

**Red-first receipt for that limit (mine, not inherited from `p-verify-seam-fixes`):** `cp`-backed, one
command per call — `sed -i` replaced `stdio: ["ignore", "pipe", "pipe"],` with a comment, then
`pnpm test:scoped tests/tooling/load-budget.int.test.ts` → **exit 0, 13/13 passed, 1.45 s**. Restored from
the `.bak`; `grep` confirms the triple is back at `:158`; `git status --short` empty afterwards.

**A SECOND false claim, in the same file, retracted in the same paragraph.** The `#2197` comment at the
`stdio` option asserted *"execFileSync's DEFAULT leaves the child's stderr inherited by the parent, so
`err.stderr` is null"*. Measured by me on node **v26.5.0**, one child writing both streams and exiting 2:

```
DEFAULT (no stdio option)          stderr="fatal-words"  typeof=string   status=2   (and ECHOED to the parent)
triple ["ignore","pipe","pipe"]    stderr="fatal-words"  typeof=string   status=2   (not echoed)
"inherit"                          stderr=null           typeof=object   status=2
```

So the default already captures; only `stdio: "inherit"` — which this call site never used — nulls it.
**The triple STAYS** (the owner's fix survives): what changed is its stated reason, now the two things the
measurement shows it actually buys — stdin isolation and suppression of node's echo into the vitest
stream — plus the note that the legibility half the row was filed for is the
`${label} child exit ${status}: ${stderr}` throw below it. This is the house idiom: *the ruling survives,
its input changed.*

### (c) Historical planter results — quiet-box closure remains unproved

I did not run `check-gates.repo.int` (planting suite, orchestrator-only, outside this lane's load fence).
**Ten local, gitignored slots under `reports/runs/test/` carry it.** They are historical observations, not versioned proof of the ARM B fix as the cause of the transition.

| slot | verdict |
| - | - |
| `main-2912752-2026-09-12T13-38-40-645Z` | ORB-LOAD-KILL, 10 skipped — correctly stamped NON-VERDICT (loadavg 12.8/8) |
| `main-3589678-2026-09-12T15-31-39-142Z` | 10 passed |
| `main-527041-2026-09-12T18-31-03-678Z` | **failed — `check:structure pass (check-gates.int beforeAll) child exit 2`** |
| `main-651345-2026-09-12T18-59-47-710Z` | ORB-LOAD-KILL, NON-VERDICT (loadavg 6.0/8) |
| `main-713372-2026-09-12T19-11-20-468Z` | **failed — `child exit 2`** |
| — | **`fa8a6e15a` lands 2026-09-12T19:23:56Z — the ARM B fix** |
| `main-767971-2026-09-12T19-24-37-420Z` | **10 passed** (41 s after the fix) |
| `main-809094-2026-09-12T19-36-25-419Z` | 10 passed |
| `main-1345284-2026-09-12T22-12-58-985Z` | 10 passed |
| `main-3843198-2026-09-13T04-47-15-881Z` | ORB-LOAD-KILL, NON-VERDICT (loadavg 6.3/24) |
| `main-4132528-2026-09-13T05-45-37-478Z` | **10 passed / 0 failed / 0 skipped — the most recent** |

Read by parsing each local slot's `test-report.json` for the `check-gates.repo.int` entry. The completed 10/10 runs are valid historical observations. These JSON files do not record a Git revision or load average, and the failed runs say only `child exit 2`; the series also contains a green before the fix. Therefore timestamp ordering does not establish controlled causality or the owner's quiet-box condition. The three killed runs establish their own load-non-verdict classification only.

**#2197 stays OPEN pending a fresh revision- and load-bearing planter receipt.** The repaired Arm B and the fatal-child diagnostic pin are independently confirmed; neither fact substitutes for that remaining acceptance condition.

## 2. #2259 — the `6cd7b488c` size figures

### (a) The #2242 correction comment exists — CONFIRMED

`gh issue view 2242 --comments`, comment 2 of 2: *"## Receipt correction (#2259): `6cd7b488c`'s own size
figures are WRONG, measured against the tree at that sha"*, with the per-file delta table
(`proc.ts` 331→**357** +26 · `gate-program-docs.ts` 260→**255** −5 · `artifacts.ts` 406→**407** +1), the
reproducing command `git show 6cd7b488c:<path> | wc -l`, and the statement that the load-bearing conclusion
(all under the 450 cap) is unaffected.

### (b) BOTH cite sites named in the fix spec are false — the residue is ZERO

Ledger row 753's fix spec says *"correct the figures wherever they are cited (**the #1584 comment**, **the
board evidence field**)"*. Neither ever carried them.

**#1584** — all 59 comments dumped (187,670 bytes, `gh issue view 1584 --json comments --jq
'.comments[].body'`), counted with `/usr/bin/grep -ao <token> | wc -l`:

| token | occurrences |
| - | -: |
| `331` | **0** |
| `406` | **0** |
| `6cd7b488c` | **0** |
| `407` | 0 |
| positive control `gate` | **240** |

(The closure review reported the control as 173; that is `grep -c` — lines containing — against my `-o`
occurrence count over the identical 187,670-byte dump. Both are non-zero, which is all the control owes.)

**#2242's Project-1 `evidence` field — this is the cell the closure review listed under "WHAT I DID NOT
COVER"; I read it.** `gh api graphql` over `repository.issue(2242).projectItems.fieldValues`:

- `Evidence` = *"CONFIRMED by cb-v-wave-7 … report docs/reviews/gate-runtime/v-wave-7-2026-09-13.md. Real-tree
  drives through the production dispatcher: eslint-grant-liveness 0 findings / 2 with the old .cache/*\*
  value planted; tooling-size 22/22 …"\* — **no line counts at all**.
- `Lane` = `p-verify-seam-fixes`; `Title` carries `464` and `507`, which are the BEFORE values the ledger
  row itself calls exact.
- Positive control for the read: the query returned populated text for `Title`, `Lane` and `Evidence`, so
  the zero on `331/260/406` is a measurement, not an empty response.

**Consequence:** the only surviving home of the wrong figures is the IMMUTABLE commit message
`6cd7b488c`, and the correction already lives on #2242. #2259's fix spec is fully discharged; nothing in
the tree needs an edit (`/usr/bin/grep -rn '464→331\|507→260\|441→406'` over the whole worktree returns
exactly two hits, both the DEFECT row itself: `refutation-ledger-2026-09-12.md:753` and its verbatim twin
`v-wave-7-2026-09-13.md:272`).

**No source change for this row.** The correction is the two ledger cells in §5.

## 3. #2270 — the parked `test-layout` population

### (a) The class pin — PRESERVED

No edit to the assertions. `pnpm test:scoped tests/tooling/verify/gates/mirror-index-family.suite.test.ts` (run
together with the load-budget suite) → **36 passed across 2 files, exit 0**, of which 23 are this file.

### (b) #2142 correction delivered by the orchestrator

The lane drafted §6; Claude B subsequently posted the number correction and a follow-up distinguishing seven family tests from one named non-family exception (bridge notes 1021 and 1030). #2142 remains the separate owner of the parked work. The comment URL is pending in the local GitHub catch-up queue.

### (c) The six post-park members now have a RECORD — in the header, with per-member receipts

`183e49714`'s 57-path literal was replaced by the class invariant at `6049dcded`, which was right, but it
took the only in-code record of WHO joined with it. The class deliberately does not red on an in-class
addition, so growth is auditable only if it is written down. **What changed:**
`tests/tooling/verify/gates/mirror-index-family.suite.test.ts`, header only — a `THE POST-PARK RECORD` block
naming the six with the commit that ADDED each (`git log --diff-filter=A`), all six dated 2026-09-12:

| adding commit | member |
| - | - |
| `a196a35d7` | `tests/tooling/verify/gates/bus-payload-family.suite.test.ts` |
| `2dabae9ce` | `tests/tooling/verify/gates/seed-theme-ink-family.suite.test.ts` |
| `a97454714` | `tests/tooling/verify/gates/token-contract-family.suite.test.ts` |
| `17a59099b` | `tests/tooling/verify/gates/css-home-topology-family.suite.test.ts` |
| `ae7a40e0b` | `tests/tooling/verify/gates/real-corpus-liveness-family.suite.repo.int.test.ts` |
| `61cae0710` | `tests/tooling/doc-catalog/ops/catalog-scope.suite.test.ts` — **NOT in the class**; it is the first `PARKED_EXCEPTIONS` row, and the member that vindicates the roster argument |

**AND THE POPULATION MOVED AGAIN WHILE I WAS WRITING THE RECORD — 57 is stale, tip is 59.**
`pnpm check:structure --check test-layout` at `204607e84`: `✗ test-layout (59) · raw 59 = waived 0 +
granted 0 + effective 59 · 0 alarm(s) · 0 tool error(s) · 0 withheld`. Attribution derived by diffing the
tip finding list against the 57-path literal recovered from
`git show 183e49714:tests/tooling/verify/gates/mirror-index-family.suite.test.ts` (60 path tokens = 57 members +
3 overlay FIXTURE paths — `use-thing`, `start-chat`, `snapx/cli` — which are not members):

| adding commit | new member since wave-12b |
| - | - |
| `9104f718f` (2026-09-12) | `tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` |
| `158dbdd96` (2026-09-13) | `tests/tooling/verify/gates/no-color-literals-parity.test.ts` |

Both in-class; both entered SILENTLY; nothing red. That is the ruled trade working as designed — and it is
also the receipt that the record is worth writing, since a report is the only thing that would have caught
it and reports age. The header says so explicitly, and tells the next reader to RE-DERIVE with the named
command rather than trust the number.

### (d) The naming half was wave-12b's, not `6049dcded`'s — CONFIRMED, correction in §5

`docs/reviews/gate-runtime/v-wave-12b-2026-09-13.md` §2 carries the 51/53/57 reconciliation and the six
names; `183e49714` is wave-12b's commit. `6049dcded` shipped the class invariant (ledger 905's half) and
nothing of the naming. The closure text crediting `6049dcded` with both is wrong on the tree.

## 4. #2288 — `.dependency-cruiser.cjs` and the citation grammar

### (a) Arm-B membership includes the root `.cjs` — CONFIRMED by my own two-direction control

`cp`-backed, one command per call, restored, `git status --short` empty verified after:

```
baseline    pnpm check:structure --check dangling-doc-cite   → exit 0,  raw 0 = effective 0
PROBE A  // … docs/architecture/core/Cb-X-Probe-Nonexistent.md   → FLAGGED  .dependency-cruiser.cjs:855:33
PROBE B  // … Cb-X-Probe-Nonexistent-Bare.md                     → NOT flagged
planted     same command                                     → exit 1,  raw 1 = effective 1
```

Both probes were planted in ONE edit on consecutive lines and judged by ONE run, so the pair is a
two-direction control rather than two measurements. Membership is `dangling-doc-cite.ts:134-140`
(`isArmBMember`) with `ROOT_EXTS` at `:103` — **not** `dangling-refs`, whose corpora genuinely exclude it.

### (b) The residue: 63 of 64, ROUTED to #1334 — and I REFUSE to widen the grammar here

**REFUSAL WITH RECEIPT.** The brief offered two arms: repair the recognizer so the bare form is admitted,
or route the residual under #1334. I take the routing arm and decline the widening, because widening
`DOC_TOKEN_RE` **IS #1334's stated deliverable** — *"dangling-doc-cite is anchored on a docs/ prefix and
the house idiom is a bare filename — 137 unresolvable comment citations are invisible to it"*, and its
body quotes the exact regex and the exact header justification I would be editing. #1334 is **OPEN** and
its Project status is **Running**. Building it here is a head-on collision with a claimed row, and the
census it needs (137 sites repo-wide) is an order of magnitude past this lane's fence. The orchestrator
confirmed mid-run that #1334's `p-verify-instruments` lane label has no live worker; the row is still its
owner, so the routing arm stands.

**The accurate proof of what IS covered**, measured on `.dependency-cruiser.cjs` at `204607e84` by
resolving every `.md` token against `git ls-files` (exact path, `/`-suffix, and basename):

| | count |
| - | -: |
| `.md` cites total | **64** |
| distinct spellings | 16 |
| `docs/`-prefixed (i.e. inside `DOC_TOKEN_RE`) | **1** (`docs/architecture/core/Core-Tooling-Law.md`, `:660`) |
| outside the grammar | **63** — 14 bare basenames (61 cites) + one `history/`-relative spelling (2 cites) |
| **unresolvable today** | **0** |

So the risk is PROSPECTIVE rot, not a live lie — which is exactly why the repair is #1334's widening and
not a coverage claim here. The closure comment must NOT read *nothing further is owed*.

**What changed:** `tooling/src/verify/gates/dangling-doc-cite.ts`, header only — the `DOC_TOKEN_RE`
paragraph now names #1334 as the limit's live owner, carries the two-direction membership control above,
and states the 64/1/63/0 measurement so the next reader cannot mistake arm-B membership for citation
coverage. No grammar, no behaviour, no proof row touched (the bounded gate run after the edit is green and
the module does not flag its own header).

### (c) The two wrong receipts in the closure text — the right paths

| the closure cites | the truth at `204607e84` |
| - | - |
| `tooling/src/verify/gates/dangling-refs.ts:262` as the Arm-B membership rule | `:262` is `LAW_OUTSIDE_DOCS`, a two-entry `.md` list; `dangling-refs` does NOT include root `.cjs`. The membership rule is a DIFFERENT module: `tooling/src/verify/gates/dangling-doc-cite.ts:134-140` (`isArmBMember`), `ROOT_EXTS` at `:103` |
| `tests/tooling/verify/gates/dangling-refs.test.ts:106,190` | **that path does not exist.** `ls` → `No such file or directory`. The only file there is `dangling-refs.repo.int.test.ts`, and its arms are `dangling-refs`'s own planted-file and population receipts — not controls on `dangling-doc-cite`. The membership control that DOES exist is the one I planted above; the module's committed refusal pins are in `tests/tooling/verify/gates/text-citation-family.suite.test.ts` (named by `dangling-doc-cite.ts:61-62,72-73`) |

## 5. Proposed ledger cells

For root to apply to `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md`. Line numbers are this
tree's (`204607e84`); the closure review numbers them 2 higher because it measured a tree with two extra
appended rows. `f946a501e` is this lane's commit.

**Row 770 (review's 772) — `tests/tooling/_load-budget.ts`, board #2197**

- current STATE cell: `**OPEN** (board #2197)`
- current RECEIPT cell ends: ``…and `/usr/bin/grep -arln 'runCommandWithBudget' tests/` returns nothing``
- proposed STATE cell: `**OPEN** — `f946a501e`(board #2197): the row's PREMISE was false when written (the grep returns three hits; the error path is pinned at`load-budget.int.test.ts:82-86`), and the pin the row asked for is now NAMED in the `CommandBudget`JSDoc together with its declared limit — the exit-2 arm pins the throw's text, not the`stdio` triple (cb-x-refute-repairs)`
- proposed RECEIPT-cell APPENDIX (leave the original text byte-preserved, append after it):
  ``· CORRECTED 2026-09-13 (cb-x-refute-repairs): that grep returns `_load-budget.ts:125` (definition), `:167` and `:172`; positive control `/usr/bin/grep -arl 'scaledBudget' tests/ | wc -l` → 143. Deleting the `stdio` triple leaves the suite 13/13 green (cp-backed, restored), so the limit is now written down rather than implied``

**Row 753 (review's 755) — commit `6cd7b488c` message, board #2259**

- current STATE cell: `**OPEN** (board #2259)`
- the RECEIPT cell's fix spec currently ends: `Fix: correct the figures wherever they are cited (the #1584 comment, the board evidence field)`
- proposed STATE cell: `**CLOSED** — evidence reconciled, no executable defect (board #2259): the correction comment is on #2242 (2026-09-13T00:29:46Z, `357 / 255 / 407` with the reproducing command), and NEITHER cite site the fix spec names ever carried the figures, so the residue is zero (cb-x-refute-repairs)`
- proposed RECEIPT-cell APPENDIX: ``· BOTH NAMED CITE SITES MEASURED EMPTY 2026-09-13 (cb-x-refute-repairs): #1584's 59 comments dumped (187,670 B) carry `331` 0×, `406` 0×, `6cd7b488c` 0× (positive control `gate` 240×); #2242's Project-1 `Evidence` field, read through `gh api graphql`, contains no line counts at all (its `Title` carries the BEFORE values 464/507, which this row calls exact; the read returned populated `Title`/`Lane`/`Evidence` text, so the zero is a measurement). The only surviving home of the wrong figures is the immutable commit message. The fix spec was speculative about both sites``

**Row 785 (review's 787) — `test-layout`, board #2270**

- current STATE cell: `**OPEN** (board #2270)`
- proposed STATE cell: `**CLOSED** — `f946a501e`(board #2270): the NAMING half is discharged — the six post-park members are recorded in`mirror-index-family.suite.test.ts`'s header with a per-member `git log --diff-filter=A`sha, and the +2 that landed SINCE wave-12b (57 → 59) is named there too. The naming was`183e49714`/wave-12b's, never `6049dcded`'s. The correction was posted by Claude B (bridge 1021/1030); #2142 remains the separate parked-work owner (cb-x-refute-repairs)`
- proposed RECEIPT-cell APPENDIX: ``· RE-MEASURED 2026-09-13 at `204607e84` (cb-x-refute-repairs): `pnpm check:structure --check test-layout` → `raw 59 = effective 59, 0 tool errors, 0 withheld`. The 57 → 59 delta is `9104f718f` `css-hook-provenance-family.suite.test.ts` and `158dbdd96` `no-color-literals-parity.test.ts`, both in-class and both SILENT under the class invariant by design``

**Row 902 (review's 905) — `test-layout` (family pin), board #2270**

- current STATE cell: `**OPEN** (board #2270)`
- proposed STATE cell: `**CLOSED** — `6049dcded`(board #2270): the exact-set pin is gone;`mirror-index-family.suite.test.ts:314-406`holds the two-conjunct class plus two named exceptions asserted live,`realTreeMisses`asserts`toolErrors: \[]`and`withheldPolicyIds: \[]`before any arm reads a finding, and four discriminating overlay arms judge the predicate against real gate output in both directions. 23/23 green at`204607e84` (cb-x-refute-repairs, independent re-run)`

**Row 842 (review's 844) — `.dependency-cruiser.cjs` · `dangling-refs`, board #2288**

- current STATE cell: `**OPEN** (board #2288)`
- proposed STATE cell: `**CLOSED** — `f946a501e` (board #2288): the row's MODULE is wrong (`dangling-refs`indeed excludes root`.cjs`, but `dangling-doc-cite`INCLUDES it —`isArmBMember`, `dangling-doc-cite.ts:134-140`, proven by a two-direction planted control) and its CONSEQUENCE clause is right for 63 of the file's 64 `.md`cites, which are outside`DOC_TOKEN_RE`. That residue is **#1334**'s, is now routed there from the module header, and stays OPEN until #1334 widens the grammar (cb-x-refute-repairs)`
- proposed RECEIPT-cell APPENDIX: ``· MEASURED 2026-09-13 (cb-x-refute-repairs): planted `docs/…`-prefixed cite → FLAGGED `.dependency-cruiser.cjs:855:33`, bare-basename twin on the next line → NOT flagged, one bounded `--check dangling-doc-cite` run each (baseline raw 0 → planted raw 1, restored, tree clean). Token census on the file: 64 cites / 16 spellings / 1 `docs/`-prefixed / 63 outside the grammar / **0 unresolvable today** — prospective blindness, not a live lie``

Both of the closure text's #2288 receipts are wrong and must be dropped rather than re-pointed:
`dangling-refs.ts:262` is `LAW_OUTSIDE_DOCS`, and `tests/tooling/verify/gates/dangling-refs.test.ts` does
not exist.

## 6. Draft comment for #2142 (orchestrator to post — this lane does not touch issues)

> **NUMBER CORRECTION (cb-x-refute-repairs, 2026-09-13, measured at `204607e84`): the parked population is
> 59, not 51. The park and its wake condition are UNCHANGED.**
>
> This row's body records 51 live `test-layout` hard/error findings, measured at `78a411ab0`. Re-measured
> today with `pnpm check:structure --check test-layout`: **`raw 59 = waived 0 + granted 0 + effective 59`
> (59 error, 0 warning), 0 alarms, 0 tool errors, 0 withheld.**
>
> The +8 is fully attributed: seven are gate-conversion family tests and one is the named non-family
> `catalog-scope.suite.test.ts` exception. All are tooling tests; the distinction is preserved by the class pin:
>
> | | member | added by |
> | - | - | - |
> | 51 → 57 | `bus-payload-family.suite.test.ts` | `a196a35d7` |
> | | `seed-theme-ink-family.suite.test.ts` | `2dabae9ce` |
> | | `token-contract-family.suite.test.ts` | `a97454714` |
> | | `css-home-topology-family.suite.test.ts` | `17a59099b` |
> | | `real-corpus-liveness-family.suite.repo.int.test.ts` | `ae7a40e0b` |
> | | `tests/tooling/doc-catalog/ops/catalog-scope.suite.test.ts` | `61cae0710` — the one NON-family member; a concept-named unit test, held as a NAMED EXCEPTION rather than in the class |
> | 57 → 59 | `css-hook-provenance-family.suite.test.ts` | `9104f718f` |
> | | `no-color-literals-parity.test.ts` | `158dbdd96` |
>
> All five family-test paths in the first block, and both in the second, sit under
> `tests/tooling/verify/gates/`. Reconciliation method: per-member `git cat-file -e <sha>:<path>` across
> `78a411ab0` / `50e31c534` / `9ad17fb5a` (`docs/reviews/gate-runtime/v-wave-12b-2026-09-13.md` §2) for the
> first six, and a diff of the tip finding list against the 57-path literal recovered from
> `git show 183e49714:tests/tooling/verify/gates/mirror-index-family.suite.test.ts` for the last two.
>
> **PROPOSED WAKE TEXT (replacing "the test-mirror revamp program is filed or the owner rules on the 51
> sites"):** *the test-mirror revamp program is filed, or the owner rules on the parked sites — whose count
> is DERIVED, never quoted: `pnpm check:structure --check test-layout` reads it, and it was 51 at
> `78a411ab0`, 53 at `50e31c534`, 57 at `9ad17fb5a` and 59 at `204607e84`. The park covers the CLASS (a
> tooling mirror miss under `tests/tooling/verify/gates/`), not a number, and the class grows by design at
> roughly one member per gate conversion; a member of any OTHER class entering is NOT parked and reds
> `tests/tooling/verify/gates/mirror-index-family.suite.test.ts`.*
>
> Nothing here asks the owner to re-decide anything: arms A/B/C and the default are untouched, and the
> parked findings stay reported under the standing red.

## 7. Deviations, with receipts

1. **The four rows were not CLOSED** (§0.1). Accepted by the orchestrator mid-run.
2. **#2197(c) has historical passing runs, but its acceptance condition remains unproved** (§1c). Independent review rejected the original claim that timestamp ordering proved controlled causality or quietness.
3. **I refused to widen `DOC_TOKEN_RE`** (§4b), with the #1334 receipt. Accepted mid-run.
4. **The review's `no-loose-id-cast.ts:30-44,:105` coordinates are stale** (§1a) — #2325 moved them. The
   ARM B code is intact; only the citation needed re-deriving.
5. **The review's #2288 "14 distinct spellings" is 15 non-`docs/` spellings** (§4b): 14 bare basenames plus
   one `history/`-relative path. The 63/64 headline is exact.
6. **No `pnpm check`, no `check:policy-conformance`, no CT, no planter** — load fence, as briefed. What
   that leaves unmeasured is in §9.

## LEDGER ROWS (2 rows)

| module | wave·path:line | defect | class | state | receipt |
| - | - | - | - | - | - |
| `tests/tooling/_load-budget.ts` | cb-x-refute-repairs · `tests/tooling/_load-budget.ts:132-138` (pre-fix) | the `#2197` comment justifying the `stdio` triple asserted a node mechanism that does not exist — *"execFileSync's DEFAULT leaves the child's stderr inherited by the parent, so `err.stderr` is null"*. The default is `["pipe","pipe","pipe"]` and already yields a populated string; only `stdio:"inherit"` nulls it, and this call site never used it. The CHANGE was correct for two other real reasons, so the comment made a correct fix unfalsifiable — a reader checking the stated mechanism finds it false and has no way to tell whether the code is wrong too | drifted comment / a commit message's stated mechanism carried into code as fact | **FIXED** — `f946a501e` (board #2197) | node v26.5.0, one child writing both streams and exiting 2: DEFAULT → `stderr="fatal-words"` (string) AND echoed to the parent; `["ignore","pipe","pipe"]` → `"fatal-words"` (string), not echoed; `"inherit"` → `null`. Comment rewritten to the two effects the measurement shows (stdin isolation, echo suppression); triple preserved |
| `test-layout` (park accounting) | cb-x-refute-repairs · `tooling/src/verify/gates/test-layout.ts` · `#2142` body | the parked population is 59 at `204607e84` while #2142's body reads 51 and wave-12b's report reads 57 — the park's number goes stale roughly once per gate conversion and NOTHING re-measures it. The class invariant is right not to red (that was #2270/905), so the drift is structurally invisible; the only defence is that the number is DERIVED at read time, which the row's wake condition does not say | parked baseline with no re-measurement door (the #2270 residue, one layer out) | **OPEN** (board #2142) | `pnpm check:structure --check test-layout` at `204607e84` → `raw 59 = effective 59, 0 tool errors, 0 withheld`; +2 since wave-12b attributed to `9104f718f` and `158dbdd96` by diffing the tip list against `git show 183e49714:…mirror-index-family.suite.test.ts`'s 57-path literal (60 tokens − 3 overlay fixture paths). Proposed wake text in §6 makes the count derived rather than quoted |

`ledger rows OWED: 0`

## 8. Floor

| check | result |
| - | - |
| `pnpm test:scoped tests/tooling/load-budget.int.test.ts tests/tooling/verify/gates/mirror-index-family.suite.test.ts` | exit 0 — **36 passed / 2 files** (13 + 23) |
| `pnpm check:structure --check dangling-doc-cite --check dangling-refs --check no-loose-id-cast` | exit 0 — all three ✓, `0 tool error(s) · 0 withheld` |
| `pnpm check:structure --check test-layout` | exit 1 — 59 findings, the standing parked red (baseline, not this lane's) |
| `pnpm exec biome check <3 files> --diagnostic-level=error` | exit 0 — 3 files checked |
| `pnpm exec eslint <3 files>` | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | exit 0 — both PASS (programs named by `typecheck-plan --primary --file --json`) |
| `node tooling/src/doc-catalog/cli.ts format --check <this file>` | see the commit message |

## 9. WHAT I DID NOT COVER

- **`check-gates.repo.int` run by me** — planting suite, orchestrator-only. §1c answers it from committed
  artifacts, not from a run.
- **`pnpm check`, `check:policy-conformance`, whole-corpus `check:structure`, any CT** — load fence.
- **#1334's grammar widening and its 137-site census** — refused with receipt (§4b); that is #1334's lane.
- **The ledger and the wave reports themselves** — read-only for this lane. §5 is the proposed text; the
  identical row also exists verbatim at `v-wave-7-2026-09-13.md:272` (row 753) and
  `v-wave-8a-2026-09-13.md:344` (row 770), and those twins must move WITH the ledger or they desync.
- **#2212, #2248, #2284** — the three REFUTED rows. Not this lane's; their bounded specs are in the closure
  review §3 and are unaffected by anything here.

## Independent integration review and corrections

Root read the following independent review in full. The original report was rejected as closure evidence; the branch identity, historical-run claims, proposed state vocabulary and seven-plus-one classification above are corrected in this integration. #2197 remains OPEN; #2259 technical acceptance does not mean GitHub Done (last confirmed Verify). #2270 and #2288 have bounded acceptance with #2142 and #1334 retained separately. No executable behavior changed.

# Independent review — `f946a501e` refute repairs

**Verdict: REFUTED as integration-ready closure evidence.** The commit makes no executable change and preserves the existing `no-loose-id-cast` Arm B and `test-layout` class pins. Three of the four issue outcomes are supportable after correcting the proposed ledger states. The proposed #2197 closure is not proved: the report turns unversioned historical run slots into a controlled causal/quiet-box receipt, which the artifacts cannot establish.

Reviewed subject: `f946a501eb0d00064af658d49ff850c6a9c1688f` in `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-ac47f44db1be8dba4`, against root main `da3f25f63`. The subject is 8 commits behind and 1 ahead. I read both 1021/1022 bridge messages and all four touched files in full. I did not edit the repository, run board transitions, rebase, or run a test suite.

## Confirmed findings

### HIGH — #2197's claimed closure condition is not proved by the cited run-slot history

**Failure scenario.** Root copies §1c's conclusion into the ledger and closes #2197 on the claim that the quiet planter condition was met and that `fa8a6e15a` is the exact discriminator. The cited artifacts do show valid successful planter runs after the fix, but they do not establish either quietness or controlled causality:

- `git ls-files reports/runs/test | wc -l` is **0** and `git check-ignore -v` places the slots under `.gitignore:44:/reports/`. They are local completed artifacts, not “committed slots.”
- The `test-report.json` objects have no `gitSha`, `commit`, `metadata`, or `runId` field. Their directory timestamps cannot prove the exact source revision each run exercised.
- Both cited pre-fix failures contain only `check:structure ... child exit 2`; the error text does not name `no-loose-id-cast` or the parenthesized fixture, so the artifacts cannot attribute those failures to Arm B.
- The series itself includes a 10/10 green slot at 15:31Z before `fa8a6e15a`, then failures at 18:31Z and 19:11Z, then green at 19:24Z. This is compatible with source/fixture changes between runs and is not a two-direction control.
- The report concedes at lines 122-124 that passing slots record no load average. Three observed load-kill non-verdicts prove those three classifications only; they do not prove the universal claim that load “produces NON-VERDICTS, never a false green.”

**Minimal fix.** Rewrite §1c to the fact the artifacts support: multiple completed planter runs after the repair are 10/10 green, and three separate killed runs identify themselves as load non-verdicts. Remove “committed,” “exact discriminator,” “two-direction control,” and the universal load claim. Keep #2197 open/at verification until the already-stated quiet-box condition has a fresh receipt that records the relevant load state and revision, or until an existing owner ruling explicitly defines a completed non-load-kill pass as satisfying that condition. No new principal, policy, or Arm B decision is needed.

### MEDIUM — the report records the wrong branch identity

At report lines 9-12, the worktree path is correct but the branch is stated as `wt/agent-a413f153774cb57e9`. `git branch --show-current` in that worktree returns `wt/agent-ac47f44db1be8dba4`. A durable review report must identify its actual source branch.

**Minimal fix.** Replace the branch name with `wt/agent-ac47f44db1be8dba4`.

### MEDIUM — both proposed `PARTIAL` ledger states are outside the ledger's state contract

Report §5 proposes `PARTIAL` for rows 785 and 842. `tooling/src/verify/lib/gate-program-rollup.ts:58` defines the complete bins as `CLOSED`, `OPEN`, `SUPERSEDED`, `DISSOLVED`, `UNADJUDICATED`, `N/A`, and `FIXED`; `ledgers-fresh.ts:345` reports any other state as unbinned. `PARTIAL` is treated as open-ish by `ledger-claims.ts`, but it is not a valid rollup state.

**Minimal fix.** Do not copy either proposed cell verbatim:

- \#2270: use `CLOSED` for the bounded #2270 rows once the already-posted #2142 correction is cited; keep #2142 as the separate open owner of the park/re-measurement work.
- \#2288: use `CLOSED` for the corrected #2288 module-membership question and cite #1334 as the separate open owner of recognizer widening.

If any bounded obligation is considered unfinished, keep that row `OPEN`; never introduce `PARTIAL`.

### MEDIUM — the proposed #2142 text contradicts the preserved class distinction

Report lines 332-344 say all eight additions are “gate-conversion FAMILY TEST\[s]” and then correctly identify `tests/tooling/doc-catalog/ops/catalog-scope.suite.test.ts` as the one non-family, concept-named exception. The class distinction is the reason the replacement pin is safe; flattening the exception back into the family misstates the proof.

**Minimal fix.** Say seven additions are in the family-test class and `catalog-scope.suite.test.ts` is the named non-family exception. Preserve the current `PARKED_EXCEPTIONS` classification. The #2142 comment is already posted per bridge 1021, so its correction belongs in the owner-facing follow-up/outbox rather than in repository source.

### LOW — #2259's durable lifecycle statement needs the 1022 correction

The report records #2259 as Ready at its timestamp and proposes a closed ledger cell. Bridge 1022 supersedes the lifecycle claim: review and verify succeeded, but both Done writes failed with GitHub GraphQL 5xx, so **#2259 remains VERIFY**. The technical closure evidence is unaffected.

**Minimal fix.** Any integration/closure note must state VERIFY and must not claim Done until the lifecycle write succeeds.

## Per-issue adjudication

### #2197 — REFUTED for closure; repair and pins confirmed

- **Arm B preserved.** `f946a501e` does not edit `tooling/src/verify/gates/no-loose-id-cast.ts`. The live source retains recursive parenthesis unwrapping (`:33-39`), the declared coordinate limit (`:41-54`), the detection/anchor calls (`:56`, `:94`, `:104`), and the parenthesized operand `mustFlag` (`:121-126`).
- **Existing fatal-child pin confirmed.** `tests/tooling/load-budget.int.test.ts:82-86` drives `runNodeWithBudget` with stdout, stderr `fatal`, and exit 2, then asserts `/exit 2.*fatal/su`. The old ledger's “nothing under tests exercises the error path” premise is false.
- **`stdio` semantics are now described honestly.** The commit changes comments only and retains `stdio: ["ignore", "pipe", "pipe"]`; the JSDoc explicitly says the test pins the thrown diagnostic, not that exact option tuple.
- **Closure blocker.** The quiet-planter/causality conclusion is not supported for the reasons above. The strongest durable conclusion is “post-repair planter runs passed,” not “the quiet condition is proved by an exact natural experiment.”

### #2259 — CONFIRMED on technical closure; lifecycle remains VERIFY

- The wrong `6cd7b488c` figures are an immutable commit-message defect, while the corrected 357/255/407 figures and reproducing command are recorded on #2242 according to the full bridge/report receipt.
- The report's census found no bad figures in the two mutable cite sites named by the original fix spec: #1584 comments and #2242 Project Evidence. No repository source change is owed.
- Bridge 1022 is authoritative for current lifecycle: VERIFY, not Done.

### #2270 — CONFIRMED after state/text corrections

- The commit changes only the header of `mirror-index-family.suite.test.ts`; `inParkedClass`, `PARKED_EXCEPTIONS`, `realTreeMisses`, the non-vacuity checks, and all four discriminating arms are byte-unchanged.
- Historical presence checks independently reproduce the growth: at `50e31c534`, the two additions beyond 51 are `real-corpus-liveness-family.suite.repo.int.test.ts` and the named non-family `catalog-scope.suite.test.ts`; at `9ad17fb5a`, all six additions through 57 are present; at `204607e84`, the two further in-class additions bring the reported population to 59.
- Root main `da3f25f63` adds no new `tests/tooling/verify/gates` family member, so the 59 snapshot has not been superseded by the eight newer main commits. It remains a snapshot, not a pin.
- Bridge 1021 says the #2142 correction was posted. Therefore #2270's bounded naming/fold requirement can close, while #2142 remains the separate owner. The report's proposed `PARTIAL` state and “all eight family tests” sentence must not be used.

### #2288 — CONFIRMED after state correction

- The executable Arm B remains unchanged: `ROOT_EXTS` includes `.cjs`, and `isArmBMember` admits root files with those extensions. The edit is header-only.
- Independent current-tree census reproduces the report exactly: 64 `.md` tokens, 16 distinct spellings, 1 `docs/`-prefixed token, 63 outside `DOC_TOKEN_RE`, and 0 currently unresolved spellings.
- This closes #2288's mistaken module-membership premise while preserving the real prospective grammar gap under #1334. Root should use a valid `CLOSED` state for #2288 and keep #1334 open; no grammar widening belongs in this commit.

## Verification receipts and limits

- `git diff f946a501e^ f946a501e` shows code-file changes only in comments/JSDoc; no executable statement, regular expression, set member, assertion, or test body changed.
- `git diff --check f946a501e^ f946a501e` is clean.
- Worktree branch/HEAD: `wt/agent-ac47f44db1be8dba4` / `f946a501eb0d00064af658d49ff850c6a9c1688f`; worktree status was empty.
- Main divergence: `git rev-list --left-right --count da3f25f63...f946a501e` returned `8 1`.
- No tests were re-run: the touched executable behavior is byte-unchanged, the lane's scoped floor is already recorded, and the brief prohibited redundant/broad work while four B lanes are active.

## Integration conditions

1. Correct the report's branch identity.
2. Correct the #2142 “all eight family tests” text through the owner-facing follow-up because the comment is already posted.
3. Replace both proposed `PARTIAL` ledger states with contract-valid states and preserve #2142/#1334 as their own open rows.
4. Keep #2259 at VERIFY until the Done write succeeds.
5. Do not close #2197 on §1c as written. Narrow the artifact claim and obtain the quiet/revision-bearing receipt required by its existing condition.

No domain behavior, authority, grant, or runtime policy changes are implicated by these corrections.
