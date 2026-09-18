---
kind: review
status: active
updated: 2026-09-18
---

# Refutation ledger — which of the §5b audit's defects are still OPEN (#1584, #2012)

Program #1584's §5b audit ran **ten waves** and refuted roughly 100 of 112 audited modules across ~430 KB of
review prose. Nobody could say which of those refutations were still open, so the audit could not be used as a
work queue and every fix pass re-read the whole corpus to discover its own scope. **This file is the index:
one row per named defect extracted into this ledger, with the wave that found it, its class, and its
last reconciled state against `main`.** Project 1 controls current ownership and lifecycle.

## SWEEP HISTORY

Original sweep 2026-09-11; re-derived 2026-09-18. Full history in git.

## WHO MAINTAINS THIS, AND WHEN

**The ORCHESTRATOR owns this file, and a row is updated IN THE SAME ACT AS THE MERGE THAT CLOSES IT** — not
at a barrier, not by a later sweep, not by a lane. Owner ruling 2026-09-12: *"if the refutation ledger is
stale that's on you as orchestrator."*

It went stale within a day of being written — eight closures landed while the rollup still read 25/15/3/48 —
which is the exact disease it was built to cure, and the third instance in one week of a list nobody
re-derives (`Core-Enforcement-Deferred-Dropped.md`'s one-sided half, #2008; `runner-config-path-liveness`'s
refusal outliving its blocker, #2013; this). **A ledger that is not updated at merge time is a snapshot
pretending to be a queue.**

The durable fix is not diligence — it is #2017's shape: make the claim DATA so something REDs when it rots.
Until that lands, this paragraph is the whole mechanism.

**RECONCILED 2026-09-12, because the sentence above is refuted by this file's own body — and the refutation is
the better rule.** *"Not by a lane"* is false as written. Four Wave 5 rows read **CLOSED — lane
`p-ledger-client-residue`, 2026-09-12 (same commit as this row)**; lane `p-instrument-repairs` appended rows in
its own landing commit (`91d9a2ab7`, +24/−2 here); `p-mirror-index-convert` is closing three more the same way
as this is written. **A lane updating the row its own commit closes is the STRONGEST form of the requirement,
not a violation of it** — the row moves in the same commit as the fix rather than one merge later. The ruling
survives; its INPUT changed.

**What that sentence was actually protecting, stated so it is enforceable:**

1. **NO ROW OUTLIVES ITS FIX.** Whoever performs the closing act writes the row in that same act — the lane in
   its own commit, or the merging account in the merge. Never a later sweep, never "at the barrier".
2. **ONE WRITER PER COMMIT, AND NEVER A REFORMAT.** This is a shared multi-lane file. `pnpm format:docs` over
   it converts untouched CONTEXT into owned DIFF, and a later 3-way rebase then reasserts a stale copy of a
   sibling's row as a pure content replacement that never conflicts — paid 2026-09-12 across four rebases, now
   law in `.claude/rules/lane-standing-facts.md`. **#2059 widened that door to cover `docs/reviews/**`, so the
   hazard is LIVE for this file**; `doc-catalog format --check <this file>` already reports it clean, so no
   format is ever owed here. Edit per LINE by row id, never by count, and declare your hunk regions through
   `main` before you start.
3. **THE ROLLUP IS BARRIER-ONLY.** A rollup recomputed while lanes are appending is stale on arrival. Rows land
   continuously; `## CLASS ROLLUP` is rebuilt once, on a quiet tree, by the account holding main's checkout.
4. **EVERY APPEND GOES ABOVE `## CLASS ROLLUP`, INSIDE THE `## THE LEDGER` FENCE** (#2166). The fence is
   `## THE LEDGER` → the next `##`, and it is what `lib/gate-program-docs.ts#ledgerSections` counts, what the
   rollup rebuild sums, and what the `ledgers:fresh` section-vs-report reconciler reads. `6c983149e` appended
   `### cb-v-fix-wave-1` BELOW the rollup and its six rows were invisible to all three at once — the
   reconciler printed the SAME "11 of 24 reconcilable" before and after, correct about a section it could not
   see, while a naive `grep -c` found the rows and read them as present. **That is no longer silent:** a
   ledger-shaped section outside the fence is now a `ledgers:fresh` finding naming the heading, its line and
   the `##` it landed under. The detector keys on the TABLE's schema (`defect` + `state`), not on the
   heading's wording, so a section whose heading cites no report is caught too.

**WHO, under the role split in force (2026-09-12).** claude-b is the orchestrator: it owns Project 1, the
verify lens and the rulings, and it never commits on main's checkout. The primary account owns dispatch and
merges and is the only account that commits there, so it is this file's writer on `main` — it appends each
verifier's `### <lane>` section before `## CLASS ROLLUP` and rebuilds the rollup at the barrier. **The owner's
ruling above binds the orchestrator ROLE's accountability for staleness; it is not a claim about which account
types.** Under the split both accounts answer for it.

## How to read a state

| state | means |
| - | - |
| **CLOSED** | the code no longer has the shape the wave described, and the `receipt` column says which shape replaced it |
| **OPEN** | the shape is still on the tree; the `state` cell names the board row if one exists, or says none does |
| **SUPERSEDED** | the METHOD changed under the cell — a later wave re-read the same fence and reclassified it, or a gate now mechanizes the class. Not a silent drop: the reason is in the receipt |
| **DISSOLVED** | **the row was never a real defect, or its cell was measured under a rule that has since been corrected** — §4.1's method rules accumulated (cut DIRECTION, the declared performance PREFILTER, later-wave-supersedes, the inverted tripwire direction), and *"an old cell can dissolve rather than merely shrink"*. Distinct from CLOSED (nobody fixed anything) and from SUPERSEDED (the premise did not move — the RULING about it did). Introduced by the 2026-09-11 sweep |
| **UNADJUDICATED** | extracted but not checked against the tree in this session. Listed so it is findable, never so it looks covered |

**A defect's state is a question about TODAY's tree, never about what the wave said** — wave 6 reported 25
unenforced cells for `origin-client` and fifteen were genuinely open by the time a fix lane started, because a
sibling lane had already closed D1, D2 and all five of D5 (#1989/#1990). Every CLOSED row below carries a
receipt I produced in this session; every OPEN row was re-derived against `831576613`.

## Method

Original audit method in git history.

## THE LEDGER` FENCE** (#2166). The fence is
   `## THE LEDGER` → the next `##`, and it is what `lib/gate-program-docs.ts#ledgerSections` counts, what the
   rollup rebuild sums, and what the `ledgers:fresh` section-vs-report reconciler reads. `6c983149e` appended
   `### cb-v-fix-wave-1` BELOW the rollup and its six rows were invisible to all three at once — the
   reconciler printed the SAME "11 of 24 reconcilable" before and after, correct about a section it could not
   see, while a naive `grep -c` found the rows and read them as present. **That is no longer silent:** a
   ledger-shaped section outside the fence is now a `ledgers:fresh` finding naming the heading, its line and
   the `##` it landed under. The detector keys on the TABLE's schema (`defect` + `state`), not on the
   heading's wording, so a section whose heading cites no report is caught too.

**WHO, under the role split in force (2026-09-12).** claude-b is the orchestrator: it owns Project 1, the
verify lens and the rulings, and it never commits on main's checkout. The primary account owns dispatch and
merges and is the only account that commits there, so it is this file's writer on `main` — it appends each
verifier's `### <lane>` section before `## CLASS ROLLUP` and rebuilds the rollup at the barrier. **The owner's
ruling above binds the orchestrator ROLE's accountability for staleness; it is not a claim about which account
types.** Under the split both accounts answer for it.

## How to read a state

| state | means |
| - | - |
| **CLOSED** | the code no longer has the shape the wave described, and the `receipt` column says which shape replaced it |
| **OPEN** | the shape is still on the tree; the `state` cell names the board row if one exists, or says none does |
| **SUPERSEDED** | the METHOD changed under the cell — a later wave re-read the same fence and reclassified it, or a gate now mechanizes the class. Not a silent drop: the reason is in the receipt |
| **DISSOLVED** | **the row was never a real defect, or its cell was measured under a rule that has since been corrected** — §4.1's method rules accumulated (cut DIRECTION, the declared performance PREFILTER, later-wave-supersedes, the inverted tripwire direction), and *"an old cell can dissolve rather than merely shrink"*. Distinct from CLOSED (nobody fixed anything) and from SUPERSEDED (the premise did not move — the RULING about it did). Introduced by the 2026-09-11 sweep |
| **UNADJUDICATED** | extracted but not checked against the tree in this session. Listed so it is findable, never so it looks covered |

**A defect's state is a question about TODAY's tree, never about what the wave said** — wave 6 reported 25
unenforced cells for `origin-client` and fifteen were genuinely open by the time a fix lane started, because a
sibling lane had already closed D1, D2 and all five of D5 (#1989/#1990). Every CLOSED row below carries a
receipt I produced in this session; every OPEN row was re-derived against `831576613`.

## Method and its limits

- Adjudicated by reading the CURRENT gate module / roster / doc, never by re-running a §4.1 cut. Where a wave's
  defect is a cut verdict, the check is **whether a `mustPass`/`mustFlag` row now exists that the cut would
  kill** — that is what the receipt column states.
- Baseline commit `831576613` (worktree `wt/agent-aff85de92a395152c`). **Wave 10 lives in an unmerged worktree**
  (`agent-a6a5469bbfac5b55d`, `fca7c9b42`); its rows are extracted from there and adjudicated against main's tree.
- **No `check:structure`, no `gate:contract`, no conformance run** — four lanes were live. Every live number
  quoted below is a RECORDED receipt from a wave or the playbook, and is labelled as recorded rather than measured.
- Adjudication order was HIGH/SEVERE first, then defects in modules named by guide §3's plane table, then the rest.

**SWEEP 2026-09-11 (`v-ledger-sweep`) — three of this section's premises are now DEAD, kept here rather than
deleted because that is this file's house style:**

- ~~"Wave 10 lives in an unmerged worktree"~~ — **merged.** `docs/reviews/gate-runtime/v-audit-wave10-2026-09-12.md`
  is tracked on `main` at `6eb2d7dc3`. Its rows no longer describe a tree the reader cannot open.
- ~~"No `check:structure`, no `gate:contract`, no conformance run … no state in this ledger is a
  LIVE-INSTRUMENT verdict"~~ — **partly repaired.** `pnpm gate:contract` and `pnpm check:policy-conformance`
  are neither `check:structure` nor a vitest suite, and both were run this sweep (numbers in the SWEEP block
  at the top). `check:structure` remains unrun and is why exactly one row stays UNADJUDICATED.
- ~~"I did not adjudicate any §4.6 differential row, because there are none to adjudicate"~~ — **the axis
  opened while nobody was looking.** `23b31b3ca` landed the split-arm differential for the four wave-5 splits
  and `6f815e95e` for all eight `-health` siblings, both citing #2000. The §4.6 row in the rollup is still 0
  because no WAVE filed a §4.6 defect — but the claim that the axis cannot start is no longer true, and a
  future extraction pass over those two commits owes this table rows.
- **Baseline superseded:** every state below now reads against `64dfbf349`, not `831576613`.

## THE LEDGER

### Wave 1 — the ten cited exemplars (`v-exemplar-audit-2026-09-12.md`) — 12 rows (0 OPEN, 11 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W1-2 `no-raw-matchmedia` | w1 `:168` | the DECLARED LIMIT ("`window`/`self`/bare land on the unreadable finding") is FALSE in the header, two row `why`s and the roster | §5b.2 message | STATUS: … |
| ROW-W1-4 `server-layout` · `ui-exports-map-complete` | w1 `:232` | the cited not-ready guard CANNOT EXECUTE (`resolveResourceDeclarations` throws in the population phase) | §5b.7 forbidden | STATUS: … |

### Wave 2 — registry / completeness (`v-audit-wave2-2026-09-12.md`) — 6 rows (0 OPEN, 6 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### Wave 3 — the Drizzle-schema fact family (`v-audit-wave3-2026-09-12.md`) — 8 rows (1 OPEN, 7 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W3-1 all nine | w3 `:187` (HIGH), systemic successor | The original nine Drizzle headers are repaired; other final headers still omit a semantic family decision or the legacy/final population comparison. | §5b.5 header | STATUS: OPEN  **OPEN — systemic; the named nine are CLOSED** | Independent full-header adjudication at `22d61f8bb`, 2026-09-13: the twelve imports of `origin-client-family.test.ts` include seven missing family decisions and nine missing population ports. These are semantic omissions, not missing uppercase labels or SHA patterns. Counterexamples include `fetch-fn-in-features` and `no-context-returntype`; neither header supplies either decision. This bounded census does not establish a new whole-corpus count. Historical token counts are superseded as acceptance evidence.  Historical receipts retained for provenance; current adjudication above supersedes their stale population and token counts: re-derived this session: `grep -c 'FAMILY'` and `grep -c 'POPULATION PORT'` return **0 for all nine**. Waves 8 (25/25) and 9 (14/14) reproduce the same gap on the server plane, so this is systemic, not family-local · **RE-DERIVED 2026-09-11 (sweep `v-ledger-sweep`, `64dfbf349`):** re-census: `FAMILY` 0 of 9 and `POPULATION PORT` 0 of 9, UNCHANGED. But **legacy SHA is now 3 of 9, up from 0** — `contract-banned-shapes`, `schema-banned-shapes` and `ownerid-registry` each gained a 40-char legacy descriptor SHA from `4e832e610`. (My first census read 0 of 9 because the pattern assumed a 7-12 char abbreviated SHA; the landed form is the full 40. Naming the corrected pattern here so the next reader does not repeat it.) · **RE-DERIVED AND CLOSED 2026-09-12 by lane `p-ledger-schema-registry`, BY HAND — full reads of all nine headers, no pattern, so neither the caret-eating shape regex nor a length-pinned one can reach it. THE RECORDED SHA FIGURE IS ITSELF AN ARTIFACT: it is 4 of 9, not 3.** The missed carrier is `db-enum-from-tuple`, whose citation is the NINE-CHARACTER abbreviated `1bf7ff7d9` — which the corrected 40-char pattern drops exactly as the 7-12 char one dropped the landed form. So this field has now under-reported in three distinct ways (caret-eaten rev-specs, length-pinned patterns) and over-reported in one (word-match, 78%). Positive control for the by-hand read: it finds `section-registry-completeness`'s `(dd862e988^)` and correctly finds none in `table-explicit-primary-key`'s one-line header. Census before the fix: **FAMILY 1/9 · POPULATION PORT 3/9 · legacy SHA 4/9**. After: **9/9 FAMILY · 9/9 POPULATION PORT · 4/9 legacy SHA**, with the family's port delta given ONE home at `DRIZZLE_SCHEMA_POPULATION` (`lib/schema-fact.ts`) instead of copied into five headers — it is an INTENTIONAL WIDENING BY EXACTLY ONE PATH against the `isSchemaFile` legacy spelling, and lossless: `packages/db/src/schema/index.ts` carries ZERO `sqliteTable(` calls against 97 across the other 29 files (the positive control). **AND THE THREE-ARM SHA CHECK RETURNS 0 DEFECTIVE OF 4 CARRIERS IN THIS FENCE:** `ownerid-registry`, `schema-banned-shapes`, `contract-banned-shapes` and `db-enum-from-tuple` each cite their own conversion's PARENT, the blob exists there (`git cat-file -e`), and each is a legacy `GateDescriptor` (`defineGate` count 0). `contract-banned-shapes` is the one that LOOKS like arm 2 and is not — its own file does not exist at the cited sha because that half was born at the split, and its sentence names the legacy MODULE; the header now says so explicitly. · **Integration receipt, 2026-09-13:** Integrated header candidate `d3d90593e`..`d03b51074` as `d1d7e88b0`. Independent review measured 57 port blocks; unsampled claims remain uncertified. Final comment correction separately reviewed by root. Six in-scope family-classification candidates and 40 excluded owner-lane modules remain outstanding; this systemic row stays OPEN. Candidate tooling native typecheck passed; merged caught-failure census and consolidated verification remain owed. |

### Wave 4 — raw-CSS / token surface (`v-audit-wave4-2026-09-12.md`) — 9 rows (0 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt | |
| - | - | - | - | - | - | - |

### Wave 5 — `ordinary-visitors` ×15 (`v-audit-wave5-2026-09-12.md`) — 9 rows (0 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt | |
| - | - | - | - | - | - | - |
| ROW-W5-8 `no-inline-types` (real tree) | w5 `:396` | `check:structure` reports **19** live findings, 18 of them exported verdict types in `tooling/src/verify/lib/**` — the shared readers the program | STATUS: UNADJUDICATED  **UNADJUDICATED — FENCED, and it is the one row I could n … |

### Wave 6 — `origin-client` ×12 (`v-audit-wave6-2026-09-12.md`) — 10 rows (0 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W6-2 `no-chat-trpc-in-surface` | w6 `:133` (HIGH) | the WHOLE `isProxyRoot` predicate is unenforced; only a MESSAGE discriminates it, so every count-only row is blind | §4.1 narrowing | STATUS: … |

### Wave 7 — `home-client` ×14 (`v-audit-wave7-2026-09-12.md`) — 10 rows (0 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt | |
| - | - | - | - | - | - | - |

### Wave 8 — the SERVER plane, `home-server` 11 + `origin-server` 14 (`v-audit-wave8-2026-09-12.md`) — 10 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W8-4 `no-raw-clock` · `no-raw-random` | w8 `:247` | both advertise a fail-closed unreadable arm no row reaches; the acquittal half IS proven, the refusal half is not | §4.1 narrowing | STATUS: C … |

### Wave 9 — `origin-server` ×14, closing wave 8's open axes (`v-audit-wave9-2026-09-12.md`) — 10 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### Wave 10 — the BUS plane + `id-brand-flow` (`v-audit-wave10-2026-09-12.md`, unmerged at `fca7c9b42`) — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W10-5 11 cells + 3 uncovered arms | w10 `:158` | 11 genuinely UNENFORCED narrowings + 3 UNCOVERED ARMS (14 of 47, 30%), six with a built falsifier ready to paste | §4.1 narrowing | STATUS: CLOSE … |

### The gate-batch verifier (`v-gate-batch-2026-09-12.md`) — the four exemplar lanes — 8 rows (0 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-THE-GATE-BATCH-VERIFIER-V-GA-5 `detached-work-traced.ts` | gb `:173` | orphan export `hasLiveDetachedSwallowOwner` left by the retired `@swallowed-ok` arm; invisible to knip | other | STATUS: CL … |

### cb-v-hooks-wave — the four 2026-09-12 mixed-hook merges (`v-hooks-wave-2026-09-12.md`) — 3 rows (0 OPEN, 3 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-ledger-fixes — the twelve #1584 Verify-column rows (`v-ledger-fixes-2026-09-12.md`) — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-LEDGER-FIXES-8 `no-inline-types` | w5 (the ledger's one UNADJUDICATED row) | wave 5's real-tree finding count could not be adjudicated because `check:structure` was fenced | other | STATUS: … |

### cb-v-mixed-hooks-1-3 — the §12.6 split groups 1–3 (`v-mixed-hooks-1-3-2026-09-12.md`) — 10 rows (0 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-instruments — the instrument sweep (`v-instruments-2026-09-12.md`) — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-world-gates — the §12.7 world-program guarantees (`v-world-gates-2026-09-12.md`) — 10 rows (1 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WORLD-GATES-3 `eslint-grant-liveness` · `depcruise-grant-liveness` · `runner-config-path-liveness` | cb-v-world-gates · `eslint-grant-liveness.ts:21`, `depcruise-grant-liveness.ts:52,74`, `runner-config-path-liveness.ts:106` | three FINAL world-program modules carry gate-owned `ExemptionTable`s that §12.5 ("gate modules receive neither grant tables nor marker parsers") and §3 ("no gate-owned exemption table") forbid. Two are live suppressors, not carry-forward stubs: `eslint-grant-liveness.ts:72-74` does `RATIFIED[key] → continue`, and depcruise hands `ratified: RATIFIED` to the shared reconciler at `:261` | §5b.7 forbidden | STATUS: OPEN  **OPEN — subsumed by #1922** (2 of 3 remain; re-derived 2026-09-18) | `runner-config-path-liveness` ExemptionTable removed by `df6a163b8`; `eslint-grant-liveness` (1 ExemptionTable ref) and `depcruise-grant-liveness` (1 ExemptionTable ref) still carry the table. Census rows `exception-authority-census.md:98,99,163` |

### cb-v-night-conversions — the seven 2026-09-12 night conversions (`v-night-conversions-2026-09-12.md`) — 4 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### p-suite-honesty — the instrument-honesty lane (2026-09-12) — 12 rows (0 OPEN, 12 CLOSED)

Every row here is a SUITE or an INSTRUMENT that was lying or silent, not a converted policy. The shared
shape: **a test asserting a number or a membership that another lane's correct work invalidates**, plus two
conversions that dropped their own marker translation. All of it was unobservable because `tests/tooling/**`
is `--full`-only (#1842) and nothing runs `--full` on a cadence.

| subject | defect | class | state | receipt |
| - | - | - | - | - |

### cb-v-ledger-wave — the five merged ledger lanes (`v-ledger-wave-2026-09-12.md`) — 4 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-suite-honesty — the eleven instrument repairs (`v-suite-honesty-2026-09-12.md`) — 3 rows (0 OPEN, 3 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-unaudited-finals — 28 never-audited final policies read IN FULL against §5b's seven criteria; 10 REFUTED. (`v-unaudited-finals-2026-09-12.md`) — 17 rows (0 OPEN, 17 CLOSED)

| module | lane · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-authority-census — the per-row current input for #1922. Its §5 chunks C0–C9 REPLACE `p-authority-migration`'s brief. (`v-authority-census-2026-09-12.md`) — 10 rows (0 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-config-liveness — the config-liveness conversion (#2021) (`v-config-liveness-2026-09-12.md`) — 6 rows (0 OPEN, 6 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-parity-instruments — the parity + instrument merges (`v-parity-instruments-2026-09-12.md`) — 11 rows (0 OPEN, 11 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-fix-wave-1 — the six fix commits of 2026-09-12 evening, verified row by row; 21 of 22 CONFIRMED, #2086 REFUTED. (`v-fix-wave-1-2026-09-12.md`) — 6 rows (0 OPEN, 6 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-fix-wave-2 — the wave-2 fix commits, verified row by row (`v-fix-wave-2-2026-09-12.md`) — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-mirror-suppressions — the three mirror policies (`aecbc6c6c`) and `suppressions` (`a33b2e339`) (`v-mirror-suppressions-2026-09-12.md`) — 15 rows (0 OPEN, 15 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-fix-wave-3 — the wave-3 fix commits `b254138ab` (#2148) + `a5abe00d7` (#2074 #2093 #2102), verified by `cb-v-fix-wave-3` ([`v-fix-wave-3-2026-09-12.md`](v-fix-wave-3-2026-09-12.md)); 6 rows asserted — all four rows CONFIRMED; structure leg slot `agent-afe32bf567331e109-208490-2026-09-12T17-44-12-744Z`, 0 tool errors · 0 withheld — 6 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-forge-policing-audit — the policing-surface matrix lane (#2111, owner-authorized forge; `a1c848001` on main), verified by its own planted-break receipts ([`policing-surface-audit-2026-09-12.md`](policing-surface-audit-2026-09-12.md) §9); 54 rows asserted — the report's own heading says 53 and is off by one, measured here (7 CLOSED at `a54de0421` / `3420a81e9` per the report), the rest OPEN as migration rows for `p-authority-migration` (#2147), `p-family-readers` (#2162), `p-binding-readers` (#2163), `p-proof-expectations-red` (#2025 flip) and `p-proof-soundness` (#2155 item 2) — 54 rows (3 OPEN, 51 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-FORGE-POLICING-AUDIT-1 `depcruise-grant-liveness` | #2111 · `tooling/src/verify/gates/depcruise-grant-liveness.ts:30` | imports `ExemptionTable, Finding` from `contract/gate.ts` behind `defineGate` | legacy artifact (#1922 migration set; class row #2147) | STATUS: OPEN  **OPEN** | `policy-legacy-imports` ARM A live finding; family second opinion |
| ROW-CB-FORGE-POLICING-AUDIT-3 `eslint-grant-liveness` | #2111 · `…/eslint-grant-liveness.ts:10` | imports `ExemptionTable` | legacy artifact (#2147) | STATUS: OPEN  **OPEN** | same |
| ROW-CB-FORGE-POLICING-AUDIT-21 `spacing-tier-home-health` | #2096 · `…/spacing-tier-home-health.ts:27` | imported `SANCTIONED_HOMES` from `no-raw-spacing-in-features.ts` | gate→gate import | STATUS: … |
| ROW-CB-FORGE-POLICING-AUDIT-50 `gate-modernization` | #2111 · `tooling/src/verify/gates/gate-modernization.ts` | The live legacy meta-gate retains a local registration reader until its retirement. It is not an exact duplicate of the central readers: it returns descriptor nodes for its arms, and its final-callee recognition differs. | transition obligation (legacy meta-gate) | STATUS: OPEN  **OPEN — held until cutover; no pre-cutover repair** | Independent source adjudication at `22d61f8bb`, 2026-09-13: local `registrationOf` remains called; central `gateRegistrationOf` returns a contract kind, while `finalRegistrationOf` recognizes canonical namespace registrations for policing. Standardization §1 and playbook §4.1 retain the legacy owner through transition. Retire its local reader with the meta-gate and successor evidence; do not perform a nominal deduplication now. |

### cb-v-ledger-reconcile — the 76 OPEN/UNADJUDICATED rows re-derived against `61cae0710` ([`v-ledger-reconcile-2026-09-12.md`](v-ledger-reconcile-2026-09-12.md)); 3 rows asserted. Its 48 paste-ready flips (40 CLOSED · 1 SUPERSEDED · 7 narrowed) were applied to the rows above in the same commit; the still-open remainder is chunked A–F in its §STILL OPEN — 3 rows (0 OPEN, 3 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-policing-audit — the forge merge `a1c848001` (#2111) verified by a fresh lens ([`v-policing-audit-2026-09-12.md`](v-policing-audit-2026-09-12.md)): 8 of 8 built items CONFIRMED with planted controls both directions; 5 rows asserted (row 5 is #2196, owned by `205224e9a`, not this merge) — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-additions-wave — the post-barrier fold `575e48d5a`…`a7d88287b` + the fix leg `bba5101db` + `5ee1149a9`, verified on `3166664f5` ([`v-additions-wave-2026-09-12.md`](v-additions-wave-2026-09-12.md)); 11 rows asserted (the 11th from its structure leg) — 4 CLOSED at `bba5101db` with pre/post receipts (#2184 and #2185 REFUTED at `575e48d5a`, CONFIRMED at the fix), 6 OPEN (board: #2210 row 6, #2214 row 7, #2215 row 9, #2212 row 10; row 5 is the census regen owed by `5ee1149a9`; row 8 informational) — 11 rows (1 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-ADDITIONS-WAVE-8 `tooling/src/verify/lib/gate-contract-origin.ts#receiverConstituents` | v-additions-wave `:8` | the commit presents the non-nullable receiver and the per-constituent split as two load-bearing halves; against the committed control they are MUTUALLY REDUNDANT | §4.1 classification | STATUS: OPEN  **OPEN (informational)** | each single cut leaves `gate-contract-origin.test.ts` 2/2 GREEN; the JOINT cut reds it (`expected false to be true`). Recorded so a later lane does not read a clean single cut as an unenforced fence |

### cb-v-instruments-2 — the instrument commits `e0dcf56d8` (#2167 #2110) · `ae7a40e0b` (#2166 #2149) · `205224e9a` (#2171 #2172 #2168), verified on `9e14a5d93` ([`v-instruments-2-2026-09-12.md`](v-instruments-2-2026-09-12.md)); 8 rows asserted — #2168 REFUTED (the split-family excuse covers 0 pairs on today's tree, board #2219), the rest CONFIRMED with defects filed as rows — 8 rows (0 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-migrations-wave — the #2096/#2097 migrations and the #2025 burn-down (`3420a81e9` · `3ed1a7d7a` · `ebfe88146` · `874b34b58` · `b5490a02a`), verified on `9e14a5d93` ([`v-migrations-wave-2026-09-12.md`](v-migrations-wave-2026-09-12.md)); 5 rows asserted — all five commits CONFIRMED; the 18 migration rows above flipped CLOSED with this wave's receipts (the commits' own `flipped ledger rows` lines were false — none touched the ledger) — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-css-audit — the §5b audit of the eight legacy CSS gates before train lanes 2/3, measured on `0e03cee19` ([`css-family-audit-2026-09-12.md`](css-family-audit-2026-09-12.md)); 18 rows asserted — #2181 lane 1 REFUTED on its own claim (rows 1–11, 13–14 are its refute spec, board #2181 back at Ready); row 12 is decision #2230 (203 is DERIVABLE); rows 15–16 are #2231 (a false clean in a live gate; rides CSS lane 3, #2183); rows 17–18 ride CSS lane 2 (#2182). Zero live markers for all eight (N=7725, control 1196). — 18 rows (0 OPEN, 18 CLOSED)

| # | module / file | defect | evidence | class | state |
| -: | - | - | - | - | - |

### cb-v-wave-5 — reconcile chunk C (`44a66de69`), the ENOBUFS/budget pair (`fc4e0fa03` · `eb51d4313`), the CSS train (`e7e3f083b` · `9e29a921c`), the §5b.5 header waves (`0ee8acbe0` · `3d78778a9` · `e620af376`) and the rollup arm (`ee831a898` via `686853320`, first outing `50910752f`), measured on `0e03cee19` ([`v-wave-5-2026-09-12.md`](v-wave-5-2026-09-12.md)); 4 rows asserted — nine rows CONFIRMED and closed (#2157 #2158 #2160 #2206 #2214 #2215 #2190 #2207; #2198 already Done), #2212 REFUTED in part (row 2, back at Ready with the independent-count spec), #2181 PARTIAL (its behavioural half is the cb-v-css-audit section above); row 1 is #2229 (the seam parse break), rows 3–4 are #2233 / #2234. — 4 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-fix-wave-4 — the nine older Verify rows (`3690117ba` #1331 #1335 #1949 #1996 · `27df4238a` #2086 #2152 · `e6994a62f` + `135e992c0` #2145 #2161 #2164), measured on `0e03cee19` ([`v-fix-wave-4-2026-09-12.md`](v-fix-wave-4-2026-09-12.md), landed UNFORMATTED on purpose — row 9 is why); 11 rows asserted — all nine rows CONFIRMED and closed; the eleven defects are the neighbours of the repaired claims: rows 1–3 and 11 are #2236, row 4 is #2237, row 5 and 10 are #2240, rows 6–7 are #2238, row 8 is #2239, row 9 is #2235 (P2, a formatter cementing a loss at exit 0). Structure leg HELD behind the battery. — 11 rows (0 OPEN, 11 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-barrier-structure-delta — the 2026-09-12 23:01 barrier's `check:structure-delta` (`main-586333-2026-09-12T18-47-45-941Z` → `main-1662184-2026-09-12T23-01-14-421Z`, measured by claude-b on `d968fc3fb`; no report file — the receipt is the two published slots); 2 rows asserted — the delta's first regression catch: two final hard policies went red under the baseline red and nothing else could see them (#2110's tool doing its job) — 2 rows (0 OPEN, 2 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-wave-6 — the ten Verify rows behind `3e2f189a3` (#1958 #2001 #2002 #2055 #2037) · `e0b83327c` (#2037) · `7f39f9970` (#1964 #1973 #2069) · `f96f45fb4` (#1976 #1977), measured on `cf7e46d12` ([`v-wave-6-2026-09-12.md`](v-wave-6-2026-09-12.md)); 4 rows asserted — all ten rows CONFIRMED and closed; rows 1–3 are #2249 (ARM E's three undeclared spellings), row 4 is #2250 (the #1976 remedy names the wrong door). Structure leg run and complete: 0 tool errors · 0 withheld · 303/303 · 312 effective, identical to the barrier slot. — 4 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-wave-7 — the eight Verify rows behind `6cd7b488c` (#2213 #2242 #2241 #2221 #2222) and `b6ab9d444` (#2223 #2235 #2216), measured on `badc14944` ([`v-wave-7-2026-09-13.md`](v-wave-7-2026-09-13.md)); 4 rows asserted — all eight rows CONFIRMED and closed; the four defects are neighbours of the landed work: row 1 is #2258 (a false re-export claim in the new module's header), row 2 is #2259 (the landing message's non-reproducing size figures), row 3 is #2260 (a test file whose header names the wrong subject, with no enforcer over `tooling/**` mirror names), row 4 is #2262 (`closeRunSlot` prunes the run ring on gate-scoped/non-verdict runs). Structure leg SKIPPED by ruling — per-module `runPolicyPass` drives answered both real-tree questions; the whole-corpus tail stays unmeasured by this wave. — 4 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-wave-8a — eleven Verify rows (#1980 #2017 #2106 #2101 #2109 #2168 #2217 #2219 #2201 #2203 #2197) over `03dd7329e` · `c9b125f6a` · `ea37c99d8` · `b5490a02a` · `d334dd5ca` · merge `686853320` · `c053e67b3` · `fa8a6e15a`, measured on `50e31c534` ([`v-wave-8a-2026-09-13.md`](v-wave-8a-2026-09-13.md)); 10 rows asserted — seven rows CONFIRMED and closed (#2168 superseded by #2219), four PARTIAL and refuted back to Ready with the rework as their spec: row 1 is #2267 (`POPULATION_ROOTS` held by nothing), row 2 is #2268 (a NEW gate-modernization arm-B red minted by chunk C1), row 3 rides #2101, row 4 rides #2109, rows 5–9 are #2217's six surviving citers, row 10 rides #2197. Structure leg not requested; the planter re-run and the barrier's exit-2 classification remain primary's. — 10 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-wave-8c — fourteen Verify rows (#2067 #2068 #2153 #2154 #2071 #2095 #2150 #2151 #2174 #2175 #2177 #2178 #2204 #2210) over the docs/rules/formatter landings `007c8b837` · `9757ed2da` · `ecf3d90fa` · `49b456e89` · `c6812ae41` · `8c7ca5e9f` · `b8bea3139` · `489dbca98` · `2e11d8c8b` · `0e83242dc` · `ebfe88146` · `da1fc0126` · `3d78778a9` · `56ae6a8cf`, measured on `50e31c534` ([`v-wave-8c-2026-09-13.md`](v-wave-8c-2026-09-13.md)); 10 rows asserted — seven rows CONFIRMED and closed (#2204 closed as a clarification), five PARTIAL and two REFUTED back to Ready with the rework as their spec: rows 1–2 ride #2067 (the repair half never landed in the two core law docs), rows 3–4 ride #2068 (`dangling-refs` grew 20 → 35, the `\bdead\b` escape unruled), row 5 rides #2150 (a SIZE cell regenerated beside an uncommitted edit), row 6 is #2266 (closed the same hour), row 7 rides #2071 (the law-doc half), row 8 rides #2095 (one relabel), row 9 rides #2210 (the census line never landed; the 46th key is a bare identifier), row 10 is #2270 (a parked population that grew). — 10 rows (0 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-wave-8b — twelve Verify rows (#1983 #1988 #2165 #1994 #2021 #2019 #2107 #2155 #2058 #2061 #2062 #2063) over `aff69b7ca` · `466fb187c` · `61cae0710` · `c97de9d2f` · `1a5c348eb` · `97e68be91` · `630cfe24c` · `6cc09bab2` · `b254138ab` · `a54de0421` · `44a66de69` · `ef32c26d0` · `aecbc6c6c` · `a33b2e339`, measured on `50e31c534` ([`v-wave-8b-2026-09-13.md`](v-wave-8b-2026-09-13.md)); 9 rows asserted — eight rows CONFIRMED and closed, three PARTIAL and one REFUTED (first half) back to Ready with the rework as their spec: row 1 rides #1988 (three `verify/**` sites still effective and unowned), rows 2–3 ride #2155 (the contract header lies about an emitter; three envelope sentences unpinned), row 4 rides #2063 (the ruled A+B split never landed — the module is wholly legacy), rows 5–8 are #2273 (four §4.6 silences on otherwise-confirmed conversions), row 9 is #2274 (`policy-refusal-coverage`'s family-test half is dead behind a fixture that invents a two-positional-arg dispatcher). Structure leg not requested. Rows 2–3 and 9 were later repaired and verified on main; their rows below point to the closing receipts. — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-instruments-3 — the instruments batch `a5f33a0e1` (#2226 #2218 #2192) · `68e2851d2` (#2228) · `1d97b71df` (#2194 #2193), measured on `e417baa5b` ([`v-instruments-3-2026-09-13.md`](v-instruments-3-2026-09-13.md)); 6 rows asserted — #2226 and #2193 CONFIRMED and closed; #2218 REFUTED (the four arms already inherited a load-scaled budget, so the change is a no-op with a false comment), #2192 and #2194 PARTIAL, #2228 PARTIAL on its in-fence half — all four back to the authoring lane as one warm leg: rows 1–2 ride #2218, row 3 rides #2192, rows 4 and 6 ride #2228 (33 of 34 `@public` line citations wrong; the residual header's count), row 5 rides #2194 (the #2097 half untouched). Budget factor measured at 1.0116 under loadavg 10.2/16. — 6 rows (0 OPEN, 6 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-wave-9b — the mirror family's nine rows (#2129 #2130 #2131 #2132 #2133 #2134 #2136 #2138 #2141) behind `9b01c410a`, measured on `f211c4060` in the verifier's own worktree (every drive worktree- or tmpdir-rooted; the 01:25–01:36Z `__g_` leak on main's checkout touches none of it) ([`v-wave-9b-2026-09-13.md`](v-wave-9b-2026-09-13.md)); 5 rows asserted — seven rows CONFIRMED and closed, #2129 closed with its residual already on #2273, #2136 PARTIAL and refuted back to Ready (a fourth false-SHA carrier in the family test the commit itself edited); the nine mirror rows in the cb-v-mirror-suppressions section above flipped CLOSED here. Row 1 rides #2136, row 2 rides #2273, row 3 is #2279 (the empty pin has no same-substrate green twin), row 4 is the flip bookkeeping (closed here), row 5 is #2280 (a dead fallback whose comment asserts the guarantee that makes it unreachable). The wave also corroborated #2274 with receipts (the refusal-coverage recogniser credits zero real pins corpus-wide). — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-verify-lib-4 — the verify-lib fixes `509d1d56a` (#2249 #2250 #2232 #2233 #2234 #2195) · `c30c4c9c2` (#2268) · `fdc708323` (#2275), measured on `cce850dc1` in the verifier's own worktree ([`v-verify-lib-4-2026-09-13.md`](v-verify-lib-4-2026-09-13.md)); 8 rows asserted + 1 bookkeeping row (#2275, whose commit named an OWED id with no row) — six rows CONFIRMED and closed; #2232 REFUTED (the founding case still reproduces: a MIXED operand emits neither flag; the lane's discriminating receipt does not reproduce; a `--project=types-node` regression) and #2233 PARTIAL (the fix shipped a new false paragraph) back to the authoring lane as one warm leg; rows 3–5 ride #2232, rows 1 and 8 ride #2233, row 2 is #2284 (`ledger-claims` has no maxBuffer), row 6 is #2285 (the artifact's one-term `ok`, #2234 one file over), row 7 closed here. The new verb's own arm (b) caught the missing #2275 row. — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-wave-9a — nine Verify rows over primary's fixes `badc14944` (#2236 #2237 #2238 #2239 #2240) · `50e31c534` (#2042) · `f211c4060` (#2217) · `05b3619c8` (#2247 #2248), measured on `cce850dc1` in the verifier's own worktree ([`v-wave-9a-2026-09-13.md`](v-wave-9a-2026-09-13.md)); 7 rows asserted — seven rows CONFIRMED and closed, two PARTIAL and refuted back to Ready: #2238 (the fix moved the unpinned default-resolver wiring instead of pinning it) and #2248 (the rendezvous follower can never satisfy the condition, so the 50 s failsafe is the mechanism on every run). Rows 1–3 are the confirmed rows' survivors (#2286 #2287 #2288), row 4 rides #2238, rows 5–6 ride #2248, row 7 is #2289 (a real-CLI child under the default 5 s timeout). — 7 rows (0 OPEN, 7 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-css-train-3 — the CSS train's four conversions `17a59099b` (sanctioned-css-homes + playwright-css-topology; #2183 #2231 #2265) · `a97454714` (tokens-contract; #2182) · `2dabae9ce` (seed-theme-ink-contrast; #2182) · `156609ccd` (#2181 row 14), measured on `1692583d6` in the verifier's own worktree ([`v-css-train-3-2026-09-13.md`](v-css-train-3-2026-09-13.md)); 9 rows asserted (the lane's own 2 rows are the section below) — #2265 #2231 and #2181 row 14 CONFIRMED and closed; sanctioned-css-homes and playwright-css-topology PARTIAL (functionally confirmed, one false header sentence and one unenforced narrowing); **tokens-contract REFUTED** (a malformed vault is WITHHELD, not reported — a §4.6 catch-regression the receipt census hides) and **seed-theme-ink-contrast REFUTED** (header prose takes the live finding-overload-provenance 0 → 2; an unenforced blindness arm; a private CSS parser survives). Rows 1 and 7 are #2292, rows 2/4/5 are #2293, rows 3/6/8/9 are #2294. The two REFUTED modules do not get their #1584 landing comment until the rework is confirmed. — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

Current adjudication: the original #2292/#2293 defects and the four filed #2294 clauses above are independently verified. The later reachable-status, delta, and coupled-comment rows retain their separately adjudicated states below; these clause closures do not certify a whole module or issue. The original verdict in the heading records the first review, not the current closure state.

### cb-x-css-train — the lane's own two rows from [`x-css-train-2026-09-13.md`](x-css-train-2026-09-13.md) §LEDGER ROWS, landed at the verifier's confirmation (cb-v-css-train-3 judged both VALID); 2 rows asserted — both CLOSED by the train's own commits (#2265 at `17a59099b`; the seed-theme exemption table at `2dabae9ce`). — 2 rows (0 OPEN, 2 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-wave-10 — the instruments warm leg `cce850dc1` (#2218 #2192 #2194, #2228's in-fence half) · `8d1654afc` + `1d83cf962` (#2068 #2175) · `c810fee07` (#2225 #2272 #2224) · `0043f5533` (#2150), measured on `a196a35d7` then re-driven at tip `5045a6a68` in the verifier's own worktree ([`v-wave-10-2026-09-13.md`](v-wave-10-2026-09-13.md)); 5 rows asserted — eight rows CONFIRMED and closed; **#2068 REFUTED** (its rider-narrowing half holds both ways on the real corpus, but `1d83cf962` deleted the `domain/hub` ARM3_ALLOW row on a false premise and `dangling-refs` reads 2 at tip — a patched sibling with the one row restored reads 0); #2225 PARTIAL (the row asks two things the landing does not give). Row 1 rides #2068, rows 2–4 are #2295 (three comment residues of the instruments batch), row 5 rides #2225. The `SANCTIONED_FIELDS` pair the wave first saw at a196a35d7 was gone at tip (`89a0b751d`) and was not filed. — 5 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-conversions-11 — primary's conversion trains `a196a35d7` (devtools-frontend-assets converts; bus-payload-allowlist splits over the new `lib/bus-payload-fact.ts`) and `cc2a7f76d` + `17297f298` (the Base UI family: baseui-surface-manifest, baseui-anatomy-completeness, baseui-derives-not-respells + `-health`, `lib/baseui-read.ts` re-homed), measured on `17297f298` in the verifier's own worktree ([`v-conversions-11-2026-09-13.md`](v-conversions-11-2026-09-13.md)); 12 rows asserted — `bus-payload-allowlist-health` and `baseui-derives-not-respells-health` CONFIRMED (#1584 comment posted); **baseui-surface-manifest and baseui-anatomy-completeness REFUTED** (three headline arms enforced by nothing including the version-bump tripwire; an unreachable carve claimed held; a raw-text blindness guard under a comment-SAFE header); devtools-frontend-assets, bus-payload-allowlist and baseui-derives-not-respells PARTIAL. Row 1 is #2296 (a LANDED SUITE RED: bus-payload-allowlist left in check-gates.repo.int's UNFIXTURABLE_GATES); rows 2/4/5/6/7/9/11 are #2297 (the Base UI rework); rows 3/8/10/12 are #2298 (planter-trio residue: five `adjudicateDevToolsClosure` clauses held by no tier, a receipt counting what was FOUND, a grant row out of sort order, a wrong test count). Not verified: the §4.6 fixture-level replays the commits claim (7/9, 6/7, 12/12). — 12 rows (0 OPEN, 12 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-wave-12b — the mirror-family fix `183e49714` (#2254 #2279 #2280 #2270) and the client P1 landing `9ad17fb5a` (#1843 #1874 #1871 #2243), measured on `9ad17fb5a` in the verifier's own worktree ([`v-wave-12b-2026-09-13.md`](v-wave-12b-2026-09-13.md)); 3 rows asserted — six rows CONFIRMED and closed (#2254 #2279 #2280 #1843 code lens #1874 #2243); **#2270 PARTIAL** (the 57-member roster re-derives and reconciles member-for-member, but the INSTRUMENT is the defect: exact-set equality over a population that grows ~6 members a day in a `--full`-only suite is a false-red by construction — a planted `export {};` family test takes the drive to 58); #1871 PARTIAL by scope (item 1 confirmed; items 2/3/4 and comment finding 6 untouched at `9ad17fb5a`). Row 1 rides #2270 (fix spec: a class assertion plus a named-exception list); rows 2–3 are #2301 (four drifted `::after` headers plus `hit-extent.ts:107` documenting the fixed CTA-ring collision as live; the Button `inline` arm pinned by computed geometry alone). The rendered/UX half of #1843/#1874/#1871 was not measured (side-eye lens not dispatched, owner order). — 3 rows (0 OPEN, 3 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-wave-12a — five commits `c810fee07` · `6d62ad8ab` · `37caa7980` · `196232af6` · `30fd90298`, measured on `9ad17fb5a` ([`v-wave-12a-2026-09-13.md`](v-wave-12a-2026-09-13.md)); 8 rows asserted — rows 1/2/3/5/6/7 are **CLOSED on current source** by `4d7f7152c` + comment correction `dd00ebb78` (#2303/#2304); row 4 remains **OPEN** (#2302), because neither scoped suite asserts the positional identities against the real ESLint config; row 8 remains **OPEN** (#2304), because the history reader still cannot identify a merge train or prove a prior pass. The repair lane recorded two native programs green before integration. Root independently ran the registry/run/history suites on integrated `dd00ebb78`: 106/106 passed, exit 0, receipt `reports/runs/test/main-3719553-2026-09-13T04-27-21-801Z/test-report.json`. This validates focused stage planning and history behavior; the full verification barrier remains owed. — 8 rows (1 OPEN, 7 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-12A-8 `history` (#1983 part 2) | w12a R8 · `tooling/src/verify/lib/history.ts:176-189` | the once-per-merge-train cadence is still advisory output: no exit change, threshold or machine-readable merge-train identity enforces it | other (advisory where an enforcement was implied) | STATUS: OPEN  **OPEN** (board #2304) | current source now states the limit truthfully in code and rendered output: cadence enforcement remains the quiescent-barrier procedure, and bounded per-checkout history cannot identify a merge train or prove a prior pass. `history.int.test.ts:183-188` pins that wording, but the function still returns strings only and `ops/run.ts` only prints them. The repair narrows the claim; it does not close the cadence defect |

### cb-x-policing-additions — five repair findings from [the full report](x-policing-additions-2026-09-13.md); 5 rows asserted. Integrated through `b718a0835`, independently source-reviewed. Branch measurements remain attributed to their recorded base. Current-main focused verification at `765dcdd71` passed 170/170 tests across the nine requested files (`reports/runs/test/main-4017828-2026-09-13T05-21-29-260Z/test-report.json`); this closes these five findings, not the broader policing program or follow-up #2309. — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-x-test-population — five findings from [the full report](x-test-population-2026-09-13.md); 5 rows asserted. Code/config repairs integrated at `94830a655` and independently source-reviewed. The two residual defects were tracked as #2307 and #2308; #2308 now has the current-main focused receipt recorded below. — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-x-css-train-fixes — five follow-up findings from [the complete repair report](x-css-train-fixes-2026-09-13.md); 5 rows asserted. Source review and scoped integration receipts are recorded per row. — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-x-css-family-unit — the conversion lane's authored-slice defect from [`x-css-family-unit-2026-09-13.md`](x-css-family-unit-2026-09-13.md) §LEDGER ROWS; 1 row asserted — independently confirmed by cb-v-css-family. — 1 rows (0 OPEN, 1 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-css-family — independent review of the five-policy CSS-family conversion, measured on `3c685ce6a` ([full verifier report](v-css-family-2026-09-13.md)); 6 rows asserted — four repairs are source-accepted and green in the integrated 11/11 family battery, but remain FIXED pending the final B re-lens. The retirement dependency remains #2297; the inherited grant-order red closed separately as #2306. This section does not close the conversion wave. — 6 rows (0 OPEN, 6 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

Current adjudication: the second independent lens confirms the two ordinary policies; three repaired rows close, while health/prose residues remain #2305. The earlier awaiting-review heading and receipts are historical.

### codex performance closure — `policy-soundness` repeated static-read work (#1992) — 1 rows (0 OPEN, 1 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-css-train-4 — independent re-verification at `61fb1b8ef` ([full report](v-css-train-4-2026-09-13.md)); 5 rows asserted. The filed #2292/#2293 defects are closed, while these newly separated rows remain open. Assignment does not establish repair. — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-hit-geometry — adversarial verification at `765dcdd71` ([full report](v-hit-geometry-2026-09-13.md)); 7 rows asserted. No browser/CT floor was run by this verifier. — 7 rows (0 OPEN, 7 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-v-css-unit-2 — second independent lens at `f56e83d52` ([full report](v-css-unit-2-2026-09-13.md)); 5 rows asserted. Ordinary `css-family-ownership` and `css-selector-has-a-writer` are confirmed for landing; these sibling/prose residues remain open. — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-x-resource-selection — [full builder report](x-resource-selection-2026-09-13.md), measured at `028e278ee`; 3 rows asserted. Integrated as `57f7affdc`, including the contract-home correction. Independent source review accepted the algorithm and integrated 220/220 passed at `reports/runs/test/main-190157-2026-09-13T06-23-39-779Z/test-report.json`; Resource-contract prose is reconciled in this integration after independent source review. The final independent review at `99acf985d` confirms the three #2309 defects ([v-baseui-final Claims 1–5](v-baseui-final-2026-09-13.md)); that report's separate #2297 and whole-program limitations are not closed by these rows. — 3 rows (0 OPEN, 3 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### Recovered adjacency-review table 1 — 2026-09-13 — 4 rows (1 OPEN, 3 CLOSED)

These existing rows had lost their table header and carried escaped leading pipes, making them invisible to the derived rollup. Their recorded defect text and states are preserved; restoration is not fresh implementation adjudication.

| module | wave · source | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-RECOVERED-ADJACENCY-REVIEW-T-1 `policy-legacy-imports` | cb-adj-authority L1 · `tooling/src/verify/gates/policy-legacy-imports.ts:120-136` (`FORBIDDEN_IMPORT_HOMES`) and its `fix` string | **ARM A's stated remedy VOIDS the §12.5 property the arm exists to enforce.** The arm judges the IMPORT ORIGIN of a specifier, and `#2201`'s re-export chase follows only `export … from`. A gate-owned `ExemptionTable` moved into `lib/<family>.ts` as `import type { ExemptionTable } from "../contract/gate.ts"` + `export const T: ExemptionTable = {…}` is therefore invisible: `lib/x.ts` is neither a forbidden home nor a registering gate module, and it is outside the declared population (`under: ["tooling/src/verify/gates/**"]`, 309 source files). §12.5 says *"Gate modules receive neither grant tables nor marker parsers"* — a final module importing that table still receives one. The arm's own `fix` ARM B authorizes the move (*"debt data with one owner (a deferral list) moves to `contract/` or `lib/` the same way"*), so this is a designed escape rather than a false negative — but nothing then holds §12.5, and #1922's migration can reach 0 red at 0% done | other (coverage gap created by the stated remedy) | STATUS: OPEN  **OPEN** (board #2320; migration #2147 / #1922) | `pnpm check:structure --check policy-legacy-imports` on `1ea2c2a0e`: **5 findings** (the invocation's own positive control — the recognizer fires) and NONE of them is `no-raw-spacing-in-features:34`, `no-raw-typography-in-features:51`, `contract-derives-not-respells:54` or `injected-op-caller-param-health:22`, each of which imports a live exemption table from `lib/`. The four tables are intact: `lib/raw-spacing-tier.ts:22`, `lib/raw-typography-tier.ts:21`, `lib/contract-derives-not-respells.ts:32` (all three still `ExemptionTable`-typed off `contract/gate.ts`) and `lib/injected-op-caller-param.ts:37` (retyped `CallerFreeOpRow[]`). Four of the nine modules the arm named at mint went green by exactly this move (`3420a81e9`, `d9d1e3524`) and **zero reviewed grants were minted** — no `REVIEWED_GRANTS` row names any of the five sanctioned-home policies · FIX: judge the exemption-table SHAPE at the final module's import boundary (a `defineGate` module importing a value whose declared type resolves to `contract/gate.ts#ExemptionTable`/`ExemptionRow`, wherever it sits), or widen the population to `tooling/src/verify/lib/**` with an `ExemptionTable`-declaration arm. Either way the arm needs a `mustFlag` fixture for the one-hop-lib shape, which it has for the `export … from` shim (`:434`) and not for this one |

### Recovered adjacency-review table 2 — 2026-09-13 — 2 rows (0 OPEN, 2 CLOSED)

These existing rows had lost their table header and carried escaped leading pipes, making them invisible to the derived rollup. Their recorded defect text and states are preserved; restoration is not fresh implementation adjudication.

| module | wave · source | defect | class | state | receipt |
| - | - | - | - | - | - |

### Codex original-wave gap probes — measured on `83215b816` ([`adj-audit-gap-probes-2026-09-13.md`](adj-audit-gap-probes-2026-09-13.md)); one confirmed defect, filed as #2325 — 1 rows (0 OPEN, 1 CLOSED)

| subject | found by | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-adj-closures — production-default and false-receipt follow-ups · 2 rows ([full review](adj-closure-review-2026-09-13.md)) — 2 rows (0 OPEN, 2 CLOSED)

| module | wave·path:line | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-x-production-drivers — two attestation follow-up findings ([`x-production-drivers-2026-09-13.md`](x-production-drivers-2026-09-13.md)); 2 rows asserted, both closed by the reviewed root seam and fixture isolation at `846818115` + `7c63968db`. Historical observations are retained; final independent review and main runtime/type receipts are in the report. — 2 rows (0 OPEN, 2 CLOSED)

| # | module / file | defect | evidence | class | state |
| -: | - | - | - | - | - |

### cb-x-refute-repairs — [full corrected report and independent review](x-refute-repairs-2026-09-13.md); 2 rows asserted. Integrated as cde165d7d. #2197 remains OPEN pending a revision/load-bearing quiet planter receipt; bounded #2259/#2270/#2288 dispositions are separate. — 2 rows (0 OPEN, 2 CLOSED)

| module | wave·path:line | defect | class | state | receipt |
| - | - | - | - | - | - |

### cb-x-config-scoped-proof — [full report and independent review](x-config-scoped-proof-2026-09-13.md); 1 row asserted. Integrated at a19a119c2 + c739f3544 and verified on main. — 1 rows (0 OPEN, 1 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |

### Compiler-program discovery — #2335 ([`v-world-type-config-preservation-2026-09-13.md`](v-world-type-config-preservation-2026-09-13.md)); 1 row — 1 rows (0 OPEN, 1 CLOSED)

| module | wave/path | defect | class | state | receipt |
| - | - | - | - | - | - |

### Q08 production dependency repair — #2337 ([`v-q08-production-consumption-2026-09-13.md`](v-q08-production-consumption-2026-09-13.md)); 1 row — 1 rows (0 OPEN, 1 CLOSED)

| id | module | defect | class | state | receipt |
| - | - | - | - | - | - |

### Workboard byte-limit repair — #1906 / #1920 ([`v-workboard-evidence-2026-09-13.md`](v-workboard-evidence-2026-09-13.md)); 2 rows — 2 rows (0 OPEN, 2 CLOSED)

| id | module | defect | class | state | receipt |
| - | - | - | - | - | - |

### Replay continuation repairs — #2319 ([`v-2319-continuation-review-2026-09-13.md`](v-2319-continuation-review-2026-09-13.md)); 4 rows — 4 rows (0 OPEN, 4 CLOSED)

| id | module | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-REPLAY-CONTINUATION-REPAIRS-2 V-2319-C2 | x-legacy-replay-2026-09-13.md | Recipe required prepend while the working twin also repointed existing imports. | other (stale procedure) | STATUS: CLOS … |

### Replay exact-arm repair — #2338 ([`v-2319-integration-review-2026-09-13.md`](v-2319-integration-review-2026-09-13.md)); 1 row — 1 rows (0 OPEN, 1 CLOSED)

| id | module | defect | class | state | receipt |
| - | - | - | - | - | - |

### Proof-message and declaration-census prevention — 2026-09-13; 3 rows — 3 rows (0 OPEN, 3 CLOSED)

| id | module | defect | class | state | receipt |
| - | - | - | - | - | - |

### Boot-trace terminal capture and evidence truth — #2345, 2026-09-13 — 1 rows (0 OPEN, 1 CLOSED)

Independent review refuted the intermediate repair before landing: stop-command stalls escaped its deadline, failed stops lost raw evidence, two timeout literals violated the clock policy, and partial retained traces inherited a complete artifact declaration. The final repair was reviewed against the five-file snapshot committed below; this does not establish the gate program's consolidated barrier.

| module | defect | class | state | receipt |
| - | - | - | - | - |

### Board-citation control witness — #2347, 2026-09-13 — 1 rows (0 OPEN, 1 CLOSED)

| module | defect | class | state | receipt |
| - | - | - | - | - |

### Ledger orphan-row admission — #2348, 2026-09-13 — 1 rows (0 OPEN, 1 CLOSED)

| module | defect | class | state | receipt |
| - | - | - | - | - |

### Q02 independent closing review — expanding phantom generic, 2026-09-13 — 1 rows (1 OPEN, 0 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-Q02-INDEPENDENT-CLOSING-REVI-1 `lib/type-member-origin.ts` | Q02 independent review of `763c38c98` · `candidateScopes` | Changed recursive instantiation removes value eligibility filtering, so `Nested<ExemptionRow>` with only `next: Nested<T[]>` treats an erased generic argument as unresolved canonical data and withholds the policy. The type parameter never occupies a data position. | false refusal / phantom type provenance | STATUS: OPEN  **OPEN — integrated in `4522eee58`; composed verification and closure reconciliation remain owed** (reader repair #2320) | Independent production dispatch: phantom producer gives zero findings, evaluate tool error and incomplete/withheld owner; adding `value: T` yields exactly one finding and complete owner. The committed 144/144 tests and selected real-corpus 11-findings/309-path run both pass, so neither covers this defect. Reproducer SHA-256 `55dbb828a335e0fff47e232aa90238f6ae4ba4de914d6453f2cf8362ea054a01`. Repair must preserve actual data containment and genuine opaque refusals, with permanent unit and dispatched controls; no arbitrary traversal cap. **Intermediate correction also REFUTED:** stopping at a changed recursive edge makes stable and expanding parameter swaps pass clean even when canonical data is reached after that edge. Independent swap probe SHA-256 `12f0a4584e41950d3f96a3cadc38769576e2748f0f2bdebb12831951e7033fab`; unrolled twin finds the row, phantom twin stays clean. The 147/147 intermediate suite lacks swap/rotation/post-hop projection coverage. That snapshot remains unmerged; the assigned reader builder is repairing recurrence reachability, not accepting unseen data as absent. **Next correction also REFUTED:** its 161/161 floor and original 25-case matrix pass, but a three-parameter rotation that wraps each transported argument in an object returns zero findings and errors while TypeScript accepts the reachable nested value as the canonical row; four-parameter and Readonly-wrapped controls also pass falsely. Independent production probe SHA-256 `910695ebf3cd61c6d71e98d05d2964511615c2a003f7a3bcf50a79cbb04c0224`; an unrolled twin finds the row and the compiler rejects the planted number control. Property-blind argument transport collapses the recurrence signature before data reaches a value position. Integration remains blocked under this same repair row. **Round 3 also REFUTED:** the 173/173 candidate repairs argument wrappers but a wrapper on both the recursive edge and transported arguments still returns zero findings/errors with a complete owner; the compiler accepts the nested canonical value and rejects the number control. An intersection-recursive data twin takes 53.3 seconds and refuses where the preceding candidate reported in 113 milliseconds; its phantom twin takes 43.0 seconds. Independent report SHA-256 `1a758ff534b6fb8f4f8819fe1f2b594d17dbe14248964e52375c9df419d10db4`. Both defects remain with the same reader repair owner; integration requires edge-wrapper and intersection data/phantom regression proofs plus measured cost. **Finiteness review:** the subsequent intersection selection exhausted the 16 GB heap twice and was interrupted (exit 130); no completed test verdict or full-suite receipt exists for that candidate. Independent source review of reader SHA-256 `e3102b5fae62e628509e8c498d300c546ecde15fd4164d1a9d8d97a1b3eed0b7` identifies excluded intersection constructor identities, independently recursive wrapper expansion, and nested-wrapper cycle discovery gaps. A delayed conditional canonical output also defeats repeated boolean signatures as an absence proof; this new counterexample is source-derived, not runtime-confirmed. Review artifact SHA-256 `8c423a4b5becccaa262d9df0edf709fabe37d14ed48269d69b052400afa6ea36`. Repair replaces concrete recurrence discovery with finite declaration/parameter transport summaries, retains compiler-validated positive witnesses, and records candidate-specific unsupported frontiers; new controls and completed behavioral verification remain owed. **Finite-summary candidate behavioral result (2026-09-13):** source-cleared reader `58962691` completed the focused run in 9.68 seconds without OOM, but remains refuted: 23 passed, 7 failed, 169 skipped. The selector admitted 30 tests rather than the intended 34. Box and Readonly recursive-edge data cases still falsely pass clean in unit and dispatched planes; a non-generic alias crosses the unit recurrence tripwire and refuses in production instead of proving the phantom clean. The intersection unit compiler witness incorrectly assigns a reachable array to its element type; its dispatched positive passes. Receipt `reports/runs/test/agent-a6646bc6706ca2732-3660145-2026-09-13T20-43-56-278Z/test-report.json`. Bounded repairs and corrected selection are owed; this candidate remains unintegrated. **Later integration, 2026-09-14:** `4522eee58` landed the independently reviewed successor aggregate; the preceding refutations describe earlier candidates. At main `e0528f591`, all 91 type-member-origin tests pass, and the ledger-admission owning suites pass 55/55 (combined run 146/146, `reports/runs/test/main-2835097-2026-09-14T02-14-39-771Z/test-report.json`). The full 11 native programs and 129 type assertions also pass after integration. The composed policy-family rerun and final board/ledger closure are still owed; this row stays OPEN rather than asserting full acceptance. |

## CLASS ROLLUP

**REBUILT FROM THE BODY, 2026-09-11 (`v-ledger-sweep`, `64dfbf349`). The previous table read
`91 rows · 33/7/3/48` and matched nothing — the body held 99.** The old total was wrong by 8 and its OPEN
column by 5.

**THE METHOD BELOW WAS WRONG IN THREE MEASURABLE WAYS BY 2026-09-12, AND IT IS THE FILE'S OWN DISEASE ONE
LAYER UP: a re-derivation instruction that silently stopped covering the file.** It is repaired in place; the
original is quoted inside each repair. (a) *"the eleven tables"* — there were **20** at that dated repair. (b) *"≥6 cells"* and
*"cell 5"* — the `p-suite-honesty` section carries a **FIVE**-column schema, `subject` then `defect`, `class`,
`state`, `receipt`, so the `≥6` filter DROPS all 12 of its rows outright and `cell 5` would bin its RECEIPT
column.
(c) the bin vocabulary omits **`FIXED`**, which is what 11 of those 12 rows say. Net effect: a reader following
the old method exactly misses 12 rows and cannot tell that from a clean run. **Do not hardcode a column index
in a file whose sections do not share a schema** — read each table's own header row and use its `state`
column, which is what the repaired method does.

**Current counting method.** Use `deriveClassRollup` in
`tooling/src/verify/lib/gate-program-rollup.ts`, the same production reader used by
`classRollupDrift` in `tooling/src/verify/ops/ledgers-fresh.ts`. It reads tables between
`## THE LEDGER` and its next top-level h2 through shared Markdown admission, splits only unescaped
pipes, locates each table's `state` column by name, and bins its first bolded word (otherwise its first
word). The supported states are defined by `STATE_BINS`; unknown states and tables without a state
column are reported, never silently dropped. Class selection follows the reader's ordered named-class
list, falling back to `other`. Each row counts once.

Run `pnpm check:ledgers-fresh` to compare this authored table with the production derivation. It prints
per-table counts and unbinned cells on every run. Rebuild from that reader at a quiet integration
barrier; do not maintain a second parser or copy old totals. State changes retain their board IDs and
verification receipts so the historical defect can be joined to its disposition.

**Rebuilt 2026-09-18 (lane `ledger-reformat`) after adding `ROW-` ids and `STATUS:` prefixes to every row.**
`pnpm check:ledgers-fresh` confirms `80 tables · 538 rows · unbinned 0` against this tree — the format
change did not shift any row's bin. Only `other.CLOSED`/`other.OPEN` and their `TOTAL` moved (one row
reclassified since the prior rebuild), matching the tool's own diff.

| class | rows | CLOSED | OPEN | SUPERSEDED | DISSOLVED | UNADJUDICATED | N/A | FIXED |
| - | -: | -: | -: | -: | -: | -: | -: | -: |
| §4.1 | 98 | 93 | 1 | 3 | 1 | 0 | 0 | 0 |
| §4.2 | 4 | 3 | 0 | 1 | 0 | 0 | 0 | 0 |
| §4.5 | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| §4.6 | 7 | 7 | 0 | 0 | 0 | 0 | 0 | 0 |
| §5b.1 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| §5b.2 | 12 | 12 | 0 | 0 | 0 | 0 | 0 | 0 |
| §5b.3 | 9 | 7 | 0 | 1 | 0 | 0 | 0 | 1 |
| §5b.5 | 19 | 18 | 1 | 0 | 0 | 0 | 0 | 0 |
| §5b.7 | 10 | 9 | 1 | 0 | 0 | 0 | 0 | 0 |
| §12.3 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| roster | 17 | 17 | 0 | 0 | 0 | 0 | 0 | 0 |
| other | 342 | 331 | 6 | 1 | 3 | 1 | 0 | 0 |
| **TOTAL** | 538 | 517 | 9 | 6 | 4 | 1 | 0 | 1 |

**DATED HAND CENSUS — 2026-09-12 (taken at the 23:01Z barrier, `64fd349e8`), not re-derived since.** The sub-table below is a historical partition of the `other` bin by hand-read phrases. Its rows sum to its snapshot TOTAL (176); it makes no current-population claim. The current derived population is the CLASS ROLLUP table above.

| free-text class in `other`, as written | rows |
| - | -: |
| other | 16 |
| local binding resolution | 14 |
| instrument | 11 |
| gate→gate import | 11 |
| proof-expectation debt | 11 |
| #2147 | 7 |
| gate-source conformance | 4 |
| #1968 | 3 |
| ledger/doc staleness | 3 |
| unmeasured verdict | 3 |
| correctness | 2 |
| marker translation dropped by a conversion | 2 |
| a literal another lane's correct work invalidates | 2 |
| stale ledger | 2 |
| doc | 2 |
| proof | 2 |
| same | 2 |
| judgment | 2 |
| ledger staleness | 2 |
| ledger freshness | 2 |
| *1-offs (distinct phrases, one row each)* | 73 |
| **`other` TOTAL** | **176** |

**`other` is the majority bin BY CONSTRUCTION** — most sections write a FREE-TEXT class rather than a
§-number, so the **STATE axis is load-bearing and the CLASS axis is indicative only**. The second table
below counts what those cells actually say, binned by the cell's first named phrase; counting what the
cells say is not a taxonomy, it is the census that would inform one later, if ever.

**Rebuilt 2026-09-12 at `2fea1bd15` over the WHOLE BODY by the counting paragraph's own method** (unescaped-pipe
split · `state` index off the header BY NAME · first-bolded-word-else-first-word), reproducing
`34 tables · 327 rows · UNBINNED 0`. The previous table read `100 rows · 45/48/4/1/1/1` and had been stale
by 203 rows since `64dfbf349` — **the second time this table has gone stale the same way** (its own opening
paragraph records the first). **`ledgers:fresh` does NOT hold this table**: its ledger arm reconciles each
SECTION against the REPORT that section cites and never reads the rollup, which is why a 203-row error
survived every `pnpm check` of the preceding day. That gap is **#2207**.

### The cross-cutting classes, counted PER MODULE rather than per row

These are the leverage. Each is ONE decision that lands across many modules, which is why they are counted here
instead of being restated 25 times in the table.

| class | modules affected | state |
| - | -: | - |
| **§5b.5 header — no FAMILY line, no POPULATION PORT, no legacy SHA** (#2005) | **48+, but the SHA half is moving** — wave 3's 9 re-censused 2026-09-11 as `FAMILY 0/9 · POPULATION PORT 0/9 · legacy SHA 3/9` (was 0/9; `4e832e610` landed 40-char SHAs in 20 headers across the bus, tenancy, raw-spacing/typography, serde and banned-shapes families). Wave 8's 25, wave 9's 14, wave 6's 10 of 12 and wave 10's 8 of 12 were all measured BEFORE that commit and are now upper bounds | STATUS: OPEN **OPEN, systemic.** Wave 9 names the consequence: it is the mechanical blocker for #2000's §4.6 differential — no module records a SHA to replay against |
| **§5b.3 — ordinary `fix` names no `@orb-waive` spelling** (#1978) | ~~**51 of 88** at `8257071ee`~~ — the four this ledger named as still-open samples are ALL compliant on `64dfbf349` (`fk-ondelete-stated:10-14`, `empty-state-has-action:47-50`, `bounded-list-limit:23-27`, `no-raw-container-widths:62-64`, via `e7bbc809d`). **Do not hand-census this class** — a grep for `@orb-waive` calls 45 of 48 non-compliant modules compliant; the gate resolves `fix: FIX` const aliases and `+` concatenation and a hand count is strictly worse | STATUS: OPEN **OPEN as WARNING DEBT.** MECHANIZED: `policy-waiver-spelling` (#1971) reports its own worklist on the commit bar. Confirmed still open on a sample: `fk-ondelete-stated`, `empty-state-has-action`, `bounded-list-limit`, `no-raw-container-widths` |
| **#1968 expectation rows with no `count`** | **78 → 11** (recorded, playbook §2b) | **SUPERSEDED — mechanized.** `policy-proof-expectations` ARM C. The 11 survivors are a measured registry-cardinality exemption (#2001), NOT debt. Wave 3's `ownerid-registry` and wave 5's `persisted-store-registry` cells are plausibly inside it — **check the enforcer's worklist before adding a `count`** |
| **§4.2 identity arms** (#1952) | **0 of 86 outstanding** (recorded, playbook §2b) | **SUPERSEDED — mechanized.** `policy-waiver-identity` accepts both sanctioned shapes and is marker-FORM, not mention, which is the trap wave 4's D2 grep fell into |
| **inert `ext` / contract residue / `node:fs`** (#1959) | swept to 0 at `8257071ee` | **SUPERSEDED — mechanized.** `policy-soundness` E1/E2/E3 |
| **#944 third answer unreached** | ~~wave 7: 10 still OPEN~~ → **wave 6: 9 CLOSED · wave 7: 12 CLOSED · wave 8: 3 OPEN · wave 9: 3 OPEN · wave 10: 5 OPEN** | STATUS: OPEN **OPEN — residual only.** Re-derived 2026-09-18: **50 modules** now carry `messageIncludes: "CANNOT be established"`. The seven server/bus modules previously listed at 0 are ALL now pinned: `single-stream-transport` 2, `no-raw-clock` 2, `no-raw-random` 2, `membership-enforcer` 2, `discovery-no-stats-rollups` 2, `persistence-no-in-memory-state` 2, `no-await-db-in-loop` 2. Of the five `id-brand-flow` members, three now carry the pin (`no-mint-via-cast` 2, `no-raw-id` 2, `no-fake-disabled-id` 2) while two remain at 0 (`no-loose-id-cast`, `brand-in-name-position`). `no-untrusted-html-in-main-dom` remains 0 and is a separate row. **The server and bus plane fix pass HAS now landed; the residual is 2 id-brand-flow members + the separate html row** |
| **unenforced §4.1 narrowing cells** | ~~\~110 cells across ~55 modules~~ → **re-derived 2026-09-11: roughly 60**, and the aggregates were the worst offenders | STATUS: OPEN **OPEN and MEASURABLY SMALLER.** Wave 6's 25 → ~1 (`2aba9c0ed`/#1999 landed 15 pinned-fence rows, `a54394df6`/#1990 the third answers); wave 5's 33 → 10 (`8ad418868` closed `no-inline-types` 9 of 9 and `zod-modern-spellings` 6 of 6); wave 4's 10 → 4; wave 3's 4 → 1. Waves 8/9/10 are UNTOUCHED (34 + 14 + 11 cells, modules byte-identical). **The decay is entirely on the CLIENT planes; the server and bus planes have had no fix pass at all** |

## DATED PRIORITY SNAPSHOT FROM THE 2026-09-11 SWEEP

This ranking preserves the sweep's historical prioritization. Inline closure annotations record later
outcomes; Project 1 controls current ownership and ordering.

Ranked by *a correct gate accusing correct code* first, then by blast radius, then by cost-to-close.

1. ~~**#2006 — the sealed-origin conflation, five gates ACCUSING CORRECT CODE on pristine source**~~
   **— CLOSED, `0b9a4dfa2`/`ae2e935d3`. Re-verified by `v-ledger-sweep` 2026-09-11: `sealedOriginReports`
   occurs 3× in each of `discovery-no-stats-rollups`, `membership-enforcer`, `providers-runner-seal`,
   `turn-identity` and `vector-scope-derived`.** The sixth candidate the wave named,
   `untrusted-regex-safe-exec`, is §4.1's SHAPE 3 (ACQUITTING direction) and **must not be "fixed"**.
   Superseded text follows. (wave 9 D1, `v-audit-wave9-2026-09-12.md:90`). This is the only row in
   the whole ledger where a gate is WRONG about real code rather than under-proven: a local object whose key is
   spelled like the sealed export is reported. **The fix is one line per module and is PROVEN** — swapping
   `readSealedOrigin(…).kind !== "foreign"` for `sealedOriginReports(verdict, anchor)` goes to 0 failures while
   the unreadable-door `mustFlag` still flags. `untrusted-regex-safe-exec` carries the same shape and is a sixth
   candidate the wave did not measure. The counter-example AND the fix both already live inside the family
   (`test-fixture-imports` scopes its fail-closure correctly, with an 89-false-positive receipt in its own row).

2. ~~**The #944 third answer is dead in ten `home-client` modules**~~ — **CLOSED 2026-09-11 (#2014,
   `0a550c91c`); re-censused by `v-ledger-sweep` at `messageIncludes: "CANNOT be established"` ≥ 2 in all
   twelve `home-client` modules.** **ITS REPLACEMENT AT THIS RANK IS THE SAME SHAPE ONE PLANE OVER:** the arm
   is still absent from `single-stream-transport`, `no-raw-clock`, `no-raw-random`, `membership-enforcer`,
   `discovery-no-stats-rollups`, `persistence-no-in-memory-state`, `no-await-db-in-loop` and **all five of
   `id-brand-flow`** — where `no-mint-via-cast.ts:24,28` returns `false` on an unresolved origin inside a
   HARD/error mint-laundering ban. Same known fix, applied twice now, never to the server or bus plane; ~16
   rows, zero design risk. **And a genuinely new #1 candidate the first pass filed as MEDIUM:**
   `no-untrusted-html-in-main-dom`'s attribute-NAME fence is the entire subject of a D44 SECURITY policy over
   `@client` + `@ui`, and NEITHER `mustPass` dies when it is cut (`:91-95` has no JSX attribute at all,
   `:96-102` is a plain-object property in a `.ts` file). One row closes it and no board row exists.

3. ~~**`no-effect-on-shared-selection` FAILS OPEN on the shared reader's third answer**~~ **CLOSED 2026-09-12 (#2016, `eae36a2b8`); the class recurs at `persisted-store-registry` — #2022.** — **CLOSED 2026-09-13, `1a97c17ab`.** Fixed as a THIRD `unreadable` ARM, not as re-attribution to a door: the door decides WHICH ARGUMENT holds the store name (bare arg 0 for persist vs an options bag for draft), so attributing an unreadable callee to either door reads the wrong argument and emits a message about the NAME when the unknown is the DECLARATION — and on a HARD policy the message IS the fix instruction. Proven doors are answered BEFORE the fallback, or an absent home file swallows a sibling door's proven match. **Real-corpus RAW 0 → 0, latent again**, so this is copy-trap containment rather than a live escape. The acquitting `mustPass` was proven NON-DUPLICATE by cutting the SHARED reader (`project-home-origin.ts:82`, resolved non-home → `unreadable`), which kills it while the pre-existing local-function counterfactual SURVIVES — and the complementary cut at `:76` (refusal classifier → `other`) kills `mustFlag[5]` instead, so the two rows are pinned by DISJOINT code paths. **CORRECTED 2026-09-13: an earlier version of this line said the cut kills “only that row across the family”. It does not — it kills FOUR rows corpus-wide** (`bound-field-via-hook.mustPass[1]`, `chat-stream-writes-in-bus-only.mustPass[2]`, `persisted-store-registry.mustPass[2]`, `selection-store-via-factory.mustPass[1]`), all same-name-different-module counterfactuals resolving through the same line. **A cut in a SHARED reader is family-wide BY CONSTRUCTION**, so exclusivity was never what made the row non-vacuous — survival of the sibling is. The honest form is *“exactly one row inside the MODULE, and the sibling survives”*; a lane copying “a shared-reader cut kills exactly my row” as a method will be surprised. Original text: (wave 7 D1, `:337`;
   `:186` unchanged). It is the program's named ANTI-pattern: eleven siblings write `!== "other"` and report,
   this one writes `=== "home"` and drops the verdict. Measured pinned in NEITHER direction — flipping the
   predicate changes no declared row — so a future edit moves it between fail-open and fail-closed invisibly.
   It is a security-adjacent selection-taint policy; the subsequent #2022 disposition is recorded above.

4. **§5b.5 — the header gap across 48+ modules (#2005), because it BLOCKS #2000.** Not prose polish: wave 9
   states the mechanical consequence outright — no converted module records the legacy pre-conversion SHA its
   §4.6 differential would replay against, so the parity question (#2000, P1) cannot be attempted for the
   corpus. Re-derived 0 of 9 on the Drizzle family this session; waves 8 and 9 measured 25 of 25 and 14 of 14.
   The standard already exists in one paragraph: `nullable-column-inequality.ts:42-53` (legacy `scanRoot`,
   measured 6,113 → 6,112 delta, the one dropped path, a positive control).

5. **#1922 — gate-owned exemption authority still needs migration.** Dated census at `d6b895775`
   (2026-09-13): two modules both declare an `ExemptionTable` value and register a final policy:
   `depcruise-grant-liveness` and `eslint-grant-liveness`. This is a snapshot, not a maintained roster.
   Re-derive declaration identity and final registration from current source before assigning migration;
   a comment mentioning the type is not a declaration. The earlier TEN/SEVEN counts are superseded.
   Authority migration must also inspect consumed external tables, rather than mistake this narrow
   declaration census for the complete set of suppressors. Preserve live permissions until their
   reviewed successor is verified.

## WHAT A WAVE CLAIMED THAT I FOUND FALSE

- **Wave 8's `token` census for `origin-server` is wrong** ("78 rows carry `token` — every origin-server row").
  Wave 9 re-derived the same byte-identical files and found **79 rows, 77 with `token`** — `vector-scope-derived`
  carries two multi-arm rows with `expect: { count: 2 }` and no token. I did not re-run the census; I record
  that wave 9's correction names a MECHANISM (a multi-arm row has no slot for a per-row `token`), which is the
  tie-breaker the brief prescribes, so **prefer wave 9**.
- **Wave 1's 40% unenforced-narrowing headline does not survive its own method.** Waves 2, 5, 7, 8, 9 and 10 all
  measured naive over-reports of 41–73% once the four-way classification was applied. Wave 1 predates every one
  of §4.1's five method rules. Its per-defect findings (D1–D10) hold and nine of ten are closed; its AGGREGATE
  does not, and the playbook already carries that caveat.
- **Wave 4's "three ORDINARY policies have no §4.2 identity arm anywhere" is superseded, not closed by luck.**
  The grep that produced it matched prose; `policy-waiver-identity`'s header records the same trap and is
  marker-FORM rather than mention, and #1952 closed at 0 of 86. A fix lane reading wave 4 D2 today would be
  chasing a row that a gate has been holding since `e4250ae50`.
- **Wave 10 records two claims it EXPECTED to be lies and proved TRUE** (`brand-in-name-position`'s blindness
  tripwire moved into `receiptFailures`' `count === 0`; `bus-fact-health`'s `members: 1` constant is
  load-bearing). Those are not defects and must not be re-opened as roster lies.

## WHAT I DID NOT COVER

These bullets preserve what the original sweep did not measure. Later receipts and corrections in this
document supersede their historical boundaries; they are not current queue claims. Report-gap
accounting is linked below; a clean rollup alone cannot establish that completeness.

- ~~**48 of 91 rows are UNADJUDICATED**~~ — **superseded by the 2026-09-11 sweep: 1 of 100.** The one that
  remains is wave 5's real-tree `no-inline-types` count. The heaviest OPEN block is still the §4.1 narrowing
  cells (30 rows), but they are now each carrying a receipt against `64dfbf349` rather than a wave's claim.

**THE 2026-09-11 SWEEP'S OWN LIMITS — read these as the boundary of the 48 OPEN verdicts:**

- **I ran no §4.1 cut, and I mutated no file.** A CLOSED narrowing verdict means the discriminating row now
  exists and I read its `why`; an OPEN one means I searched the module for the wave's falsifier fixture and
  did not find it. Neither is a two-arm measurement. Where the falsifier is a SHAPE rather than a literal
  (wave 8's `no-raw-clock`/`single-stream-transport` fail-closed arms, wave 9's `persistence-no-in-memory-state`),
  my receipt is "the module is byte-identical to the baseline the wave measured" plus a census — which is
  strong evidence of NO CHANGE and no evidence about the wave's original classification.
- **I did not run `check:structure`, `pnpm check`, `pnpm verify`, `gate-conformance.repo.int`,
  `gate-ignore-grammar.repo.int` or `check-gates.repo.int`** — four lanes were live and the brief fenced all
  six. So wave 4's D5 (row `w4 :256`) is CLOSED on a STATIC reading of both suites' current source, never on a
  green run. If either is red today for a NEW reason, nothing here would show it.
- **The `§5b.5 header` census is a grep census and grep undercounts SHAs in two directions.** My first pass
  read `0 of 9` legacy SHAs on the Drizzle family with a 7-12-character pattern; the landed form is the full
  40-character SHA and the true figure is 3 of 9. **Waves 8 and 9's `25 of 25` / `14 of 14` were measured
  before `4e832e610` landed SHAs in 20 headers, so BOTH are upper bounds and neither was re-censused here.**
- **Roster-row rows are adjudicated clause by clause against `Core-Enforcement-Active-Gates.md` text, not
  against a gate.** `enforcement-registry-parity` proves a row EXISTS; nothing on the tree proves a row is
  TRUE, which is why five of wave 4's seven survive untouched while the two that were repaired were repaired
  by hand.
- **The original sweep did not extract the per-wave omissions.** The later ten-wave accounting linked
  below now classifies them; it does not convert an omitted probe into a defect without evidence.
- **One class is a gate BLIND SPOT I found while adjudicating, not a row anyone filed:**
  `policy-proof-expectations` ARM M cannot see a message composed by a CALL
  (`lib/policy-descriptor-read.ts:137-148` handles literal / template / `+` / conditional / identifier, and a
  `CallExpression` template span yields no static text). That is why `contract-banned-shapes`' `mustFlag[6]`
  is OPEN under a green enforcer. Nobody has filed it.
- **The initial pass had no live-instrument verdict.** The later dated `gate:contract` and
  `check:policy-conformance` receipts in the opening sweep supersede that blanket limitation. Each row's
  own receipt still determines whether its verdict rests on source inspection or an executed control;
  a later whole-instrument pass does not retroactively execute every historical cut.
- **I did not re-run a single §4.1 cut.** A CLOSED verdict on a narrowing cell here means "a row now exists that
  the cut would kill", not "I cut it and the row died". That is the standard the brief set and it is weaker than
  the wave's own receipt.
- **The four meta-policies are a premise I checked by reading, not by running.** `policy-soundness`,
  `policy-proof-expectations`, `policy-waiver-identity` and `policy-waiver-spelling` (#1971) mechanize four
  defect classes. I read all four headers; I did not verify any of them is GREEN or read its worklist. If one of
  them is withheld on the real tree, every SUPERSEDED-mechanized row above reverts to OPEN and nothing here
  would show it.
- **Roster-row defects are under-adjudicated** (4 of 8 rows). Wave 2's D2 alone is eight independent
  noun-of-art claims against `Core-Enforcement-Active-Gates.md`, and the honest check is a per-clause grep of
  the converted module, which I did not do. Wave 4's D7 (seven of nine rows wrong) is in the same state.
- **Wave 10's initial adjudication used main while its report was still in a worktree**
  (`agent-a6a5469bbfac5b55d` at `fca7c9b42`). The report is now present at
  `v-audit-wave10-2026-09-12.md`; the original source receipts describe their stated main revision, not
  an implicit equivalence with that worktree's base.
- **Two suites the waves flagged are fenced to the orchestrator and were not run:**
  `gate-conformance.repo.int.test.ts` (wave 4 D5 reproduced it RED on a quiet tree) and
  `gate-ignore-grammar.repo.int.test.ts` (wave 4 proved all three of its carriers went final, statically). The
  actual failure mode of the second — red vs vacuously green — remains UNMEASURED by anyone.
- **The initial waves did not run conversion differentials.** Waves 1, 2, 3, 5, 6, 7, 8, 9 and 10
  record that omission. Later §4.6 records and #2000's bounded repair supersede the claim that the axis
  cannot start; they do not establish that every legacy replay is complete. #2319 tracks that separate
  replay backlog, and individual differential rows retain their own receipts.
- **The original ten waves' declared omissions were reconciled on 2026-09-13:**
  [full gap accounting](adj-audit-gap-accounting-2026-09-13.md). Most are historical verification
  boundaries or were covered by later waves and barriers. Remaining conversion-replay work is tracked by
  \#2319, #2273, #1970 and #2033; proven authority/shared-reader work is tracked by #1922/#2147/#2320 and
  \#2163. Targeted probes cleared the stated FK spread and alias/satisfies cases and filed the parenthesized
  cast-coordinate failure as #2325. The [completed security census](adj-role-authority-census-2026-09-13.md) confirmed zero instances
  for the three exact header-defined shapes, with planted controls. No new defect rows were justified solely by the omissions; the new row rests on reproduced
  behavior recorded in the linked probe report.

## BOARD LINKAGE APPENDIX — RETIRED 2026-09-18

**Retired.** The 117-row appendix duplicated two already-authoritative surfaces: (1) the defect tables
above (every row with substantive ledger evidence was a duplicate of an existing `ROW-` entry with a
line reference), and (2) Project 1's board (every row without substantive ledger evidence was a
board-status echo with no defect finding). Board statuses verified against `pnpm work:item show` on
2026-09-18 confirmed the appendix's `STATUS:` column was stale on 40+ items (Done/Review items still
marked UNADJUDICATED). The ledger has ONE tracking surface: the defect tables between `## THE LEDGER`
and `## CLASS ROLLUP`.
