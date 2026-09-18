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
| ROW-W1-1 `server-layout` | w1 `:153` | `mustFlag[0]` carries no `count` and tolerates **8** findings from two arms under a one-finding `why` | §4.1 narrowing | STATUS: CLOSED  **CLOSED** | `server-l … |
| ROW-W1-2 `no-raw-matchmedia` | w1 `:168` | the DECLARED LIMIT ("`window`/`self`/bare land on the unreadable finding") is FALSE in the header, two row `why`s and the roster | §5b.2 message | STATUS: … |
| ROW-W1-3 `ui-exports-map-complete` | w1 `:222` | `mustFlag[1]`'s sole discriminator `messageIncludes: "not"` also matches the dead-target arm | §4.1 narrowing | STATUS: CLOSED  **CLOSED** | `:148` i … |
| ROW-W1-4 `server-layout` · `ui-exports-map-complete` | w1 `:232` | the cited not-ready guard CANNOT EXECUTE (`resolveResourceDeclarations` throws in the population phase) | §5b.7 forbidden | STATUS: … |
| ROW-W1-5 `no-raw-matchmedia` | w1 `:268` | the fail-closed UNREADABLE verdict is exercised by NO row | §4.1 narrowing | STATUS: CLOSED  **CLOSED** | `:261` `expect: { count: 1, messageIncludes: "CAN … |
| ROW-W1-6 `no-raw-matchmedia` | w1 `:284` | `mustPass[1]` does not prove the narrowing its `why` names (`isCapabilityProbe`) | §4.1 narrowing | STATUS: CLOSED  **CLOSED** | `:280`'s `why` is rewritte … |
| ROW-W1-7 `no-array-literal-querykey` · `no-inline-types` | w1 `:291` | ordinary `fix` names no `@orb-waive` spelling | other (§5b.3) | STATUS: CLOSED  **CLOSED** | `no-array-literal-querykey.ts:32` … |
| ROW-W1-8 `no-raw-spacing-in-features` · `no-raw-typography-in-features` (+ two `-health` siblings, by import) | w1 `:305` | a legacy `ExemptionTable` from `contract/gate.ts` survives behind `defineG | STATUS: CLOSED  **CLOSED — `7b3d15bc4`** (re-derived 2026-09-18)  … |
| ROW-W1-9 four roster rows (`:100`, `:132`, `:254`, `:256`) | w1 `:321` | bare pre-conversion labels in `Core-Enforcement-Active-Gates.md` | roster row | STATUS: CLOSED  **CLOSED** | playbook §2b DON … |
| ROW-W1-10 `user-bus-deferred-member` | w1 `:337` | inert `ext: ["ts","tsx"]` in an exemplar | other | STATUS: CLOSED  **CLOSED** | no inert `ext` survives corpus-wide (only narrowing `ext: ["tsx"]` … |
| ROW-W1-11 the ten exemplars | w1 `:445` | `exemplars-2026-09-11.md` asserts "Wart: none found" for three modules that are refuted, and prefers a refuted module | other | STATUS: CLOSED  **CLOSED** | … |
| ROW-W1-12 wave 1's whole cut table | w1 `:99` | "12 of 30 narrowings UNENFORCED (40%)" | §4.1 narrowing | STATUS: SUPERSEDED  **SUPERSEDED** | the figure is NAIVE (pre-classification). Wave 2 reclas … |

### Wave 2 — registry / completeness (`v-audit-wave2-2026-09-12.md`) — 6 rows (0 OPEN, 6 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W2-1 `chrome-` · `section-` · `modal-` · `config-group-registry-completeness` · `warning-code-coverage` | w2 `:107` (HIGH) | the #1972 `ctx.relativePath` escape FIRES in five of seven — reproduc | STATUS: CLOSED  **CLOSED** … |
| ROW-W2-2 eight roster rows | w2 `:167` | five of eight rows are DENSE about the LEGACY implementation (a `DEFERRED` table, a `*-section.*` population, a `fileLoaded` door, an "annotation head" subje | STATUS: CLOSED  **CLOSED — `f4d71c4d4`**  … |
| ROW-W2-3 `message-kind-policy-coverage` | w2 `:188` | the header records NO family line and NO population port; singleton declared with no reason | §5b.5 header | STATUS: CLOSED  **CLOSED** | `:20` … |
| ROW-W2-4 `message-kind-policy-coverage` | w2 `:208` | `mustPass[3]`'s `why` names a narrowing the row does not prove (`isReaderScope`); the property is a `mustFlag`, not a `mustPass` | §4.1 narrowin | STATUS: CLOSED  **CLOSED** … |
| ROW-W2-5 chrome unreadable-id gate · warning-code chat-emitter gate · warning-code pushed-record `message` · message-kind reader-scope · placeholder pair-key | w2 `:223` | five genuinely UNENFORCED | STATUS: CLOSED  **CLOSED — 5 of 5**  … |
| ROW-W2-6 `config-group-completeness` · `placeholder-copy-registry` | w2 `:234` | no §4.5 refusal/receipt pin at all — including for config-group's third declared denominator whose stated purpose is | STATUS: CLOSED  **CLOSED — `f4d71c4d4`**  … |

### Wave 3 — the Drizzle-schema fact family (`v-audit-wave3-2026-09-12.md`) — 8 rows (1 OPEN, 7 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W3-1 all nine | w3 `:187` (HIGH), systemic successor | The original nine Drizzle headers are repaired; other final headers still omit a semantic family decision or the legacy/final population comparison. | §5b.5 header | STATUS: OPEN  **OPEN — systemic; the named nine are CLOSED** | Independent full-header adjudication at `22d61f8bb`, 2026-09-13: the twelve imports of `origin-client-family.test.ts` include seven missing family decisions and nine missing population ports. These are semantic omissions, not missing uppercase labels or SHA patterns. Counterexamples include `fetch-fn-in-features` and `no-context-returntype`; neither header supplies either decision. This bounded census does not establish a new whole-corpus count. Historical token counts are superseded as acceptance evidence.  Historical receipts retained for provenance; current adjudication above supersedes their stale population and token counts: re-derived this session: `grep -c 'FAMILY'` and `grep -c 'POPULATION PORT'` return **0 for all nine**. Waves 8 (25/25) and 9 (14/14) reproduce the same gap on the server plane, so this is systemic, not family-local · **RE-DERIVED 2026-09-11 (sweep `v-ledger-sweep`, `64dfbf349`):** re-census: `FAMILY` 0 of 9 and `POPULATION PORT` 0 of 9, UNCHANGED. But **legacy SHA is now 3 of 9, up from 0** — `contract-banned-shapes`, `schema-banned-shapes` and `ownerid-registry` each gained a 40-char legacy descriptor SHA from `4e832e610`. (My first census read 0 of 9 because the pattern assumed a 7-12 char abbreviated SHA; the landed form is the full 40. Naming the corrected pattern here so the next reader does not repeat it.) · **RE-DERIVED AND CLOSED 2026-09-12 by lane `p-ledger-schema-registry`, BY HAND — full reads of all nine headers, no pattern, so neither the caret-eating shape regex nor a length-pinned one can reach it. THE RECORDED SHA FIGURE IS ITSELF AN ARTIFACT: it is 4 of 9, not 3.** The missed carrier is `db-enum-from-tuple`, whose citation is the NINE-CHARACTER abbreviated `1bf7ff7d9` — which the corrected 40-char pattern drops exactly as the 7-12 char one dropped the landed form. So this field has now under-reported in three distinct ways (caret-eaten rev-specs, length-pinned patterns) and over-reported in one (word-match, 78%). Positive control for the by-hand read: it finds `section-registry-completeness`'s `(dd862e988^)` and correctly finds none in `table-explicit-primary-key`'s one-line header. Census before the fix: **FAMILY 1/9 · POPULATION PORT 3/9 · legacy SHA 4/9**. After: **9/9 FAMILY · 9/9 POPULATION PORT · 4/9 legacy SHA**, with the family's port delta given ONE home at `DRIZZLE_SCHEMA_POPULATION` (`lib/schema-fact.ts`) instead of copied into five headers — it is an INTENTIONAL WIDENING BY EXACTLY ONE PATH against the `isSchemaFile` legacy spelling, and lossless: `packages/db/src/schema/index.ts` carries ZERO `sqliteTable(` calls against 97 across the other 29 files (the positive control). **AND THE THREE-ARM SHA CHECK RETURNS 0 DEFECTIVE OF 4 CARRIERS IN THIS FENCE:** `ownerid-registry`, `schema-banned-shapes`, `contract-banned-shapes` and `db-enum-from-tuple` each cite their own conversion's PARENT, the blob exists there (`git cat-file -e`), and each is a legacy `GateDescriptor` (`defineGate` count 0). `contract-banned-shapes` is the one that LOOKS like arm 2 and is not — its own file does not exist at the cited sha because that half was born at the split, and its sentence names the legacy MODULE; the header now says so explicitly. · **Integration receipt, 2026-09-13:** Integrated header candidate `d3d90593e`..`d03b51074` as `d1d7e88b0`. Independent review measured 57 port blocks; unsampled claims remain uncertified. Final comment correction separately reviewed by root. Six in-scope family-classification candidates and 40 excluded owner-lane modules remain outstanding; this systemic row stays OPEN. Candidate tooling native typecheck passed; merged caught-failure census and consolidated verification remain owed. |
| ROW-W3-2 `contract-banned-shapes` | w3 `:216` | `mustFlag[6]` cannot discriminate the two §4.6 arms — `missingHome` embeds `missingSubject` verbatim, so `"SILENT NO-OP"` is in both messages | §4.1 n | STATUS: CLOSED  **CLOSED — and the ARM M blindness is SUPERSEDED by #2040**  … |
| ROW-W3-3 `schema-branding` ×3 · `fk-columns-indexed` ×1 | w3 `:246` | four genuinely UNENFORCED narrowings, each with a falsifier run in BOTH arms. `fk-columns-indexed`'s is the sharpest — **the mod | STATUS: CLOSED  **CLOSED — 4 of 4**  … |
| ROW-W3-4 `ownerid-registry` | w3 `:262` | `mustFlag[4]` (the stale arm) carries no `count`; derived value is 27 | §4.1 narrowing | STATUS: CLOSED  **CLOSED — the fork is resolved AGAINST the exempti … |
| ROW-W3-5 `fk-ondelete-stated` | w3 `:277` | ORDINARY policy whose `fix` names NO waiver spelling; the best position statement in the family sits in a `mustPass` `why` the author never sees | other ( | STATUS: CLOSED  **CLOSED — #1978** (all 46 ordinary policies now name their exac … |
| ROW-W3-6 roster `:102` `fk-columns-indexed` · roster `:100` `schema-branding` | w3 `:301` | one cites the LEGACY reader `_shared/schema-read.ts` the converted module does not import; the other is a | STATUS: CLOSED  **CLOSED** … |
| ROW-W3-7 `contract-banned-shapes` | w3 `:316` | declares a SINGLETON `family` with no reason while sharing `lib/ledger-banned-shapes.ts` with `schema-banned-shapes` | §5b.5 header | STATUS: CLOSED … |
| ROW-W3-8 `schema-banned-shapes` · `schema-branding` | w3 `:326` | an `offset < 0` fallback arm reached by NO row; and a latent `carries null` message defect the `parentBrand` fence is hiding | §4.1 | STATUS: CLOSED  **CLOSED — both halves**  … |

### Wave 4 — raw-CSS / token surface (`v-audit-wave4-2026-09-12.md`) — 9 rows (0 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt | |
| - | - | - | - | - | - | - |
| ROW-W4-1 `no-raw-spacing-in-features` · `no-raw-typography-in-features` · `no-off-token-radius-shadow` | w4 `:110` (HIGH) | the #1954 carrier-fence repair pinned the OUTER fence and left BOTH INNER | STATUS: CLOSED  **CLOSED** … |
| ROW-W4-2 `no-color-literals` · `no-off-token-radius-shadow` · `no-raw-container-widths` | w4 `:153` (HIGH) | three ORDINARY policies have no §4.2 identity arm ANYWHERE — not in the module, not in a | STATUS: SUPERSEDED  **SUPERSEDED — mechanized**  … |
| ROW-W4-3 `no-raw-color-in-css` · `no-raw-container-widths` · `no-color-literals` · `no-off-token-radius-shadow` | w4 `:175` | four of eight ordinary `fix` strings name no waiver spelling | other (§5 | STATUS: CLOSED  **CLOSED — #1978, `e7bbc809d`**  … |
| ROW-W4-4 `no-color-literals` | w4 `:181` (HIGH) | declares one of three disjoint messages as THE policy message (printed as the group header by `render.ts:233`), and 4 of 5 rows cannot say which pat | STATUS: CLOSED  **CLOSED** … |
| ROW-W4-5 `no-raw-color-in-css` | w4 `:219` | answers a broken resource with a SILENT RETURN (§12.3 says THROW); unfalsifiable by any proof row (§4.5b gap 1) | other (§12.3) | STATUS: CLOSED  **CLOSE … |
| ROW-W4-6 `no-off-token-radius-shadow` (conversion) | w4 `:256` (HIGH) | the conversion left `gate-conformance.repo.int.test.ts:49` RED on a quiet tree, and disconnected `gate-ignore-grammar.repo.int | STATUS: CLOSED  **CLOSED — both halves (static receipt; neither suite was RUN)** … |
| ROW-W4-7 `grant-liveness-family.test.ts` · `drizzle-registry-conversion.test.ts` | w4 `:304` | red on a QUIET tree — a 5 s default budget with no `scaledBudget`, against a policy measured at 5022.9 | STATUS: CLOSED  **CLOSED** — cf38b544d, drizzle-registry-conversion.test.ts:39 a … |
| ROW-W4-8 seven of nine roster rows | w4 `:320` | two bare labels, one asserting the "in className/cn" context #1954 REMOVED, two describing retired allowlists, one stale row count | roster row | STA | STATUS: CLOSED  **CLOSED — all five survivors, lane `p-ledger-client-residue`, 2 … |
| ROW-W4-9 nine modules | w4 `:336` | 10 of 31 narrowings unenforced (32%); **1 of 9 modules has any §4.5 pin** | §4.1 narrowing · §4.5 pin | STATUS: CLOSED  **CLOSED — lane `p-ledger-client-residue`, … |

### Wave 5 — `ordinary-visitors` ×15 (`v-audit-wave5-2026-09-12.md`) — 9 rows (0 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt | |
| - | - | - | - | - | - | - |
| ROW-W5-1 `persistence-boundary` | w5 `:213` | the header claims SIX grant rows where FOUR exist (`lib/reviewed-grants.ts`); the roster row was the correct one | §5b.5 header | STATUS: CLOSED  **CLOS … |
| ROW-W5-2 `no-untyped-soft-ref` | w5 `:222` | `mustPass[2]`'s `why` claims to prove the primary-key exemption and does not — the fixture's key is `id`, excluded by the id-shape test before the pk cla | STATUS: CLOSED  **CLOSED — lane `p-ledger-client-residue`, 2026-09-12 (same comm … |
| ROW-W5-3 `registry-assembly-at-door-only` | w5 `:229` | header declares `FAMILY: SINGLETON under its own id` while `no-mutating-register-api` carries the identical `family` string — the family has T | STATUS: CLOSED  **CLOSED — `1d8a38dbc`** (#2005)  … |
| ROW-W5-4 `persisted-store-registry` | w5 `:246` | `mustFlag[4]` carries no `count`; derived value **14**, so the two-sided stale ratchet's COMPLETENESS is unpinned (the row passes on 1 stale finding | STATUS: CLOSED  **CLOSED — lane `p-ledger-client-residue`, 2026-09-12 (same comm … |
| ROW-W5-5 `no-untyped-soft-ref` | w5 `:252` | both `messageIncludes` discriminators are TAUTOLOGIES because `:42` sets `const UNREADABLE = MESSAGE` — every finding carries the whole string | §4.1 nar | STATUS: CLOSED  **CLOSED — #1968, `f72fa4f0e`**  … |
| ROW-W5-6 12 modules (33 cells) | w5 `:171` | 33 genuinely unenforced narrowings, each with its falsifier named. Concentrated: `no-inline-types` 9 · `zod-modern-spellings` 6 · `zod-error-issues-home` | STATUS: CLOSED  **CLOSED — all 10 survivors, lane `p-ledger-client-residue`, 202 … |
| ROW-W5-7 `empty-state-has-action` · `no-inline-domain-interface` · `no-inline-types` · `zod-modern-spellings` | w5 `:360` | four of six ordinary `fix` strings name no waiver spelling | other (§5b.3) | STATUS: CLOSED  **CLOSED — #1978, `e7bbc809d`**  … |
| ROW-W5-8 `no-inline-types` (real tree) | w5 `:396` | `check:structure` reports **19** live findings, 18 of them exported verdict types in `tooling/src/verify/lib/**` — the shared readers the program | STATUS: UNADJUDICATED  **UNADJUDICATED — FENCED, and it is the one row I could n … |
| ROW-W5-9 the §4.2 exemplar citation | w5 `:81` | `.claude/rules/gates-and-tooling.md` and §4.2 cite `ordinary-visitors-family.test.ts:187-205`, which INCLUDES the dead-position NEGATIVE arm §4.2 tel | STATUS: CLOSED  **CLOSED** … |

### Wave 6 — `origin-client` ×12 (`v-audit-wave6-2026-09-12.md`) — 10 rows (0 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W6-1 nine of twelve | w6 `:102` (HIGH) | the advertised **#944 THIRD ANSWER is UNPROVEN** — a `throw` planted in the `unreadable` branch fires on zero declared rows in nine modules. "The virtue | STATUS: CLOSED  **CLOSED** … |
| ROW-W6-2 `no-chat-trpc-in-surface` | w6 `:133` (HIGH) | the WHOLE `isProxyRoot` predicate is unenforced; only a MESSAGE discriminates it, so every count-only row is blind | §4.1 narrowing | STATUS: … |
| ROW-W6-3 `lib/react-origin.ts` (serving `no-forward-ref` · `no-use-context` · `no-context-provider`) | w6 `:157` (HIGH) | both SHARED-READER fences that prevent a repo-wide false accusation are unen | STATUS: CLOSED  **CLOSED — #1999, `2aba9c0ed`**  … |
| ROW-W6-4 `no-manual-autosave-flush` | w6 `:176` | a module-scope pair in a `features/**` file is UNREPORTED and nothing says so; plus two more unenforced fences | §4.1 narrowing | STATUS: CLOSED  ** … |
| ROW-W6-5 `no-manual-token-estimate` | w6 `:195` (HIGH) | five unenforced fences — including BOTH divisor fences that ARE the law's discrimination — and an advertised rename tripwire with NO §4.5 pin | STATUS: CLOSED  **CLOSED — lane `p-ledger-client-residue`, 2026-09-12 (same comm … |
| ROW-W6-6 `no-multiplexed-mutation-error` · `no-manual-autosave-flush` · `zustand-selector-stability` | w6 `:226` | `UNREADABLE` is built by EMBEDDING `MESSAGE`, so a base-message pin can never discr | STATUS: SUPERSEDED  **SUPERSEDED — mechanized, and the practical half closed**  … |
| ROW-W6-7 roster `:289` `no-use-context` · `:262` `no-static-staletime` · `:271` `zustand-selector-stability` | w6 `:269` | one row is stale AND INVERTED (it teaches the name-keyed mechanism the conv | STATUS: CLOSED  **CLOSED — all three, lane `p-ledger-client-residue`, 2026-09-12 … |
| ROW-W6-8 `gate-spelling-twins` (program-wide) | w6 `:285` (HIGH) | the conversion left the #1506 spelling control DEAD for **54 ledger rows**, 7 of them this family's — `loadGates` returns legacy AL | STATUS: CLOSED  **CLOSED** — 91d9a2ab7 (#2031), the suite drives BOTH engines (l … |
| ROW-W6-9 twelve modules | w6 `:309` | Origin-client headers still omit family decisions and legacy/final population comparisons; the waiver-fix spelling defect is repaired. | other (§5b.3) · §5b.5 h | STATUS: FIXED  **FIXED — header repair integrated at `d1d7e88b0`; consolidated v … |
| ROW-W6-10 twelve modules (25 cells) | w6 `:325` | 25 genuinely UNENFORCED narrowings of 59 cuts (42%), each with a built falsifier | §4.1 narrowing | STATUS: CLOSED  **CLOSED — #1999 (`2aba9c0ed`) + … |

### Wave 7 — `home-client` ×14 (`v-audit-wave7-2026-09-12.md`) — 10 rows (0 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt | |
| - | - | - | - | - | - | - |
| ROW-W7-1 `no-effect-on-shared-selection` | w7 `:337` (HIGH — the ANTI-pattern) | FAILS OPEN on the shared reader's third answer: `=== "home"` treats an `unreadable` pointer receiver identically to a | STATUS: CLOSED  **CLOSED — #2016, `eae36a2b8`**  … |
| ROW-W7-2 ten of eleven implementers | w7 `:231` | the #944 THIRD ANSWER is reached in **1 of 11** — the wave-6 correlation reproduces exactly, in a family with no author overlap: the only module tha | STATUS: CLOSED  **CLOSED — #2014, `0a550c91c`**  … |
| ROW-W7-3 `no-untrusted-html-in-main-dom` | w7 `:362` (HIGH) | the attribute-NAME fence is the WHOLE policy and nothing pins it — cutting it makes a D44 SECURITY policy on 1685 files flag `className` | STATUS: CLOSED  **CLOSED — #2039, lane `p-ledger-client-residue`, 2026-09-12 (sa … |
| ROW-W7-4 `no-raw-intl-time` | w7 `:379` | carries `no-raw-matchmedia`'s UNFALSIFIABLE clause WITHOUT the paragraph that makes it honest — and the sibling clause beside it is a genuine gap | §5b.5 he | STATUS: CLOSED  **CLOSED — and the wave's PREMISE is REFUTED. Lane `p-ledger-cli … |
| ROW-W7-5 `no-direct-useform` | w7 `:393` | a CODE COMMENT claims canonical-operation keying that no row proves; not closable by a proof row (`runPass` pins `reviewedGrants: []`) — belongs in the fam | STATUS: CLOSED  **CLOSED — lane `p-ledger-client-residue`, 2026-09-12 (same comm … |
| ROW-W7-6 `render-error-via-battery` | w7 `:410` | a foreign `return` licenses a custom arm — the containment test IS the conversion's correctness claim (it replaced the legacy `getDescendantsOfKind` | STATUS: CLOSED  **CLOSED — lane `p-ledger-client-residue`, 2026-09-12 (same comm … |
| ROW-W7-7 `no-raw-zustand-persist` | w7 `:420` | two more comment-claims with no rows, plus ARM B's zustand-identity fence unfenced; its `fix` is the one reviewed-grant `fix` that names no grant door | STATUS: CLOSED  **CLOSED — all three cells, lane `p-ledger-client-residue`, 2026 … |
| ROW-W7-8 `no-raw-matchmedia` | w7 `:435` | header AND roster both say "All four" permissions against **FIVE** live grant rows, and the stated reason for one ("no coarse-pointer home exists") is now | STATUS: CLOSED  **CLOSED** … |
| ROW-W7-9 `registry-context-via-mint` | w7 `:451` | the family's ONE ordinary policy gives its author no `@orb-waive` spelling, in a module whose own `mustPass[5]` `why` explains at length that the p | STATUS: CLOSED  **CLOSED — #1978** (all 46 ordinary policies now name their exac … |
| ROW-W7-10 `home-client-family.test.ts` | w7 `:461` | the substring trap is unpinned in the one module that avoids it — a future edit folding `MESSAGE` into `UNREADABLE` keeps all three rows green an | STATUS: CLOSED  **CLOSED — lane `p-ledger-client-residue`, 2026-09-12 (same comm … |

### Wave 8 — the SERVER plane, `home-server` 11 + `origin-server` 14 (`v-audit-wave8-2026-09-12.md`) — 10 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W8-1 `bus-channel-primitive` | w8 `:140` (HIGH) | the canonical `exportedName` half of the identity fence is UNENFORCED (falsified: a barrel re-exporting `setMaxListeners as EventEmitter`) | §4. | STATUS: CLOSED  **CLOSED** … |
| ROW-W8-2 `sole-env-reader` | w8 `:162` (HIGH) | the `node:process` DOOR comparison is UNENFORCED and the ambient half is unfalsified beside it — **the only clause of the identity reader any row enfo | STATUS: CLOSED  **CLOSED … |
| ROW-W8-3 `single-stream-transport` | w8 `:239` (HIGH) | the ENTIRE fail-closed branch is DEAD — reached by none of its 8 rows, and its comment asserts two properties that are both unproven | §4.1 na | STATUS: CLOSED  **CLOSED — `250c9eb60` (#2041), NOT this lane's work**  … |
| ROW-W8-4 `no-raw-clock` · `no-raw-random` | w8 `:247` | both advertise a fail-closed unreadable arm no row reaches; the acquittal half IS proven, the refusal half is not | §4.1 narrowing | STATUS: C … |
| ROW-W8-5 `bus-channel-primitive` | w8 `:253` | two dead branches; the header's sentence *"A construction that PROVABLY binds another declaration is a different class and passes"* is enforced by noth | STATUS: CLOSED  **CLOSED** … |
| ROW-W8-6 `content-part-seam` | w8 `:261` (HIGH — the wave's ANTI-pattern) | declares two visitor kinds its subject can NEVER produce — `ChatContentPart` is `export type`, and `PropertyAccessExpressi | STATUS: CLOSED  **CLOSED** … |
| ROW-W8-7 seven of ten reviewed-grant policies | w8 `:289` (HIGH) | NO §4.3 grant pin anywhere — and `home-server-family.test.ts`'s own header claims grant liveness for "every policy here" while it h | STATUS: CLOSED  **CLOSED — TEN of ten, and held TOTAL**  … |
| ROW-W8-8 `owner-role-split` | w8 `:326` | the withholding claim is unenforced while its TWIN's identical claim is pinned; "the twin's pin covers me" is not a receipt | §4.5 pin | STATUS: CLOSED  **C … |
| ROW-W8-9 all 25 | w8 `:337` | §5b.5 fails **25 of 25** — no FAMILY line, no POPULATION PORT, no legacy SHA; 20 of 25 declare a singleton family with no reason | §5b.5 header | STATUS: CLOSED  **CLOS … |
| ROW-W8-10 14 ordinary (origin-server) | w8 `:369` | §5b.3 — `fix` names the exact waiver spelling in **3 of 14** | other (§5b.3) | STATUS: SUPERSEDED  **SUPERSEDED — mechanized (`policy-waiver-spell … |

### Wave 9 — `origin-server` ×14, closing wave 8's open axes (`v-audit-wave9-2026-09-12.md`) — 10 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W9-1 `discovery-no-stats-rollups` · `membership-enforcer` · `providers-runner-seal` · `turn-identity` · `vector-scope-derived` | w9 `:90` (HIGH — the wave) | **FIVE CONFIRMED FALSE POSITIVES ON | STATUS: CLOSED  **CLOSED — #2006, `ae2e935d3`**  … |
| ROW-W9-2 `bounded-list-limit` · `test-mock-doctrine` · `byte-check-cast` | w9 `:196` (HIGH — the ANTI-pattern) | the "IDENTITY COUNTERFACTUAL" `mustPass` row is built from a LOCAL object, so it fals | STATUS: CLOSED  **CLOSED — all three (#2046, lane `p-ledger-origin-server`, 2026 … |
| ROW-W9-3 `persistence-no-in-memory-state` | w9 `:341` (HIGH) | the FAIL-CLOSED report line is DEAD, and the `mustFlag` row LABELLED "FAIL-CLOSED" flags through a DIFFERENT arm | §4.1 narrowing | STA | STATUS: CLOSED  **CLOSED — #2041, `250c9eb60`**  … |
| ROW-W9-4 `membership-enforcer` | w9 `:357` | advertises a fail-closed unreadable door no row reaches; its near-twin `discovery-no-stats-rollups` HAS the row | §4.1 narrowing | STATUS: CLOSED  **CLOS … |
| ROW-W9-5 `no-await-db-in-loop` | w9 `:364` (HIGH) | the "FUNCTION BOUNDARY" declared-limit row contains NO LOOP, so the boundary stop it advertises is proven by nothing; the row proves the absence o | STATUS: CLOSED  **CLOSED — #2046, lane `p-ledger-origin-server`, 2026-09-12**  … |
| ROW-W9-6 `bounded-list-limit` · `no-direct-reports-write` · `no-handwritten-wire-json-schema` · `no-hardcoded-side-gen-sampling` | w9 `:385` | a byte-identical `propertyName` helper is COPIED four t | STATUS: CLOSED  **CLOSED — #2046, lane `p-ledger-origin-server`, 2026-09-12**  … |
| ROW-W9-7 14 modules (34 cells) | w9 `:262` | 34 genuinely UNENFORCED narrowings of 107 cuts (32%). Two recurring shapes account for 20: **population fences** (9 of 14 modules carry an unexercised `n | STATUS: CLOSED  **CLOSED — 32 of 34 pinned; 2 UNFALSIFIABLE with the constructio … |
| ROW-W9-8 `vector-scope-derived` | w9 `:426` | wave 8's "78 rows carry `token` (every origin-server row)" is WRONG — two rows carry `expect: { count: 2 }` with no `token`, on a byte-identical tree | | STATUS: CLOSED  **CLOSED … |
| ROW-W9-9 `vector-scope-derived` (the two rows themselves) | w9 `:426` residual | the two `expect: { count: 2 }` rows carry no `token`, left explicitly UNADJUDICATED by the row above | §4.1 narrowing | STATUS: DISSOLVED  **DISSOLVED** … |
| ROW-W9-10 `vector-scope-derived` (the WRITE arm) | #2057 (HIGH — a FOURTH polarity) | the WRITE arm read the sealed verdict RAW (`kind === "sealed"`) and was SILENT on `unreadable`, so an insert/upd | STATUS: CLOSED  **CLOSED — #2057, lane `p-ledger-origin-server`, 2026-09-12**  … |

### Wave 10 — the BUS plane + `id-brand-flow` (`v-audit-wave10-2026-09-12.md`, unmerged at `fca7c9b42`) — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W10-1 `no-raw-id` | w10 `:136` (HIGH — the ANTI-pattern) | its hand-rolled `isZodString` identity reader is **BLIND to a one-hop re-export door** where its family sibling `no-mint-via-cast` (usi | STATUS: CLOSED  **CLOSED — #2009, `9d56aed79`**  … |
| ROW-W10-2 `brand-in-name-position` | w10 `:205` (HIGH) | the roster row publishes a **RETIRED marker vocabulary** (`@foreign-id-ok`), so an author who follows it writes a marker no reader parses and | STATUS: CLOSED  **CLOSED — #2010 / #2047 (lane `p-ledger-bus-brand`)**  … |
| ROW-W10-3 `id-brand-flow` ×5 | w10 `:180` | the #944 THIRD ANSWER is ABSENT from the whole family, and **two modules fail OPEN** — `no-mint-via-cast` returns `false` on an unresolved origin in a **h | STATUS: CLOSED  **CLOSED — #2041, `250c9eb60`** (verified, not inherited)  … |
| ROW-W10-4 `bus-on-data-no-store-write` | w10 `:225` | the outer carrier fence is pinned and BOTH discriminating halves — WHICH handler, WHICH member — are not; the red on the outer cut is carried en | STATUS: CLOSED  **CLOSED — #2047 (lane `p-ledger-bus-brand`)**  … |
| ROW-W10-5 11 cells + 3 uncovered arms | w10 `:158` | 11 genuinely UNENFORCED narrowings + 3 UNCOVERED ARMS (14 of 47, 30%), six with a built falsifier ready to paste | §4.1 narrowing | STATUS: CLOSE … |
| ROW-W10-6 `brand-in-name-position` | w10 `:481` | the message's "at this boundary" clause is untrue of one of its own two live real-tree findings (a type argument to `toEqualTypeOf` is not a boundar | STATUS: CLOSED  **CLOSED — #2047 (lane `p-ledger-bus-brand`)**  … |
| ROW-W10-7 six ordinary policies | w10 `:257` | §5b.3 — `fix` names the spelling in 2 of 6 | other (§5b.3) | STATUS: CLOSED  **CLOSED — #1978** (all 46 ordinary policies now name their exact waiver s … |
| ROW-W10-8 `no-fake-disabled-id` · `no-mint-via-cast` · `no-loose-id-cast` | w10 `:274` | three bare-`count` rows whose `why` claims WHICH node flags; two are proven pinnable TODAY at zero cost (the | STATUS: CLOSED  **CLOSED — #2047 (lane `p-ledger-bus-brand`)**  … |
| ROW-W10-9 `brand-in-name-position` · `bus-fact-health` | w10 `:242` | **NOT DEFECTS — two roster claims the wave expected to be lies and PROVED TRUE by a planted break.** The blindness tripwire MOVE | STATUS: CLOSED  **CLOSED** — N/A, recorded so nobody re-opens them  … |

### The gate-batch verifier (`v-gate-batch-2026-09-12.md`) — the four exemplar lanes — 8 rows (0 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-THE-GATE-BATCH-VERIFIER-V-GA-1 `tooling/src/stack/ops/engines-ctl.ts` | gb `:44` (HIGH) | `p-caught-failure` DELETED a live legacy marker instead of translating it — a LOST SUPPRESSION, and the | STATUS: CLOSED  **CLOSED** … |
| ROW-THE-GATE-BATCH-VERIFIER-V-GA-2 `Core-Enforcement-Active-Gates.md` | gb `:76` (HIGH) | `p-keyset` did not do its ratified coupled site: the count line was stale and `freeze-provenance-write-pairi | STATUS: CLOSED  **CLOSED** … |
| ROW-THE-GATE-BATCH-VERIFIER-V-GA-3 `freeze-provenance-write-pairing` | gb `:105` | §4.1 UNENFORCED: `memberPath.length === 0` — a MEMBER of the table binding is not "ours", and no row places a membe | STATUS: CLOSED  **CLOSED — `cdec4e3da`**  … |
| ROW-THE-GATE-BATCH-VERIFIER-V-GA-4 `lib/caught-failure.ts` | gb `:137` | §4.1 UNENFORCED: the `finally`-block owner clause — and **the module's own `message` ASSERTS it** (`"a catch block (and its f | STATUS: CLOSED  **CLOSED** — cdec4e3da, caught-failure-ownership.ts:899-905 is t … |
| ROW-THE-GATE-BATCH-VERIFIER-V-GA-5 `detached-work-traced.ts` | gb `:173` | orphan export `hasLiveDetachedSwallowOwner` left by the retired `@swallowed-ok` arm; invisible to knip | other | STATUS: CL … |
| ROW-THE-GATE-BATCH-VERIFIER-V-GA-6 `lib/drizzle-write-target.ts` | gb `:187` | a new shared reader with ONE consumer and NO test file, asymmetric with its own sibling `lib/authored-key-set.ts` lande | STATUS: CLOSED  **CLOSED** … |
| ROW-THE-GATE-BATCH-VERIFIER-V-GA-7 `contract/population.ts` (batch-wide) | gb `:201` | `@showcase` was added as a root but NOT to `@authored`, which is a literal nine-root list — so `packages/showca | STATUS: CLOSED  **CLOSED** — 03dd7329e (#1980), contract/population.ts:31-60 der … |
| ROW-THE-GATE-BATCH-VERIFIER-V-GA-8 `ops/conformance.int.test.ts:343` | gb `:241` | `expected 749 to be greater than 1000` — a hard-coded LEGACY denominator that every conversion pushes further down, | STATUS: CLOSED  **CLOSED — #1969, `52bcdbc7f`**  … |

### cb-v-hooks-wave — the four 2026-09-12 mixed-hook merges (`v-hooks-wave-2026-09-12.md`) — 3 rows (0 OPEN, 3 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-HOOKS-WAVE-1 `tooling-instrument-proof` | hw §REFUTED D1 | 0 → **654** unsuppressible hard findings on the real tree, 582 anchored on ambient builtins (`String` 259, `JSON` 89, `Promise` 78 | STATUS: CLOSED  **CLOSED — lane `p-hooks-wave-refute`, 654 → 0 on the real tree. … |
| ROW-CB-V-HOOKS-WAVE-2 `design-audit-rule-proof` | hw §REFUTED D2 | BLIND on the real tree: its one finding is its own tripwire ("no rule ids were readable from `DESIGN_AUDIT_RULES`") against a 62-ro | STATUS: CLOSED  **CLOSED — lane `p-hooks-wave-refute`, as the ruled CLASS fix. L … |
| ROW-CB-V-HOOKS-WAVE-3 `no-inline-union-redecl` (real tree) | hw §Caveat | "legacy 12 = final 12 at identical sites" is **15** on main: the 9 pre-wave sites survive byte-identical, plus SIX `"<x>" \| | STATUS: CLOSED  **CLOSED — #2051, lane `p-hooks-wave-refute`, 15 → 9 on the real … |

### cb-v-ledger-fixes — the twelve #1584 Verify-column rows (`v-ledger-fixes-2026-09-12.md`) — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-LEDGER-FIXES-1 `structure-mixed.suite.int` | cb-v-ledger-fixes `tests/tooling/verify/ops/structure-mixed.suite.int.test.ts:100` | the suite asserts `ran 3/3 active gate(s) (1/1 legacy · 2/2 | STATUS: CLOSED  **CLOSED** — 91d9a2ab7 (#2052); the suite plants its own authore … |
| ROW-CB-V-LEDGER-FIXES-2 `over-art-plate-arm` | cb-v-ledger-fixes `tests/tooling/verify/gates/over-art-plate-arm.int.test.ts:137` | the pin asserts `{ severity: "warning", workItem: 626 }`; `17a495fb | STATUS: CLOSED  **CLOSED** — 91d9a2ab7; over-art-plate-arm.int.test.ts no longer … |
| ROW-CB-V-LEDGER-FIXES-3 `dangling-refs` (roster docs) | cb-v-ledger-fixes `docs/architecture/core/Core-Enforcement-Active-Gates.md:87,89,95,97,99,128` + `Core-Tooling-Law.md:73,230,259` | nine phant | STATUS: CLOSED  **CLOSED** — dangling-refs.repo.int run at 61cae0710 reports 20  … |
| ROW-CB-V-LEDGER-FIXES-4 `gate-runtime-standardization` | cb-v-ledger-fixes `docs/design/gate-runtime-standardization.md:539` | the §4.1 "UNFALSIFIABLE owes a constructed fixture" paragraph teaches i | STATUS: CLOSED  **CLOSED** — 91d9a2ab7; guide §4.1 writes the fixture path as <a … |
| ROW-CB-V-LEDGER-FIXES-5 `vector-scope-derived` | cb-v-ledger-fixes `tooling/src/verify/gates/vector-scope-derived.ts:80,86` | the WRITE arm (`vectorTableArgument`) still reads the sealed VERDICT raw | STATUS: CLOSED  **CLOSED** — b36f782a8 (#2057), vector-scope-derived.ts:121-125  … |
| ROW-CB-V-LEDGER-FIXES-6 `policy-proof-expectations` | cb-v-ledger-fixes `tooling/src/verify/gates/policy-proof-expectations.ts` (enforcer worklist) | the enforcer's real-tree residue is **50**, not | STATUS: CLOSED  **CLOSED — lane `p-enforcer-and-render`, 2026-09-12.** RE-DERIVE … |
| ROW-CB-V-LEDGER-FIXES-7 `#2001` (the exemption's own text) | cb-v-ledger-fixes `#2001` body | *"Each of the 11 carries `token` + an arm-specific `messageIncludes`"* is FALSE for three of them, and t | STATUS: CLOSED  **CLOSED — lane `p-enforcer-and-render`, 2026-09-12.** both corr … |
| ROW-CB-V-LEDGER-FIXES-8 `no-inline-types` | w5 (the ledger's one UNADJUDICATED row) | wave 5's real-tree finding count could not be adjudicated because `check:structure` was fenced | other | STATUS: … |
| ROW-CB-V-LEDGER-FIXES-9 `#2000` | cb-v-ledger-fixes `tests/tooling/verify/gates/split-arm-parity.test.ts` | the row's re-scoped spec is Tier 2a + 2b + 2c + a Tier 3 ruling; only Tier 2a landed | §4. | STATUS: CLOSED  **CLOSED** — #2000 bounded spec: c97de9d2f / ef044b12e contain T … |

### cb-v-mixed-hooks-1-3 — the §12.6 split groups 1–3 (`v-mixed-hooks-1-3-2026-09-12.md`) — 10 rows (0 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-MIXED-HOOKS-1-3-1 `tooling-argv-front-door` | mixed-hooks g2 `e2b183b80` · `tooling/src/verify/lib/process-member-origin.ts:32-48` | member-name-only prefilter admits every `x["argv"]`; the | STATUS: CLOSED  **CLOSED — #2058, lane `p-hooks-wave-refute`, 2 → 0 on the real  … |
| ROW-CB-V-MIXED-HOOKS-1-3-2 `origin-verdict` (shared) | mixed-hooks g2 · `tooling/src/verify/lib/origin-verdict.ts:29-31` | `leafIdentifier` unwraps only `PropertyAccessExpression`, so `bindsProvenNo | STATUS: CLOSED  **CLOSED … |
| ROW-CB-V-MIXED-HOOKS-1-3-3 `session-channel-boundary` | mixed-hooks g1 `f1bbc34e7` · `tooling/src/verify/gates/session-channel-boundary.ts:81` | the UNREADABLE message ends without a doc/code pointe | STATUS: CLOSED  **CLOSED — lane `p-hooks-wave-refute`**: the UNREADABLE text now … |
| ROW-CB-V-MIXED-HOOKS-1-3-4 `broadcast-channel-origin` | mixed-hooks g1 `f1bbc34e7` · `tooling/src/verify/lib/broadcast-channel-origin.ts:34` | exported inline 3-member string-literal union type alia | STATUS: CLOSED  **CLOSED** — both halves, in two lane commits. `no-inline-union- … |
| ROW-CB-V-MIXED-HOOKS-1-3-5 `process-member-origin` | mixed-hooks g2 `e2b183b80` · `tooling/src/verify/lib/process-member-origin.ts:29` | same exported inline union — new `no-inline-types` AND `no-in | STATUS: CLOSED  **CLOSED** — both halves; same two commits and the same move  … |
| ROW-CB-V-MIXED-HOOKS-1-3-6 `tooling-argv-front-door` | mixed-hooks g2 `e2b183b80` · `tooling/src/verify/gates/tooling-argv-front-door.ts:109` | the UNREADABLE message ends without a pointer — a new | STATUS: CLOSED  **CLOSED — lane `p-hooks-wave-refute`**: the UNREADABLE text now … |
| ROW-CB-V-MIXED-HOOKS-1-3-7 `session-channel-boundary-health` | mixed-hooks g1 `f1bbc34e7` · `:78,:87,:96` | all three `mustFlag` rows assert `messageIncludes: "is BLIND"` on a ONE-message module — t | STATUS: CLOSED  **CLOSED — lane `p-hooks-wave-refute`: the three rows DROP the ` … |
| ROW-CB-V-MIXED-HOOKS-1-3-8 `tooling-argv-front-door-health` | mixed-hooks g2 `e2b183b80` · `:78,:87,:96,:106,:115` | five `mustFlag` rows assert `messageIncludes: "blind gate"` on a ONE-message modu | STATUS: CLOSED  **CLOSED — lane `p-hooks-wave-refute`: all five DROP the `messag … |
| ROW-CB-V-MIXED-HOOKS-1-3-9 `tooling-ops-direct-invocation` | mixed-hooks g1 `f1bbc34e7` · `:119` | one `mustFlag` row with a whole-message `messageIncludes` | non-discriminating proof row (#1968) | | STATUS: CLOSED  **CLOSED — `874b34b58` (#1968/#2025): the ceremony discriminator … |
| ROW-CB-V-MIXED-HOOKS-1-3-10 `sub-floor-disclosure` | mixed-hooks g3 `6563946a0` · roster row `Core-Enforcement-Active-Gates.md:284` | the row says the `@sub-floor-ok` grammar "RETIRED" without notin | STATUS: CLOSED  **CLOSED** — `7801bd189` (board #2191): roster row 284 now names … |

### cb-v-instruments — the instrument sweep (`v-instruments-2026-09-12.md`) — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-INSTRUMENTS-1 `policy-proof-expectations` | cb-v-instruments `lib/policy-descriptor-read.ts:214` | ARM M's TAUTOLOGY arm FALSE-POSITIVES on a module whose two texts come from ONE report cal | STATUS: CLOSED  **CLOSED — lane `p-enforcer-and-render`, 2026-09-12.** `messageA … |
| ROW-CB-V-INSTRUMENTS-2 `contract-banned-shapes` | w3 `:216` | `mustFlag[6]` cannot discriminate the two §4.6 arms; ARM M was blind to the call-composed message | §4.1 narrowing | STATUS: CLOSED  **C … |
| ROW-CB-V-INSTRUMENTS-3 `gates/_proof/node-types.ts` · design `gate-runtime-standardization.md` §4.8b | cb-v-instruments (#2037) | BOTH the plant's header and §4.8b claim the corpus "exercises both b | STATUS: CLOSED  **CLOSED — lane `p-enforcer-and-render`, 2026-09-12.** the sente … |
| ROW-CB-V-INSTRUMENTS-4 `tests/tooling/verify/ops/policy-conformance-stage.int.test.ts` | cb-v-instruments (#1969) | the sibling of the retired `compared > 1000` floor was BUMPED `8→9` / `10→11` rath | STATUS: CLOSED  **CLOSED** — 91d9a2ab7 (#1969), policy-conformance-stage.int.tes … |
| ROW-CB-V-INSTRUMENTS-5 `tests/tooling/verify/ops/conformance.int.test.ts` | cb-v-instruments (#1969) | the new property's comment claims both denominators are *"derived independently of the sweeps' | STATUS: CLOSED  **CLOSED** — #2322: ff95a161d corrects both coupled independence … |
| ROW-CB-V-INSTRUMENTS-6 `gate-modernization` ARM E | cb-v-instruments (#1958) | `ctx.checker()` under `analysis: "syntax"` is caught only by a RUNTIME throw, so an unexecuted branch is caught by no t | STATUS: CLOSED  **CLOSED — lane `p-enforcer-and-render`, 2026-09-12.** `TYPE_REA … |
| ROW-CB-V-INSTRUMENTS-7 `no-array-literal-querykey` | w? (#1994) | still the only one of #1994's nine with no family test anywhere | §4.2 identity home | STATUS: CLOSED  **CLOSED** — 1a5c348eb (#1994 … |
| ROW-CB-V-INSTRUMENTS-8 design `gate-runtime-standardization.md` §12.5 | cb-v-instruments (#2025) | *"Five policies declare `warning`, and **THREE** of them are `authority: "hard"`"* contradicts the | STATUS: CLOSED  **CLOSED** — 8c7ca5e9f; guide §12.5 reads FOUR hard warning poli … |
| ROW-CB-V-INSTRUMENTS-9 `tests/server/entry/compose/chat.int.test.ts` | cb-v-instruments | the D53 ReDoS-watchdog test is load-fragile: it consumed 7634 ms of its 10000 ms budget on a QUIET re-run an | STATUS: CLOSED  **CLOSED — #2192**, `a5f33a0e1`/`cce850dc1`/`d63153446`; indepen … |

### cb-v-world-gates — the §12.7 world-program guarantees (`v-world-gates-2026-09-12.md`) — 10 rows (1 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WORLD-GATES-1 `biome-grant-liveness` | cb-v-world-gates · `lib/biome-rule-liveness.ts:284`, `:169` | arm six (RULE liveness, #1158) WRITES `__g_biome-rule-liveness.<pid>.json` into the REPO | STATUS: CLOSED  **CLOSED** — a5abe00d7 (#2074); arm six is now the config:biome- … |
| ROW-CB-V-WORLD-GATES-2 `test-presence` | cb-v-world-gates · `test-presence.baseline.json`, `exception-authority-census.md:135` | the baseline's 2 rows are LIVE debt whose cited burn-down work item * | STATUS: CLOSED  **CLOSED — the DEMAND was the defect, lane `p-mirror-index-conve … |
| ROW-CB-V-WORLD-GATES-3 `eslint-grant-liveness` · `depcruise-grant-liveness` · `runner-config-path-liveness` | cb-v-world-gates · `eslint-grant-liveness.ts:21`, `depcruise-grant-liveness.ts:52,74`, `runner-config-path-liveness.ts:106` | three FINAL world-program modules carry gate-owned `ExemptionTable`s that §12.5 ("gate modules receive neither grant tables nor marker parsers") and §3 ("no gate-owned exemption table") forbid. Two are live suppressors, not carry-forward stubs: `eslint-grant-liveness.ts:72-74` does `RATIFIED[key] → continue`, and depcruise hands `ratified: RATIFIED` to the shared reconciler at `:261` | §5b.7 forbidden | STATUS: OPEN  **OPEN — subsumed by #1922** (2 of 3 remain; re-derived 2026-09-18) | `runner-config-path-liveness` ExemptionTable removed by `df6a163b8`; `eslint-grant-liveness` (1 ExemptionTable ref) and `depcruise-grant-liveness` (1 ExemptionTable ref) still carry the table. Census rows `exception-authority-census.md:98,99,163` |
| ROW-CB-V-WORLD-GATES-4 `refutation-ledger-2026-09-12.md` | cb-v-world-gates · `refutation-ledger-2026-09-12.md:364-370` | **the "TEN FINAL modules still carry a legacy `ExemptionTable`" census is wr | STATUS: CLOSED  **CLOSED** — census corrected against `d6b895775`: two declaring … |
| ROW-CB-V-WORLD-GATES-5 `#1947` | cb-v-world-gates · board row #1947 | the issue is OPEN at P1 asserting two shipped conversions "exit 2 on the real repo while their isolated proofs pass". **Closed o | STATUS: CLOSED  **CLOSED** — board #1947 is Done (lane p-native-config-fix); the … |
| ROW-CB-V-WORLD-GATES-6 `gate-runtime-read-first.md` | cb-v-world-gates · `gate-runtime-read-first.md` §0.3 and §2 | two settled-facts statements are stale, and §2's heading is literally **"What NOT | STATUS: CLOSED  **CLOSED** — `562a22a92` removed the false legacy statement from … |
| ROW-CB-V-WORLD-GATES-7 `mirror-index` kind | cb-v-world-gates · `contract/resource-mirror.ts`, `ops/resource-mirror.ts` | a SHIPPED frozen kind with **ZERO gate consumers** — `grep -rn 'mirror-index | STATUS: CLOSED  **CLOSED — wired, lane `p-mirror-index-convert` (#2061)**  … |
| ROW-CB-V-WORLD-GATES-8 `test-layout` | cb-v-world-gates · `tests/tooling/` (absence) | §12.7 row 1's required proof ("unsupported test-shaped names fail, **including in helper trees**") is held by N | STATUS: CLOSED  **CLOSED — lane `p-mirror-index-convert` (#2061)**  … |
| ROW-CB-V-WORLD-GATES-9 `scripts/ts7.cjs` | cb-v-world-gates · §12.7 row 14 | half (a) of the required proof — "warm/changed/restored produce green/red/green **without deleting caches**" — has no com | STATUS: CLOSED  **CLOSED — #2193**, `1d97b71df`; real-wrapper green/red/green pl … |
| ROW-CB-V-WORLD-GATES-10 `#2021` disposition comment | cb-v-world-gates · issue #2021 comment 2026-09-12T12:37Z | the comment tells a lane to convert `tsconfig-entry-liveness` "against `json`/`author | STATUS: SUPERSEDED  **SUPERSEDED** — the subject is gone: tsconfig-entry-livenes … |

### cb-v-night-conversions — the seven 2026-09-12 night conversions (`v-night-conversions-2026-09-12.md`) — 4 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-NIGHT-CONVERSIONS-1 `no-hardcoded-model-prose` | `04e455f4d` · `tooling/src/verify/gates/no-hardcoded-model-prose.ts` + 5 product files (`packages/server/src/domain/automation/engine/analys | STATUS: CLOSED  **CLOSED** — 91d9a2ab7; 15 @orb-waive no-hardcoded-model-prose m … |
| ROW-CB-V-NIGHT-CONVERSIONS-2 `integer-line-boxes` | `a0807ce47` · `packages/ui/src/charts/meter/variants.ts:307,309,311` · `packages/ui/src/markdown/markdown.tsx:257` | 4 live central `@orb-gate-ign | STATUS: CLOSED  **CLOSED** — 91d9a2ab7; the four sites carry @orb-waive integer- … |
| ROW-CB-V-NIGHT-CONVERSIONS-3 `surface-in-a-container-health` | `ff07e1302` · `tooling/src/verify/gates/surface-in-a-container-health.ts` (`mustPass[2]`) | the `${EXEMPT_DIR}/` prefix fence is unenfo | STATUS: CLOSED  **CLOSED — repaired by lane `p-ledger-client-residue`, 2026-09-1 … |
| ROW-CB-V-NIGHT-CONVERSIONS-4 `class-token-splice` | `e8e4d85b7` · `tooling/src/verify/gates/class-token-splice.ts:179` | the `CLASS_ATTRIBUTE` attribute-NAME half of `carrierVerdict` is pinned by no | STATUS: CLOSED  **CLOSED — repaired by lane `p-ledger-client-residue`, 2026-09-1 … |

### p-suite-honesty — the instrument-honesty lane (2026-09-12) — 12 rows (0 OPEN, 12 CLOSED)

Every row here is a SUITE or an INSTRUMENT that was lying or silent, not a converted policy. The shared
shape: **a test asserting a number or a membership that another lane's correct work invalidates**, plus two
conversions that dropped their own marker translation. All of it was unobservable because `tests/tooling/**`
is `--full`-only (#1842) and nothing runs `--full` on a cadence.

| subject | defect | class | state | receipt |
| - | - | - | - | - |
| ROW-P-SUITE-HONESTY-1 `integer-line-boxes` (#2043) | four legacy `@orb-gate-ignore` markers were never translated at `a0807ce47`, so under §7's routing fence they bound to nothing and four legitimat | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#2043)** — four translated `@orb-waive`  … |
| ROW-P-SUITE-HONESTY-2 `no-hardcoded-model-prose` (#2064) | same defect at `04e455f4d`: 16 private `PROSE-OK` markers untranslated, **15 blocking on main**; the 16th (`packages/contracts/src/rpg/view | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#2064)** — 15 translated `@orb-waive` ma … |
| ROW-P-SUITE-HONESTY-3 `json-column-write-parity` (#2044) | its stale-sweep `mustFlag` row hardcoded `count: 7` against **10** live exemption rows (ALLOWLIST 6 + GUARD_EXEMPT 4); red about a week uns | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#2044)** — the count derives from `Objec … |
| ROW-P-SUITE-HONESTY-4 `gate-spelling-twins.int` (#2031) | keyed on `loadGates()` — the LEGACY remnant alone — so every conversion shrank its subject silently: 54 of 79 ledger names had converted, th | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#2031)** — re-expressed over the mixed c … |
| ROW-P-SUITE-HONESTY-5 `_load-budget` scaling (#1985) | `readBoxLoad` divided a box-wide loadavg by `cpus().length` (24) while `.claude/hooks/cpu-fence.sh` (#1835) caps each session tree at CPUQuota | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#1985)** — the denominator is the minimu … |
| ROW-P-SUITE-HONESTY-6 `_load-budget` (#1985, repair 1) | the row named two missing `scaledBudget` call sites | **premise dead on today's tree** | STATUS: CLOSED  **CLOSED — no source change (#1985)* … |
| ROW-P-SUITE-HONESTY-7 `structure-mixed.suite.int` (#2052) | its 3-file probe corpus shimmed the LIVE `assumes-single-replica` as its only legacy carrier; `04e455f4d` converted it, `legacy:` became ` | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#2052)** — the probe carries its own aut … |
| ROW-P-SUITE-HONESTY-8 `over-art-plate-arm.int` (#2053) | asserted `workItem` 626 after `17a495fb8` re-homed the debt to 2024 — a value change that never grepped its literal | a literal another lane' | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#2053)** removed the stale literal and i … |
| ROW-P-SUITE-HONESTY-9 `policy-conformance-stage.int` (#1969, refuted) | its first repair replaced one hardcoded corpus denominator with ANOTHER and then bumped it 8→9 and 10→11 — the exact rot the r | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#1969)** — every proof-row count derives … |
| ROW-P-SUITE-HONESTY-10 `dangling-refs.repo.int` (#2054) | 10 phantom cites in LIVING law docs: six constants deleted by the front-door and plumbing splits, still cited by `Core-Enforcement-Active-Ga | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#2054)** — nine constant cites became me … |
| ROW-P-SUITE-HONESTY-11 `pnpm lint:eslint <paths>` (#2056) | exits 3 with a bare "takes no arguments" — a dead end, because the whole-repo verb genuinely takes none and the scoped answer is a DIFFERE | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#2056)** — the no-tail grammar carries ` … |
| ROW-P-SUITE-HONESTY-12 `check:docs` / `format:docs` (#2059) | ONE population (`formatTargets`) serves both doors and it was `docs/architecture/**` alone, so `docs/design/**` and `docs/reviews/**` we | STATUS: CLOSED  **CLOSED — `91d9a2ab7` (#2059)** — `formatTargets` admits tracke … |

### cb-v-ledger-wave — the five merged ledger lanes (`v-ledger-wave-2026-09-12.md`) — 4 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-LEDGER-WAVE-1 `no-raw-zustand-persist` | `cb-v-ledger-wave` `tooling/src/verify/gates/no-raw-zustand-persist.ts:204-217` | **ARM C fails OPEN on an unreadable receiver** while ARM A (`:138` | STATUS: CLOSED  **CLOSED** — da79208b3 (#2050); ARM C fails closed at no-raw-zus … |
| ROW-CB-V-LEDGER-WAVE-2 `lib/reference-fact-writes.ts` | `cb-v-ledger-wave` `tooling/src/verify/lib/reference-fact-writes.ts` (`isReadOnlyInvocation`) | **`members.length === 1` is an UNENFORCED §4.1 | STATUS: CLOSED  **CLOSED — #2058 follow-up, lane `p-hooks-wave-refute`. THE REFU … |
| ROW-CB-V-LEDGER-WAVE-3 `bus-belt-total` · `bus-producer-coverage` | `cb-v-ledger-wave`, against `ee6dab949`'s commit message | the commit claims *"§5b.5 headers on all 9 touched modules: FAMILY + PO | STATUS: CLOSED  **CLOSED** — 8bf81b7e2 (#2047); bus-belt-total.ts:19/:26 and bus … |
| ROW-CB-V-LEDGER-WAVE-4 `no-untyped-soft-ref` | `cb-v-ledger-wave` `tooling/src/verify/gates/no-untyped-soft-ref.ts:51-64,82` | declares a distinct `UNREADABLE` const and passes it as `unreadableMess | STATUS: CLOSED  **CLOSED** — 4096bc3a9; no-untyped-soft-ref.ts:42 is now UNREADA … |

### cb-v-suite-honesty — the eleven instrument repairs (`v-suite-honesty-2026-09-12.md`) — 3 rows (0 OPEN, 3 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-SUITE-HONESTY-1 `over-art-plate-arm` | cb-v-suite-honesty L1 · `over-art-plate-arm.ts` `workItem: 2024` | the warning debt points at a **CLOSED** issue again (#2024 closed 2026-09-12T04:26: | STATUS: CLOSED  **CLOSED — #2070**; owner repointed to #2326 at `55437a35e`; der … |
| ROW-CB-V-SUITE-HONESTY-2 the widened docs formatter | cb-v-suite-honesty L2 · `#2059` | the emitter escapes `_` `#` `~` `[` `*` in PROSE, which was always true but #2059 pointed it at the design and | STATUS: CLOSED  **CLOSED — `007c8b837` + `ff5ec76a9` (#2059).** Rechecked at `ff … |
| ROW-CB-V-SUITE-HONESTY-3 both doc doors | cb-v-suite-honesty L3 · `formatTargets` | resolving through `git ls-files` makes an UNTRACKED `.md` neither checked nor formatted — **an undeclared NARROWIN | STATUS: CLOSED  **CLOSED** — 91d9a2ab7; format.ts:35-36 states the tracked-corpu … |

### cb-v-unaudited-finals — 28 never-audited final policies read IN FULL against §5b's seven criteria; 10 REFUTED. (`v-unaudited-finals-2026-09-12.md`) — 17 rows (0 OPEN, 17 CLOSED)

| module | lane · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-UNAUDITED-FINALS-1 `ct-story-single-import` | cb-v-unaudited-finals L1 · `ct-story-single-import.ts:106-116` (`jsxTreeRoot`) | **THE GATE IS BLIND TO A PAIRED ELEMENT — a reproducible false | STATUS: CLOSED  **CLOSED — #2077, lane `p-unaudited-fix-a`, `0060ec324`**  … |
| ROW-CB-V-UNAUDITED-FINALS-2 `ct-story-single-import` | cb-v-unaudited-finals L2 · `ct-story-single-import.ts:259-266` (`mustPass[4]`) | **A FALSE PIN riding L1.** The `primitive.ct.tsx` row is cited | STATUS: CLOSED  **CLOSED — #2078, lane `p-unaudited-fix-a`, `0060ec324`**  … |
| ROW-CB-V-UNAUDITED-FINALS-3 `config-anchor-in-registry` | cb-v-unaudited-finals L3 · `config-anchor-in-registry.ts:51-54` (`isAnchorCall`) | **THE FOURTH POLARITY: an accusing arm whose predicate is | STATUS: CLOSED  **CLOSED — #2079, lane `p-unaudited-fix-a`, `0060ec324`**  … |
| ROW-CB-V-UNAUDITED-FINALS-4 `config-anchor-in-registry` | cb-v-unaudited-finals L4 · `lib/reviewed-grants.ts:122,130` | **a reviewed-grant policy with TWO live grant rows and NO §4.3 grant-identity | STATUS: CLOSED  **CLOSED — #2080, lane `p-unaudited-fix-a`, `0060ec324`**  … |
| ROW-CB-V-UNAUDITED-FINALS-5 `serde-core-seal-health` | cb-v-unaudited-finals L5 · `serde-core-seal-health.ts:67-71` | **the accusation's SUBJECT IDENTITY is unpinned: reporting the WRONG sanctioned | STATUS: CLOSED  **CLOSED — #2081, lane `p-unaudited-fix-a`, `0060ec324`**  … |
| ROW-CB-V-UNAUDITED-FINALS-6 `serde-core-seal-health` | cb-v-unaudited-finals L6 · `serde-core-seal-health.ts:52` | the byte-surgery IDENTITY fence is unenforced: replacing `pngChunkImport(node) !== | STATUS: CLOSED  **CLOSED — #2082, lane `p-unaudited-fix-a`, `0060ec324`**  … |
| ROW-CB-V-UNAUDITED-FINALS-7 `component-size` | cb-v-unaudited-finals L7 · `component-size.ts:18,33` (`CAP_ROUTE`) | **the route-cap branch is entirely unexercised — dead by fixture, in BOTH directio | STATUS: CLOSED  **CLOSED — #2083, lane `p-unaudited-fix-a`, `0060ec324`**  … |
| ROW-CB-V-UNAUDITED-FINALS-8 `component-size` | cb-v-unaudited-finals L8 · `component-size.ts:22` | the `notNamed` test/spec/gen/`.d.ts` exclusions are unenforced (deleting the whole list: **CLEAN**) | STATUS: CLOSED  **CLOSED — #2084, lane `p-unaudited-fix-a`, `0060ec324`**  … |
| ROW-CB-V-UNAUDITED-FINALS-9 `commented-code` | cb-v-unaudited-finals L9 · `commented-code.ts:16` | **the self-scan fence `notUnder: ["tooling/src/verify/gates/**"]` is unenforced** (dropping it: **C | STATUS: CLOSED  **CLOSED — #2085, lane `p-unaudited-fix-a`, `0060ec324`**  … |
| ROW-CB-V-UNAUDITED-FINALS-10 `commented-code` | cb-v-unaudited-finals L10 · `commented-code.ts:7,26-31` | two further unenforced fences: the `SingleLineCommentTrivia` kind test and the `[;{}]` termi | STATUS: CLOSED  **CLOSED — #2086, `27df4238a`**  … |
| ROW-CB-V-UNAUDITED-FINALS-11 `windowed-infinite-query` | cb-v-unaudited-finals L11 · `windowed-infinite-query.ts:44-45` + `:339` (`mustPass[3].why`) | **the header's §4.1 matrix names a row that doe | STATUS: CLOSED  **CLOSED** — d9d1e3524 (#2087); the matrix cell is corrected at  … |
| ROW-CB-V-UNAUDITED-FINALS-12 `no-form-state-in-useeffect` | cb-v-unaudited-finals L12 · `no-form-state-in-useeffect.ts:169` | no positive §4.2 identity arm: no marker-form `mustPass` row and no fami | STATUS: CLOSED  **CLOSED** — d9d1e3524 (#2088); no-form-state-in-useeffect.ts:18 … |
| ROW-CB-V-UNAUDITED-FINALS-13 `persist-partialize-and-total-migrate` | cb-v-unaudited-finals L13 · `persist-partialize-and-total-migrate.ts:84-90` (`isPersistCall`) | **an ALIASED `persist` inside th | STATUS: CLOSED  **CLOSED** — d9d1e3524 (#2089); the alias mustFlag at :250-252 ( … |
| ROW-CB-V-UNAUDITED-FINALS-14 `contract-derives-not-respells-health` | cb-v-unaudited-finals L14 · `contract-derives-not-respells-health.ts:33` | the header claims TWO death modes ("renamed, deleted, | STATUS: CLOSED  **CLOSED** — d9d1e3524 (#2090); contract-derives-not-respells-he … |
| ROW-CB-V-UNAUDITED-FINALS-15 `contract-derives-not-respells-health` | cb-v-unaudited-finals L15 · `contract-derives-not-respells-health.ts:11` | §5b.4/§5b.7: the "shared reader" is the SIBLING GATE | STATUS: CLOSED  **CLOSED** — d9d1e3524 (#2091/#2096); the five symbols now come  … |
| ROW-CB-V-UNAUDITED-FINALS-16 `ct-poll-schedule-and-paint` | cb-v-unaudited-finals L16 · `ct-poll-schedule-and-paint.ts:23` | the header calls the `hard` occurrence half "the ORDINARY per-occurrence | STATUS: CLOSED  **CLOSED** — d9d1e3524 (#2092); ordinary-as-English removed (:17 … |
| ROW-CB-V-UNAUDITED-FINALS-17 `serde-core-seal` | cb-v-unaudited-finals L17 · `gate-modernization.ts:277-284` vs `serde-core-seal.ts:31` | **AN INSTRUMENT FALSE POSITIVE CREATED BY THE #1584 SPLIT.** | STATUS: CLOSED  **CLOSED** — a5abe00d7 (#2093); gate-modernization.ts:308-330 is … |

### cb-v-authority-census — the per-row current input for #1922. Its §5 chunks C0–C9 REPLACE `p-authority-migration`'s brief. (`v-authority-census-2026-09-12.md`) — 10 rows (0 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-AUTHORITY-CENSUS-1 the `58 X / 2 O` split | cb-v-authority-census L1 · `docs/design/gate-runtime-orchestrator-playbook.md:936` · `docs/design/gate-runtime-read-first.md:128-130` | the figur | STATUS: CLOSED  **CLOSED** — d23150315; playbook:400 and read-first:151 both car … |
| ROW-CB-V-AUTHORITY-CENSUS-2 the authority notation | cb-v-authority-census L2 · `docs/reviews/gate-runtime/uncovered-gate-conversion-census.md:71-72` · `docs/design/gate-runtime-standardization.md:1 | STATUS: CLOSED  **CLOSED** — 3525c6f28 (#2098); uncovered-gate-conversion-census … |
| ROW-CB-V-AUTHORITY-CENSUS-3 `no-blanket-suppression` · `tsconfig-entry-liveness` | cb-v-authority-census L3 · `no-blanket-suppression.ts:17-34` · `tsconfig-entry-liveness.ts:22-24` | both are standi | STATUS: CLOSED  **CLOSED** — d23150315; guide:1103 states the denominator as CON … |
| ROW-CB-V-AUTHORITY-CENSUS-4 `no-test-fabrication` | cb-v-authority-census L4 · `no-test-fabrication.ts:16-19` | its `FABRICATION-OK` grammar is **absent from both censuses** and from guide §7's elev | STATUS: CLOSED  **CLOSED** — d23150315; guide:1174 is a TWELVE-grammar table nam … |
| ROW-CB-V-AUTHORITY-CENSUS-5 `finding-overload-provenance` | cb-v-authority-census L5 · `exception-authority-census.md:65` vs `finding-overload-provenance.ts:1-14` | the census's disposition — "Delet | STATUS: CLOSED  **CLOSED** — 3525c6f28 (#2100); exception-authority-census.md:65 … |
| ROW-CB-V-AUTHORITY-CENSUS-6 guide §7 parked-grammar table | cb-v-authority-census L6 · `docs/design/gate-runtime-standardization.md:1069-1078` | the table's REASON is refuted: `sub-floor-disclosure` | STATUS: CLOSED  **CLOSED** — 8c7ca5e9f; guide:1200-1202 records the three gramma … |
| ROW-CB-V-AUTHORITY-CENSUS-7 `css-length-tokens` | cb-v-authority-census L7 · `css-length-tokens.ts:31,95,105` | **16 grant rows carrying an explicit per-row `count`** across three tables — the sharp | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-AUTHORITY-CENSUS-8 `ops/new-gate.ts` | cb-v-authority-census L8 · `tooling/src/verify/ops/new-gate.ts:43` | a NINTH `ExemptionTable` home the "eight in FINAL modules" expectation does not c | STATUS: CLOSED  **CLOSED** — a5abe00d7 (#2102); ops/new-gate.ts:46 emits defineG … |
| ROW-CB-V-AUTHORITY-CENSUS-9 the marker-census predicate | cb-v-authority-census L9 · guide `docs/design/gate-runtime-standardization.md:1080-1085` | a loose `grep -F "// @opener"` reports **86** cen | STATUS: CLOSED  **CLOSED** — d23150315; guide:1183 states the anchored predicate … |
| ROW-CB-V-AUTHORITY-CENSUS-10 `test-presence-client` | cb-v-authority-census L10 · `tooling/src/verify/gates/test-presence-client.ts:20` | `CLIENT_EXCLUDE_FILES` subtracts `data/trpc.ts` BY NAME from | STATUS: CLOSED  **CLOSED** — b5490a02a (#2103); the data/trpc.ts row is deleted, … |

### cb-v-config-liveness — the config-liveness conversion (#2021) (`v-config-liveness-2026-09-12.md`) — 6 rows (0 OPEN, 6 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-CONFIG-LIVENESS-1 `tsconfig-entry-liveness-health` | cb-v-config-liveness L1 · `tooling/src/verify/lib/config-grant-rows.ts:87` | `readTsconfigRoster` maps only `corpus.files` and DISCARDS | STATUS: CLOSED  **CLOSED — #2120, lane `p-config-liveness-convert`, 2026-09-12** … |
| ROW-CB-V-CONFIG-LIVENESS-2 `biome-grant-liveness` | cb-v-config-liveness L2 · `tooling/src/verify/gates/biome-grant-liveness.ts:140` | the same unread-refusal shape one notch milder: `corpus.files.f | STATUS: CLOSED  **CLOSED — #2121, lane `p-config-liveness-convert`, 2026-09-12** … |
| ROW-CB-V-CONFIG-LIVENESS-3 `biome-grant-liveness` | cb-v-config-liveness L3 · `tooling/src/verify/lib/config-grant-rows.ts:135` | `overrideIncludes` reads only `overrides[].includes`, excluding the | STATUS: CLOSED  **CLOSED — #2122, lane `p-config-liveness-convert`, 2026-09-12** … |
| ROW-CB-V-CONFIG-LIVENESS-4 `biome-grant-liveness` | cb-v-config-liveness L4 · `tooling/src/verify/gates/biome-grant-liveness.ts:1` | the header records FAMILY, readers and AUTHORITY but carries **no | STATUS: CLOSED  **CLOSED — #2123, lane `p-config-liveness-convert`, 2026-09-12** … |
| ROW-CB-V-CONFIG-LIVENESS-5 `biome-grant-liveness` | cb-v-config-liveness L5 · `tooling/src/verify/gates/biome-grant-liveness.ts:29` | the header names `dangling-refs` as where a moved grant justific | STATUS: CLOSED  **CLOSED — #2124, lane `p-config-liveness-convert`, 2026-09-12** … |
| ROW-CB-V-CONFIG-LIVENESS-6 `biome-grant-liveness` | cb-v-config-liveness L6 · `tests/tooling/verify/gates/biome-grant-liveness.int.test.ts:47` | the module header (`:36-37`) claims an empty tracked | STATUS: CLOSED  **CLOSED — #2125, lane `p-config-liveness-convert`, 2026-09-12** … |

### cb-v-parity-instruments — the parity + instrument merges (`v-parity-instruments-2026-09-12.md`) — 11 rows (0 OPEN, 11 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-PARITY-INSTRUMENTS-1 `conversion-refusal-liveness` | cb-v-parity-instruments L1 · `tooling/src/verify/gates/no-blanket-suppression.ts:60` | the new HARD gate is RED on the real tree against | STATUS: CLOSED  **CLOSED — #2106, lane `p-roster-as-data`, `c9b125f6a`**  … |
| ROW-CB-V-PARITY-INSTRUMENTS-2 `conversion-refusal-liveness` | cb-v-parity-instruments L2 · `tooling/src/verify/gates/conversion-refusal-liveness.ts:176` | ARM D's message is not true of what it flag | STATUS: CLOSED  **CLOSED — #2106, lane `p-roster-as-data`, `c9b125f6a`**  … |
| ROW-CB-V-PARITY-INSTRUMENTS-3 `conversion-refusal-liveness` | cb-v-parity-instruments L3 · `tooling/src/verify/lib/conversion-refusal.ts:52-58` | §4.1: the header-span scoping in `refusalOpenerLine` | STATUS: CLOSED  **CLOSED — #2113, lane `p-roster-as-data`**  … |
| ROW-CB-V-PARITY-INSTRUMENTS-4 `conversion-refusal-liveness` | cb-v-parity-instruments L4 · `tooling/src/verify/gates/conversion-refusal-liveness.ts:161` | §4.1: the `GATES_DIR` fence on ARM A has no | STATUS: CLOSED  **CLOSED — #2114, lane `p-roster-as-data`**  … |
| ROW-CB-V-PARITY-INSTRUMENTS-5 `conversion-refusal-liveness` | cb-v-parity-instruments L11 · `tooling/src/verify/contract/conversion-refusal.ts:27` | the #2013 property the module's own header opens | STATUS: CLOSED  **CLOSED — #2115, lane `p-roster-as-data`**  … |
| ROW-CB-V-PARITY-INSTRUMENTS-6 `contract/population.ts` | cb-v-parity-instruments L5 · `tooling/src/verify/contract/population.ts:74` | `authoredExclusionReason` is an exported dead reader — `pnpm as | STATUS: CLOSED  **CLOSED — #2116, lane `p-roster-as-data`**  … |
| ROW-CB-V-PARITY-INSTRUMENTS-7 `lib/gate-program-docs.ts` | cb-v-parity-instruments L6 · `tooling/src/verify/lib/gate-program-docs.ts:79` and `:115` | the header literal `module` (matched as a whole | STATUS: CLOSED  **CLOSED — #2075, lane `p-roster-as-data`**  … |
| ROW-CB-V-PARITY-INSTRUMENTS-8 `ops/gen/read-first-costs.ts` | cb-v-parity-instruments L7 · `tooling/src/verify/ops/gen/read-first-costs.ts:130` | the freshness arm reports a bare `1 difference(s) … | STATUS: CLOSED  **CLOSED — #2117, lane `p-roster-as-data`**  … |
| ROW-CB-V-PARITY-INSTRUMENTS-9 `tier3-close-by-rule` | cb-v-parity-instruments L8 · `tests/tooling/verify/gates/tier3-close-by-rule.test.ts:131-139` | clause 6 — the load-bearing one — checks carriag | STATUS: CLOSED  **CLOSED** — ef044b12e (#2118); carriageRefusals compares the fi … |
| ROW-CB-V-PARITY-INSTRUMENTS-10 `tests/support/legacy-differential.ts` | cb-v-parity-instruments L9 · `tests/support/legacy-differential.ts:202` | the shared harness is `useInMemoryFileSystem: true` | STATUS: CLOSED  **CLOSED** — ef044b12e (#2119); FILESYSTEM_REACH + frozenLegacyG … |
| ROW-CB-V-PARITY-INSTRUMENTS-11 `ledgers:fresh` | cb-v-parity-instruments L10 · `docs/design/gate-runtime-read-first.md:49-55` | `pnpm -s check:ledgers-fresh` is exit 1 on `007c8b837`: the read-first | STATUS: CLOSED  **CLOSED — lane `p-roster-as-data`**  … |

### cb-v-fix-wave-1 — the six fix commits of 2026-09-12 evening, verified row by row; 21 of 22 CONFIRMED, #2086 REFUTED. (`v-fix-wave-1-2026-09-12.md`) — 6 rows (0 OPEN, 6 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-FIX-WAVE-1-1 `ops/gen/read-first-costs.ts` | cb-v-fix-wave-1 L1 · `docs/design/gate-runtime-read-first.md:51,54` | the GENERATED SIZE column is stale at HEAD and `pnpm check:ledgers-fresh` | STATUS: CLOSED  **CLOSED — #2150, lane `p-barrier` (primary), `8631161b6`** (THR … |
| ROW-CB-V-FIX-WAVE-1-2 the refutation ledger | cb-v-fix-wave-1 L2 · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:483-504` | `0060ec324` closed board rows #2077-#2086 but did NOT flip th | STATUS: CLOSED  **CLOSED — #2151, lane `p-barrier` (primary), this commit**  … |
| ROW-CB-V-FIX-WAVE-1-3 `commented-code` | cb-v-fix-wave-1 L3 · `tooling/src/verify/gates/commented-code.ts:74` (`mustPass[4]`) | the COMMENT-KIND fence is still unpinned and the new row's `why` state | STATUS: CLOSED  **CLOSED — #2086, `27df4238a`** (first attempt REFUTED by this w … |
| ROW-CB-V-FIX-WAVE-1-4 `component-size` | cb-v-fix-wave-1 L4 · `tooling/src/verify/gates/component-size.ts:53` (`mustFlag[1].why`) | the `why` says the route branch is pinned from both sides because | STATUS: CLOSED  **CLOSED — #2152, lane `p-unaudited-fix-a`, `27df4238a`**  … |
| ROW-CB-V-FIX-WAVE-1-5 the refutation ledger · `contract/population.ts` | cb-v-fix-wave-1 L5 · `refutation-ledger-2026-09-12.md:499` · `tooling/src/verify/contract/population.ts:44` | the closure cit | STATUS: CLOSED  **CLOSED — #2153, lane `p-roster-as-data`, `ecf3d90fa`**  … |
| ROW-CB-V-FIX-WAVE-1-6 `docs/design/plugin-showcase-set.md` | cb-v-fix-wave-1 L6 · `docs/design/plugin-showcase-set.md:198,205-207` | `91d9a2ab7`'s formatter run ALSO corrupted non-table content in t | STATUS: CLOSED  **CLOSED — #2154, lane `p-doc-formatter-lossy`, `49b456e89`**  … |

### cb-v-fix-wave-2 — the wave-2 fix commits, verified row by row (`v-fix-wave-2-2026-09-12.md`) — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-FIX-WAVE-2-1 `no-tailwind-dark-variant` | cb-v-fix-wave-2 L1 · `tooling/src/verify/gates/no-tailwind-dark-variant.ts:40` | the `fix` string still says *"A candidate containing a paren (an a | STATUS: CLOSED  **CLOSED — `44a66de69`**; header/FIX now name the actual leading … |
| ROW-CB-V-FIX-WAVE-2-2 `lib/ordinary-waiver` + `lib/policy-pass-context` | cb-v-fix-wave-2 L2 · `tooling/src/verify/lib/ordinary-waiver.ts:56` · `tooling/src/verify/lib/policy-pass-context.ts:107` | | STATUS: CLOSED  **CLOSED — `44a66de69` (#2157)**; committed eight-test coordinat … |
| ROW-CB-V-FIX-WAVE-2-3 `no-raw-color-in-css` · `no-tailwind-dark-variant` | cb-v-fix-wave-2 L3 · `tooling/src/verify/gates/no-raw-color-in-css.ts:167` · `tooling/src/verify/gates/no-tailwind-dark-var | STATUS: CLOSED  **CLOSED — `44a66de69` (#2158)**; two production-dispatched coor … |
| ROW-CB-V-FIX-WAVE-2-4 `docs/architecture/core/AGENTS.md` | cb-v-fix-wave-2 L4 · `docs/architecture/core/AGENTS.md:68` · `:322` · `tooling/src/verify/gates/GATE-AUTHORING.md:14` | #2076 repaired the | STATUS: CLOSED  **CLOSED — `f902e79ef` (#2159)**; all three routes label the exe … |
| ROW-CB-V-FIX-WAVE-2-5 `no-raw-color-in-css` · `no-tailwind-dark-variant` · `rest-transform-grid` | cb-v-fix-wave-2 L5 · `tooling/src/verify/gates/no-raw-color-in-css.ts:85` · `no-tailwind-dark-varia | STATUS: CLOSED  **CLOSED — `44a66de69` (#2160), original three consumers only**; … |

### cb-v-mirror-suppressions — the three mirror policies (`aecbc6c6c`) and `suppressions` (`a33b2e339`) (`v-mirror-suppressions-2026-09-12.md`) — 15 rows (0 OPEN, 15 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-MIRROR-SUPPRESSIONS-1 `suppressions` | cb-v-mirror-suppressions L1 · `tooling/src/verify/gates/suppressions.ts:162,164,184` | the conversion ADDED 2 live `diagnostic-legibility` findings (l | STATUS: CLOSED  **CLOSED** — `a7aad5369` (chunk B, board #2127): the two diagnos … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-2 `suppressions` | cb-v-mirror-suppressions L2 · `docs/test-baseline/manifest.json:2255` | `a33b2e339` deleted `tests/tooling/suppressions.residual.test.ts` (195 lines) | STATUS: CLOSED  **CLOSED** — `a7aad5369` (board #2128): `docs/test-baseline/mani … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-3 mirror family | cb-v-mirror-suppressions L3 · `tests/tooling/verify/gates/mirror-index-family.test.ts:1` | no §4.6 conversion differential for any of the three mirror | STATUS: CLOSED  **CLOSED** — `9b01c410a` (board #2129): the §4.6 record landed i … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-4 mirror family | cb-v-mirror-suppressions L4 · `tests/tooling/verify/gates/mirror-index-family.test.ts:95` | the §4.5 pin matrix is incomplete: `unresolved` is unpinned | STATUS: CLOSED  **CLOSED** — `9b01c410a` (board #2130): three new §4.5 cells re- … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-5 `test-presence` | cb-v-mirror-suppressions L5 · `tooling/src/verify/gates/test-presence.ts:214,228,268,384` | FOUR narrowings no row holds, individually AND jointly wi | STATUS: CLOSED  **CLOSED** — `9b01c410a` (board #2131): four cuts, each kills ex … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-6 `test-presence` | cb-v-mirror-suppressions L6 · `tooling/src/verify/gates/test-presence.ts:757,772` | `mustPass[4]`'s `why` claims "THE `isFeatureRoot` NARROWING" and | STATUS: CLOSED  **CLOSED** — `9b01c410a` (board #2132): the wiring-root branch d … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-7 `test-presence-client` | cb-v-mirror-suppressions L7 · `tooling/src/verify/gates/test-presence-client.ts:205,317,240,176` | FOUR narrowings no row holds: the `notNamed | STATUS: CLOSED  **CLOSED** — `9b01c410a` (board #2133): four cuts, four dedicate … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-8 `test-layout` | cb-v-mirror-suppressions L8 · `tooling/src/verify/gates/test-layout.ts:107` | `MIRROR_MIN_SEGS` is MUTUALLY REDUNDANT with the `sourceDirectories` fenc | STATUS: CLOSED  **CLOSED** — `9b01c410a` (board #2134): MUTUALLY REDUNDANT — the … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-9 `suppressions` | cb-v-mirror-suppressions L9 · `tooling/src/verify/lib/reviewed-grant-findings.ts:110` | `fileSiteList` dedupes and then sorts the RENDERED `file:line` | STATUS: CLOSED  **CLOSED** — `a7aad5369` (board #2135): `fileSiteList` no longer … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-10 mirror family | cb-v-mirror-suppressions L10 · `tooling/src/verify/gates/test-layout.ts:21` | all three mirror headers say "legacy at `90bbeb04f` (the parent of this | STATUS: CLOSED  **CLOSED** — #2136: 8c165cd9f corrects all four parent-SHA carri … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-11 `suppressions` | cb-v-mirror-suppressions L11 · `tooling/src/verify/gates/suppressions.ts:90` | the §5b.5 header carries FAMILY, POPULATION PORT, MARKER CENSUS and DE | STATUS: CLOSED  **CLOSED** — `a7aad5369` (board #2137): the §5b.5 header carries … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-12 `test-presence` | cb-v-mirror-suppressions L12 · `docs/architecture/core/Spine-Testing.md:106` | LAW doc still states the #767 residual population "rides a shrink-onl | STATUS: CLOSED  **CLOSED** — `9b01c410a` (board #2138): doc paragraph and both r … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-13 both | cb-v-mirror-suppressions L13 · `docs/reviews/gate-runtime/exception-authority-census.md:36,37,135,139,157` | this `status: active`, read-in-full tier-4 doc now | STATUS: CLOSED  **CLOSED** — `a7aad5369` (board #2139): the five rows describing … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-14 `suppressions` | cb-v-mirror-suppressions L14 · `docs/design/962-blanket-suppression-control-plane.md:212` | this `status: active` design doc's live "Coupled sites" l | STATUS: CLOSED  **CLOSED** — `a7aad5369` (board #2140): `962-blanket-suppression … |
| ROW-CB-V-MIRROR-SUPPRESSIONS-15 `test-presence-client` | cb-v-mirror-suppressions L15 · `tooling/src/verify/gates/test-presence-client.ts:97` | `CLIENT_EXCLUDE_FILES = ["data/trpc.ts"]` was carried | STATUS: CLOSED  **CLOSED** — b5490a02a (#2103); CLIENT_EXCLUDE_FILES is deleted, … |

### cb-v-fix-wave-3 — the wave-3 fix commits `b254138ab` (#2148) + `a5abe00d7` (#2074 #2093 #2102), verified by `cb-v-fix-wave-3` ([`v-fix-wave-3-2026-09-12.md`](v-fix-wave-3-2026-09-12.md)); 6 rows asserted — all four rows CONFIRMED; structure leg slot `agent-afe32bf567331e109-208490-2026-09-12T17-44-12-744Z`, 0 tool errors · 0 withheld — 6 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-FIX-WAVE-3-1 `gate-modernization` | cb-v-fix-wave-3 L1 · `tooling/src/verify/gates/gate-modernization.ts:330` | the #2093 split-family door excuses a collection whenever ANY corpus module i | STATUS: SUPERSEDED  **SUPERSEDED — `3f08879f4` (#2219): the collection-agnostic  … |
| ROW-CB-V-FIX-WAVE-3-2 `policy-soundness` | cb-v-fix-wave-3 L2 · `docs/architecture/core/Core-Enforcement-Active-Gates.md:336` | the ACTIVE roster row documents E1–E3 only and asserts *"All three wer | STATUS: CLOSED  **CLOSED — `99db67542` (#2019/#2148): the ACTIVE roster now reco … |
| ROW-CB-V-FIX-WAVE-3-3 `policy-soundness` | cb-v-fix-wave-3 L3 · `.claude/handover/pps-2109-items-1-2.patch:10` | a TRACKED, unapplied handover patch adds the roster's E4 clause in its PRE-#2148 word | STATUS: DISSOLVED  **DISSOLVED — `ee165b3a7` (#2148): the tracked carrier was de … |
| ROW-CB-V-FIX-WAVE-3-4 `biome-rule-liveness` | cb-v-fix-wave-3 L4 · `tooling/src/verify/lib/biome-rule-liveness.ts:303-304` | when EVERY granted subject has vanished from the tree, the arm returns `{ | STATUS: CLOSED  **CLOSED** — `205224e9a` (board #2171): all-vanished subjects →  … |
| ROW-CB-V-FIX-WAVE-3-5 `test-layout` | cb-v-fix-wave-3 L6 · `tests/tooling/verify/gates/gate-modernization-arm-b.test.ts:1` | **`a5abe00d7` landed a NEW live gate violation**: the `test-layout` final | STATUS: CLOSED  **CLOSED — `5e2b8af98` (#2093/#2174): the arm-specific test was  … |
| ROW-CB-V-FIX-WAVE-3-6 `biome-rule-liveness` | cb-v-fix-wave-3 L5 · `tooling/src/verify/lib/biome-rule-liveness.ts:299` | a malformed `biome.json` refuses through a bare `JSON.parse` SyntaxError (`Ex | STATUS: CLOSED  **CLOSED** — `205224e9a` (board #2172): the malformed-config ref … |

### cb-forge-policing-audit — the policing-surface matrix lane (#2111, owner-authorized forge; `a1c848001` on main), verified by its own planted-break receipts ([`policing-surface-audit-2026-09-12.md`](policing-surface-audit-2026-09-12.md) §9); 54 rows asserted — the report's own heading says 53 and is off by one, measured here (7 CLOSED at `a54de0421` / `3420a81e9` per the report), the rest OPEN as migration rows for `p-authority-migration` (#2147), `p-family-readers` (#2162), `p-binding-readers` (#2163), `p-proof-expectations-red` (#2025 flip) and `p-proof-soundness` (#2155 item 2) — 54 rows (3 OPEN, 51 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-FORGE-POLICING-AUDIT-1 `depcruise-grant-liveness` | #2111 · `tooling/src/verify/gates/depcruise-grant-liveness.ts:30` | imports `ExemptionTable, Finding` from `contract/gate.ts` behind `defineGate` | legacy artifact (#1922 migration set; class row #2147) | STATUS: OPEN  **OPEN** | `policy-legacy-imports` ARM A live finding; family second opinion |
| ROW-CB-FORGE-POLICING-AUDIT-2 `domain-freshness-plane` | #2111 · `…/domain-freshness-plane.ts:70` | imports `ExemptionRow` from `contract/gate.ts` | legacy artifact (#2147) | STATUS: CLOSED  **CLOSE … |
| ROW-CB-FORGE-POLICING-AUDIT-3 `eslint-grant-liveness` | #2111 · `…/eslint-grant-liveness.ts:10` | imports `ExemptionTable` | legacy artifact (#2147) | STATUS: OPEN  **OPEN** | same |
| ROW-CB-FORGE-POLICING-AUDIT-4 `injected-op-caller-param` | #2111 · `…/injected-op-caller-param.ts:24` | imports `ExemptionTable` | legacy artifact (#2147) | STATUS: CLOSED  **CLOSED — `ebfe88146`**: … |
| ROW-CB-FORGE-POLICING-AUDIT-5 `lifecycle-portability` | #2111 · `…/lifecycle-portability.ts:54` | imports `ExemptionRow, ExemptionTable` | legacy artifact (#2147) | STATUS: CLOSED  **CLOSED — `df6a1 … |
| ROW-CB-FORGE-POLICING-AUDIT-6 `no-raw-spacing-in-features` | #2111 · `…/no-raw-spacing-in-features.ts:33` | imported `ExemptionTable` | legacy artifact (#2147) | STATUS: CLOSED  **CLOSED** at `3420a … |
| ROW-CB-FORGE-POLICING-AUDIT-7 `no-raw-typography-in-features` | #2111 · `…/no-raw-typography-in-features.ts:33` | imported `ExemptionTable` | legacy artifact (#2147) | STATUS: CLOSED  **CLOSED** at … |
| ROW-CB-FORGE-POLICING-AUDIT-8 `runner-config-path-liveness` | #2111 · `…/runner-config-path-liveness.ts:78` | imports `ExemptionTable, Finding` | legacy artifact (#2147) | STATUS: CLOSED  **CLOSED — … |
| ROW-CB-FORGE-POLICING-AUDIT-9 `no-raw-color-in-css` | #2111 · `…/no-raw-color-in-css.ts:44` | imported `waivableCoordinate` from `lib/ordinary-waiver.ts` (the marker engine's module) | §12.5 marker- | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-FORGE-POLICING-AUDIT-10 `no-tailwind-dark-variant` | #2111 · `…/no-tailwind-dark-variant.ts:29` | same | same | STATUS: CLOSED  **CLOSED** at `a54de0421` | same | … |
| ROW-CB-FORGE-POLICING-AUDIT-11 `rest-transform-grid` | #2111 · `…/rest-transform-grid.ts:51` | same | same | STATUS: CLOSED  **CLOSED** at `a54de0421` | same | … |
| ROW-CB-FORGE-POLICING-AUDIT-12 `bus-producer-coverage` | #2096 · `…/bus-producer-coverage.ts:59` | imported `deferralsFor` from sibling gate `user-bus-deferred-member.ts` | gate→gate import | STATUS | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-FORGE-POLICING-AUDIT-13 `context-definition-shape-health` | #2096 · `…/context-definition-shape-health.ts:36` | imported three predicates from its twin | gate→gate import | STATUS: CLOSED  ** … |
| ROW-CB-FORGE-POLICING-AUDIT-14 `ct-poll-schedule-and-paint-health` | #2096 · `…/ct-poll-schedule-and-paint-health.ts:21` | imports seven predicates from its twin | gate→gate import | STATUS: CLOSED … |
| ROW-CB-FORGE-POLICING-AUDIT-15 `freeze-provenance-write-pairing-health` | #2096 · `…/freeze-provenance-write-pairing-health.ts:44` | imported four predicates from its twin | gate→gate import | STATU | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-FORGE-POLICING-AUDIT-16 `injected-op-caller-param-health` | #2096 · `…/injected-op-caller-param-health.ts:9` | imports `CALLER_FREE_OPS, deriveEntityIdTypes, IDS_MODULE` from its twin | gate→ | STATUS: CLOSED  **CLOSED** — `3420a81e9`/`bba5101db` (board #2162): same; confir … |
| ROW-CB-FORGE-POLICING-AUDIT-17 `owner-scoped-reads` | #2096 · `…/owner-scoped-reads.ts:30` | imports `ownerScopedTableIdents` from `table-scoping-class.ts` (a final gate) | gate→gate import | STATUS | STATUS: CLOSED  **CLOSED** — `3ed1a7d7a` (board #2162, arm 3): the 97-row tenanc … |
| ROW-CB-FORGE-POLICING-AUDIT-18 `owner-scoped-upserts` | #2096 · `…/owner-scoped-upserts.ts:31` | imports `ownerScopedTableIdents, schemaTableIdents` from `table-scoping-class.ts` | gate→gate import | STATUS: CLOSED  **CLOSED** — `3ed1a7d7a` (board #2162): same; confirmed by cb-v- … |
| ROW-CB-FORGE-POLICING-AUDIT-19 `owner-scoped-writes` | #2096 · `…/owner-scoped-writes.ts:24` | same shape | gate→gate import | STATUS: CLOSED  **CLOSED** — `3ed1a7d7a` (board #2162): same; confirmed … |
| ROW-CB-FORGE-POLICING-AUDIT-20 `serde-core-seal-health` | #2096 · `…/serde-core-seal-health.ts:11` | imports `DOMAIN_ROOT, pngChunkImport, SANCTIONED_DOMAINS` from its twin | gate→gate import | STAT | STATUS: CLOSED  **CLOSED** — `ebfe88146` (board #2162): the last four gate→gate  … |
| ROW-CB-FORGE-POLICING-AUDIT-21 `spacing-tier-home-health` | #2096 · `…/spacing-tier-home-health.ts:27` | imported `SANCTIONED_HOMES` from `no-raw-spacing-in-features.ts` | gate→gate import | STATUS: … |
| ROW-CB-FORGE-POLICING-AUDIT-22 `typography-tier-home-health` | #2096 · `…/typography-tier-home-health.ts:9` | imported `SANCTIONED_HOMES` from `no-raw-typography-in-features.ts` | gate→gate import | | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-FORGE-POLICING-AUDIT-23 `playwright-css-topology` | #2096 · `…/playwright-css-topology.ts:9` | imports `SANCTIONED_CSS_HOMES` from the LEGACY sibling `sanctioned-css-homes.ts` — itself a LEGA | STATUS: CLOSED  **CLOSED** — `ebfe88146` (board #2162): the legacy pair resolved … |
| ROW-CB-FORGE-POLICING-AUDIT-24 `audit-client-tests` | #2097 · `…/audit-client-tests.ts:221` | `Symbol#getDeclarations()` chain | local binding resolution | STATUS: CLOSED  **CLOSED — `ddf1adf53`** ( … |
| ROW-CB-FORGE-POLICING-AUDIT-25 `class-token-splice` | #2097 · `…/class-token-splice.ts:149` | `lexicalReferenceSymbol(callee)?.getDeclarations()` — a `lib/` reader returning a `Symbol` invites the g | STATUS: CLOSED  **CLOSED — `dadb46390 + 8fe92bbe7`** (#2163): shared callable re … |
| ROW-CB-FORGE-POLICING-AUDIT-26 `context-definition-shape` | #2097 · `…/context-definition-shape.ts:134` | `nameNode.getDefinitionNodes()` | local binding resolution | STATUS: CLOSED  **CLOSED — `467 … |
| ROW-CB-FORGE-POLICING-AUDIT-27 `ct-no-oneshot-live-read-assert` | #2097 · `…/ct-no-oneshot-live-read-assert.ts:197` | `identifier.getDefinitionNodes()` | local binding resolution | STATUS: CLOSED  * … |
| ROW-CB-FORGE-POLICING-AUDIT-28 `evaluate-no-scope-capture` | #2097 · `…/evaluate-no-scope-capture.ts:227`, `:249` | `getAliasedSymbol()` / `getValueDeclaration()` chains | local binding resolution | | STATUS: CLOSED  **CLOSED — `467bef90d`** (#2163): shared readers adopted; indepe … |
| ROW-CB-FORGE-POLICING-AUDIT-29 `message-kind-policy-coverage` | #2097 · `…/message-kind-policy-coverage.ts:77`, `:95` | `(symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations()`, `property.getDecl | STATUS: CLOSED  **CLOSED — `467bef90d`** (#2163): shared readers adopted; indepe … |
| ROW-CB-FORGE-POLICING-AUDIT-30 `no-context-returntype` | #2097 · `…/no-context-returntype.ts:41` | `node.getSymbol()?.getDeclarations()` | local binding resolution | STATUS: CLOSED  **CLOSED — `467b … |
| ROW-CB-FORGE-POLICING-AUDIT-31 `no-manual-token-estimate` | #2097 · `…/no-manual-token-estimate.ts:57` | `(symbol.getAliasedSymbol() ?? symbol).getDeclarations()` | local binding resolution | STATUS | STATUS: CLOSED  **CLOSED — `467bef90d`** (#2163): shared readers adopted; indepe … |
| ROW-CB-FORGE-POLICING-AUDIT-32 `no-raw-zustand-persist` | #2097 · `…/no-raw-zustand-persist.ts:343` | same chain | local binding resolution | STATUS: CLOSED  **CLOSED — `467bef90d`** (#2163): shared … |
| ROW-CB-FORGE-POLICING-AUDIT-33 `plugin-dump-guard` | #2097 · `…/plugin-dump-guard.ts:89` | `callee.getSymbol()?.getDeclarations()` | local binding resolution | STATUS: CLOSED  **CLOSED — `0c5b1e0bb` … |
| ROW-CB-FORGE-POLICING-AUDIT-34 `registry-context-via-mint` | #2097 · `…/registry-context-via-mint.ts:65-66` | `getAliasedSymbol()` + `getDeclarations()` | local binding resolution | STATUS: CLOSED … |
| ROW-CB-FORGE-POLICING-AUDIT-35 `section-factory-contribution-bundle` | #2097 · `…/section-factory-contribution-bundle.ts:85` | `type?.getSymbol()?.getDeclarations()` | local binding resolution | STA | STATUS: CLOSED  **CLOSED — `467bef90d`** (#2163): shared readers adopted; indepe … |
| ROW-CB-FORGE-POLICING-AUDIT-36 `warning-code-coverage` | #2097 · `…/warning-code-coverage.ts:98` | `node.getSymbol()?.getDeclarations()[0]` | local binding resolution | STATUS: CLOSED  **CLOSED — `4 … |
| ROW-CB-FORGE-POLICING-AUDIT-37 `zod-error-issues-home` | #2097 · `…/zod-error-issues-home.ts:81` | `symbol?.getDeclarations()` | local binding resolution | STATUS: CLOSED  **CLOSED — cce850dc1** (bo … |
| ROW-CB-FORGE-POLICING-AUDIT-38 `assumes-single-replica` | #2025 · `policy-proof-expectations` finding(s) in `…/assumes-single-replica.ts` | §4.1 expectation debt (a `mustFlag` row without `count`, o | STATUS: CLOSED  **CLOSED** — `874b34b58` (board #2025 flip burn-down): the ARM-M … |
| ROW-CB-FORGE-POLICING-AUDIT-39 `d-citation-integrity` | #2025 · `…/d-citation-integrity.ts` | same class | proof-expectation debt | STATUS: CLOSED  **CLOSED** — `874b34b58` (board #2025 flip burn-do … |
| ROW-CB-FORGE-POLICING-AUDIT-40 `dangling-doc-cite` | #2025 · `…/dangling-doc-cite.ts` | same class | proof-expectation debt | STATUS: CLOSED  **CLOSED** — `874b34b58` (board #2025 flip burn-down): t … |
| ROW-CB-FORGE-POLICING-AUDIT-41 `detached-work-traced-health` | #2025 · `…/detached-work-traced-health.ts` | same class | proof-expectation debt | STATUS: CLOSED  **CLOSED** — `874b34b58` (board #202 … |
| ROW-CB-FORGE-POLICING-AUDIT-42 `no-form-reset-in-autosave-health` | #2025 · `…/no-form-reset-in-autosave-health.ts` | same class | proof-expectation debt | STATUS: CLOSED  **CLOSED** — `874b34b58` ( … |
| ROW-CB-FORGE-POLICING-AUDIT-43 `public-route-body-cap-health` | #2025 · `…/public-route-body-cap-health.ts` | same class | proof-expectation debt | STATUS: CLOSED  **CLOSED** — `874b34b58` (board #2 … |
| ROW-CB-FORGE-POLICING-AUDIT-44 `surface-in-a-container-health` | #2025 · `…/surface-in-a-container-health.ts` | same class | proof-expectation debt | STATUS: CLOSED  **CLOSED** — `874b34b58` (board … |
| ROW-CB-FORGE-POLICING-AUDIT-45 `testid-liveness-health` | #2025 · `…/testid-liveness-health.ts` | same class | proof-expectation debt | STATUS: CLOSED  **CLOSED** — `874b34b58` (board #2025 flip bur … |
| ROW-CB-FORGE-POLICING-AUDIT-46 `tooling-artifact-run-slot` | #2025 · `…/tooling-artifact-run-slot.ts` | same class | proof-expectation debt | STATUS: CLOSED  **CLOSED** — `874b34b58` (board #2025 fl … |
| ROW-CB-FORGE-POLICING-AUDIT-47 `tooling-cli-entry` | #2025 · `…/tooling-cli-entry.ts` | same class | proof-expectation debt | STATUS: CLOSED  **CLOSED** — `874b34b58` (board #2025 flip burn-down): t … |
| ROW-CB-FORGE-POLICING-AUDIT-48 `tooling-ops-direct-invocation` | #2025 · `…/tooling-ops-direct-invocation.ts` | same class | proof-expectation debt | STATUS: CLOSED  **CLOSED** — `874b34b58` (board … |
| ROW-CB-FORGE-POLICING-AUDIT-49 `lib/policy-pass-context.ts` | #2155 item 2 · `tooling/src/verify/lib/policy-pass-context.ts:249,257,280,347,354,396,411,415,418,421` | ten refusal sentences spelled b | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (specific #2155 item; separate res … |
| ROW-CB-FORGE-POLICING-AUDIT-50 `gate-modernization` | #2111 · `tooling/src/verify/gates/gate-modernization.ts` | The live legacy meta-gate retains a local registration reader until its retirement. It is not an exact duplicate of the central readers: it returns descriptor nodes for its arms, and its final-callee recognition differs. | transition obligation (legacy meta-gate) | STATUS: OPEN  **OPEN — held until cutover; no pre-cutover repair** | Independent source adjudication at `22d61f8bb`, 2026-09-13: local `registrationOf` remains called; central `gateRegistrationOf` returns a contract kind, while `finalRegistrationOf` recognizes canonical namespace registrations for policing. Standardization §1 and playbook §4.1 retain the legacy owner through transition. Retire its local reader with the meta-gate and successor evidence; do not perform a nominal deduplication now. |
| ROW-CB-FORGE-POLICING-AUDIT-51 `own-tables-only` | #2111 · `…/own-tables-only.ts` `FILE_ALLOWLIST` | a name-vocabulary collection on a final module that reads as an exemption table by NAME; content | STATUS: CLOSED  **CLOSED** — `c44d382c6272648abe2ac133cc924cea19b1198d`: exact-f … |
| ROW-CB-FORGE-POLICING-AUDIT-52 `verify-registry-parity` | #2111 · `…/verify-registry-parity.ts` `NON_STAGE_ALLOWLIST` | Non-stage exceptions had no reverse subject-liveness check. | judgment | STATU | STATUS: CLOSED  **CLOSED — #2340; a175779d0**  … |
| ROW-CB-FORGE-POLICING-AUDIT-53 `vector-scope-derived` | #2111 · `…/vector-scope-derived.ts` `IMPORT_SANCTIONED` | Permanent architectural import roles were misclassified as expiring exception debt. | STATUS: CLOSED  **CLOSED — #2328; a175779d0**  … |
| ROW-CB-FORGE-POLICING-AUDIT-54 `ops/debt.ts` | #2111 · `tooling/src/verify/ops/debt.ts` | The debt reader imports the live legacy owners’ baseline path constants so path changes cannot silently deta | STATUS: CLOSED  **CLOSED — `e44238d47` + `adf23ae69`** (re-derived 2026-09-18)  … |

### cb-v-ledger-reconcile — the 76 OPEN/UNADJUDICATED rows re-derived against `61cae0710` ([`v-ledger-reconcile-2026-09-12.md`](v-ledger-reconcile-2026-09-12.md)); 3 rows asserted. Its 48 paste-ready flips (40 CLOSED · 1 SUPERSEDED · 7 narrowed) were applied to the rows above in the same commit; the still-open remainder is chunked A–F in its §STILL OPEN — 3 rows (0 OPEN, 3 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-LEDGER-RECONCILE-1 `dangling-refs` (review docs) | cb-v-ledger-reconcile L1 · `tests/tooling/verify/gates/dangling-refs.repo.int.test.ts:50,73,182` | the repo pin is RED on a NEW population | STATUS: CLOSED  **CLOSED — `1bf959a3e + 8d1654afc` (#2068), merged-tree follow-u … |
| ROW-CB-V-LEDGER-RECONCILE-2 `zod-error-issues-home` | cb-v-ledger-reconcile L2 · `tooling/src/verify/gates/zod-error-issues-home.ts:44,110-116,121` | declares a DISTINCT `UNREADABLE` string and pass | STATUS: CLOSED  **CLOSED — `1d97b71df` (#2194), independently confirmed at `cce8 … |
| ROW-CB-V-LEDGER-RECONCILE-3 the refutation ledger | cb-v-ledger-reconcile L3 · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` (whole file) | **`b5490a02a`'s commit message claims three | STATUS: CLOSED  **CLOSED** — reconciled at `0460b1589`: cb-v-authority-census L7 … |

### cb-v-policing-audit — the forge merge `a1c848001` (#2111) verified by a fresh lens ([`v-policing-audit-2026-09-12.md`](v-policing-audit-2026-09-12.md)): 8 of 8 built items CONFIRMED with planted controls both directions; 5 rows asserted (row 5 is #2196, owned by `205224e9a`, not this merge) — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-POLICING-AUDIT-1 `policy-legacy-imports` | cb-v-policing-audit · `tooling/src/verify/gates/policy-legacy-imports.ts:122-143` (`judgeDoor`) | BOTH arms are defeated by a ONE-HOP `lib/` RE-EX | STATUS: CLOSED  **CLOSED** — `c053e67b3` (board #2201): candidates resolved to f … |
| ROW-CB-V-POLICING-AUDIT-2 `policy-binding-resolution` · `lib/gate-contract-origin.ts` | cb-v-policing-audit · `tooling/src/verify/lib/gate-contract-origin.ts:105-127` (`callableDeclarations`/`isTsMo | STATUS: CLOSED  **CLOSED** — `a7d88287b` (board #2202): `callableDeclarations` h … |
| ROW-CB-V-POLICING-AUDIT-3 `policy-legacy-imports` | cb-v-policing-audit · `tooling/src/verify/gates/policy-legacy-imports.ts:36-38` (header) | The header MISSTATES the module's own candidate set: *" | STATUS: CLOSED  **CLOSED** — `c053e67b3` (board #2203): the header states the pr … |
| ROW-CB-V-POLICING-AUDIT-4 `policing-surface-audit-2026-09-12.md` | cb-v-policing-audit · `docs/reviews/gate-runtime/policing-surface-audit-2026-09-12.md` §8 delta 6 | The LAW DELTA the orchestrator | STATUS: CLOSED  **CLOSED** — reconciled at `0460b1589`: the current roster expli … |
| ROW-CB-V-POLICING-AUDIT-5 `biome-rule-liveness` (NOT #2111) | cb-v-policing-audit · `tooling/src/verify/lib/biome-rule-liveness.ts:303:3` | A live BLOCKING authority alarm on the current tree: `ordi | STATUS: CLOSED  **CLOSED** — `7801bd189` (board #2196): the marker waived nothin … |

### cb-v-additions-wave — the post-barrier fold `575e48d5a`…`a7d88287b` + the fix leg `bba5101db` + `5ee1149a9`, verified on `3166664f5` ([`v-additions-wave-2026-09-12.md`](v-additions-wave-2026-09-12.md)); 11 rows asserted (the 11th from its structure leg) — 4 CLOSED at `bba5101db` with pre/post receipts (#2184 and #2185 REFUTED at `575e48d5a`, CONFIRMED at the fix), 6 OPEN (board: #2210 row 6, #2214 row 7, #2215 row 9, #2212 row 10; row 5 is the census regen owed by `5ee1149a9`; row 8 informational) — 11 rows (1 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-ADDITIONS-WAVE-1 `policy-refusal-coverage` | v-additions-wave `:1` | an ORDINARY policy whose `fix` names no `@orb-waive` spelling — `policy-waiver-spelling` (`hard`/`error`) reports it, so | STATUS: CLOSED  **CLOSED … |
| ROW-CB-V-ADDITIONS-WAVE-2 `policy-refusal-coverage` | v-additions-wave `:2` | no §4.2 positive identity arm anywhere — `policy-waiver-identity` (`hard`/`error`, entire-population) reports it; a seco | STATUS: CLOSED  **CLOSED … |
| ROW-CB-V-ADDITIONS-WAVE-3 `tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` | v-additions-wave `:3` | the real-corpus arm asserted findings for 4 of 8 members, so two live blocki | STATUS: CLOSED  **CLOSED … |
| ROW-CB-V-ADDITIONS-WAVE-4 `policy-fixture-substrate` | v-additions-wave `:4` | Shape A twin blindness in a brand-new module: `isCwdCall`/`isImportMetaRoot` keyed on `PropertyAccessExpression`, so `p | STATUS: CLOSED  **CLOSED … |
| ROW-CB-V-ADDITIONS-WAVE-5 `tooling/src/_shared/proc.ts` · `docs/reviews/caught-failure-ownership/population.json` | v-additions-wave `:5` | `5ee1149a9` added 5 lines above two census sites and did n | STATUS: CLOSED  **CLOSED — `bb61df614`**  … |
| ROW-CB-V-ADDITIONS-WAVE-6 `docs/reviews/gate-runtime/exception-authority-census.md` | v-additions-wave `:6` | the #2139 correction states `RATIFIED_RULES` held **45** source rows at `d23150315`; it | STATUS: CLOSED  **CLOSED — `1bf959a3e` (#2210): the dated correction now derives … |
| ROW-CB-V-ADDITIONS-WAVE-7 `owner-scoped-upserts` | v-additions-wave `:7` · residual after #2214 | `predicatesTableColumn`'s receiver-by-TEXT acquittal was pinned for `owner-scoped-writes` but not fo | STATUS: CLOSED  **CLOSED — #2341; df1b8797d**  … |
| ROW-CB-V-ADDITIONS-WAVE-8 `tooling/src/verify/lib/gate-contract-origin.ts#receiverConstituents` | v-additions-wave `:8` | the commit presents the non-nullable receiver and the per-constituent split as two load-bearing halves; against the committed control they are MUTUALLY REDUNDANT | §4.1 classification | STATUS: OPEN  **OPEN (informational)** | each single cut leaves `gate-contract-origin.test.ts` 2/2 GREEN; the JOINT cut reds it (`expected false to be true`). Recorded so a later lane does not read a clean single cut as an unenforced fence |
| ROW-CB-V-ADDITIONS-WAVE-9 `tests/tooling/gate-ignore-grammar.repo.int.test.ts` | v-additions-wave `:9` | the new cleanup test's second assertion compares `CLEAN_ROOTS` against a re-evaluation of its | STATUS: CLOSED  **CLOSED — `eb51d4313` (#2215)**  … |
| ROW-CB-V-ADDITIONS-WAVE-10 `tooling/src/verify/ops/eslint.ts` · `tooling/src/_shared/proc.ts` | v-additions-wave `:10` | `5ee1149a9`'s stated defect — the discovery child dying ENOBUFS at current re | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-ADDITIONS-WAVE-11 `docs/test-baseline/manifest.json` · `monotonic-tests` | v-additions-wave `:11` | four baselined specs no longer exist with no `deletions` entry, so `monotonic-tests` is R | STATUS: CLOSED  **CLOSED … |

### cb-v-instruments-2 — the instrument commits `e0dcf56d8` (#2167 #2110) · `ae7a40e0b` (#2166 #2149) · `205224e9a` (#2171 #2172 #2168), verified on `9e14a5d93` ([`v-instruments-2-2026-09-12.md`](v-instruments-2-2026-09-12.md)); 8 rows asserted — #2168 REFUTED (the split-family excuse covers 0 pairs on today's tree, board #2219), the rest CONFIRMED with defects filed as rows — 8 rows (0 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-INSTRUMENTS-2-1 `verify/ops/structure` + `_shared/artifacts` | cb-v-instruments-2 V1 · `tooling/src/verify/ops/structure.ts:364` + `tooling/src/_shared/artifacts.ts:245-251` | a NON-VERDICT | STATUS: CLOSED  **CLOSED — `6cd7b488c` (#2221): `closeRunSlot` unlinks the in-fl … |
| ROW-CB-V-INSTRUMENTS-2-2 `verify/ops/debt` | cb-v-instruments-2 V2 · `tooling/src/verify/ops/debt.ts:162-166, 331` | the `#2167` refusal drops the reason and MISATTRIBUTES the cause. `e0dcf56d8` cla | STATUS: CLOSED  **CLOSED — `6cd7b488c` (#2222): the debt refusal now carries `no … |
| ROW-CB-V-INSTRUMENTS-2-3 `verify/ops/structure` | cb-v-instruments-2 V3 · `tooling/src/verify/ops/structure.ts:496-505` | the `‼ THIS RUN IS NOT A VERDICT` banner is written AFTER `renderPass` and A | STATUS: CLOSED  **CLOSED — `6cd7b488c` (#2222), preserved through extraction at  … |
| ROW-CB-V-INSTRUMENTS-2-4 `verify/ops/structure-delta` | cb-v-instruments-2 D1 · `tooling/src/verify/ops/structure-delta.ts:170-198, 200-206` | a NEW authority alarm on an ALREADY-RED final policy is | STATUS: CLOSED  **CLOSED — `6cd7b488c` (#2223)**  … |
| ROW-CB-V-INSTRUMENTS-2-5 `verify/ops/structure-delta` | cb-v-instruments-2 D2 · `tooling/src/verify/ops/structure-delta.ts:275-283` | a final policy that VANISHES between the two slots prints `no lo | STATUS: CLOSED  **CLOSED — `6cd7b488c` (#2223)**  … |
| ROW-CB-V-INSTRUMENTS-2-6 `verify/ops/structure-delta` | cb-v-instruments-2 D3 · `tooling/src/verify/ops/structure-delta.ts:128-148` | `resolveBefore` enforces `run.startedAt < afterStart` only on th | STATUS: CLOSED  **CLOSED — `6cd7b488c` (#2223)**  … |
| ROW-CB-V-INSTRUMENTS-2-7 `verify/lib/gate-program-docs` | cb-v-instruments-2 L1 · `tooling/src/verify/lib/gate-program-docs.ts:171-176, 216-244` | the `#2166` stray scanner catches the shape that ha | STATUS: CLOSED  **CLOSED — `c810fee07` (#2224): the reader now accepts heading d … |
| ROW-CB-V-INSTRUMENTS-2-8 `gate-modernization` | cb-v-instruments-2 M1 · `tests/tooling/verify/gates/gate-modernization.test.ts:138` | **RED on `main` today**: "the split-family door is ENGAGED on th | STATUS: CLOSED  **CLOSED — `3f08879f4` (#2219): the dead split-family door and i … |

### cb-v-migrations-wave — the #2096/#2097 migrations and the #2025 burn-down (`3420a81e9` · `3ed1a7d7a` · `ebfe88146` · `874b34b58` · `b5490a02a`), verified on `9e14a5d93` ([`v-migrations-wave-2026-09-12.md`](v-migrations-wave-2026-09-12.md)); 5 rows asserted — all five commits CONFIRMED; the 18 migration rows above flipped CLOSED with this wave's receipts (the commits' own `flipped ledger rows` lines were false — none touched the ledger) — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-MIGRATIONS-WAVE-1 `tests/tooling/gate-spelling-twins.int.test.ts` · `lib/tenancy-read.ts` | cb-v-migrations-wave MED-1 · `tests/tooling/gate-spelling-twins.int.test.ts:38-40`, `lib/tenancy- | STATUS: CLOSED  **CLOSED — `59297ef74` (#2233): the receipt now cites the existi … |
| ROW-CB-V-MIGRATIONS-WAVE-2 the refutation ledger | cb-v-migrations-wave MED-2 · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:584,586,587,588,589,590,593` + `:608-618` | **eighteen rows | STATUS: CLOSED  **CLOSED — `ac9be2e8a`**: all eighteen cited rows carry closing  … |
| ROW-CB-V-MIGRATIONS-WAVE-3 `policy-legacy-imports` · design `gate-runtime-standardization.md` §12.3 | cb-v-migrations-wave LOW-4 · `gates/policy-legacy-imports.ts:353,359`; `docs/design/gate-runtime | STATUS: CLOSED  **CLOSED — df2a54b09** (legacy runtime deletion rewrote the file … |
| ROW-CB-V-MIGRATIONS-WAVE-4 `lib/context-definition-shape.ts` | cb-v-migrations-wave LOW-1 · `lib/context-definition-shape.ts:8-16,22` | the new shared module's header states *"the three names both h | STATUS: CLOSED  **CLOSED — `c44d382c6` (#2227)**  … |
| ROW-CB-V-MIGRATIONS-WAVE-5 `lib/bus-deferred-member.ts` · `gates/user-bus-deferred-member.ts` · `lib/tenancy-scope.ts` | cb-v-migrations-wave LOW-2/LOW-3 · `lib/bus-deferred-member.ts:40` + `gates/u | STATUS: CLOSED  **CLOSED — `c44d382c6` + `03ec7b01c` (#2227)**  … |

### cb-v-css-audit — the §5b audit of the eight legacy CSS gates before train lanes 2/3, measured on `0e03cee19` ([`css-family-audit-2026-09-12.md`](css-family-audit-2026-09-12.md)); 18 rows asserted — #2181 lane 1 REFUTED on its own claim (rows 1–11, 13–14 are its refute spec, board #2181 back at Ready); row 12 is decision #2230 (203 is DERIVABLE); rows 15–16 are #2231 (a false clean in a live gate; rides CSS lane 3, #2183); rows 17–18 ride CSS lane 2 (#2182). Zero live markers for all eight (N=7725, control 1196). — 18 rows (0 OPEN, 18 CLOSED)

| # | module / file | defect | evidence | class | state |
| -: | - | - | - | - | - |
| ROW-CB-V-CSS-AUDIT-1 1 | `gates/css-length-tokens.ts` — the 13 `STRUCTURAL_CLASS_CANDIDATES` rows (#2181, `e7e3f083b`) | The replacement for `STRUCTURAL_CLASS_FILES` is pinned by NO committed proof | STATUS: CLOSED  **CLOSED** — `e1c314202` (#2181 proof repair; original `88a8d295 … |
| ROW-CB-V-CSS-AUDIT-2 2 | `gates/css-length-tokens.ts` — the 10 `STRUCTURAL_DECLARATIONS` liveness rows (#2101) | Same shape one table over: the declaration-liveness arm can be deleted whole with no | STATUS: CLOSED  **CLOSED** — `e1c314202` (#2181 proof repair; original `88a8d295 … |
| ROW-CB-V-CSS-AUDIT-3 3 | `gates/css-length-tokens.ts` — `mustFlag[3]` | The only row that reaches the real-tree-guarded arms yields **18** findings and asserts `{ token }` only — no `count`. Its own | STATUS: CLOSED  **CLOSED** — `e1c314202` (#2181 proof repair; original `88a8d295 … |
| ROW-CB-V-CSS-AUDIT-4 4 | `gates/css-var-defined.ts` — `checkRealTreeVendor` (#2181, `9e29a921c`) | The three replacement blindness tripwires AND both reviewed-vendor-vocabulary arms are reached by Z | STATUS: CLOSED  **CLOSED** — `e1c314202` (#2181 proof repair; original `88a8d295 … |
| ROW-CB-V-CSS-AUDIT-5 5 | `gates/css-var-defined.ts` — `checkRealTreeRuntime` | All four runtime-producer arms (runtime-use vocabulary, unreviewed writer, stale producer row) reached by zero committe | STATUS: CLOSED  **CLOSED** — `e1c314202` (#2181 proof repair; original `88a8d295 … |
| ROW-CB-V-CSS-AUDIT-6 6 | `gates/css-var-defined.ts` — `checkPopulations` | Three of four blindness tripwires (`custom-property definitions`, `custom-property references`, `static class roots`) unpin | STATUS: CLOSED  **CLOSED** — `e1c314202` (#2181 proof repair; original `88a8d295 … |
| ROW-CB-V-CSS-AUDIT-7 7 | `gates/css-var-defined.ts` — the descriptor `fix` | *"define it in the six-home topology, add an explicit var() fallback, or use a proved Base UI runtime property"* is untru | STATUS: CLOSED  **CLOSED** — `e1c314202` (#2181 proof repair; original `88a8d295 … |
| ROW-CB-V-CSS-AUDIT-8 8 | `gates/css-family-ownership.ts` / `lib/css-family-policy.ts` — `zero-declarations` | The blindness arm `0e03cee19`'s "retirement costs nothing in instrument health" rests on | STATUS: CLOSED  **CLOSED** — `dd98eb356` + `7bf03e12f`; ownership-health `mustFl … |
| ROW-CB-V-CSS-AUDIT-9 9 | `lib/css-family-policy.ts` — `zero-theme-values` | Same: reached by zero committed rows | throw probe f03: 0 rows die | #1990 dead-arm | STATUS: CLOSED  **CLOSED** — `9104f7 … |
| ROW-CB-V-CSS-AUDIT-10 10 | `lib/css-family-policy.ts` — `fullHomeSet` fence in `reportExactCensus` | Unenforced, and post-retirement it guards only `zero-declarations`, so it is now near-dead decora | STATUS: CLOSED  **CLOSED … |
| ROW-CB-V-CSS-AUDIT-11 11 | `lib/css-family-census.ts` — `EXPECTED_RUNTIME_WRITERS` (4 keys, `fade: 12` a bare literal) + `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` (3 keys) | SEVEN hand-spelled count ra | STATUS: CLOSED  **CLOSED** — `dd98eb356` + `7bf03e12f`; runtime member coverage  … |
| ROW-CB-V-CSS-AUDIT-12 12 | `lib/css-family-census.ts:79` — `EXPECTED_DIRECT_THEME_DECLARATIONS = 203` | Presented as "generated-output parity" and escalated as such. It is DERIVABLE: `tokens.build.t | STATUS: CLOSED  **CLOSED** — #2230 ARM B, `1ef220c20`; full generated theme byte … |
| ROW-CB-V-CSS-AUDIT-13 13 | `gates/css-family-ownership.ts:174,438` + `lib/css-family-census.ts:79` | The #1956 coupled-site hazard survives for `EXPECTED_DIRECT_THEME_DECLARATIONS`: one number spell | STATUS: CLOSED  **CLOSED** — `1ef220c20`; ARM B removes the parity constant and  … |
| ROW-CB-V-CSS-AUDIT-14 14 | `0e03cee19` commit message + `docs/design/951-css-family-semantic-provenance.md` §7 | "the lift asserted an identical word count on both sides (1919)" is true of the SOURC | STATUS: CLOSED  **CLOSED** — `156609ccd` (board #2181 row 14): the 1919 → 1921 l … |
| ROW-CB-V-CSS-AUDIT-15 15 | `gates/playwright-css-topology.ts` — the `unresolved` arm | STRUCTURALLY DEAD. `cssGraph`'s `visit` returns before `files.push(rel)` when `read()` is null, and `!unresolve | STATUS: CLOSED  **CLOSED** — `17a59099b` (board #2231): the unresolved arm is re … |
| ROW-CB-V-CSS-AUDIT-16 16 | `gates/playwright-css-topology.ts` — `validateCtConfig` | The whole four-clause fence (extension plugin present, tailwind present, ORDER, `CLIENT_GLOBALS` marker) is unenf | STATUS: CLOSED  **CLOSED** — `17a59099b` (board #2231): same commit; the fused f … |
| ROW-CB-V-CSS-AUDIT-17 17 | `gates/css-selector-has-a-writer.ts` / `lib/css-selector-writer-policy.ts` | Both Base UI reconciliation arms (`baseUiManifestOnly`, `baseUiInstalledOnly`) unenforced — th | STATUS: CLOSED  **CLOSED … |
| ROW-CB-V-CSS-AUDIT-18 18 | `gates/tokens-contract.ts` | The real-tree history-ratchet conditional (`historyRoot`) is unenforced, so the git-removal half of a seven-document contract is proven by not | STATUS: CLOSED  **CLOSED** — `a97454714` (board #2182): the token-removal ratche … |

### cb-v-wave-5 — reconcile chunk C (`44a66de69`), the ENOBUFS/budget pair (`fc4e0fa03` · `eb51d4313`), the CSS train (`e7e3f083b` · `9e29a921c`), the §5b.5 header waves (`0ee8acbe0` · `3d78778a9` · `e620af376`) and the rollup arm (`ee831a898` via `686853320`, first outing `50910752f`), measured on `0e03cee19` ([`v-wave-5-2026-09-12.md`](v-wave-5-2026-09-12.md)); 4 rows asserted — nine rows CONFIRMED and closed (#2157 #2158 #2160 #2206 #2214 #2215 #2190 #2207; #2198 already Done), #2212 REFUTED in part (row 2, back at Ready with the independent-count spec), #2181 PARTIAL (its behavioural half is the cb-v-css-audit section above); row 1 is #2229 (the seam parse break), rows 3–4 are #2233 / #2234. — 4 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-5-1 `tests/tooling/verify/ops/eslint.int.test.ts` | cb-v-wave-5 `:152` | the file **DOES NOT PARSE** at `0e03cee19` — the `test("the discovery payload is MEASURED…")` opened at `:152` | STATUS: CLOSED  **CLOSED** — `37caa7980` (#2229); independent `v-ledger-adjudica … |
| ROW-CB-V-WAVE-5-2 `eslint-discovery` · `eslint` | cb-v-wave-5 `eslint-discovery.ts:53-60` · `eslint.ts:36-40` | the #2212 "completion control" **cannot detect the truncation it is sold on**: the pro | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-WAVE-5-3 `gate-spelling-twins` | cb-v-wave-5 `:40` | the comment *"Pinned by that gate's own new namespace `mustFlag` row, not by this ledger"* is **still FALSE after `eb51d4313`**. It desc | STATUS: CLOSED  **CLOSED — `59297ef74` (#2233): the false `mustFlag` credit was  … |
| ROW-CB-V-WAVE-5-4 `lib/pass.ts` (legacy dispatcher) | cb-v-wave-5 `run` phase | a gate whose `run` phase THROWS comes back `ok: true` with `findings: []`; the failure appears only in the sibling `re | STATUS: CLOSED  **CLOSED** — `509d1d56a` (board #2234): legacy `runPass` `ok` is … |

### cb-v-fix-wave-4 — the nine older Verify rows (`3690117ba` #1331 #1335 #1949 #1996 · `27df4238a` #2086 #2152 · `e6994a62f` + `135e992c0` #2145 #2161 #2164), measured on `0e03cee19` ([`v-fix-wave-4-2026-09-12.md`](v-fix-wave-4-2026-09-12.md), landed UNFORMATTED on purpose — row 9 is why); 11 rows asserted — all nine rows CONFIRMED and closed; the eleven defects are the neighbours of the repaired claims: rows 1–3 and 11 are #2236, row 4 is #2237, row 5 and 10 are #2240, rows 6–7 are #2238, row 8 is #2239, row 9 is #2235 (P2, a formatter cementing a loss at exit 0). Structure leg HELD behind the battery. — 11 rows (0 OPEN, 11 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-FIX-WAVE-4-1 `eslint.config.js` | cb-v-fix-wave-4 L1 · `eslint.config.js:45` | the header's "What we INTENTIONALLY DROP" list names `query/infinite-query-property-order` and `query/mutation | STATUS: CLOSED  **CLOSED** — `badc14944` (board #2236): all four header claims n … |
| ROW-CB-V-FIX-WAVE-4-2 `eslint.config.js` | cb-v-fix-wave-4 L2 · `eslint.config.js:16, 18, 28, 22` | three "dormant until X lands" claims are all FALSE at tip, and one scope claim is stale. Query: "d | STATUS: CLOSED  **CLOSED** — `badc14944` (board #2236): all four header claims n … |
| ROW-CB-V-FIX-WAVE-4-3 `eslint.config.js` | cb-v-fix-wave-4 L3 · `eslint.config.js:1-55` | the header's "What each plugin gives us" enumerates 9 items and OMITS `eslint-plugin-tsdoc`, which is import | STATUS: CLOSED  **CLOSED** — `badc14944` (board #2236): all four header claims n … |
| ROW-CB-V-FIX-WAVE-4-4 `.dependency-cruiser.cjs` | cb-v-fix-wave-4 L4 · `.dependency-cruiser.cjs:13` | the repaired header replaced its own five dead cites with **"Each rule's own `comment` carries i | STATUS: CLOSED  **CLOSED** — `badc14944` (board #2237): all 16 spellings resolve … |
| ROW-CB-V-FIX-WAVE-4-5 `UNIFIED-VERIFICATION-DESIGN.md` | cb-v-fix-wave-4 L5 · `docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md:86-91, 110` | §3.1's new rule is absolute — **"TIER MEMBERSHIP IS | STATUS: CLOSED  **CLOSED** — `badc14944` (board #2240): both residues repaired ( … |
| ROW-CB-V-FIX-WAVE-4-6 `doc-catalog/ops/attest` | cb-v-fix-wave-4 L6 · `tooling/src/doc-catalog/ops/attest.ts:229` | the #1996 half-two DRIVER is pinned by NOTHING. `resolveEvidenceErrors` — the tree | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-FIX-WAVE-4-7 `doc-catalog/ops/attest` | cb-v-fix-wave-4 L7 · `tooling/src/doc-catalog/ops/attest.ts:10` | the header cites `tests/tooling/doc-catalog/attest.test.ts` as the file that "pins | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-FIX-WAVE-4-8 `component-size` | cb-v-fix-wave-4 L8 · `tooling/src/verify/gates/component-size.ts:64` | the rewritten `mustFlag[1]` `why` says "`line` and `messageIncludes` both name the ROU | STATUS: CLOSED  **CLOSED** — `badc14944` (board #2239): the `line` discriminator … |
| ROW-CB-V-FIX-WAVE-4-9 `doc-catalog/ops/format` | cb-v-fix-wave-4 L9 · `tooling/src/doc-catalog/ops/format.ts:344-387, 425-437` | `format --write` SILENTLY CEMENTS the #2154 loss, and class 1 just ad | STATUS: CLOSED  **CLOSED** — `b6ab9d444` (board #2235): `format --check` and `fo … |
| ROW-CB-V-FIX-WAVE-4-10 `.claude/agents/side-eye.md` | cb-v-fix-wave-4 L10 · `.claude/agents/side-eye.md:181` | the #2145 repair fixed the SPLIT and left three malformed code spans in the same cell: | STATUS: CLOSED  **CLOSED** — `badc14944` (board #2240): both residues repaired ( … |
| ROW-CB-V-FIX-WAVE-4-11 `eslint.config.js` | cb-v-fix-wave-4 L11 · `eslint.config.js:12-13` | the header points a reader at "`--max-warnings=0` (see the `lint:eslint` script)" for the property that t | STATUS: CLOSED  **CLOSED** — `badc14944` (board #2236): all four header claims n … |

### cb-barrier-structure-delta — the 2026-09-12 23:01 barrier's `check:structure-delta` (`main-586333-2026-09-12T18-47-45-941Z` → `main-1662184-2026-09-12T23-01-14-421Z`, measured by claude-b on `d968fc3fb`; no report file — the receipt is the two published slots); 2 rows asserted — the delta's first regression catch: two final hard policies went red under the baseline red and nothing else could see them (#2110's tool doing its job) — 2 rows (0 OPEN, 2 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-BARRIER-STRUCTURE-DELTA-1 `eslint-grant-liveness` · `eslint.config.js` | barrier delta · `gates/eslint-grant-liveness.ts:43,119,132,149` | REGRESSED 0 → 2 effective, ok → red. `c57e3c9b9` (#2 | STATUS: CLOSED  **CLOSED** — `6cd7b488c` (board #2213): the RATIFIED row and its … |
| ROW-CB-BARRIER-STRUCTURE-DELTA-2 `tooling-size` · `_shared/proc.ts` · `lib/gate-program-docs.ts` | barrier delta · `proc.ts` 464 lines (`fc4e0fa03`) · `gate-program-docs.ts` 507 lines (`ee831a898`) | STATUS: CLOSED  **CLOSED** — `6cd7b488c` (board #2242): `proc.ts` / `gate-progra … |

### cb-v-wave-6 — the ten Verify rows behind `3e2f189a3` (#1958 #2001 #2002 #2055 #2037) · `e0b83327c` (#2037) · `7f39f9970` (#1964 #1973 #2069) · `f96f45fb4` (#1976 #1977), measured on `cf7e46d12` ([`v-wave-6-2026-09-12.md`](v-wave-6-2026-09-12.md)); 4 rows asserted — all ten rows CONFIRMED and closed; rows 1–3 are #2249 (ARM E's three undeclared spellings), row 4 is #2250 (the #1976 remedy names the wrong door). Structure leg run and complete: 0 tool errors · 0 withheld · 303/303 · 312 effective, identical to the barrier slot. — 4 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-6-1 `gate-modernization` | cb-v-wave-6 `:225-234` | ARM E's `readsTypes` matches a type read only through a **PropertyAccessExpression callee**, so the ELEMENT-ACCESS spelling escapes | STATUS: CLOSED  **CLOSED** — `509d1d56a` (board #2249): ARM E matches a member P … |
| ROW-CB-V-WAVE-6-2 `gate-modernization` | cb-v-wave-6 `:225-234` | the same arm is blind to an **identifier callee**: `const { getType } = ctx.node; getType()` and `call(ctx.node.getType.bind(ctx.nod | STATUS: CLOSED  **CLOSED** — `509d1d56a` (board #2249): ARM E matches a member P … |
| ROW-CB-V-WAVE-6-3 `gate-modernization` | cb-v-wave-6 `:238-252` | ARM E recurses over `sf` — **the policy module's OWN SourceFile only** — so a type read one import hop away in a `lib/` helper is in | STATUS: CLOSED  **CLOSED** — `509d1d56a` (board #2249): ARM E matches a member P … |
| ROW-CB-V-WAVE-6-4 `lib/policy-pass-context.ts` | cb-v-wave-6 `:354` · `:396` | the #1976 fact-widening diagnosis is a single hard-coded string ending *"…never with `ctx.relativePath`"*, and `factWid | STATUS: CLOSED  **CLOSED** — `509d1d56a` (board #2250): the fact-widening diagno … |

### cb-v-wave-7 — the eight Verify rows behind `6cd7b488c` (#2213 #2242 #2241 #2221 #2222) and `b6ab9d444` (#2223 #2235 #2216), measured on `badc14944` ([`v-wave-7-2026-09-13.md`](v-wave-7-2026-09-13.md)); 4 rows asserted — all eight rows CONFIRMED and closed; the four defects are neighbours of the landed work: row 1 is #2258 (a false re-export claim in the new module's header), row 2 is #2259 (the landing message's non-reproducing size figures), row 3 is #2260 (a test file whose header names the wrong subject, with no enforcer over `tooling/**` mirror names), row 4 is #2262 (`closeRunSlot` prunes the run ring on gate-scoped/non-verdict runs). Structure leg SKIPPED by ruling — per-module `runPolicyPass` drives answered both real-tree questions; the whole-corpus tail stays unmeasured by this wave. — 4 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-7-1 `_shared/artifact-naming.ts` | cb-v-wave-7 `:7-9` | the new module's header states a MECHANISM that is false on the tree and that its own sibling in the SAME commit denies: *"IMPOR | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-WAVE-7-2 commit `6cd7b488c` (message) | cb-v-wave-7 · the `#2242` paragraph | the three post-split line counts in the landing message DO NOT REPRODUCE against the gate's own metric: it clai | STATUS: CLOSED  **CLOSED — INDEPENDENTLY REVIEWED** (#2259; cde165d7d): correcte … |
| ROW-CB-V-WAVE-7-3 `tests/tooling/_shared/artifacts.test.ts` | cb-v-wave-7 `:1` · `:10` | after the split this file tests ONLY `artifact-naming.ts` (`:10` imports all four names from `@orb/tooling/_s | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-WAVE-7-4 `_shared/artifacts.ts#closeRunSlot` · `verify/ops/structure.ts#finishSlot` | cb-v-wave-7 `artifacts.ts:252` | `closeRunSlot` is `publishRunSlot(root, slot, [])`, and `publishRunSlo | STATUS: CLOSED  **CLOSED** … |

### cb-v-wave-8a — eleven Verify rows (#1980 #2017 #2106 #2101 #2109 #2168 #2217 #2219 #2201 #2203 #2197) over `03dd7329e` · `c9b125f6a` · `ea37c99d8` · `b5490a02a` · `d334dd5ca` · merge `686853320` · `c053e67b3` · `fa8a6e15a`, measured on `50e31c534` ([`v-wave-8a-2026-09-13.md`](v-wave-8a-2026-09-13.md)); 10 rows asserted — seven rows CONFIRMED and closed (#2168 superseded by #2219), four PARTIAL and refuted back to Ready with the rework as their spec: row 1 is #2267 (`POPULATION_ROOTS` held by nothing), row 2 is #2268 (a NEW gate-modernization arm-B red minted by chunk C1), row 3 rides #2101, row 4 rides #2109, rows 5–9 are #2217's six surviving citers, row 10 rides #2197. Structure leg not requested; the planter re-run and the barrier's exit-2 classification remain primary's. — 10 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-8A-1 `contract/population.ts` | cb-v-wave-8a L1 · `tooling/src/verify/contract/population.ts:4-21` | `@authored` is now derived and exhaustive over `POPULATION_ROOTS` (#1980), but `POP | STATUS: CLOSED  **CLOSED — INDEPENDENTLY REVIEWED** (board #2267; 007f8732a): na … |
| ROW-CB-V-WAVE-8A-2 `list-row-adoption` | cb-v-wave-8a L2 · `tooling/src/verify/gates/list-row-adoption.ts:22` | `b5490a02a` (#2101/#2103 chunk C1) deleted the module's empty `ALLOWLIST` **and its st | STATUS: CLOSED  **CLOSED** — `c30c4c9c2` (board #2268): `ALLOWED_ROOTS` renamed  … |
| ROW-CB-V-WAVE-8A-3 `duplicate-action-doors` | cb-v-wave-8a L3 · `tooling/src/verify/gates/duplicate-action-doors.ts:228,259,264` | #2101's cardinality ruling names four modules; three are done and t | STATUS: CLOSED  **CLOSED** — #2101: 8fc7eb6dd replaces the per-row upper budget  … |
| ROW-CB-V-WAVE-8A-4 `policy-proof-expectations` | cb-v-wave-8a L4 · `tooling/src/verify/gates/policy-proof-expectations.ts:4` | header cites `` `expectationFailure` (`ops/policy-conformance.ts:184-21 | STATUS: CLOSED  **CLOSED — ee165b3a7** (board #2109): header names expectationFa … |
| ROW-CB-V-WAVE-8A-5 `contract/harness.ts` | cb-v-wave-8a L5 · `tooling/src/verify/contract/harness.ts:3` | the header justifies the surviving `Check` vocabulary by *"the retained `monotonicTests` Che | STATUS: CLOSED  **CLOSED** — `f211c4060` (board #2217): rg --hidden census by ar … |
| ROW-CB-V-WAVE-8A-6 `gate-runtime-orchestrator-playbook` | cb-v-wave-8a L6 · `docs/design/gate-runtime-orchestrator-playbook.md:664` | a LIVE orchestrator instruction — *"a renamed TRACKED spec is a | STATUS: CLOSED  **CLOSED** — `f211c4060` (board #2217): rg --hidden census by ar … |
| ROW-CB-V-WAVE-8A-7 `.claude/agent-doctrine.md` | cb-v-wave-8a L7 · `.claude/agent-doctrine.md:128` | a standing lane rule instructing that *"the test-baseline `deletions` ledger becomes a lie that p | STATUS: CLOSED  **CLOSED** — `f211c4060` (board #2217): rg --hidden census by ar … |
| ROW-CB-V-WAVE-8A-8 `gate-config-system` | cb-v-wave-8a L8 · `docs/design/gate-config-system.md:240` | lists as OWED work *"`GATE-AUTHORING.md`'s … `monotonic-tests.ts` `allow-skip` citation (that ga | STATUS: CLOSED  **CLOSED** — `f211c4060` (board #2217): rg --hidden census by ar … |
| ROW-CB-V-WAVE-8A-9 two test files | cb-v-wave-8a L9 · `tests/client/features/chat/components/greeting-swipe-strip.ct.tsx:4` · `tests/server/domain/chat/persistence/identity.int.test.ts:4` | both hea | STATUS: CLOSED  **CLOSED** — `f211c4060` (board #2217): rg --hidden census by ar … |
| ROW-CB-V-WAVE-8A-10 `tests/tooling/_load-budget.ts` | cb-v-wave-8a L10 · `tests/tooling/_load-budget.ts:134` | the #2197 stderr-capture repair (an instrument caught lying by omission) shipped with N | STATUS: DISSOLVED  **DISSOLVED — false premise** (#2197): the exit-2/stderr pin  … |

### cb-v-wave-8c — fourteen Verify rows (#2067 #2068 #2153 #2154 #2071 #2095 #2150 #2151 #2174 #2175 #2177 #2178 #2204 #2210) over the docs/rules/formatter landings `007c8b837` · `9757ed2da` · `ecf3d90fa` · `49b456e89` · `c6812ae41` · `8c7ca5e9f` · `b8bea3139` · `489dbca98` · `2e11d8c8b` · `0e83242dc` · `ebfe88146` · `da1fc0126` · `3d78778a9` · `56ae6a8cf`, measured on `50e31c534` ([`v-wave-8c-2026-09-13.md`](v-wave-8c-2026-09-13.md)); 10 rows asserted — seven rows CONFIRMED and closed (#2204 closed as a clarification), five PARTIAL and two REFUTED back to Ready with the rework as their spec: rows 1–2 ride #2067 (the repair half never landed in the two core law docs), rows 3–4 ride #2068 (`dangling-refs` grew 20 → 35, the `\bdead\b` escape unruled), row 5 rides #2150 (a SIZE cell regenerated beside an uncommitted edit), row 6 is #2266 (closed the same hour), row 7 rides #2071 (the law-doc half), row 8 rides #2095 (one relabel), row 9 rides #2210 (the census line never landed; the 46th key is a bare identifier), row 10 is #2270 (a parked population that grew). — 10 rows (0 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-8C-1 `Core-Enforcement-Active-Gates.md` | cb-v-wave-8c L1 · `docs/architecture/core/Core-Enforcement-Active-Gates.md:332,361` | #2067's repair half never landed in the two CORE LAW doc | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED (board #2067; core repair `6e5 … |
| ROW-CB-V-WAVE-8C-2 `Core-Path-Registry.md` | cb-v-wave-8c L2 · `docs/architecture/core/Core-Path-Registry.md:279` | the same class, lower severity: `the lenient naked/` + three escaped backticks + ` | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED (board #2067; core repair `6e5 … |
| ROW-CB-V-WAVE-8C-3 `dangling-refs` | cb-v-wave-8c L3 · `tooling/src/verify/gates/dangling-refs.ts` | the gate is STILL RED and has GROWN: 35 findings at `50e31c534` against the 20 #2068 named. 21 ar | STATUS: CLOSED  **CLOSED — `8d1654afc` plus `037356d74` (#2068/#2312): dangling  … |
| ROW-CB-V-WAVE-8C-4 `dangling-refs` | cb-v-wave-8c L4 · `tooling/src/verify/gates/dangling-refs.ts:390` | #2068's second half — "decide whether the `\bdead\b` escape is too wide" — was never decided. | STATUS: CLOSED  **CLOSED — `8d1654afc` (#2068): the rider escape is narrowed by  … |
| ROW-CB-V-WAVE-8C-5 `ops/gen/read-first-costs.ts` | cb-v-wave-8c L5 · `docs/design/gate-runtime-read-first.md:50` | `check:ledgers-fresh` is exit 1 at HEAD on a NEW instance of #2150's family: row 2 | STATUS: CLOSED  **CLOSED** — `0043f5533` (board #2150): the playbook states the  … |
| ROW-CB-V-WAVE-8C-6 `agent-sync/ops/sync.ts` | cb-v-wave-8c L6 · `.codex/agents/side-eye.toml` | `pnpm check:agents`, a REGISTERED stage, is exit 1 at HEAD: "side-eye.toml is stale". `badc14944` edit | STATUS: CLOSED  **CLOSED** — `6e03f7dae` (board #2266): `agents:sync` re-synced  … |
| ROW-CB-V-WAVE-8C-7 gate program docs | cb-v-wave-8c L7 · `docs/design/gate-runtime-standardization.md` | #2071's LAW-doc half was not executed. The doc is 2101 lines against the row's "well under 80 | STATUS: CLOSED  **CLOSED** — `119ad479f` split law/history; `5b82cc765` restored … |
| ROW-CB-V-WAVE-8C-8 `no-default-props` | cb-v-wave-8c L8 · `tooling/src/verify/gates/no-default-props.ts:6` | #2095's "after 0 · 0 · 0" is off by one: this module states its port as `// POPULATION NO | STATUS: CLOSED  **CLOSED** — #2095: 8c165cd9f relabels the substantive header PO … |
| ROW-CB-V-WAVE-8C-9 `exception-authority-census.md` | cb-v-wave-8c L9 · `docs/reviews/gate-runtime/exception-authority-census.md:172` | #2210's stated fix did not land. The census still reads "`RATIF | STATUS: CLOSED  **CLOSED — `1bf959a3e` (#2210): the census correction now record … |
| ROW-CB-V-WAVE-8C-10 `test-layout` | cb-v-wave-8c L10 · `tooling/src/verify/gates/test-layout.ts` | #2142's PARKED baseline of 51 real findings has drifted to 53 raw at HEAD. #2174's own file is NOT | STATUS: CLOSED  **CLOSED — INDEPENDENTLY REVIEWED** (#2270; cde165d7d): dated ad … |

### cb-v-wave-8b — twelve Verify rows (#1983 #1988 #2165 #1994 #2021 #2019 #2107 #2155 #2058 #2061 #2062 #2063) over `aff69b7ca` · `466fb187c` · `61cae0710` · `c97de9d2f` · `1a5c348eb` · `97e68be91` · `630cfe24c` · `6cc09bab2` · `b254138ab` · `a54de0421` · `44a66de69` · `ef32c26d0` · `aecbc6c6c` · `a33b2e339`, measured on `50e31c534` ([`v-wave-8b-2026-09-13.md`](v-wave-8b-2026-09-13.md)); 9 rows asserted — eight rows CONFIRMED and closed, three PARTIAL and one REFUTED (first half) back to Ready with the rework as their spec: row 1 rides #1988 (three `verify/**` sites still effective and unowned), rows 2–3 ride #2155 (the contract header lies about an emitter; three envelope sentences unpinned), row 4 rides #2063 (the ruled A+B split never landed — the module is wholly legacy), rows 5–8 are #2273 (four §4.6 silences on otherwise-confirmed conversions), row 9 is #2274 (`policy-refusal-coverage`'s family-test half is dead behind a fixture that invents a two-positional-arg dispatcher). Structure leg not requested. Rows 2–3 and 9 were later repaired and verified on main; their rows below point to the closing receipts. — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-8B-1 `no-inline-types` | cb-v-wave-8b · `tooling/src/verify/lib/show-artifact.ts:55`, `lib/tenancy-scope.ts:77`, `ops/debt.ts:155` | #1988 moved 22 verdict types to `contract/` and too | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED** (board #1988; f895d7348): th … |
| ROW-CB-V-WAVE-8B-2 `lib/policy-pass-context.ts` | cb-v-wave-8b · `tooling/src/verify/contract/policy-pass.ts:16` | #2155 item 2 is still open AND the contract header now LIES about it: it names `lib | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (specific #2155 item; separate res … |
| ROW-CB-V-WAVE-8B-3 `policy-refusal-envelope` | cb-v-wave-8b · `tests/tooling/verify/lib/policy-refusal-envelope.test.ts:117` | the two-sided pin that holds the literal/contract pair equal drives FIV | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (specific #2155 item; separate res … |
| ROW-CB-V-WAVE-8B-4 `no-blanket-suppression` | cb-v-wave-8b · `tooling/src/verify/gates/no-blanket-suppression.ts:512` | the #2063 ruling (SPLIT arms A+B to a final policy, arm C stays legacy and arm | STATUS: CLOSED  **CLOSED — `f5030b149`** (re-derived 2026-09-18)  … |
| ROW-CB-V-WAVE-8B-5 `tsconfig-entry-liveness` \| `biome-grant-liveness` | cb-v-wave-8b · `97e68be91`, `630cfe24c` | §4.6 SILENCE: neither commit lands a differential as a committed test nor states in | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-WAVE-8B-6 `test-layout` \| `test-presence` \| `test-presence-client` | cb-v-wave-8b · `aecbc6c6c` | §4.6 SILENCE for the mirror trio: the commit's floor names 15 §4.1 cuts, a `count:99` ins | STATUS: CLOSED  **CLOSED** — #2273 mirror record: 183e49714 records findings, po … |
| ROW-CB-V-WAVE-8B-7 `test-layout` | cb-v-wave-8b · `tooling/src/verify/gates/test-layout.ts` | ANCHOR MOVE (§4.6 category 6) unrecorded: the legacy descriptor reported its 53 mirror misses at `line: | STATUS: CLOSED  **CLOSED** — #2273: 183e49714 records line 0 to 1:1 movement plu … |
| ROW-CB-V-WAVE-8B-8 `no-color-literals` | cb-v-wave-8b · `tests/tooling/verify/gates/unfenced-class-fragment-scanners.test.ts:24` | the family test's header states §4.3 and §4.5 as inapplicable and s | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-WAVE-8B-9 `policy-refusal-coverage` | cb-v-wave-8b · `tooling/src/verify/gates/policy-refusal-coverage.ts:139-151`, `:195` | **THE FAMILY-TEST HALF IS DEAD, AND ITS PROOF ROW IS GREEN BECAU | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (board #2274)  … |

### cb-v-instruments-3 — the instruments batch `a5f33a0e1` (#2226 #2218 #2192) · `68e2851d2` (#2228) · `1d97b71df` (#2194 #2193), measured on `e417baa5b` ([`v-instruments-3-2026-09-13.md`](v-instruments-3-2026-09-13.md)); 6 rows asserted — #2226 and #2193 CONFIRMED and closed; #2218 REFUTED (the four arms already inherited a load-scaled budget, so the change is a no-op with a false comment), #2192 and #2194 PARTIAL, #2228 PARTIAL on its in-fence half — all four back to the authoring lane as one warm leg: rows 1–2 ride #2218, row 3 rides #2192, rows 4 and 6 ride #2228 (33 of 34 `@public` line citations wrong; the residual header's count), row 5 rides #2194 (the #2097 half untouched). Budget factor measured at 1.0116 under loadavg 10.2/16. — 6 rows (0 OPEN, 6 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-INSTRUMENTS-3-1 `eslint-tests-coverage.int` | cb-v-instruments-3 L1 · `tests/tooling/eslint-tests-coverage.int.test.ts:26-33,59,74,86,99` | `a5f33a0e1` adds `{ timeout: scaledBudget(CENSUS_ | STATUS: CLOSED  **CLOSED** — `cce850dc1` (board #2218): the no-op reverted, the  … |
| ROW-CB-V-INSTRUMENTS-3-2 `eslint-tests-coverage.int` | cb-v-instruments-3 L2 · `tests/tooling/eslint-tests-coverage.int.test.ts:50` | the inline *"the whole census (~2700 files) resolves in ~1s rega | STATUS: CLOSED  **CLOSED** — `cce850dc1` (board #2218): the no-op reverted, the  … |
| ROW-CB-V-INSTRUMENTS-3-3 `chat.int` D53 tripwire | cb-v-instruments-3 L3 · `tests/server/entry/compose/chat.int.test.ts:85-96,135` | the row's goal — a tripwire no longer "one contended run away fro | STATUS: CLOSED  **CLOSED** — `cce850dc1` (board #2192): the header states the me … |
| ROW-CB-V-INSTRUMENTS-3-4 `contract/**` `@public` reasons | cb-v-instruments-3 L4 · `tooling/src/verify/contract/schema-fact.ts:6,10` · `static-authored-value.ts:6,14` · (+31 more) | `68e2851d2`'s 57 | STATUS: CLOSED  **CLOSED** — `cce850dc1` (board #2228, in-fence half): the 46 li … |
| ROW-CB-V-INSTRUMENTS-3-5 `zod-error-issues-home` | cb-v-instruments-3 L5 · `tooling/src/verify/gates/zod-error-issues-home.ts:111` | #2194's second half — the #2097 `symbol?.getDeclarations()` chain | STATUS: CLOSED  **CLOSED** — `cce850dc1` (board #2194): `resolveTypePropertyOrig … |
| ROW-CB-V-INSTRUMENTS-3-6 `x-instruments-batch` report | cb-v-instruments-3 L6 · `docs/reviews/gate-runtime/x-instruments-batch-2026-09-13.md:88` | the residual header says "**68 rows**, none in this | STATUS: CLOSED  **CLOSED** — `cce850dc1` (board #2228, in-fence half): the 46 li … |

### cb-v-wave-9b — the mirror family's nine rows (#2129 #2130 #2131 #2132 #2133 #2134 #2136 #2138 #2141) behind `9b01c410a`, measured on `f211c4060` in the verifier's own worktree (every drive worktree- or tmpdir-rooted; the 01:25–01:36Z `__g_` leak on main's checkout touches none of it) ([`v-wave-9b-2026-09-13.md`](v-wave-9b-2026-09-13.md)); 5 rows asserted — seven rows CONFIRMED and closed, #2129 closed with its residual already on #2273, #2136 PARTIAL and refuted back to Ready (a fourth false-SHA carrier in the family test the commit itself edited); the nine mirror rows in the cb-v-mirror-suppressions section above flipped CLOSED here. Row 1 rides #2136, row 2 rides #2273, row 3 is #2279 (the empty pin has no same-substrate green twin), row 4 is the flip bookkeeping (closed here), row 5 is #2280 (a dead fallback whose comment asserts the guarantee that makes it unreachable). The wave also corroborated #2274 with receipts (the refusal-coverage recogniser credits zero real pins corpus-wide). — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-9B-1 mirror family | cb-v-wave-9b · `tests/tooling/verify/gates/mirror-index-family.test.ts:2` | the FOURTH carrier of #2136's false legacy-SHA parenthetical survives in the file `9b01 | STATUS: CLOSED  **CLOSED** — #2136: 8c165cd9f corrects the fourth parent-SHA car … |
| ROW-CB-V-WAVE-9B-2 mirror family | cb-v-wave-9b · `9b01c410a` commit message, `§4.6 DIFFERENTIAL` paragraph | the landed §4.6 record is a FINDINGS differential only — no POPULATION and no TOOL-ERROR | STATUS: CLOSED  **CLOSED** — #2273 mirror record: 183e49714 supersedes the findi … |
| ROW-CB-V-WAVE-9B-3 `test-presence` | cb-v-wave-9b · `tests/tooling/verify/gates/mirror-index-family.test.ts:208` | the NEW disk-planted `empty` pin has no SAME-SUBSTRATE green twin, so the file's ow | STATUS: CLOSED  **CLOSED** — `183e49714` (#2279); independent `v-wave-12b-2026-0 … |
| ROW-CB-V-WAVE-9B-4 mirror family | cb-v-wave-9b · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:549` | `9b01c410a` closes nine rows and flips NONE of them: ledger row `:549` (#2136) and | STATUS: CLOSED  **CLOSED** — flipped in THIS section (the nine rows above now re … |
| ROW-CB-V-WAVE-9B-5 `test-presence-client` | cb-v-wave-9b · `tooling/src/verify/gates/test-presence-client.ts:382` | dead fallback: `subjects = demanded.length > 0 ? demanded.toSorted() : [lowestTest | STATUS: CLOSED  **CLOSED** — `183e49714` (#2280); independent `v-wave-12b-2026-0 … |

### cb-v-verify-lib-4 — the verify-lib fixes `509d1d56a` (#2249 #2250 #2232 #2233 #2234 #2195) · `c30c4c9c2` (#2268) · `fdc708323` (#2275), measured on `cce850dc1` in the verifier's own worktree ([`v-verify-lib-4-2026-09-13.md`](v-verify-lib-4-2026-09-13.md)); 8 rows asserted + 1 bookkeeping row (#2275, whose commit named an OWED id with no row) — six rows CONFIRMED and closed; #2232 REFUTED (the founding case still reproduces: a MIXED operand emits neither flag; the lane's discriminating receipt does not reproduce; a `--project=types-node` regression) and #2233 PARTIAL (the fix shipped a new false paragraph) back to the authoring lane as one warm leg; rows 3–5 ride #2232, rows 1 and 8 ride #2233, row 2 is #2284 (`ledger-claims` has no maxBuffer), row 6 is #2285 (the artifact's one-term `ok`, #2234 one file over), row 7 closed here. The new verb's own arm (b) caught the missing #2275 row. — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-VERIFY-LIB-4-1 `gate-spelling-twins` | cb-v-verify-lib-4 · `tests/tooling/gate-spelling-twins.int.test.ts:48-51` | The paragraph `509d1d56a` added says the suite *"calls `loadGates()`, whic | STATUS: CLOSED  **CLOSED — `59297ef74` (#2233): the false legacy-only loader par … |
| ROW-CB-V-VERIFY-LIB-4-2 `ledger-claims` | cb-v-verify-lib-4 · `tooling/src/verify/ops/ledger-claims.ts` (`gitLog`) | `runNicedSync` is called with no `maxBuffer`, so `spawnSync`'s 1 MiB default trun | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-VERIFY-LIB-4-3 `scoped-test` | cb-v-verify-lib-4 · `tooling/src/verify/ops/scoped-test.ts` (`nodeConfigModeArgs`, MIXED arm) | The MIXED arm emits NEITHER flag, so a DIRECTORY operand holdi | STATUS: CLOSED  **CLOSED — `59297ef74` (#2232): MIXED selection now emits the un … |
| ROW-CB-V-VERIFY-LIB-4-4 `scoped-test` | cb-v-verify-lib-4 · `tests/tooling/verify/ops/scoped-test.test.ts:12-16` | The committed pin's RED-FIRST paragraph claims receipt 2 — *"with a PLANTED parse e | STATUS: CLOSED  **CLOSED — `59297ef74` (#2232): the false receipt prose was remo … |
| ROW-CB-V-VERIFY-LIB-4-5 UNIFIED-VERIFICATION-DESIGN | cb-v-verify-lib-4 · `docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md` §tests | The added sentence says *"every scoped node run carried the | STATUS: CLOSED  **CLOSED — `59297ef74` plus `cc3fe1648` (#2232/#2323): the false … |
| ROW-CB-V-VERIFY-LIB-4-6 `structure` | cb-v-verify-lib-4 · `tooling/src/verify/ops/structure.ts:83` | `toLegacyRows` writes the per-gate artifact row as `ok: violations.length === 0`, so `reports/che | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-VERIFY-LIB-4-7 ledger hygiene | cb-v-verify-lib-4 · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` | `b44d9ffa6` states `ledger rows OWED: #2275` and `#2275` exists as no row i | STATUS: CLOSED  **CLOSED** — resolved in THIS section: #2275's row is appended b … |
| ROW-CB-V-VERIFY-LIB-4-8 receipts | cb-v-verify-lib-4 · `docs/reviews/gate-runtime/x-verify-lib-fixes-2026-09-13.md` | Three receipt statements are wrong: (1) `scoped-test.int.test.ts` is **10** rows | STATUS: CLOSED  **CLOSED — `59297ef74` (#2233): the dated receipt-corrections se … |
| ROW-CB-V-VERIFY-LIB-4-9 `lib/bus-fact.ts` · `lib/tuple-vocabulary-fact.ts` | filed at landing · `bus-fact.ts:62-63` · `tuple-vocabulary-fact.ts:131-132` | `pnpm lint:eslint` was EXIT 1 on seven `tsd | STATUS: CLOSED  **CLOSED** — `fdc708323` (board #2275): both files reflowed, com … |

### cb-v-wave-9a — nine Verify rows over primary's fixes `badc14944` (#2236 #2237 #2238 #2239 #2240) · `50e31c534` (#2042) · `f211c4060` (#2217) · `05b3619c8` (#2247 #2248), measured on `cce850dc1` in the verifier's own worktree ([`v-wave-9a-2026-09-13.md`](v-wave-9a-2026-09-13.md)); 7 rows asserted — seven rows CONFIRMED and closed, two PARTIAL and refuted back to Ready: #2238 (the fix moved the unpinned default-resolver wiring instead of pinning it) and #2248 (the rendezvous follower can never satisfy the condition, so the 50 s failsafe is the mechanism on every run). Rows 1–3 are the confirmed rows' survivors (#2286 #2287 #2288), row 4 rides #2238, rows 5–6 ride #2248, row 7 is #2289 (a real-CLI child under the default 5 s timeout). — 7 rows (0 OPEN, 7 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-9A-1 `eslint.config.js` | w9a `eslint.config.js:809` | the zustand block's own comment still reads *"Dormant until `packages/client/src/state/` exists"* while the header item 6 that #2 | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-WAVE-9A-2 `UNIFIED-VERIFICATION-DESIGN.md` | w9a `:110`, `:113-114` | §3.1's absolute rule ("this doc NEVER re-spells tier membership") is still broken beside the cell #2240-L5 fixed: the ` | STATUS: CLOSED  **CLOSED — ee165b3a7** (board #2287; follow-ups 8f765deda, 11a35 … |
| ROW-CB-V-WAVE-9A-3 `.dependency-cruiser.cjs` · `dangling-refs` | w9a `dangling-refs.ts:262`, `:332-345` | #2237's second half is unaddressed and unrecorded: the 27 comment citations are repaired, bu | STATUS: CLOSED  **CLOSED — BOUNDED MEMBERSHIP RECONCILED** (#2288; cde165d7d): d … |
| ROW-CB-V-WAVE-9A-4 `doc-catalog/attest` | w9a `tooling/src/doc-catalog/ops/attest.ts:226` | #2238's fix moved the unpinned wiring rather than pinning it: cutting the DEFAULT resolver (`= resolveEvid | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-WAVE-9A-5 `artifacts.int.test.ts` | w9a `tests/tooling/_shared/artifacts.int.test.ts:69` | the follower child can NEVER satisfy the rendezvous — the leader unblocks, finishes and unlinks it | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-WAVE-9A-6 `artifacts.int.test.ts` | w9a `:49`, `:169-170`, `:178` | three comment claims false at tip, all written by the commit that made them false: *"Measured cost … ~16s"* (measured 52– | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-V-WAVE-9A-7 `structure.int.test.ts` | w9a `tests/tooling/verify/ops/structure.int.test.ts:231` | "a run KILLED mid-pass leaves the in-flight stub, and `show` refuses it" spawns a real CLI chi | STATUS: CLOSED  **CLOSED** … |

### cb-v-css-train-3 — the CSS train's four conversions `17a59099b` (sanctioned-css-homes + playwright-css-topology; #2183 #2231 #2265) · `a97454714` (tokens-contract; #2182) · `2dabae9ce` (seed-theme-ink-contrast; #2182) · `156609ccd` (#2181 row 14), measured on `1692583d6` in the verifier's own worktree ([`v-css-train-3-2026-09-13.md`](v-css-train-3-2026-09-13.md)); 9 rows asserted (the lane's own 2 rows are the section below) — #2265 #2231 and #2181 row 14 CONFIRMED and closed; sanctioned-css-homes and playwright-css-topology PARTIAL (functionally confirmed, one false header sentence and one unenforced narrowing); **tokens-contract REFUTED** (a malformed vault is WITHHELD, not reported — a §4.6 catch-regression the receipt census hides) and **seed-theme-ink-contrast REFUTED** (header prose takes the live finding-overload-provenance 0 → 2; an unenforced blindness arm; a private CSS parser survives). Rows 1 and 7 are #2292, rows 2/4/5 are #2293, rows 3/6/8/9 are #2294. The two REFUTED modules do not get their #1584 landing comment until the rework is confirmed. — 9 rows (0 OPEN, 9 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-CSS-TRAIN-3-1 `tokens-contract` | v-css-train-3 · `tooling/src/verify/gates/tokens-contract.ts:118` | The consumer receipts `members: result.scannedTokens`, which is 0 for ANY unparseable b | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED** (board #2292)  … |
| ROW-CB-V-CSS-TRAIN-3-2 `seed-theme-ink-contrast` | v-css-train-3 · `tooling/src/verify/gates/seed-theme-ink-contrast.ts:35,52` | Two HEADER PROSE mentions of the retired `@orb`-family marker are rea | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED** (board #2293)  … |
| ROW-CB-V-CSS-TRAIN-3-3 `playwright-css-topology` | v-css-train-3 · `tooling/src/verify/gates/playwright-css-topology.ts:110` | `textSpecifiers`' comment blanking is an UNENFORCED narrowing — the fun | STATUS: CLOSED  **CLOSED — FILED CLAUSE INDEPENDENTLY VERIFIED** (board #2294; r … |
| ROW-CB-V-CSS-TRAIN-3-4 `seed-theme-ink-contrast` | v-css-train-3 · `tooling/src/verify/gates/seed-theme-ink-contrast.ts:279-281` | The sheet-level `unresolved`-GROUND blindness loop is pinned by no | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED** (board #2293)  … |
| ROW-CB-V-CSS-TRAIN-3-5 `seed-theme-ink-contrast` | v-css-train-3 · `tooling/src/verify/lib/seed-theme-ink.ts:38-75` | A PRIVATE CSS reader survives behind `defineGate` — `DECLARATION`/`THEME_BLOCK`/ | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED** (board #2293)  … |
| ROW-CB-V-CSS-TRAIN-3-6 `playwright-css-topology` + `seed-theme-ink-contrast` | v-css-train-3 · the two modules' `mustRefuse` arrays | `product-css` `malformed` is a REACHABLE declared-resource statu | STATUS: CLOSED  **CLOSED — FILED CLAUSE INDEPENDENTLY VERIFIED** (board #2294; r … |
| ROW-CB-V-CSS-TRAIN-3-7 `tokens-contract` | v-css-train-3 · `tooling/src/verify/gates/tokens-contract.ts:166-175` | `token-contract` `empty` is reachable and unpinned; only `missing` carries a `mustR | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED** (board #2292)  … |
| ROW-CB-V-CSS-TRAIN-3-8 `sanctioned-css-homes` | v-css-train-3 · `tooling/src/verify/gates/sanctioned-css-homes.ts:42` | The header says "Both reachable statuses are pinned by `mustRefuse` rows". Onl | STATUS: CLOSED  **CLOSED — FILED CLAUSE INDEPENDENTLY VERIFIED** (board #2294; r … |
| ROW-CB-V-CSS-TRAIN-3-9 `tests/tooling/check-gates.repo.int.test.ts` | v-css-train-3 · `tests/tooling/check-gates.repo.int.test.ts:1075` | The comment says `tokens-contract` "CONVERTED 2026-09-13 (#2 | STATUS: CLOSED  **CLOSED — FILED CLAUSE INDEPENDENTLY VERIFIED** (board #2294; r … |

Current adjudication: the original #2292/#2293 defects and the four filed #2294 clauses above are independently verified. The later reachable-status, delta, and coupled-comment rows retain their separately adjudicated states below; these clause closures do not certify a whole module or issue. The original verdict in the heading records the first review, not the current closure state.

### cb-x-css-train — the lane's own two rows from [`x-css-train-2026-09-13.md`](x-css-train-2026-09-13.md) §LEDGER ROWS, landed at the verifier's confirmation (cb-v-css-train-3 judged both VALID); 2 rows asserted — both CLOSED by the train's own commits (#2265 at `17a59099b`; the seed-theme exemption table at `2dabae9ce`). — 2 rows (0 OPEN, 2 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-X-CSS-TRAIN-1 `playwright-ct.config.ts:48` + `gates/playwright-css-topology.ts` (legacy) | cb-x-css-train (lane row 1) | The gate's CT-config fence tested `code.includes("packages/client/src/ | STATUS: CLOSED  **CLOSED** — `17a59099b` (board #2265): the config respelled at  … |
| ROW-CB-X-CSS-TRAIN-2 `gates/seed-theme-ink-contrast.ts` — `DECORATIVE_STROKE_CARRIERS` | cb-x-css-train (lane row 2) | A NINE-ROW gate-owned `ExemptionTable` §12.5 bans outright, which the §5b audit | STATUS: CLOSED  **CLOSED** — `2dabae9ce` (board #2182): the nine-row table becam … |

### cb-v-wave-10 — the instruments warm leg `cce850dc1` (#2218 #2192 #2194, #2228's in-fence half) · `8d1654afc` + `1d83cf962` (#2068 #2175) · `c810fee07` (#2225 #2272 #2224) · `0043f5533` (#2150), measured on `a196a35d7` then re-driven at tip `5045a6a68` in the verifier's own worktree ([`v-wave-10-2026-09-13.md`](v-wave-10-2026-09-13.md)); 5 rows asserted — eight rows CONFIRMED and closed; **#2068 REFUTED** (its rider-narrowing half holds both ways on the real corpus, but `1d83cf962` deleted the `domain/hub` ARM3_ALLOW row on a false premise and `dangling-refs` reads 2 at tip — a patched sibling with the one row restored reads 0); #2225 PARTIAL (the row asks two things the landing does not give). Row 1 rides #2068, rows 2–4 are #2295 (three comment residues of the instruments batch), row 5 rides #2225. The `SANCTIONED_FIELDS` pair the wave first saw at a196a35d7 was gone at tip (`89a0b751d`) and was not filed. — 5 rows (0 OPEN, 4 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-10-1 `dangling-refs` | w10 · `tooling/src/verify/gates/dangling-refs.ts:779` | `1d83cf962` DELETED the `"domain/hub"` `ARM3_ALLOW` row on the premise that "the LAST phantom-shaped ment | STATUS: DISSOLVED  **DISSOLVED** — re-derived at the SAME sha (`9ad17fb5a`, main … |
| ROW-CB-V-WAVE-10-2 `zod-error-issues-home` | w10 · `tooling/src/verify/gates/zod-error-issues-home.ts:275,285` | two `mustPass` `why` strings cite symbols that DO NOT EXIST — `isIssuesMemberRead`, ` | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2295)  … |
| ROW-CB-V-WAVE-10-3 `resource-installed` | w10 · `tooling/src/verify/contract/resource-installed.ts:67,82,92` | three `@public` reasons say each interface is "a structural field (`id`) of the exporte | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2295)  … |
| ROW-CB-V-WAVE-10-4 `chat.int` (D53 ReDoS) | w10 · `tests/server/entry/compose/chat.int.test.ts:16,147` | both comment lines still describe the tripwire as "the scoped **10s** test timeout" / "The sc | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2295)  … |
| ROW-CB-V-WAVE-10-5 `verify` runner (#2225) | w10 · `tooling/src/verify/lib/exit-classifiers.ts:97-108` · `tests/tooling/verify/ops/run.int.test.ts:1411-1479` | the board row asks for TWO things the | STATUS: CLOSED  **CLOSED** … |

### cb-v-conversions-11 — primary's conversion trains `a196a35d7` (devtools-frontend-assets converts; bus-payload-allowlist splits over the new `lib/bus-payload-fact.ts`) and `cc2a7f76d` + `17297f298` (the Base UI family: baseui-surface-manifest, baseui-anatomy-completeness, baseui-derives-not-respells + `-health`, `lib/baseui-read.ts` re-homed), measured on `17297f298` in the verifier's own worktree ([`v-conversions-11-2026-09-13.md`](v-conversions-11-2026-09-13.md)); 12 rows asserted — `bus-payload-allowlist-health` and `baseui-derives-not-respells-health` CONFIRMED (#1584 comment posted); **baseui-surface-manifest and baseui-anatomy-completeness REFUTED** (three headline arms enforced by nothing including the version-bump tripwire; an unreachable carve claimed held; a raw-text blindness guard under a comment-SAFE header); devtools-frontend-assets, bus-payload-allowlist and baseui-derives-not-respells PARTIAL. Row 1 is #2296 (a LANDED SUITE RED: bus-payload-allowlist left in check-gates.repo.int's UNFIXTURABLE_GATES); rows 2/4/5/6/7/9/11 are #2297 (the Base UI rework); rows 3/8/10/12 are #2298 (planter-trio residue: five `adjudicateDevToolsClosure` clauses held by no tier, a receipt counting what was FOUND, a grant row out of sort order, a wrong test count). Not verified: the §4.6 fixture-level replays the commits claim (7/9, 6/7, 12/12). — 12 rows (0 OPEN, 12 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-CONVERSIONS-11-1 `bus-payload-allowlist` | v-conversions-11 · `tests/tooling/check-gates.repo.int.test.ts:1118` | **A LANDED SUITE RED.** `a196a35d7` converted the gate and rewrote its `UNF | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (board #2296)  … |
| ROW-CB-V-CONVERSIONS-11-2 `baseui-surface-manifest` · `baseui-anatomy-completeness` · `baseui-derives-not-respells` | v-conversions-11 · `baseui-surface-manifest.ts:43,82` · `baseui-anatomy-complete | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (#2297; `27acc5617`)  … |
| ROW-CB-V-CONVERSIONS-11-3 `bus-payload-allowlist` | v-conversions-11 · `tooling/src/verify/lib/reviewed-grants.ts:28` | The `bus-payload-allowlist:credential-id` row is inserted OUT OF SORT ORDER — | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (boards #2298, #2306)  … |
| ROW-CB-V-CONVERSIONS-11-4 `baseui-surface-manifest` | v-conversions-11 · `baseui-surface-manifest.ts:161,173,184` | THREE arms UNENFORCED by any proof row: `diffParts`'s vanished-PART direction, `di | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (#2297; `dea1061df`)  … |
| ROW-CB-V-CONVERSIONS-11-5 `baseui-anatomy-completeness` | v-conversions-11 · `baseui-anatomy-completeness.ts:112` + `:199` | The `part.disposition !== "unresolved"` carve on arm B is UNENFORCED, and | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (#2297; `f638436a2`)  … |
| ROW-CB-V-CONVERSIONS-11-6 `baseui-anatomy-completeness` | v-conversions-11 · `baseui-anatomy-completeness.ts:102` | The `part.kind !== "part"` continue is UNENFORCED, and it is NOT unfalsifiable — ` | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (#2297; `f638436a2`)  … |
| ROW-CB-V-CONVERSIONS-11-7 `baseui-anatomy-completeness` | v-conversions-11 · `baseui-anatomy-completeness.ts:62,154` | Arm C's blindness guard is a RAW TEXT SCAN (`sf.getText().includes(BASE_UI_MODU | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (#2297; `f638436a2`)  … |
| ROW-CB-V-CONVERSIONS-11-8 `devtools-frontend-assets` | v-conversions-11 · `tooling/src/_shared/devtools-assets.ts:330,381,406,374,414` | FIVE adjudicator clauses are held by NO enforcement tier: the | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2298)  … |
| ROW-CB-V-CONVERSIONS-11-9 `baseui-surface-manifest` | v-conversions-11 · `tests/tooling/verify/gates/baseui-and-surface-family.repo.int.test.ts:256-294` | §4.5 pin gap: `resource-policy-contract.md` | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (#2297; `90a7a90db`)  … |
| ROW-CB-V-CONVERSIONS-11-10 `bus-payload-allowlist` | v-conversions-11 · `bus-payload-allowlist.ts:120` | The consumer receipt is `members: Math.max(fact.fields.length, 1)`, and the comment two lines | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2298)  … |
| ROW-CB-V-CONVERSIONS-11-11 `baseui-derives-not-respells` · `-health` | v-conversions-11 · `baseui-derives-not-respells.ts:100,103` · `-health.ts:85,86` | Both declare `analysis: "resource"` with `ex | STATUS: CLOSED  **CLOSED — CONTRACT RECONCILED** (#2297/#2309; `c8fccfa7c`)  … |
| ROW-CB-V-CONVERSIONS-11-12 `devtools-frontend-assets` | v-conversions-11 · `devtools-frontend-assets.ts:29` | The header says the runtime path's regression proof is *"tests/tooling/\_shared/devtools | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2298)  … |

### cb-v-wave-12b — the mirror-family fix `183e49714` (#2254 #2279 #2280 #2270) and the client P1 landing `9ad17fb5a` (#1843 #1874 #1871 #2243), measured on `9ad17fb5a` in the verifier's own worktree ([`v-wave-12b-2026-09-13.md`](v-wave-12b-2026-09-13.md)); 3 rows asserted — six rows CONFIRMED and closed (#2254 #2279 #2280 #1843 code lens #1874 #2243); **#2270 PARTIAL** (the 57-member roster re-derives and reconciles member-for-member, but the INSTRUMENT is the defect: exact-set equality over a population that grows ~6 members a day in a `--full`-only suite is a false-red by construction — a planted `export {};` family test takes the drive to 58); #1871 PARTIAL by scope (item 1 confirmed; items 2/3/4 and comment finding 6 untouched at `9ad17fb5a`). Row 1 rides #2270 (fix spec: a class assertion plus a named-exception list); rows 2–3 are #2301 (four drifted `::after` headers plus `hit-extent.ts:107` documenting the fixed CTA-ring collision as live; the Button `inline` arm pinned by computed geometry alone). The rendered/UX half of #1843/#1874/#1871 was not measured (side-eye lens not dispatched, owner order). — 3 rows (0 OPEN, 3 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-12B-1 `test-layout` (family pin) | cb-v-wave-12b · `tests/tooling/verify/gates/mirror-index-family.test.ts:352-363` | the parked population is pinned by EXACT SET EQUALITY over a corpu | STATUS: CLOSED  **CLOSED — INDEPENDENTLY REVIEWED** (#2270; 6049dcded, cde165d7d … |
| ROW-CB-V-WAVE-12B-2 `ui-audit` hit-extent walker + CT touch-floor kit | cb-v-wave-12b · `tooling/src/ui-audit/ops/walker/hit-extent.ts:34,96,107` · `tests/support/browser/touch-floor.ts:5` · `tests/ | STATUS: CLOSED  **CLOSED — SOURCE/MAIN-CT VERIFIED** (#2301; `815741e6c`..`765dc … |
| ROW-CB-V-WAVE-12B-3 `@orb/ui` Button (`inline` arm) | cb-v-wave-12b · `tests/ui/primitives/button/button.ct.tsx:512` | #1843's HIT-TEST pins cover `glyph-xs` at both intents and both pointers; the ` | STATUS: CLOSED  **CLOSED — MAIN-CT VERIFIED** (#2301; `765dcdd71`, CT at `99acf9 … |

### cb-v-wave-12a — five commits `c810fee07` · `6d62ad8ab` · `37caa7980` · `196232af6` · `30fd90298`, measured on `9ad17fb5a` ([`v-wave-12a-2026-09-13.md`](v-wave-12a-2026-09-13.md)); 8 rows asserted — rows 1/2/3/5/6/7 are **CLOSED on current source** by `4d7f7152c` + comment correction `dd00ebb78` (#2303/#2304); row 4 remains **OPEN** (#2302), because neither scoped suite asserts the positional identities against the real ESLint config; row 8 remains **OPEN** (#2304), because the history reader still cannot identify a merge train or prove a prior pass. The repair lane recorded two native programs green before integration. Root independently ran the registry/run/history suites on integrated `dd00ebb78`: 106/106 passed, exit 0, receipt `reports/runs/test/main-3719553-2026-09-13T04-27-21-801Z/test-report.json`. This validates focused stage planning and history behavior; the full verification barrier remains owed. — 8 rows (1 OPEN, 7 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-12A-1 `registry-triggers` | w12a R1 · `tooling/src/verify/lib/registry-triggers.ts:141-147` | the header claimed the whole-only static-stage table was exhaustive, but no executable ass | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2303)  … |
| ROW-CB-V-WAVE-12A-2 `registry-triggers` | w12a R2 · `tests/tooling/verify/ops/run.int.test.ts:755-766` | the pin header said #2277 gave six stages path triggers while its loop drove eight and the ta | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2303)  … |
| ROW-CB-V-WAVE-12A-3 `eslint-grant-liveness` | w12a R3 · `tooling/src/verify/gates/eslint-grant-liveness.ts:53-60` | the positional table comment said the two fence identities were appended even thou | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2303)  … |
| ROW-CB-V-WAVE-12A-4 `eslint-grant-liveness` | w12a R4 · `tests/tooling/verify/gates/grant-liveness-family.test.ts` · `tests/tooling/verify/gates/eslint-grant-liveness.int.test.ts:42-66` | the scoped | STATUS: CLOSED  **CLOSED — `a19a119c2` + `c739f3544` (#2302)**  … |
| ROW-CB-V-WAVE-12A-5 `bypass-enumeration` | w12a R5 · `docs/reviews/gate-runtime/bypass-enumeration-2026-09-12.md:151` | `quality:cpd`, measured green and cheap, was the only green-table stage absent | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2304)  … |
| ROW-CB-V-WAVE-12A-6 `registry-triggers` | w12a R6 · `tooling/src/verify/lib/registry-triggers.ts:104-121` · `docs/design/gate-runtime-orchestrator-playbook.md:483-490` | `types:testd`, `config:biome | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2304)  … |
| ROW-CB-V-WAVE-12A-7 `eslint fence` | w12a R7 · `docs/design/gate-runtime-standardization.md:2071-2073` · `eslint.config.js:368-373` | two homes quoted an irreproducible 246.7 s → 226 s whole-run com | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2303)  … |
| ROW-CB-V-WAVE-12A-8 `history` (#1983 part 2) | w12a R8 · `tooling/src/verify/lib/history.ts:176-189` | the once-per-merge-train cadence is still advisory output: no exit change, threshold or machine-readable merge-train identity enforces it | other (advisory where an enforcement was implied) | STATUS: OPEN  **OPEN** (board #2304) | current source now states the limit truthfully in code and rendered output: cadence enforcement remains the quiescent-barrier procedure, and bounded per-checkout history cannot identify a merge train or prove a prior pass. `history.int.test.ts:183-188` pins that wording, but the function still returns strings only and `ops/run.ts` only prints them. The repair narrows the claim; it does not close the cadence defect |

### cb-x-policing-additions — five repair findings from [the full report](x-policing-additions-2026-09-13.md); 5 rows asserted. Integrated through `b718a0835`, independently source-reviewed. Branch measurements remain attributed to their recorded base. Current-main focused verification at `765dcdd71` passed 170/170 tests across the nine requested files (`reports/runs/test/main-4017828-2026-09-13T05-21-29-260Z/test-report.json`); this closes these five findings, not the broader policing program or follow-up #2309. — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-X-POLICING-ADDITIONS-1 `tooling/src/verify/gates/policy-refusal-coverage.ts` (recognizer) + `tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts:350` | cb-x-policing-additions | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (board #2274)  … |
| ROW-CB-X-POLICING-ADDITIONS-2 `docs/reviews/gate-runtime/policing-surface-audit-2026-09-12.md` §RECOMMENDED ADDITIONS #5 | cb-x-policing-additions row 2 | The ordering census counts SPLIT FAMILIES u | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (board #2187)  … |
| ROW-CB-X-POLICING-ADDITIONS-3 `tooling/src/verify/contract/policy-pass.ts` header + `tooling/src/verify/lib/policy-pass-context.ts` | cb-x-policing-additions row 3 | The contract named `policy-pass- | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (specific #2155 item; separate res … |
| ROW-CB-X-POLICING-ADDITIONS-4 `tests/tooling/verify/lib/policy-refusal-envelope.test.ts` (the #2155 completeness census, as landed at `9568d86f1`) | cb-x-policing-additions row 4 | Three ways at onc | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (specific #2155 item; separate res … |
| ROW-CB-X-POLICING-ADDITIONS-5 `tests/tooling/verify/lib/policy-refusal-envelope.test.ts` (the census as landed at `20b2c4190`) | cb-x-policing-additions row 5 | Two more: an authored sentence held i | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (specific #2155 item; separate res … |

### cb-x-test-population — five findings from [the full report](x-test-population-2026-09-13.md); 5 rows asserted. Code/config repairs integrated at `94830a655` and independently source-reviewed. The two residual defects were tracked as #2307 and #2308; #2308 now has the current-main focused receipt recorded below. — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-X-TEST-POPULATION-1 `biome.edit.jsonc` / the edit hook | cb-x-test-population · `tooling/biome.edit.jsonc:13` · `.claude/hooks/biome-check.sh:154-157` | `files.experimentalScannerIgnores` SUP | STATUS: CLOSED  **CLOSED — #2299** (`54b98560d`, integrated as `94830a655`); ind … |
| ROW-CB-X-TEST-POPULATION-2 biome scope (`vcs.useIgnoreFile`) | cb-x-test-population · `scripts/probes/openrouter/.gitignore:7` · `scripts/probes/rpg-extraction/.gitignore:4` | biome reads NESTED ign | STATUS: CLOSED  **CLOSED — #2299** (`54b98560d`, integrated as `94830a655`); ind … |
| ROW-CB-X-TEST-POPULATION-3 `biome` CLI contract | cb-x-test-population · row text of #2299 · `.claude/rules/lane-standing-facts.md` §Tool hazards | the recorded claim "biome exits 0 on an ignored pa | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2307)  … |
| ROW-CB-X-TEST-POPULATION-4 `POPULATION_ROOTS` | cb-x-test-population · `tooling/src/verify/contract/population.ts:4-21` | the hand-typed root table had no enforcer against the workspace: a new `pack | STATUS: CLOSED  **CLOSED — #2267** (`26315e791`, integrated as `007f8732a`); ind … |
| ROW-CB-X-TEST-POPULATION-5 `mirror-index-family` / `verifyPolicyProofs` | cb-x-test-population · `tests/tooling/verify/gates/mirror-index-family.test.ts:46-48` | the file's first assertion drives `v | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (board #2308)  … |

### cb-x-css-train-fixes — five follow-up findings from [the complete repair report](x-css-train-fixes-2026-09-13.md); 5 rows asserted. Source review and scoped integration receipts are recorded per row. — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-X-CSS-TRAIN-FIXES-1 `baseui-derives-not-respells` + `-health` | x-css-train-fixes · `tooling/src/verify/gates/baseui-derives-not-respells.ts:15` · `baseui-derives-not-respells-health.ts:22` a | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (board #2297)  … |
| ROW-CB-X-CSS-TRAIN-FIXES-2 `seed-theme-ink-contrast` | x-css-train-fixes leg 2 · `tooling/src/verify/lib/seed-theme-ink.ts:110` at `75b99ea89` | The first fold read only a declaration's immediate ow | STATUS: CLOSED  **CLOSED** — `4e6580704` (board #2293; lane `53d3d74ec`)  … |
| ROW-CB-X-CSS-TRAIN-FIXES-3 `tests/tooling/verify/ops/resource-tree.test.ts` | x-css-train-fixes leg 2 · `tests/tooling/verify/ops/resource-tree.test.ts:112` | Its whole-object `AuthoredCssFile` expe | STATUS: CLOSED  **CLOSED** — `4e6580704` (lane `53d3d74ec`)  … |
| ROW-CB-X-CSS-TRAIN-FIXES-4 `seed-theme-ink-contrast` | x-css-train-fixes leg 3 · `tooling/src/verify/lib/seed-theme-ink.ts:139-144` at `53d3d74ec` | Root membership matched the whole selector-list t | STATUS: CLOSED  **CLOSED** — `8425837e6` (board #2293; lane `4552bdf24`)  … |
| ROW-CB-X-CSS-TRAIN-FIXES-5 `seed-theme-ink-contrast` | x-css-train-fixes leg 4 · `tooling/src/verify/lib/seed-theme-ink.ts:178-187` at `4552bdf24` | The selector-list reader stopped at the first val | STATUS: CLOSED  **CLOSED** — `b8af78b29` (board #2293; lane `893d44b49`)  … |

### cb-x-css-family-unit — the conversion lane's authored-slice defect from [`x-css-family-unit-2026-09-13.md`](x-css-family-unit-2026-09-13.md) §LEDGER ROWS; 1 row asserted — independently confirmed by cb-v-css-family. — 1 rows (0 OPEN, 1 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-X-CSS-FAMILY-UNIT-1 `resource-css.ts` — `CssSelectorHookFact` | cb-x-css-family-unit · `tooling/src/verify/contract/resource-css.ts` | The hook fact published the attribute's open offset but | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED**  … |

### cb-v-css-family — independent review of the five-policy CSS-family conversion, measured on `3c685ce6a` ([full verifier report](v-css-family-2026-09-13.md)); 6 rows asserted — four repairs are source-accepted and green in the integrated 11/11 family battery, but remain FIXED pending the final B re-lens. The retirement dependency remains #2297; the inherited grant-order red closed separately as #2306. This section does not close the conversion wave. — 6 rows (0 OPEN, 6 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-CSS-FAMILY-1 `css-hook-provenance` | cb-v-css-family · `tooling/src/verify/lib/css-family-source-provenance.ts` · `tests/tooling/static-class-collection.int.test.ts` | The one-collector cla | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED**  … |
| ROW-CB-V-CSS-FAMILY-2 `css-selector-has-a-writer` | cb-v-css-family · `tooling/src/verify/lib/css-selector-writers.ts` (matrix cell f28) | The HAST `type === "element"` test was classified mutually | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED**  … |
| ROW-CB-V-CSS-FAMILY-3 `css-selector-has-a-writer-health` | cb-v-css-family · `tooling/src/verify/gates/css-selector-has-a-writer-health.ts` | The claim that `baseui-surface-manifest` is a strictly s | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED (board #2297, #2305; `dea1061d … |
| ROW-CB-V-CSS-FAMILY-4 `css-family-ownership-health` | cb-v-css-family · `tooling/src/verify/lib/css-family-census.ts` · `tooling/src/verify/gates/css-family-ownership-health.ts` · CEAG | Blur and co | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED (board #2305; `dd98eb356`, `f5 … |
| ROW-CB-V-CSS-FAMILY-5 `css-hook-provenance` | cb-v-css-family · `tooling/src/verify/lib/css-family-source-provenance.ts` · three gate headers · CEAG | Four prose homes claimed five consumers althoug | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED**  … |
| ROW-CB-V-CSS-FAMILY-6 `reviewed-grants` | cb-v-css-family · `tooling/src/verify/lib/reviewed-grants.ts` · `tests/tooling/verify/lib/reviewed-grants.test.ts` | The central grant table was already out | STATUS: CLOSED  **CLOSED — VERIFIED ON MAIN** (board #2306)  … |

Current adjudication: the second independent lens confirms the two ordinary policies; three repaired rows close, while health/prose residues remain #2305. The earlier awaiting-review heading and receipts are historical.

### codex performance closure — `policy-soundness` repeated static-read work (#1992) — 1 rows (0 OPEN, 1 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CODEX-1 `policy-soundness` · `lib/config-static-read.ts` · `lib/gate-contract.ts` | #1992 · `config-static-read.ts:142,236,287` · `gate-contract.ts:276-301` | The real-tree policy repeatedly rec | STATUS: CLOSED  **CLOSED — MEASURED** (board #1992)  … |

### cb-v-css-train-4 — independent re-verification at `61fb1b8ef` ([full report](v-css-train-4-2026-09-13.md)); 5 rows asserted. The filed #2292/#2293 defects are closed, while these newly separated rows remain open. Assignment does not establish repair. — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-CSS-TRAIN-4-1 `tokens-contract` | cb-v-css-train-4 · `tooling/src/verify/gates/tokens-contract.ts:59` | Header claims both reachable `token-contract` statuses are pinned, but invalid UTF-8 | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (#2314; `913ac535c`)  … |
| ROW-CB-V-CSS-TRAIN-4-2 `seed-theme-ink-contrast` + `playwright-css-topology` | cb-v-css-train-4 · `seed-theme-ink-contrast.ts:76` · `playwright-css-topology.ts:59` | Both headers claim `product-css` | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (#2314; `913ac535c`)  … |
| ROW-CB-V-CSS-TRAIN-4-3 `sanctioned-css-homes` | cb-v-css-train-4 · `tooling/src/verify/gates/sanctioned-css-homes.ts:42` | #2294 corrected the sentence's row-location half but retained “Both reachab | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (#2294; `913ac535c`)  … |
| ROW-CB-V-CSS-TRAIN-4-4 `seed-theme-ink-contrast` | cb-v-css-train-4 · `tooling/src/verify/lib/seed-theme-ink.ts:20` | “The four deltas, each measured … and each pinned” is false: at least seven diff | STATUS: CLOSED  **CLOSED — DIFFERENTIAL-VERIFIED** (#2315; `913ac535c`)  … |
| ROW-CB-V-CSS-TRAIN-4-5 `tests/tooling/token-contract.test.ts` | cb-v-css-train-4 · `tests/tooling/token-contract.test.ts:199` | Twin conversion comment still attributes `tokens-contract` to #2183; i | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (#2294; `913ac535c`)  … |

### cb-v-hit-geometry — adversarial verification at `765dcdd71` ([full report](v-hit-geometry-2026-09-13.md)); 7 rows asserted. No browser/CT floor was run by this verifier. — 7 rows (0 OPEN, 7 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-HIT-GEOMETRY-1 `ui-audit` walker + CT kit | cb-v-hit-geometry · `tooling/src/ui-audit/ops/walker/hit-extent.ts:126-127` + `tests/support/iso/hit-extent-walk.ts` | “Pinned equal” is false: r | STATUS: CLOSED  **CLOSED — NODE/MUTATION + MAIN-CT VERIFIED** (#2300; `0e0c3adab … |
| ROW-CB-V-HIT-GEOMETRY-2 `tests/client/components/setting-teach-row.ct.tsx` | cb-v-hit-geometry · `:353-360` | Live `::after` read remains on Button `size="inline"`, whose hit pseudo moved to `::befo | STATUS: CLOSED  **CLOSED — MAIN-CT + MUTATION VERIFIED** (#2311; `99acf985d`)  … |
| ROW-CB-V-HIT-GEOMETRY-3 `tests/client/features/preset/components/params-deck.ct.tsx` | cb-v-hit-geometry · `:578,606,635,956,982` | Same stale pseudo read is hidden by `\|\| 0`, so the assertion sil | STATUS: CLOSED  **CLOSED — MAIN-CT + SOURCE VERIFIED** (#2311; `99acf985d`)  … |
| ROW-CB-V-HIT-GEOMETRY-4 both hit-extent homes | cb-v-hit-geometry · `tests/support/iso/hit-extent-walk.ts#pseudoHitRect` + `tooling/src/ui-audit/ops/walker/hit-extent.ts:140-159` | Resolved local-pi | STATUS: CLOSED  **CLOSED — NODE/MUTATION + MAIN-CT VERIFIED** (#2300; `0e0c3adab … |
| ROW-CB-V-HIT-GEOMETRY-5 `Core-Enforcement-Active-Gates.md` | cb-v-hit-geometry · `:242` | Backticked `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` has no declaration after #2181. | drifted law-doc cite | S | STATUS: CLOSED  **CLOSED — VERIFIED; #2312**  … |
| ROW-CB-V-HIT-GEOMETRY-6 `Core-Path-Registry.md` | cb-v-hit-geometry · `:146` | Two `domain/hub` citations regress the class #2068 had closed at `9ad17fb5a`; frame as a regression of the closed row. | STATUS: CLOSED  **CLOSED — VERIFIED; #2312**  … |
| ROW-CB-V-HIT-GEOMETRY-7 `@orb/ui` tokens | cb-v-hit-geometry · `packages/ui/src/tokens/tokens.json` `spacing.glyph-xs.$description` | Sole vault `::after` description still names the old hit pseudo | STATUS: CLOSED  **CLOSED — SOURCE/GENERATION/MAIN-CT VERIFIED** (#2313; `99acf98 … |

### cb-v-css-unit-2 — second independent lens at `f56e83d52` ([full report](v-css-unit-2-2026-09-13.md)); 5 rows asserted. Ordinary `css-family-ownership` and `css-selector-has-a-writer` are confirmed for landing; these sibling/prose residues remain open. — 5 rows (0 OPEN, 5 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-CSS-UNIT-2-1 `css-family-ownership-health` | cb-v-css-unit-2 · `tooling/src/verify/lib/css-family-policy.ts:202` · `gates/css-family-ownership-health.ts:95-110` | Emptying the colorization | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (#2305; `7bf03e12f`)  … |
| ROW-CB-V-CSS-UNIT-2-2 `css-family-ownership-health` | cb-v-css-unit-2 · `gates/css-family-ownership-health.ts:132-149` | `mustPass[5]` says it is a third carrier and stops the retired `size * 2` cou | STATUS: CLOSED  **CLOSED — CONTROL-VERIFIED** (#2305; `7bf03e12f`)  … |
| ROW-CB-V-CSS-UNIT-2-3 `css-hook-provenance` | cb-v-css-unit-2 · `tooling/src/verify/lib/css-family-policy.ts:519-524` | Fence prose still says three findings and 2-with/5-without after per-member co | STATUS: CLOSED  **CLOSED — SOURCE/CONTROL-CONFIRMED** (#2305; `7bf03e12f`)  … |
| ROW-CB-V-CSS-UNIT-2-4 `css-hook-provenance` | cb-v-css-unit-2 · `tooling/src/verify/lib/css-family-proof-fixtures.ts:107-111` (+ `gates/css-family-ownership.ts:553`) | Fixture prose retains retired | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (#2305; `7bf03e12f`)  … |
| ROW-CB-V-CSS-UNIT-2-5 `css-selector-has-a-writer-health` | cb-v-css-unit-2 · `gates/css-selector-has-a-writer-health.ts:29-36` | Prose says BaseUI vanished-part and vanished-component directions rem | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** (#2305; `7bf03e12f`)  … |

### cb-x-resource-selection — [full builder report](x-resource-selection-2026-09-13.md), measured at `028e278ee`; 3 rows asserted. Integrated as `57f7affdc`, including the contract-home correction. Independent source review accepted the algorithm and integrated 220/220 passed at `reports/runs/test/main-190157-2026-09-13T06-23-39-779Z/test-report.json`; Resource-contract prose is reconciled in this integration after independent source review. The final independent review at `99acf985d` confirms the three #2309 defects ([v-baseui-final Claims 1–5](v-baseui-final-2026-09-13.md)); that report's separate #2297 and whole-program limitations are not closed by these rows. — 3 rows (0 OPEN, 3 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-X-RESOURCE-SELECTION-1 `baseui-derives-not-respells` · `baseui-derives-not-respells-health` · `baseui-state-data-attributes` | #2309 `lib/policy-plan.ts:262` · `lib/policy-pass.ts:326` | a ch | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED** (#2309; `57f7affdc`, review  … |
| ROW-CB-X-RESOURCE-SELECTION-2 `baseui-derives-not-respells` · `baseui-derives-not-respells-health` · `baseui-state-data-attributes` | #2309 `lib/policy-pass.ts:252` (the deleted `requestStaysDeclare | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED** (#2309; `57f7affdc`, review  … |
| ROW-CB-X-RESOURCE-SELECTION-3 `lib/policy-plan.ts` · `lib/policy-pass.ts` | #2309 `policy-plan.ts:238` vs `policy-pass.ts:318` | planner and dispatcher computed the split independently and disagreed | STATUS: CLOSED  **CLOSED — INDEPENDENTLY VERIFIED** (#2309; `57f7affdc`, review  … |

### Recovered adjacency-review table 1 — 2026-09-13 — 4 rows (1 OPEN, 3 CLOSED)

These existing rows had lost their table header and carried escaped leading pipes, making them invisible to the derived rollup. Their recorded defect text and states are preserved; restoration is not fresh implementation adjudication.

| module | wave · source | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-RECOVERED-ADJACENCY-REVIEW-T-1 `policy-legacy-imports` | cb-adj-authority L1 · `tooling/src/verify/gates/policy-legacy-imports.ts:120-136` (`FORBIDDEN_IMPORT_HOMES`) and its `fix` string | **ARM A's stated remedy VOIDS the §12.5 property the arm exists to enforce.** The arm judges the IMPORT ORIGIN of a specifier, and `#2201`'s re-export chase follows only `export … from`. A gate-owned `ExemptionTable` moved into `lib/<family>.ts` as `import type { ExemptionTable } from "../contract/gate.ts"` + `export const T: ExemptionTable = {…}` is therefore invisible: `lib/x.ts` is neither a forbidden home nor a registering gate module, and it is outside the declared population (`under: ["tooling/src/verify/gates/**"]`, 309 source files). §12.5 says *"Gate modules receive neither grant tables nor marker parsers"* — a final module importing that table still receives one. The arm's own `fix` ARM B authorizes the move (*"debt data with one owner (a deferral list) moves to `contract/` or `lib/` the same way"*), so this is a designed escape rather than a false negative — but nothing then holds §12.5, and #1922's migration can reach 0 red at 0% done | other (coverage gap created by the stated remedy) | STATUS: OPEN  **OPEN** (board #2320; migration #2147 / #1922) | `pnpm check:structure --check policy-legacy-imports` on `1ea2c2a0e`: **5 findings** (the invocation's own positive control — the recognizer fires) and NONE of them is `no-raw-spacing-in-features:34`, `no-raw-typography-in-features:51`, `contract-derives-not-respells:54` or `injected-op-caller-param-health:22`, each of which imports a live exemption table from `lib/`. The four tables are intact: `lib/raw-spacing-tier.ts:22`, `lib/raw-typography-tier.ts:21`, `lib/contract-derives-not-respells.ts:32` (all three still `ExemptionTable`-typed off `contract/gate.ts`) and `lib/injected-op-caller-param.ts:37` (retyped `CallerFreeOpRow[]`). Four of the nine modules the arm named at mint went green by exactly this move (`3420a81e9`, `d9d1e3524`) and **zero reviewed grants were minted** — no `REVIEWED_GRANTS` row names any of the five sanctioned-home policies · FIX: judge the exemption-table SHAPE at the final module's import boundary (a `defineGate` module importing a value whose declared type resolves to `contract/gate.ts#ExemptionTable`/`ExemptionRow`, wherever it sits), or widen the population to `tooling/src/verify/lib/**` with an `ExemptionTable`-declaration arm. Either way the arm needs a `mustFlag` fixture for the one-hop-lib shape, which it has for the `export … from` shim (`:434`) and not for this one |
| ROW-RECOVERED-ADJACENCY-REVIEW-T-2 `#2000` | cb-adj-authority L2 · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:357` | the row's OPEN cell says *"Still owed: the Tier 3 ruling, `turn-i | STATUS: CLOSED  **CLOSED** — corrected in this fold from independently reviewed  … |
| ROW-RECOVERED-ADJACENCY-REVIEW-T-3 warning debt | cb-adj-policy · `tooling/src/verify/gates/policy-refusal-coverage.ts:422` | a SECOND warning policy names a CLOSED issue: `workItem: 2184` — *"polic | STATUS: CLOSED  **CLOSED** … |
| ROW-RECOVERED-ADJACENCY-REVIEW-T-4 the refutation ledger | cb-adj-policy · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:549,765,818` | three `state` cells read OPEN for work that lande | STATUS: CLOSED  **CLOSED** — corrected in this fold from independently reviewed  … |

### Recovered adjacency-review table 2 — 2026-09-13 — 2 rows (0 OPEN, 2 CLOSED)

These existing rows had lost their table header and carried escaped leading pipes, making them invisible to the derived rollup. Their recorded defect text and states are preserved; restoration is not fresh implementation adjudication.

| module | wave · source | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-RECOVERED-ADJACENCY-REVIEW-T2-1 UNIFIED-VERIFICATION-DESIGN | cb-adj-reconcile · `docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md:373-382` | the WHAT-THIS-DOES-NOT-FIX paragraph closes *"I | STATUS: CLOSED  **CLOSED** — #2323 source/documentation correction cc3fe1648; in … |
| ROW-RECOVERED-ADJACENCY-REVIEW-T2-2 `refutation-ledger-2026-09-12` | cb-adj-reconcile · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1063,1065` | the CLASS ROLLUP is stale by **51 rows | STATUS: CLOSED  **CLOSED — root barrier rebuilt through production `deriveClassR … |

### Codex original-wave gap probes — measured on `83215b816` ([`adj-audit-gap-probes-2026-09-13.md`](adj-audit-gap-probes-2026-09-13.md)); one confirmed defect, filed as #2325 — 1 rows (0 OPEN, 1 CLOSED)

| subject | found by | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CODEX-ORIGINAL-WAVE-GAP-PROB-1 `no-loose-id-cast` | Codex gap probes · `tooling/src/verify/gates/no-loose-id-cast.ts:45-51,79-84` | A legal parenthesized const-asserted operand in `("" as const) | STATUS: CLOSED  **CLOSED … |

### cb-adj-closures — production-default and false-receipt follow-ups · 2 rows ([full review](adj-closure-review-2026-09-13.md)) — 2 rows (0 OPEN, 2 CLOSED)

| module | wave·path:line | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-ADJ-CLOSURES-1 `ledger-claims` | cb-adj-closures · `tooling/src/verify/ops/ledger-claims.ts:214` · `:226` · `:290` | the 256 MiB capture ceiling that IS the #2284 fix is a DEFAULT PARAMETER t | STATUS: CLOSED  **CLOSED** … |
| ROW-CB-ADJ-CLOSURES-2 `tests/tooling/_load-budget.ts` (ledger row 772's receipt) | cb-adj-closures · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:772` | row 772's stated receipt does n | STATUS: CLOSED  **CLOSED — reconciled with the original L10 retraction in this l … |

### cb-x-production-drivers — two attestation follow-up findings ([`x-production-drivers-2026-09-13.md`](x-production-drivers-2026-09-13.md)); 2 rows asserted, both closed by the reviewed root seam and fixture isolation at `846818115` + `7c63968db`. Historical observations are retained; final independent review and main runtime/type receipts are in the report. — 2 rows (0 OPEN, 2 CLOSED)

| # | module / file | defect | evidence | class | state |
| -: | - | - | - | - | - |
| ROW-CB-X-PRODUCTION-DRIVERS-1 1 | `tooling/src/doc-catalog/ops/attest.ts:169-171` — the reader-sameness claim | The header says the driver judges each row "through `lib/receipt-rules.ts` — the same | STATUS: CLOSED  **CLOSED** — #2238; 846818115 + 7c63968db; independent acceptanc … |
| ROW-CB-X-PRODUCTION-DRIVERS-2 2 | `tooling/src/doc-catalog/ops/attest.ts` + `ops/tree.ts:26` — the driver has no isolated corpus | `root = REPO_ROOT` (`_shared/artifacts.ts:17`, `import.meta.dirname | STATUS: CLOSED  **CLOSED** — #2238; 846818115 + 7c63968db; independent acceptanc … |

### cb-x-refute-repairs — [full corrected report and independent review](x-refute-repairs-2026-09-13.md); 2 rows asserted. Integrated as cde165d7d. #2197 remains OPEN pending a revision/load-bearing quiet planter receipt; bounded #2259/#2270/#2288 dispositions are separate. — 2 rows (0 OPEN, 2 CLOSED)

| module | wave·path:line | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-X-REFUTE-REPAIRS-1 `tests/tooling/_load-budget.ts` | cb-x-refute-repairs · `tests/tooling/_load-budget.ts:132-138` (pre-fix) | the `#2197` comment justifying the `stdio` triple asserted a nod | STATUS: CLOSED  **CLOSED — SOURCE-CONFIRMED** — `f946a501e`, integrated in `cde1 … |
| ROW-CB-X-REFUTE-REPAIRS-2 `test-layout` (park accounting) | cb-x-refute-repairs · `tooling/src/verify/gates/test-layout.ts` · `#2142` body | the parked population is 59 at `204607e84` while #2142's | STATUS: CLOSED  **CLOSED — #2142 title, body and wake condition updated and read … |

### cb-x-config-scoped-proof — [full report and independent review](x-config-scoped-proof-2026-09-13.md); 1 row asserted. Integrated at a19a119c2 + c739f3544 and verified on main. — 1 rows (0 OPEN, 1 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-X-CONFIG-SCOPED-PROOF-1 `config-snapshot` | cb-x-config-scoped-proof · `tooling/src/verify/ops/config-snapshot.ts:574-590` (at `0276b6a57`) | Inventory and overlay branches disagreed about th | STATUS: CLOSED  **CLOSED — `a19a119c2` (#2302)**  … |

### Compiler-program discovery — #2335 ([`v-world-type-config-preservation-2026-09-13.md`](v-world-type-config-preservation-2026-09-13.md)); 1 row — 1 rows (0 OPEN, 1 CLOSED)

| module | wave/path | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-COMPILER-PROGRAM-DISCOVERY-1 `compiler-program-discovery` | W1 · `tooling/src/verify/lib/policy-program-membership.ts` | An `extends` edge removes a concrete parent from discovery and explicit n | STATUS: CLOSED  **CLOSED** — #2335; integrated `2b6df2a29`; independent review a … |

### Q08 production dependency repair — #2337 ([`v-q08-production-consumption-2026-09-13.md`](v-q08-production-consumption-2026-09-13.md)); 1 row — 1 rows (0 OPEN, 1 CLOSED)

| id | module | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-Q08-PRODUCTION-DEPENDENCY-RE-1 Q08-METHOD-ROOT | policy-descriptor-read / policy-family-readers | Legal method-form create hooks had no production dependency root, falsely accusing shared-reader | STATUS: CLOSED  **CLOSED** — #2337; `65190f0af`, `0cb85a8db`, `735a86d0c`  … |

### Workboard byte-limit repair — #1906 / #1920 ([`v-workboard-evidence-2026-09-13.md`](v-workboard-evidence-2026-09-13.md)); 2 rows — 2 rows (0 OPEN, 2 CLOSED)

| id | module | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-WORKBOARD-BYTE-LIMIT-REPAIR-1 WB-EVIDENCE-1 | workboard help / CLI test | Help and its assertion described the measured UTF-8 byte cap as characters. | other (operator guidance) | STATUS: CLOSED … |
| ROW-WORKBOARD-BYTE-LIMIT-REPAIR-2 WB-EVIDENCE-2 | orchestrator-runbook | The skill prescribed the superseded #1920 workaround after the byte-budget fix. | other (operator guidance) | STATUS: CLOSED … |

### Replay continuation repairs — #2319 ([`v-2319-continuation-review-2026-09-13.md`](v-2319-continuation-review-2026-09-13.md)); 4 rows — 4 rows (0 OPEN, 4 CLOSED)

| id | module | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-REPLAY-CONTINUATION-REPAIRS-1 V-2319-C1 | registry-definitions-legacy-replay.test.ts | Broad regex accepted any unclassified reason despite the exact-name claim. | other (proof blind spot) | STA | STATUS: CLOSED  **CLOSED** — `b6d116e6b`  … |
| ROW-REPLAY-CONTINUATION-REPAIRS-2 V-2319-C2 | x-legacy-replay-2026-09-13.md | Recipe required prepend while the working twin also repointed existing imports. | other (stale procedure) | STATUS: CLOS … |
| ROW-REPLAY-CONTINUATION-REPAIRS-3 V-2319-C3 | modal opener replay | An unresolved dependency impersonated a stronger-reader differential. | other (fixture artifact) | STATUS: CLOSED  **CLOSED** — `b … |
| ROW-REPLAY-CONTINUATION-REPAIRS-4 V-2319-S1 | route sibling replay control | Synthetic chat grant copied app-shell rationale despite licensing a different operation. | other (authority metadata) | S | STATUS: CLOSED  **CLOSED** — `dc68f3f75` (#2319)  … |

### Replay exact-arm repair — #2338 ([`v-2319-integration-review-2026-09-13.md`](v-2319-integration-review-2026-09-13.md)); 1 row — 1 rows (0 OPEN, 1 CLOSED)

| id | module | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-REPLAY-EXACT-ARM-REPAIR-1 R-2319-1 | registry-definitions-legacy-replay.test.ts | Imported modal definition observed a common prefix and mislabeled its resolved placeholder arm as an anchor move | STATUS: CLOSED  **CLOSED** — #2338; `45d520e73`  … |

### Proof-message and declaration-census prevention — 2026-09-13; 3 rows — 3 rows (0 OPEN, 3 CLOSED)

| id | module | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-PROOF-MESSAGE-AND-DECLARATIO-1 REGISTRY-HOST-IDENTITY-1 | verify-registry-parity | Missing `scripts.verify` disabled missing-stage and root-runtime-dependency checks despite canonical root resou | STATUS: CLOSED  **CLOSED — #2340; a175779d0**  … |
| ROW-PROOF-MESSAGE-AND-DECLARATIO-2 Q08-PROOF-MESSAGE-READABILITY | policy-proof-expectations | A present unreadable messageIncludes acquired the optional field's absence semantics. | other (false cl | STATUS: CLOSED  **CLOSED — #2230 checkpoint; 6373db80c**  … |
| ROW-PROOF-MESSAGE-AND-DECLARATIO-3 F3-REFUSAL-ARRAY-CENSUS | policy-refusal-coverage | Literal-only dependency/refusal arrays omit const/import aliases, credit empty spreads, and treat unreadable de | STATUS: CLOSED  **CLOSED — #2342** · integrated `bad5baab80185594f3a8d92bccf20fd … |

### Boot-trace terminal capture and evidence truth — #2345, 2026-09-13 — 1 rows (0 OPEN, 1 CLOSED)

Independent review refuted the intermediate repair before landing: stop-command stalls escaped its deadline, failed stops lost raw evidence, two timeout literals violated the clock policy, and partial retained traces inherited a complete artifact declaration. The final repair was reviewed against the five-file snapshot committed below; this does not establish the gate program's consolidated barrier.

| module | defect | class | state | receipt |
| - | - | - | - | - |
| ROW-BOOT-TRACE-TERMINAL-CAPTURE--1 `tooling/src/cpu-profile/ops/boot-trace.ts`; `tooling/src/snap/ops/arms/boot-trace.ts`; boot/plumbing tests | Bound command plus completion, retain raw events and | STATUS: CLOSED  **CLOSED** — #2345 repair committed and independently confirmed  … |

### Board-citation control witness — #2347, 2026-09-13 — 1 rows (0 OPEN, 1 CLOSED)

| module | defect | class | state | receipt |
| - | - | - | - | - |
| ROW-BOARD-CITATION-CONTROL-WITNE-1 `tooling/src/verify/ops/board-citations.ts` | A missing or off-board closed-control issue produced one generic crossing, falsely certifying that the board reader h | STATUS: CLOSED  **CLOSED** — repair `182f7ecbf` (board #2347); independently con … |

### Ledger orphan-row admission — #2348, 2026-09-13 — 1 rows (0 OPEN, 1 CLOSED)

| module | defect | class | state | receipt |
| - | - | - | - | - |
| ROW-LEDGER-ORPHAN-ROW-ADMISSION-1 `lib/gate-program-rollup.ts`; `lib/citation-sources.ts` | An escaped or separatorless orphan defect row is silently excluded while a remaining valid table keeps con | STATUS: CLOSED  **CLOSED** — `c220a8b29` (board #2348); independent correction r … |

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
