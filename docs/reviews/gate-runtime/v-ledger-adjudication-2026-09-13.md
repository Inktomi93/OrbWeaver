---
kind: review
status: active
updated: 2026-09-13
---

# Ledger adjudication — which of the refutation ledger's OPEN/FIXED rows are STALE on the tree (#1584, #2012)

**Lane `cb-v-ledger-adjudication`. Read-only. Sha `b1a23e534321a6244f20276ebdcd3a92de6bd8b6`** (`docs(gates): close
hit-geometry rows with current-main browser proof`), isolated worktree
`.claude/worktrees/agent-a342b79264b6b8b7a`. Nothing outside this file was written, and no ledger row was
flipped — every state change below is a PROPOSAL the integrator applies.

This is a reduction of uncertainty, not an audit. I adjudicated existing rows against today's tree and opened
no new scope. **`ledger rows OWED: 0`** — no new defect was found that could not be folded into an existing
row, which is the expected outcome.

## 1. The counts, re-derived by the ledger's own method

Two independent derivations at `b1a23e534`, and they agree exactly:

1. The production reader `deriveClassRollup` (`tooling/src/verify/lib/gate-program-rollup.ts`), invoked
   directly on the ledger text.
2. `pnpm check:ledgers-fresh` (exit 1 — see §1b; its ledger arms are green).

```
tables: 68 · rows: 516 · UNBINNED: 0 · statelessTables: 0
per-table: 12,6,8,9,9,10,10,10,10,9,8,3,9,10,9,10,4,12,4,3,17,10,6,11,6,5,15,6,54,3,5,11,8,5,18,4,11,2,4,4,
           10,10,9,6,5,9,7,9,2,5,12,3,8,5,5,5,1,6,1,5,7,5,3,1,2,2,2,1   (sum 516)
TOTAL  CLOSED 406 · OPEN 76 · SUPERSEDED 6 · DISSOLVED 3 · UNADJUDICATED 1 · N/A 0 · FIXED 24
```

Per class: §4.1 98 · §4.2 4 · §4.5 15 · §4.6 7 · §5b.1 2 · §5b.2 12 · §5b.3 9 · §5b.5 19 · §5b.7 10 · §12.3 3 ·
roster 17 · other 320. **The committed `## CLASS ROLLUP` table matches the derivation cell for cell**, and
`ledgers:fresh` reports the ledger FRESH on both its arms (42 of 68 in-fence sections reconcilable against
their cited reports; the rest cite a report that declares no rows). **The 76 OPEN / 24 FIXED snapshot the
brief carried is CURRENT at my sha, not stale.**

A third, hand-written binner (unescaped-pipe split, `state` index by header name, first-bolded-word-else-first-word)
extracted exactly **101 rows** in the OPEN ∪ FIXED ∪ UNADJUDICATED set — 76 + 24 + 1. That agreement is the
control on my own extraction.

### 1b. Two baselines are STALE on main — reported mid-run, not a ledger row

`pnpm check:ledgers-fresh` exits **1** at `b1a23e534` on two GENERATED artifacts. Neither is a defect of any
row below; both are barrier regens owed by whoever holds main's checkout.

| stale artifact | what differs | regen |
| - | - | - |
| `docs/reviews/caught-failure-ownership/population.json` | 10 differences: 8 `moved` (line/markerLine drift in `doc-catalog/ops/tree.ts`, `gates/devtools-frontend-assets.ts`, `lib/config-snapshot.ts`, `lib/policy-pass.ts` ×4) plus **1 NEW unproven site** `tooling/src/verify/lib/policy-pass.ts::catch::1` at line 411. Totals 595 → 596 sites, unproven 23 → 24 | `pnpm exec node tooling/src/verify/cli.ts baseline caught-failure-population` |
| `docs/design/gate-runtime-read-first.md` SIZE column | 4 rows: row 1 `223 KB` → `226 KB`; **row 3 (THE WORK QUEUE) `456 KB · 457 defect rows` → `530 KB · 516 defect rows`**; row 5b `275 KB · 77 files` → `289 KB · 82 files`; row 6 `385 KB · 305 rows` → `392 KB · 309 rows` | `pnpm exec node tooling/src/verify/cli.ts baseline read-first-costs` |

The row-3 cell matters more than the other three put together: that table exists to tell a cold session what
the queue costs before it commits, and a session budgeting 456 KB is reading 530. This is the same failure the
table's own prose was written about, one iteration on.

## 2. Selection

**RECONCILED 2026-09-13** after codex's mechanical recount of the first draft. Three of its five count
findings were correct and one surfaced a genuinely MISSING row; the corrections are recorded here rather
than silently applied, because a count nobody can re-derive is what this whole file exists to stop. What was
wrong: the exclusion table held 28 ids and said 29 (a `595`–`607` RANGE was counted as one row in one place
and thirteen in another); §3.1 held 22 rows under a heading that also said 22 but summed to 48 against a
49-row denominator; and **`:820` was adjudicated in my notes and never written into a table at all** — the
one real gap, found by the count, not by a read.

Every set below is now printed from a LIST, and the three sets are asserted disjoint and exhaustive by
`comm`, not by arithmetic I typed.

### 2a. The three sets, explicit

**START SET — 101 ids** (every row whose state cell bins to OPEN, FIXED or UNADJUDICATED at `b1a23e534`;
76 + 24 + 1):

```
193 214 248 263 387 395 396 398 401 422 423 424 425 426 428 429 430 431 432 433 448 449 465 522 531
532 533 534 535 572 573 574 575 576 579 595 596 597 598 599 600 601 602 603 604 605 606 607 621 622
623 624 625 631 632 633 642 653 655 656 657 659 667 679 680 681 682 688 689 690 691 692 693 694 695
696 697 698 699 700 704 711 770 782 794 818 820 854 857 859 860 917 933 934 936 1010 1011 1012 1033
1046 1047
```

**EXCLUDED SET — 28 ids**, no ranges:

```
395 396 448 572 573 574 575 576 579 595 596 597 598 599 600 601 602 603 604 605 606 607 622 623 624
699 782 818
```

**EXAMINED SET — 73 ids** (the set difference, computed not typed):

```
193 214 248 263 387 398 401 422 423 424 425 426 428 429 430 431 432 433 449 465 522 531 532 533 534
535 621 625 631 632 633 642 653 655 656 657 659 667 679 680 681 682 688 689 690 691 692 693 694 695
696 697 698 700 704 711 770 794 820 854 857 859 860 917 933 934 936 1010 1011 1012 1033 1046 1047
```

**The assertion, from the lists:**

```
start=101  excluded=28  examined=73          101 = 28 + 73
comm -13 start excluded   → empty   (no excluded id is outside the start set)
comm -12 examined excluded → empty   (the two sets are disjoint)
```

The EXAMINED set splits once more, and this is the split the first draft blurred:

| subset | size | ids |
| - | -: | - |
| **FIXED** — state read, not re-driven (§5) | **24** | `422 423 424 425 426 428 429 430 431 432 433 465 522 854 857 859 860 933 934 936 1010 1011 1012 1046` |
| **ADJUDICABLE** — OPEN ∪ UNADJUDICATED, each given a disposition in §3 | **49** | `193 214 248 263 387 398 401 449 531 532 533 534 535 621 625 631 632 633 642 653 655 656 657 659 667 679 680 681 682 688 689 690 691 692 693 694 695 696 697 698 700 704 711 770 794 820 917 1033 1047` |

`73 = 24 + 49`. **The §3 manifest carries all 49**, and the first draft carried 48 — `:820` is the row it
dropped, restored in §3.1 below.

### 2b. The excluded rows and their owners — 28, one line each

| ledger line(s) | subject | owner / reason |
| - | - | - |
| `:395` | `eslint-grant-liveness` · `depcruise-grant-liveness` · `runner-config-path-liveness` gate-owned `ExemptionTable`s | authority-reach / grant-table reach (#1922/#2320) |
| `:396` | the "TEN final modules carry a legacy `ExemptionTable`" census correction | same — typed exemption identity (#2320) |
| `:448` | `over-art-plate-arm` `workItem` points at a CLOSED issue | board-citations barrier (#2070) |
| `:572` `:573` `:574` `:575` `:576` `:579` (6) | six modules importing `ExemptionTable`/`ExemptionRow`/`Finding` from `contract/gate.ts` | `p-authority-migration` (#2147), grant-table reach |
| `:595` `:596` `:597` `:598` `:599` `:600` `:601` `:602` `:603` `:604` `:605` `:606` `:607` (13) | `Symbol#getDeclarations()` / `getDefinitionNodes()` chains in 13 gates | shared-binding migration, `p-binding-readers` (#2097/#2163) |
| `:622` `:623` `:624` (3) | `own-tables-only` `FILE_ALLOWLIST` · `verify-registry-parity` `NON_STAGE_ALLOWLIST` · `vector-scope-derived` `IMPORT_SANCTIONED` | grant-table reach judgment (ARM B vocabulary vs a fence list) |
| `:699` | `EXPECTED_DIRECT_THEME_DECLARATIONS = 203` is DERIVABLE | theme.css freshness, owner-pending (#2230) |
| `:782` | the LAW-doc half of #2071 never executed | #2071 docs consolidation |
| `:818` | the mirror family's disk-planted `empty` pin has no same-substrate green twin | fixture isolation / substrate (#2279) |

**`:193` IS IN THE EXAMINED SET, NOT THE EXCLUDED ONE.** It belongs to the excluded CLASS (grant-table
reach), but I adjudicated it, so counting it as excluded would double-count. It sits in §3.1 flagged
ADVISORY: root may hand it to #1922's owner rather than acting on it here. The first draft listed it in both
places, which is where the 28-versus-29 discrepancy came from.

**ADJUDICABLE ROWS EXAMINED: 49 of 49.** Every OPEN and the single UNADJUDICATED row outside the owned
scopes was read on my tree. **NOT individually re-driven: the 24 `FIXED` rows** — §5 says per row whether I
verified it against the tree or only read its cell.

## 3. CLOSED MANIFEST — 49 rows

Identity is the ledger LINE NUMBER at `b1a23e534` plus the section name, because most rows have no stable
anchor. `path:line` was re-located by SYMBOL, never by the ledger's recorded line.

**Table sizes, which now sum:** §3.1 = 22 · §3.2 = 1 · §3.3 = 25 · §3.4 = 1 → **49**.

### 3.1 STALE-CLOSED — 22 rows the tree already closes

(`:655` left this table in the 2026-09-13 reconciliation — its residue is owned in §3.3. `:820` joined it,
restored from the gap the recount found. Net 22, unchanged by coincidence, which is exactly why the
membership list in §2a and not the heading number is the thing to read.)

| ledger line · section | current predicate (what must be true for the defect to be live) | evidence | proposed |
| - | - | - | - |
| `:248` Wave 5 — `ordinary-visitors` (the ONE `UNADJUDICATED` row) | `no-inline-types` reports ~19 real-tree findings, 18 of them exported verdict types in `tooling/src/verify/lib/**` | **DRIVEN** `pnpm check:structure --check no-inline-types` at `b1a23e534`: `raw 6 = waived 5 + granted 0 + effective 1`, population 3339 source, 0 tool errors. The single effective finding is `packages/client/src/features/app-shell/lib/bug-report-capture.ts:200 BugReportSubmission` — a CLIENT feature type. **ZERO findings in `verify/lib/**`.** The decision the row said it forced has been taken (5 waivers) | **CLOSED** — driven `check:structure --check no-inline-types` at `b1a23e534`: raw 6 = 5 waived + 1 effective, and the effective one is a client feature type, not a `verify/lib/**` verdict type |
| `:193` Wave 1 (excluded class, advisory) | `no-raw-spacing-in-features.ts:29,35` and `no-raw-typography-in-features.ts:29,35` still declare a legacy `ExemptionTable` | neither module contains `ExemptionTable`, `ExemptionRow` or `contract/gate` at all; the allowlist is now `SANCTIONED_HOMES` in `lib/raw-spacing-tier.ts` / `lib/raw-typography-tier.ts` behind the shared `lib/sanctioned-home.ts` reader. Closing sha `3420a81e9` | **CLOSED** — `3420a81e9` |
| `:387` cb-v-instruments | the D53 ReDoS watchdog test still carries a flat `{ timeout: 10_000 }` that overrides the scaled default | `tests/server/entry/compose/chat.int.test.ts:150` is `{ timeout: budget(REDOS_TRIPWIRE_BASE_MS) }`; `:87-94` records the exact repair the row asked for ("`{ timeout: 10_000 }` OVERRODE the config's scaled default"). Last touch `cce850dc1` | **CLOSED** — `cce850dc1`; the arm is `budget(REDOS_TRIPWIRE_BASE_MS)` |
| `:401` cb-v-world-gates | `scripts/ts7.cjs`'s warm/changed/restored green-red-green guarantee has no committed pin | `tests/tooling/ts7-freshness.int.test.ts:93` — *"warm, changed and restored produce green/red/green through the TS7 wrapper — with no cache deleted between them"*, plus the build-info-never-written assertion at `:114` and a stated planted-break receipt. Born at `1d97b71df` (#2193) | **CLOSED** — `1d97b71df` (#2193) |
| `:531` cb-v-fix-wave-2 L1 | `no-tailwind-dark-variant`'s `fix` still says a paren-carrying candidate has NO waiver spelling | `no-tailwind-dark-variant.ts:40` now reads *"A deliberate dark: utility is waived with `// @orb-waive no-tailwind-dark-variant(<position>): …`"*; `:24` records the repair. Closing sha `44a66de69` (#2157/#2158/#2160) | **CLOSED** — `44a66de69` |
| `:532` cb-v-fix-wave-2 L2 | `waivableCoordinate` and `assertWaivablePosition` ship with no committed pin of any kind | `tests/tooling/verify/lib/waivable-coordinate.test.ts` exists and pins all three symbols, including the tool-error fence (`:156` asserts `toolErrors` `namesTheRepair`) and the refusal set (`:89`). Born at `44a66de69` | **CLOSED** — `44a66de69`; `tests/tooling/verify/lib/waivable-coordinate.test.ts` |
| `:533` cb-v-fix-wave-2 L3 | neither policy repaired by #2107 arm c carries a §4.2 identity arm at its NEW paren-carrying coordinate | both arms now exist and are the row's own two probes: `tests/tooling/verify/gates/no-raw-color-in-css.test.ts:103` (`PAREN_CARRYING`, `@orb-waive no-raw-color-in-css(oklch)`) and `tests/tooling/verify/gates/no-tailwind-dark-variant.int.test.ts:66` (`@orb-waive no-tailwind-dark-variant([&:where)`) | **CLOSED** — `44a66de69`; both paren-carrying identity arms landed as committed rows |
| `:631` cb-v-ledger-reconcile L1 | `dangling-refs.repo.int` is RED on 20 phantom cites, 19 inside `docs/reviews/gate-runtime/**`, three of six tests failing | **DRIVEN** `pnpm test:scoped tests/tooling/verify/gates/dangling-refs.repo.int.test.ts` at `b1a23e534`: **6 passed / 0 failed**, 70.9 s, including the FROZEN-doc control the row named as failing. Closed at `8d1654afc` (*"dangling-refs goes GREEN — 30 → 0"*) and `1d83cf962` | **CLOSED** — `8d1654afc` + `1d83cf962`; driven 6/6 green at `b1a23e534` |
| `:632` cb-v-ledger-reconcile L2 | `zod-error-issues-home` declares `UNREADABLE` and passes it as `unreadableMessage`, but no `candidates.push` sets `unreadable` | `zod-error-issues-home.ts:157` is `unreadable: verdict === "unreadable"` inside the single `candidates.push` at `:153`, and `:222` is a committed row whose `why` names the arm ("THE FAIL-CLOSED THIRD ANSWER (§5b.1, #2194)"). Closed at `1d97b71df`, reviewed at `cce850dc1` | **CLOSED** — `1d97b71df` (#2194) |
| `:633` cb-v-ledger-reconcile L3 | ledger rows for `cb-v-authority-census` L7 and L10 still read OPEN for work `b5490a02a` shipped | both rows are CLOSED on my tree: `:484` (`css-length-tokens`) **CLOSED at `e7e3f083b`**; `:487` (`test-presence-client` `CLIENT_EXCLUDE_FILES`) **CLOSED — `b5490a02a` (#2103)** | **CLOSED** — the two named rows now carry their receipts |
| `:642` cb-v-policing-audit | the law delta would land `policy-soundness (E1–E7 …)` while E5 belongs to `policy-legacy-imports` | landed WITH the correction: `Core-Enforcement-Active-Gates.md:340` reads *"this policy IS the `policy-soundness` family's arm E5, homed here rather than inside `policy-soundness`"*, and guide `:1123` reads *"E5's import member is the one that lives in `policy-legacy-imports`, corrected by the fresh verifier against the audit's own §8 text"* | **CLOSED** — the delta landed with the E5 correction the row demanded |
| `:657` cb-v-additions-wave `:9` | the cleanup test's second assertion compares `CLEAN_ROOTS` to a re-evaluation of its own defining expression | gone. `tests/tooling/gate-ignore-grammar.repo.int.test.ts:300-301` records the removal verbatim (*"the first version of this arm compared `CLEAN_ROOTS` to `PLANT_DIRS.map(first segment)` — which is the LINE THAT DEFINES `CLEAN_ROOTS`"*); the replacement is a real reachability arm at `:308` plus `toContain("tooling")` at `:318`. Closing sha `eb51d4313` (#2215) | **CLOSED** — `eb51d4313` (#2215) |
| `:659` cb-v-additions-wave `:11` | four baselined specs with no `deletions` entry keep `monotonic-tests` RED at 4 on every structure run | the gate and its manifest are DELETED WHOLE: `tooling/src/verify/gates/monotonic-tests.ts` absent, `docs/test-baseline/` absent. Closing sha `3f4bf19ef` (*"retire monotonic-tests whole — the gate, its manifest, and the instruction to regenerate it (#2217)"*) | **CLOSED** — `3f4bf19ef` (#2217); the gate no longer exists |
| `:667` cb-v-instruments-2 V3 | the `‼ THIS RUN IS NOT A VERDICT` banner is written BELOW both rosters while its comment claims otherwise | `tooling/src/verify/lib/structure-console.ts:47-56`: `structureConsole` emits `[banner, renderPass, renderPolicyPass, banner, completeness, timing]` — the banner prints at BOTH ends, and `:26-36` states the rationale for both placements. Last touch `05b3619c8` (#2222 lineage) | **CLOSED** — `05b3619c8`; banner at head AND tail, header states both |
| `:679` cb-v-migrations-wave MED-2 | eighteen ledger rows read OPEN for work that shipped in `3ed1a7d7a` / `ebfe88146` / `874b34b58` | all eighteen are CLOSED on my tree with receipts: `:584` `:586` `:587` `:588` `:589` `:590` `:593` all read `CLOSED` at `3420a81e9`/`3ed1a7d7a`/`bba5101db`, and `:608`–`:618` (the eleven #2025 rows) all read `**CLOSED** — 874b34b58 (board #2025 flip burn-down)` | **CLOSED** — the eighteen rows carry their receipts |
| `:695` cb-v-css-audit #8 | `css-family-ownership` / `lib/css-family-policy`'s `zero-declarations` blindness arm is reached by ZERO rows | `css-family-ownership-health.ts:9-13`: *"`zero-declarations` (cut f02) and `zero-theme-values` (cut f03) were reached by ZERO committed proof rows … Each now carries a `mustFlag` that dies without it."* The cluster changed 1123+/688− since `0e03cee19` | **CLOSED** — `dd98eb356` + `7bf03e12f` (#2305/#2181) |
| `:696` cb-v-css-audit #9 | `zero-theme-values` reached by zero rows | same receipt as `:695` | **CLOSED** — `dd98eb356` + `7bf03e12f` |
| `:697` cb-v-css-audit #10 | the `fullHomeSet` fence in `reportExactCensus` is unenforced near-dead decoration | `lib/css-family-policy.ts:458`: *"THE `fullHomeSet` GUARD IS GONE, and its deletion is the conversion's answer to audit cut f04"* | **CLOSED** — the guard is deleted; `lib/css-family-policy.ts:458` |
| `:698` cb-v-css-audit #11 | seven hand-spelled count ratchets (`EXPECTED_RUNTIME_WRITERS` 4 keys incl. `fade: 12`, `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` 3 keys) survive in `lib/css-family-census.ts` | both constants are GONE. `lib/css-family-census.ts:52` *"`EXPECTED_RUNTIME_WRITERS` IS GONE (#2305)"*; `:29` *"EVERY COUNT RATCHET IS RETIRED (audit ledger row 11 + #2305, §12.5 "no count ratchet"), and NO CARDINALITY SURVIVES IN ANY FORM"*; the `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` exemption moved to three 1:1 reviewed grants in `gates/css-family-direct-client-mechanism.ts` | **CLOSED** — `dd98eb356`/`f56e83d52` (#2305) |
| `:700` cb-v-css-audit #13 | `EXPECTED_DIRECT_THEME_DECLARATIONS` is spelled in THREE places (`css-family-ownership.ts:174,438` + `lib/css-family-census.ts:79`) | one home. The constant is declared once (`lib/css-family-census.ts:82`) and does not appear in `css-family-ownership.ts` at all; `css-family-ownership-health.ts:36-38`: *"What this conversion DOES close is the coupled site (audit ledger row 13): the two fixture spellings now DERIVE from the constant, so the number has one home"* | **CLOSED** — `dd98eb356`; no longer blocked on row 12 |
| `:704` cb-v-css-audit #17 | both Base UI reconciliation arms (`baseUiManifestOnly`, `baseUiInstalledOnly`) are unenforced in `css-selector-has-a-writer` | RETIRED with a named, stronger successor and a stated receipt: `css-selector-has-a-writer-health.ts:11-42` — the arms move to `baseui-surface-manifest#identity()`, whose `mustFlag[2]` (the `state` term), `mustFlag[3]` (vanished part, `count: 2`) and `mustFlag[4]` (vanished component, `count: 1`) landed at `dea1061df`; `lib/css-selector-writer-policy.ts` no longer exists | **CLOSED BY RETIREMENT** — `dd98eb356`/`7bf03e12f`, successor pinned at `dea1061df` |
| `:820` cb-v-wave-9b | `test-presence-client.ts:382`'s `subjects = demanded.length > 0 ? demanded.toSorted() : [lowestTest ?? STORE_STORIES]` still branches on a `lowestTest` that an earlier refusal makes unreachable | the fallback is GONE. `tooling/src/verify/gates/test-presence-client.ts:390-391` records the removal in place — *"THE LOWEST MEMBER IS TAKEN AS A SLICE, NOT AS A DEFAULTED ELEMENT (#2280). A `lowestTest ?? STORE_STORIES` fallback stood here and was UNREACHABLE by the guarantee its own comment asserted"* — and `:399-400` is the replacement explicit-membership test. Closing sha `183e49714` | **CLOSED** — `183e49714` (#2280) |

### 3.2 MISFILED — 1 row whose predicate was never true

| ledger line · section | why | proposed |
| - | - | - |
| `:770` cb-v-wave-8a L10 | The row's finding is *"Nothing under `tests/` exercises `runCommandWithBudget`'s error path"* with the receipt *"`/usr/bin/grep -arln 'runCommandWithBudget' tests/` returns nothing"*. Both halves are false **at the row's own measurement sha**: `git show 50e31c534:tests/tooling/_load-budget.ts` contains `runCommandWithBudget` **3 times**, and the error-path pin — `tests/tooling/load-budget.int.test.ts` *"a fatal child exit is preserved instead of returning its partial report"*, driving `process.stderr.write('fatal'); process.exit(2)` against `FATAL_EXIT_RE = /exit 2.*fatal/su` — has existed since **`53d4482b1`, 2026-08-25**, which `git merge-base --is-ancestor 53d4482b1 50e31c534` confirms is an ancestor of the measurement sha | **MISFILED** — the negative claim was false at its own sha `50e31c534`; the pin has existed since `53d4482b1` (2026-08-25). Row `:1033` already records this; close `:770` and keep `:1033` as the receipt |

### 3.3 RESIDUAL — 25 rows still live

(24 in the first draft, plus `:655` whose upserts half stays owned here.)

| ledger line · section | what remains, re-derived at `b1a23e534` |
| - | - |
| `:214` Wave 3 (§5b.5 header, systemic) | LIVE and SHRINKING. Re-census over the 269 `defineGate` modules under `tooling/src/verify/gates/` (negative lexical control: a literal known absent returns 0; denominator 309 `.ts` files; this is not a positive control of semantic header recognition): **FAMILY 216/269 (53 missing) · POPULATION PORT 199/269 (70 missing)**. The row's recorded `61cae0710` figures were 178/248 and 157/248 (70 and 91 missing). Update the cell to the new numbers rather than closing it |
| `:263` Wave 6 (`origin-client` ×12) | SPLIT. The §5b.5 half is LIVE: over the twelve modules `origin-client-family.test.ts` imports, **FAMILY 5/12 · POPULATION PORT 3/12** (was 2/12 and 1/12). The §5b.3 half remains unverified: the zero-result run in §4 is a lead without a positive control, not corpus-wide closure |
| `:398` cb-v-world-gates (doc staleness) | Half (a) is LIVE and WIDER than the row states. `runner-config-path-liveness` is FINAL (proved below), and the guide carries **two** false sentences, not one: `gate-runtime-standardization.md:167` *"it shipped, and the gate is still legacy"*, and `:1531` *"`runner-config-path-liveness` is NOT a converted precedent: it is a legacy `GateDescriptor` (`:306`) that REFUSED conversion"* — a second site the row never named, whose cited `:306` coordinate is also wrong. Half (b) is SUPERSEDED: both `read-first` §2 and guide `:53` now carry dated, command-bearing snapshots that disclaim themselves |
| `:449` cb-v-suite-honesty L2 (docs formatter) | Predicate UNCHANGED. `tooling/src/doc-catalog/ops/format.ts:256` still reads `const inert = (escaped === "_" && WORD.test(before) && WORD.test(after)) \|\| (escaped === "~" && before !== "~" && after !== "~")` — `#`, `[` and `*` still escape. Corpus under `docs/reviews` + `docs/design`: **56 files carrying `\[`, 79 carrying `\#`, 59 `\_`, 109 `\~`**. NARROW one half: the row's own counterexample is repaired — `docs/reviews/board-rederive/scout-D2-oidc-infra.md` now holds **3 plain and 0 escaped** `id_token_hint` |
| `:534` cb-v-fix-wave-2 L4 | LIVE, exactly as written. Three unwarned routes to the REFUTED `exemplars-2026-09-11.md` survive: `docs/architecture/core/AGENTS.md:68`, `:322`, and `tooling/src/verify/gates/GATE-AUTHORING.md:14`. (`.claude/agents/verifier.md` and `.claude/rules/gates-and-tooling.md` DO carry the warning) |
| `:535` cb-v-fix-wave-2 L5 | NARROWED from 3 unpinned to 1 of the original 3 — and 2 new sites. Pinned now: `rest-transform-grid.ts:535` and `no-raw-color-in-css.ts:196` carry `messageIncludes: "… has no anchorable coordinate"`. Still unpinned: **`no-tailwind-dark-variant.ts:189`**, plus two sites minted since (`css-selector-has-a-writer.ts:93`, `lib/css-family-policy.ts:95`). A corpus-wide grep of `tests/` for `anchorable` returns one hit, in `waivable-coordinate.test.ts` |
| `:621` cb-forge-policing-audit | LIVE. `gate-modernization.ts:112` still declares a local `registrationOf`, called at `:145`. Retires with the meta-gate at cutover, as the row says |
| `:625` cb-forge-policing-audit | LIVE. `tooling/src/verify/ops/debt.ts:53-54` still imports `BASELINE_REL` from the two legacy gates `density-tier` and `duplicate-action-doors` |
| `:653` cb-v-additions-wave `:5` | THE CLASS IS LIVE, THE ROW'S RECEIPT IS DEAD. `ledgers:fresh` is still RED on `caught-failure-ownership/population.json`, but not for the reason recorded: the row's symmetric-difference-of-two (`::error::2` 234/231, `::settle::1` 382/381, 598 rows) does not reproduce. Today it is **10 differences over 595 → 596 sites** at entirely different coordinates (§1b). Re-receipt the row and keep it open until the barrier regen |
| `:655` cb-v-additions-wave `:7` | **SPLIT — one half closed, the residue stays OWNED HERE and is not folded into a combined close.** CLOSED HALF: the row's stated defect (`predicatesTableColumn`'s receiver-by-TEXT acquittal is enforced by no committed row) is answered for `owner-scoped-writes` — `owner-scoped-writes.ts:326-328` is a `mustPass` with `import * as schema from "@orb/db"` and a correctly-scoped namespace write, `why: "THE ACQUITTAL'S OWN ROW (#2214), and the DIRECTION is the point"`, landed at `eb51d4313`. **OPEN HALF, which keeps this row OPEN:** `owner-scoped-upserts.ts:122` calls the SAME shared reader (`predicatesTableColumn`, `lib/tenancy-read.ts:120`) and carries no equivalent row of its own, and `owner-scoped-reads` does not call it at all. A `#2214` grep across the three modules returns ONE hit, in `writes`. Narrow the row's predicate to the upserts consumer rather than closing it — a shared reader pinned in one of two consumers is exactly the shape the original row objected to |
| `:656` cb-v-additions-wave `:8` (informational) | Unchanged; recorded so a later lane does not read a clean single cut on `receiverConstituents` as an unenforced fence. No action |
| `:680` cb-v-migrations-wave LOW-4 | **CONFIRMED BY DRIVE.** `pnpm check:structure --check policy-legacy-imports` at `b1a23e534`: `raw 5 = effective 5`, population 309 source, 0 tool errors — and **all five findings are ARM A** (`"../contract/gate.ts"` in `depcruise-grant-liveness:30`, `domain-freshness-plane:70`, `eslint-grant-liveness:15`, `lifecycle-portability:54`, `runner-config-path-liveness:78`). **ARM B's live class is EMPTY.** The `why` strings at `policy-legacy-imports.ts:474` and `:480` still advertise the three dissolved examples, and `gate-runtime-standardization.md:1664` still says *"Both are RED on the tree by design (the migration rows)"* |
| `:681` cb-v-migrations-wave LOW-1 | LIVE. `REGION_ATTR` (`lib/context-definition-shape.ts:22`) still has exactly ONE reader — `gates/context-definition-shape-health.ts` — against the module's own stated two-reader criterion |
| `:682` cb-v-migrations-wave LOW-2/LOW-3 | BOTH LIVE, and (b) is wider. (a) the `UNION` identity literal is still declared twice: `lib/bus-deferred-member.ts:40` and `gates/user-bus-deferred-member.ts:59`. (b) `lib/tenancy-scope.ts:417-418` still routes the three consumers *"through `table-scoping-class.ts`'s wrapper"* while all three import `../lib/tenancy-scope.ts` directly — **and two `fix` strings do the same to authors**: `owner-scoped-writes.ts:83` and `owner-scoped-upserts.ts:93` tell them to edit `tooling/src/verify/gates/table-scoping-class.ts (ownerScopedTableIdents)`, a symbol that file no longer exports |
| `:688` cb-v-css-audit #1 | LIVE, and the strongest possible control says so: **`tooling/src/verify/gates/css-length-tokens.ts` is BYTE-IDENTICAL to `0e03cee19`** (`git diff --stat 0e03cee19 HEAD -- <path>` is empty), the sha the audit drove its cuts on. Cuts c02/c03 stand |
| `:689` cb-v-css-audit #2 | LIVE — same byte-identity receipt; cut c06 stands |
| `:690` cb-v-css-audit #3 | LIVE — same byte-identity receipt. The real-tree-guarded row is still `expect: { token: "@media (max-width: 48rem) {" }` at `css-length-tokens.ts:558`, token-only with no `count`. The recorded "18 findings" is a dated number I did not re-measure |
| `:691` cb-v-css-audit #4 | LIVE — **`css-var-defined.ts` is BYTE-IDENTICAL to `0e03cee19`**. I read a `messageIncludes: "API-table custom properties"` row at `:370` and nearly called this closed; the audit's throw probe v01 (0 rows die) was driven on these exact bytes and outranks my read |
| `:692` cb-v-css-audit #5 | LIVE — same byte-identity receipt; probe v02 stands |
| `:693` cb-v-css-audit #6 | LIVE — same byte-identity receipt. Only the `scanned zero source files` tripwire has a row (`:375`); the other three are unpinned as recorded |
| `:694` cb-v-css-audit #7 | LIVE — same byte-identity receipt |
| `:794` cb-v-wave-8b | LIVE, unchanged. `no-blanket-suppression.ts:512` is `export const gate: GateDescriptor`, `:48` imports `contract/gate.ts`, and the file's single `defineGate` token is inside the refusal comment at `:17`. The #2063 A+B split has not landed |
| `:917` cb-v-wave-12a R8 | LIVE, unchanged. `lib/history.ts:171-192` `batteryCadenceLines` returns strings only; no exit change, threshold or machine-readable merge-train identity. The wording is honest (`:189` states the limit) — the repair narrowed the claim, not the defect |
| `:1033` cb-adj-closures | LIVE as a receipt-accuracy row and now DOUBLY confirmed — see the `:770` MISFILED entry, where I dated the pin to `53d4482b1` (2026-08-25) and proved it an ancestor of `50e31c534`. Recommend keeping `:1033` and closing `:770` against it |
| `:1047` cb-x-refute-repairs | LIVE, unchanged. **DRIVEN** `pnpm check:structure --check test-layout` at `b1a23e534`: `raw 59 = effective 59, 0 tool errors, 0 withheld` — the same 59 the row measured at `204607e84`, against #2142's body reading 51. Nothing re-measures it; the wake condition still quotes rather than derives |

### 3.4 STALE-CLOSED (one more, from §3.1's overflow)

`:711` cb-v-wave-5 — the predicate is *"`tests/tooling/verify/ops/eslint.int.test.ts` does not parse; the suite
collects ZERO tests"*. **DRIVEN** `pnpm test:scoped tests/tooling/verify/ops/eslint.int.test.ts` at
`b1a23e534`: **8 tests, all passed**, 32.7 s. Closing sha **`37caa7980`** (*"restore the closer dropped at the
`686853320` merge seam — main's affected-mode routing was BLIND (#2229)"*). Proposed: **CLOSED — `37caa7980`
(#2229); driven 8/8 at `b1a23e534`**.

## 4. Cross-cutting receipts root can price work from

These are not rows; they are measurements that reprice several rows and the `## CLASS ROLLUP`'s cross-cutting
table at once.

- **The §5b.3 warning-debt class (#1978) reports zero on the final corpus — THIS IS A LEAD, NOT CLOSURE.**
  `pnpm check:structure --check policy-waiver-spelling` at `b1a23e534`: `✓ policy-waiver-spelling · final
  hard/error · population 309 source`, `raw 0 = effective 0`, exit 0, 5.4 s. **I RAN NO POSITIVE CONTROL,
  planted or otherwise**, and the standing rule is explicit that a bare zero is "I could not measure", never
  "it isn't there" — planting was outside my read-only fence, so I did not clear it with the orchestrator and
  did not do it. Two further limits: the policy's population is FINAL policies only, so the 44 legacy modules
  are outside it entirely; and the ledger's own cross-cutting note warns that this class must NOT be
  hand-censused (a `@orb-waive` grep calls 45 of 48 non-compliant modules compliant), which is an argument
  against my corroborating grep too. **What would settle it:** one planted control — a scratch final policy
  whose `fix` names no `@orb-waive` spelling — red-first in the same invocation. Until someone runs that, the
  rollup's cross-cutting §5b.3 row should be NARROWED with this receipt attached, not flipped. The four
  sample modules it names (`fk-ondelete-stated`, `empty-state-has-action`, `bounded-list-limit`,
  `no-raw-container-widths`) are unaccused by this run, which is the part of the lead worth acting on.
- **The legacy-`ExemptionTable`-in-a-final-module census is FOUR, not seven, eight or ten.** Two methods:
  `ast-grep --lang ts --pattern 'const $N: ExemptionTable = $V'` over `tooling/src/verify/gates`, and a literal
  `: ExemptionTable` sweep intersected with a `defineGate(` test — 22 declaring modules, **4 FINAL**:
  `depcruise-grant-liveness`, `eslint-grant-liveness`, `lifecycle-portability`, `runner-config-path-liveness`.
  `injected-op-caller-param`, `no-raw-spacing-in-features` and `no-raw-typography-in-features` have all dropped
  theirs. Corroborated by the `policy-legacy-imports` drive: 5 ARM A findings = those four plus
  `domain-freshness-plane` (which imports `ExemptionRow`, not a table). This corrects ledger `:396` (EXCLUDED
  scope — handing it to its owner, not flipping it) and prices `:395` / `:572`–`:579` at four modules.
- **`runner-config-path-liveness` is FINAL**, proved by the drive: `policy-legacy-imports`' population IS the
  final-policy corpus and it accuses `runner-config-path-liveness.ts:78`. Two guide sentences still say
  otherwise (`:167`, `:1531`) — that is ledger row `:398`'s residual.
- **`policy-legacy-imports` ARM B's live class is EMPTY** (0 of 5 findings). Any brief pricing ARM B work off
  §12.3's *"both are RED on the tree by design"* is pricing a dead class.

## 5. The 24 `FIXED` rows — read, not re-driven, and NOT normalized to CLOSED

**Codex's instruction 4 is right and the first draft was wrong to propose a mechanical rewrite.** Several
of these cells expressly say FINAL REVIEW PENDING; flipping them to CLOSED would launder an unfinished
review into a receipt, which is the exact move this ledger exists to catch. **No FIXED row changes state in
my proposal.** Each keeps its own cell until its own claim is verified by whoever owns it.

What I owe instead is honesty about my own coverage, per row. I read all 24 state cells out of the ledger
body; I verified only three against the tree, and each of those incidentally while adjudicating a
neighbouring row. The column below says which.

| ledger line | subject | my coverage | why it must not be auto-flipped |
| - | - | - | - |
| `:422` `:423` `:424` `:425` `:426` `:428` `:429` `:430` `:431` `:432` `:433` | the eleven `p-suite-honesty` instrument repairs | **READ ONLY** — cell read, tree not re-driven | plain `**FIXED**` cells; a flip is plausible but is the OWNER's verification, not mine |
| `:465` | `commented-code` (#2086, `27df4238a`) | **READ ONLY** | plain `**FIXED**` |
| `:522` | `commented-code` (cb-v-fix-wave-1, re-fixed after a refutation) | **READ ONLY** | plain `**FIXED**`; note this row and `:465` are the same subject across two waves — a flip must not double-count |
| `:854` `:859` | `playwright-css-topology` narrowing · `sanctioned-css-homes` header honesty | **VERIFIED, PARTIAL** — I read the current source while adjudicating `:704`/`:695`; the filed clauses match their receipts | cells read **FIXED — FILED CLAUSE VERIFIED; #2294 RESIDUE OPEN**. A CLOSED flip would drop the named residue; these want CLOSED **plus a separate residual row**, never a bare flip |
| `:857` `:860` | `product-css` `malformed` pin · the `#2183`/`#2182` drifted comment | **READ ONLY** | same **#2294 RESIDUE OPEN** qualifier as above |
| `:933` `:934` `:936` | `biome.edit.jsonc` · biome nested-ignore scope · `POPULATION_ROOTS` | **READ ONLY** | `**FIXED — #2299**` / `**FIXED — #2267**`; their section header says two residuals were tracked as #2307/#2308, so the section is not wholly closed |
| `:1010` `:1011` `:1012` | the three `#2309` resource-selection defects | **READ ONLY** | cells read **FIXED — INTEGRATED; FINAL REVIEW PENDING (#2309)**, and the section header adds *"BaseUI final review remains outstanding"*. **This is a Verify-column state, not a ledger state** — flipping it to CLOSED asserts a review that has not happened |
| `:1046` | the `_load-budget` `#2197` comment (`f946a501e`) | **VERIFIED** — read while adjudicating `:770`/`:1033`; the comment is rewritten to the measured effects and the `stdio` triple is preserved | plain `**FIXED**`, and its own section header still says *"#2197 remains OPEN pending a revision/load-bearing quiet planter receipt"* |

**Coverage summary: 3 verified (`:854` `:859` `:1046`, all partial/incidental), 21 read-only.**

The grammar observation from the first draft still stands and is worth recording WITHOUT acting on it:
`FIXED` is not in the ledger's `## How to read a state` vocabulary (which defines CLOSED, OPEN, SUPERSEDED,
DISSOLVED, UNADJUDICATED), yet it is a seventh bin in `STATE_BINS` and 24 rows sit in it. That is a
vocabulary question for the ledger's owner to settle deliberately — not a rewrite a verifier performs in
passing. Until it is settled, **no aggregate should quote OPEN alone**: the honest headline at `b1a23e534`
is 76 OPEN + 1 UNADJUDICATED live, 24 FIXED-with-their-own-qualifiers, 406 CLOSED.

## 6. Family / evidence-plane grouping, for chunking

Guide §3's planes, applied to the **25 RESIDUAL** rows only. Root can route each group as one lane.

| plane | rows | why they travel together |
| - | - | - |
| **pure syntax** | `:535` `:621` `:625` `:681` `:682` | one-home and dead-branch residues in gate/lib source; all five are read-and-edit with no fixture work. `:682`'s two `fix`-string sites make it the anchor |
| **entire-population tripwire** | `:214` `:263` | the §5b.5 header census (FAMILY / POPULATION PORT). 53 and 70 missing corpus-wide; both rows are the same sweep at different denominators |
| **closed resource** | `:688` `:689` `:690` `:691` `:692` `:693` `:694` | the two BYTE-IDENTICAL CSS legacy modules (`css-length-tokens`, `css-var-defined`). **These seven are ONE lane** — they are the last unconverted half of the CSS family and no fix pass has touched them since `0e03cee19` |
| **fact consumer** | `:655` (residual half) `:656` | `predicatesTableColumn` / `receiverConstituents` acquittal arms; both are "the row that dies under the cut" work on schema facts |
| **warning debt** | `:1047` `:917` | a parked baseline with no re-measurement door, and an advisory that implies an enforcement. Both are "make the number/claim derive" |
| **split family** | `:794` | `no-blanket-suppression`'s A+B split (#2063). The one standing refusal; owner ruling 1 of read-first §0 says it converts |
| **registry / completeness** | `:653` `:680` `:398` `:449` `:534` | claims a document or generated artifact makes that the tree does not carry — the two baseline regens, ARM B's dead class advertised as live, two false guide sentences, three unwarned exemplar routes, and the formatter escape predicate. Cheap, and every one of them misprices a future brief |
| **receipt accuracy** | `:1033` | the meta-row; closes with `:770` |

## 7. What I did NOT examine, and why

- **28 EXCLUDED rows** — every id listed in §2b with its owner. I produced receipts that reprice eight of
  them (`:395` `:396` and the six `:572`–`:579` ids) and hand those to their owners in §4 rather than
  adjudicating.
- **21 of the 24 `FIXED` rows were READ, not re-driven**, and 3 were verified only incidentally and only in
  part (`:854` `:859` `:1046`). §5 gives the per-row coverage. **None is proposed for a state change** — the
  first draft's mechanical CLOSED rewrite is withdrawn.
- **A planted positive control for `policy-waiver-spelling`** — the §5b.3 zero is a LEAD without it (§4).
  Planting was outside my read-only fence and I did not clear it, so the control is owed by whoever acts on
  the lead.
- **406 CLOSED, 6 SUPERSEDED, 3 DISSOLVED rows** — out of the brief's start set by construction.
- **`pnpm check:structure` whole, `check:policy-conformance` whole, any planting suite, any planted control** —
  fenced. Four bounded `--check <policy>` drives were run one at a time (`no-inline-types`,
  `policy-legacy-imports`, `policy-waiver-spelling`, `test-layout`) and two scoped vitest files.
- **`:690`'s "18 findings" cardinality** — not re-measured; the module is byte-identical so the row stands
  regardless, but the number is dated.

## 8. The rollup PROJECTION, derived per transition and conserved

**The first draft's `429 CLOSED / 53 OPEN / 0 UNADJUDICATED` did not conserve 516 and codex was right to
refuse it.** It never stated a destination for the MISFILED row, it omitted `:820` entirely, and it printed
three columns of a seven-column identity. Two errors happened to cancel in the CLOSED column, which is the
most dangerous way for a wrong number to look right — recorded here so nobody re-derives it by trusting the
first draft's total.

**Every transition, one row per adjudication class. Nothing else moves.**

| transition | rows | ids |
| - | -: | - |
| OPEN → CLOSED | **22** | `193 387 401 531 532 533 631 632 633 642 657 659 667 679 695 696 697 698 700 704 711 820` |
| UNADJUDICATED → CLOSED | **1** | `248` |
| OPEN → DISSOLVED | **1** | `770` |
| OPEN → OPEN (receipt refreshed, no state change) | **25** | the §3.3 table, `:655` included |
| FIXED → FIXED (§5, no flip) | **24** | the FIXED list in §2a |
| excluded, untouched | **28** | the §2b list |

`22 + 1 + 1 + 25 = 49` adjudicable · `+ 24` FIXED `= 73` examined · `+ 28` excluded `= 101`. The start set
is fully accounted for.

**MISFILED's destination, stated rather than assumed.** `MISFILED` is my word, not a ledger bin. The
vocabulary's closest member is **DISSOLVED** — *"the row was never a real defect, or its cell was measured
under a rule that has since been corrected"* — which is exactly `:770` (its negative claim was false at its
own measurement sha). If the integrator disagrees and prefers CLOSED, the arithmetic below shifts one row
from DISSOLVED to CLOSED and still conserves; I am naming the ambiguity rather than forcing it.

**The projection, column by column, as `original + Σin − Σout`:**

```
CLOSED         406 + 23 (22 OPEN→CLOSED, 1 UNADJ→CLOSED) − 0  = 429
OPEN            76 +  0 − 23 (22 →CLOSED, 1 →DISSOLVED)       =  53
SUPERSEDED       6 +  0 − 0                                    =   6
DISSOLVED        3 +  1 (770) − 0                              =   4
UNADJUDICATED    1 +  0 − 1 (248)                              =   0
FIXED           24 +  0 − 0                                    =  24
N/A              0 +  0 − 0                                    =   0
                                                        TOTAL   = 516   ✓
```

Cross-check on the OPEN column from the other direction: 76 OPEN at the start = 28 excluded (untouched) +
25 residual (unchanged) + 22 closing + 1 dissolving = 76. ✓ And the 53 that survive = 28 excluded + 25
residual. ✓

**The alternative arm, if `:770` is ruled CLOSED rather than DISSOLVED:** CLOSED 430 · OPEN 53 · DISSOLVED 3
· everything else unchanged · total 516. ✓ Both arms conserve; the difference is one row's destination and
the integrator owns it.

**Do not compute the next rollup from this paragraph.** It is a projection of what the flips would do, not a
measurement. Rebuild with `deriveClassRollup` on the tree after the flips land — that is what
`pnpm check:ledgers-fresh` compares against, and the whole reason this section exists in arithmetic form is
so a mismatch is visible instead of plausible.

### 8b. The paste-ready cells

The `proposed` column of each §3.1 row (and §3.4's prose) is the paste-ready state cell. §3.3's 25 rows keep
`**OPEN**` and want only their RECEIPT column refreshed with the re-derivation quoted there — `:655`
additionally wants its PREDICATE narrowed to the `owner-scoped-upserts` consumer. The 24 FIXED rows get no
edit at all.

## LEDGER ROWS (0 rows)

No new defect. Everything I found folded into an existing row: the `table-scoping-class` `fix`-string pair went
into `:682`, the second false `runner-config-path-liveness` sentence into `:398`, the two new unpinned
`anchorable` sites into `:535`, and the two stale baselines are §1b, which is a barrier regen and not a defect.

`ledger rows OWED: 0`

## 9. Commit receipt

This report landed as `a36b8b43c` on branch `agent-a342b79264b6b8b7a`, committed with
`git -c core.hooksPath=/dev/null` per the #1584 standing exception:

```
commit a36b8b43cfdaac9684a1a593787cb6fd82239c39
docs(gates): adjudicate the refutation ledger's 48 unowned OPEN rows against the tree (#2012, #1584)
 .../v-ledger-adjudication-2026-09-13.md            | 254 +++++++++++++++++++++
 1 file changed, 254 insertions(+)
```

`git status --short` was EMPTY after that commit. Two follow-ups exist: `02fa987cc` added this section
(a commit cannot contain its own stat), and a third commit carries the 2026-09-13 RECONCILIATION — the
explicit disjoint sets in §2a, the restored `:820` row, `:655`'s split, the withdrawn FIXED normalization
in §5, the §5b.3 downgrade to a lead in §4, and the conserved projection in §8. Its sha and stat are in
the lane report rather than here, for the same reason.
