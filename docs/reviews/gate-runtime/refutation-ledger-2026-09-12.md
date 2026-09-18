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
4. **EVERY APPEND GOES ABOVE `## CLASS ROLLUP`, INSIDE THE `
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

## THE LEDGER

### Wave 3 — the Drizzle-schema fact family (`v-audit-wave3-2026-09-12.md`) — 8 rows (1 OPEN, 7 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-W3-1 all nine | w3 `:187` (HIGH), systemic successor | The original nine Drizzle headers are repaired; other final headers still omit a semantic family decision or the legacy/final population comparison. | §5b.5 header | STATUS: OPEN  **OPEN — systemic; the named nine are CLOSED** | Independent full-header adjudication at `22d61f8bb`, 2026-09-13: the twelve imports of `origin-client-family.suite.test.ts` include seven missing family decisions and nine missing population ports. These are semantic omissions, not missing uppercase labels or SHA patterns. Counterexamples include `fetch-fn-in-features` and `no-context-returntype`; neither header supplies either decision. This bounded census does not establish a new whole-corpus count. Historical token counts are superseded as acceptance evidence.  Historical receipts retained for provenance; current adjudication above supersedes their stale population and token counts: re-derived this session: `grep -c 'FAMILY'` and `grep -c 'POPULATION PORT'` return **0 for all nine**. Waves 8 (25/25) and 9 (14/14) reproduce the same gap on the server plane, so this is systemic, not family-local · **RE-DERIVED 2026-09-11 (sweep `v-ledger-sweep`, `64dfbf349`):** re-census: `FAMILY` 0 of 9 and `POPULATION PORT` 0 of 9, UNCHANGED. But **legacy SHA is now 3 of 9, up from 0** — `contract-banned-shapes`, `schema-banned-shapes` and `ownerid-registry` each gained a 40-char legacy descriptor SHA from `4e832e610`. (My first census read 0 of 9 because the pattern assumed a 7-12 char abbreviated SHA; the landed form is the full 40. Naming the corrected pattern here so the next reader does not repeat it.) · **RE-DERIVED AND CLOSED 2026-09-12 by lane `p-ledger-schema-registry`, BY HAND — full reads of all nine headers, no pattern, so neither the caret-eating shape regex nor a length-pinned one can reach it. THE RECORDED SHA FIGURE IS ITSELF AN ARTIFACT: it is 4 of 9, not 3.** The missed carrier is `db-enum-from-tuple`, whose citation is the NINE-CHARACTER abbreviated `1bf7ff7d9` — which the corrected 40-char pattern drops exactly as the 7-12 char one dropped the landed form. So this field has now under-reported in three distinct ways (caret-eaten rev-specs, length-pinned patterns) and over-reported in one (word-match, 78%). Positive control for the by-hand read: it finds `section-registry-completeness`'s `(dd862e988^)` and correctly finds none in `table-explicit-primary-key`'s one-line header. Census before the fix: **FAMILY 1/9 · POPULATION PORT 3/9 · legacy SHA 4/9**. After: **9/9 FAMILY · 9/9 POPULATION PORT · 4/9 legacy SHA**, with the family's port delta given ONE home at `DRIZZLE_SCHEMA_POPULATION` (`lib/schema-fact.ts`) instead of copied into five headers — it is an INTENTIONAL WIDENING BY EXACTLY ONE PATH against the `isSchemaFile` legacy spelling, and lossless: `packages/db/src/schema/index.ts` carries ZERO `sqliteTable(` calls against 97 across the other 29 files (the positive control). **AND THE THREE-ARM SHA CHECK RETURNS 0 DEFECTIVE OF 4 CARRIERS IN THIS FENCE:** `ownerid-registry`, `schema-banned-shapes`, `contract-banned-shapes` and `db-enum-from-tuple` each cite their own conversion's PARENT, the blob exists there (`git cat-file -e`), and each is a legacy `GateDescriptor` (`defineGate` count 0). `contract-banned-shapes` is the one that LOOKS like arm 2 and is not — its own file does not exist at the cited sha because that half was born at the split, and its sentence names the legacy MODULE; the header now says so explicitly. · **Integration receipt, 2026-09-13:** Integrated header candidate `d3d90593e`..`d03b51074` as `d1d7e88b0`. Independent review measured 57 port blocks; unsampled claims remain uncertified. Final comment correction separately reviewed by root. Six in-scope family-classification candidates and 40 excluded owner-lane modules remain outstanding; this systemic row stays OPEN. Candidate tooling native typecheck passed; merged caught-failure census and consolidated verification remain owed. |

### cb-v-world-gates — the §12.7 world-program guarantees (`v-world-gates-2026-09-12.md`) — 10 rows (1 OPEN, 8 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WORLD-GATES-3 `eslint-grant-liveness` · `depcruise-grant-liveness` · `runner-config-path-liveness` | cb-v-world-gates · `eslint-grant-liveness.ts:21`, `depcruise-grant-liveness.ts:52,74`, `runner-config-path-liveness.ts:106` | three FINAL world-program modules carry gate-owned `ExemptionTable`s that §12.5 ("gate modules receive neither grant tables nor marker parsers") and §3 ("no gate-owned exemption table") forbid. Two are live suppressors, not carry-forward stubs: `eslint-grant-liveness.ts:72-74` does `RATIFIED[key] → continue`, and depcruise hands `ratified: RATIFIED` to the shared reconciler at `:261` | §5b.7 forbidden | STATUS: OPEN  **OPEN — subsumed by #1922** (2 of 3 remain; re-derived 2026-09-18) | `runner-config-path-liveness` ExemptionTable removed by `df6a163b8`; `eslint-grant-liveness` (1 ExemptionTable ref) and `depcruise-grant-liveness` (1 ExemptionTable ref) still carry the table. Census rows `exception-authority-census.md:98,99,163` |

### cb-forge-policing-audit — the policing-surface matrix lane (#2111, owner-authorized forge; `a1c848001` on main), verified by its own planted-break receipts ([`policing-surface-audit-2026-09-12.md`](policing-surface-audit-2026-09-12.md) §9); 54 rows asserted — the report's own heading says 53 and is off by one, measured here (7 CLOSED at `a54de0421` / `3420a81e9` per the report), the rest OPEN as migration rows for `p-authority-migration` (#2147), `p-family-readers` (#2162), `p-binding-readers` (#2163), `p-proof-expectations-red` (#2025 flip) and `p-proof-soundness` (#2155 item 2) — 54 rows (3 OPEN, 51 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-FORGE-POLICING-AUDIT-1 `depcruise-grant-liveness` | #2111 · `tooling/src/verify/gates/depcruise-grant-liveness.ts:30` | imports `ExemptionTable, Finding` from `contract/gate.ts` behind `defineGate` | legacy artifact (#1922 migration set; class row #2147) | STATUS: OPEN  **OPEN** | `policy-legacy-imports` ARM A live finding; family second opinion |
| ROW-CB-FORGE-POLICING-AUDIT-3 `eslint-grant-liveness` | #2111 · `…/eslint-grant-liveness.ts:10` | imports `ExemptionTable` | legacy artifact (#2147) | STATUS: OPEN  **OPEN** | same |
| ROW-CB-FORGE-POLICING-AUDIT-21 `spacing-tier-home-health` | #2096 · `…/spacing-tier-home-health.ts:27` | imported `SANCTIONED_HOMES` from `no-raw-spacing-in-features.ts` | gate→gate import | STATUS: … |
| ROW-CB-FORGE-POLICING-AUDIT-50 `gate-modernization` | #2111 · `tooling/src/verify/gates/gate-modernization.ts` | The live legacy meta-gate retains a local registration reader until its retirement. It is not an exact duplicate of the central readers: it returns descriptor nodes for its arms, and its final-callee recognition differs. | transition obligation (legacy meta-gate) | STATUS: OPEN  **OPEN — held until cutover; no pre-cutover repair** | Independent source adjudication at `22d61f8bb`, 2026-09-13: local `registrationOf` remains called; central `gateRegistrationOf` returns a contract kind, while `finalRegistrationOf` recognizes canonical namespace registrations for policing. Standardization §1 and playbook §4.1 retain the legacy owner through transition. Retire its local reader with the meta-gate and successor evidence; do not perform a nominal deduplication now. |

### cb-v-additions-wave — the post-barrier fold `575e48d5a`…`a7d88287b` + the fix leg `bba5101db` + `5ee1149a9`, verified on `3166664f5` ([`v-additions-wave-2026-09-12.md`](v-additions-wave-2026-09-12.md)); 11 rows asserted (the 11th from its structure leg) — 4 CLOSED at `bba5101db` with pre/post receipts (#2184 and #2185 REFUTED at `575e48d5a`, CONFIRMED at the fix), 6 OPEN (board: #2210 row 6, #2214 row 7, #2215 row 9, #2212 row 10; row 5 is the census regen owed by `5ee1149a9`; row 8 informational) — 11 rows (1 OPEN, 10 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-ADDITIONS-WAVE-8 `tooling/src/verify/lib/gate-contract-origin.ts#receiverConstituents` | v-additions-wave `:8` | the commit presents the non-nullable receiver and the per-constituent split as two load-bearing halves; against the committed control they are MUTUALLY REDUNDANT | §4.1 classification | STATUS: OPEN  **OPEN (informational)** | each single cut leaves `gate-contract-origin.test.ts` 2/2 GREEN; the JOINT cut reds it (`expected false to be true`). Recorded so a later lane does not read a clean single cut as an unenforced fence |

### cb-v-wave-12a — five commits `c810fee07` · `6d62ad8ab` · `37caa7980` · `196232af6` · `30fd90298`, measured on `9ad17fb5a` ([`v-wave-12a-2026-09-13.md`](v-wave-12a-2026-09-13.md)); 8 rows asserted — rows 1/2/3/5/6/7 are **CLOSED on current source** by `4d7f7152c` + comment correction `dd00ebb78` (#2303/#2304); row 4 remains **OPEN** (#2302), because neither scoped suite asserts the positional identities against the real ESLint config; row 8 remains **OPEN** (#2304), because the history reader still cannot identify a merge train or prove a prior pass. The repair lane recorded two native programs green before integration. Root independently ran the registry/run/history suites on integrated `dd00ebb78`: 106/106 passed, exit 0, receipt `reports/runs/test/main-3719553-2026-09-13T04-27-21-801Z/test-report.json`. This validates focused stage planning and history behavior; the full verification barrier remains owed. — 8 rows (1 OPEN, 7 CLOSED)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-CB-V-WAVE-12A-8 `history` (#1983 part 2) | w12a R8 · `tooling/src/verify/lib/history.ts:176-189` | the once-per-merge-train cadence is still advisory output: no exit change, threshold or machine-readable merge-train identity enforces it | other (advisory where an enforcement was implied) | STATUS: OPEN  **OPEN** (board #2304) | current source now states the limit truthfully in code and rendered output: cadence enforcement remains the quiescent-barrier procedure, and bounded per-checkout history cannot identify a merge train or prove a prior pass. `history.int.test.ts:183-188` pins that wording, but the function still returns strings only and `ops/run.ts` only prints them. The repair narrows the claim; it does not close the cadence defect |

### Recovered adjacency-review table 1 — 2026-09-13 — 4 rows (1 OPEN, 3 CLOSED)

These existing rows had lost their table header and carried escaped leading pipes, making them invisible to the derived rollup. Their recorded defect text and states are preserved; restoration is not fresh implementation adjudication.

| module | wave · source | defect | class | state | receipt |
| - | - | - | - | - | - |
| ROW-RECOVERED-ADJACENCY-REVIEW-T-1 `policy-legacy-imports` | cb-adj-authority L1 · `tooling/src/verify/gates/policy-legacy-imports.ts:120-136` (`FORBIDDEN_IMPORT_HOMES`) and its `fix` string | **ARM A's stated remedy VOIDS the §12.5 property the arm exists to enforce.** The arm judges the IMPORT ORIGIN of a specifier, and `#2201`'s re-export chase follows only `export … from`. A gate-owned `ExemptionTable` moved into `lib/<family>.ts` as `import type { ExemptionTable } from "../contract/gate.ts"` + `export const T: ExemptionTable = {…}` is therefore invisible: `lib/x.ts` is neither a forbidden home nor a registering gate module, and it is outside the declared population (`under: ["tooling/src/verify/gates/**"]`, 309 source files). §12.5 says *"Gate modules receive neither grant tables nor marker parsers"* — a final module importing that table still receives one. The arm's own `fix` ARM B authorizes the move (*"debt data with one owner (a deferral list) moves to `contract/` or `lib/` the same way"*), so this is a designed escape rather than a false negative — but nothing then holds §12.5, and #1922's migration can reach 0 red at 0% done | other (coverage gap created by the stated remedy) | STATUS: OPEN  **OPEN** (board #2320; migration #2147 / #1922) | `pnpm check:structure --check policy-legacy-imports` on `1ea2c2a0e`: **5 findings** (the invocation's own positive control — the recognizer fires) and NONE of them is `no-raw-spacing-in-features:34`, `no-raw-typography-in-features:51`, `contract-derives-not-respells:54` or `injected-op-caller-param-health:22`, each of which imports a live exemption table from `lib/`. The four tables are intact: `lib/raw-spacing-tier.ts:22`, `lib/raw-typography-tier.ts:21`, `lib/contract-derives-not-respells.ts:32` (all three still `ExemptionTable`-typed off `contract/gate.ts`) and `lib/injected-op-caller-param.ts:37` (retyped `CallerFreeOpRow[]`). Four of the nine modules the arm named at mint went green by exactly this move (`3420a81e9`, `d9d1e3524`) and **zero reviewed grants were minted** — no `REVIEWED_GRANTS` row names any of the five sanctioned-home policies · FIX: judge the exemption-table SHAPE at the final module's import boundary (a `defineGate` module importing a value whose declared type resolves to `contract/gate.ts#ExemptionTable`/`ExemptionRow`, wherever it sits), or widen the population to `tooling/src/verify/lib/**` with an `ExemptionTable`-declaration arm. Either way the arm needs a `mustFlag` fixture for the one-hop-lib shape, which it has for the `export … from` shim (`:434`) and not for this one |

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
