---
kind: review
status: active
updated: 2026-09-13
---

# Ledger receipt reconciliation at da3f25f63

Root read both independent reports below in full and accepted their 22 exact state-cell proposals. No new behavioral run is claimed. The thirteen remaining binding-reader migrations stay OPEN; the hard enforcer is not their repair. Historical ledger defect and receipt cells are preserved. Board delivery and final combined verification remain separate.

# Exact ledger adjudication — #2097, #2267, #2109, #1988, #2287

Base: clean main `da3f25f6303a87e1a0e007d92a201a119c3e3860`. Read-only. No tests were run. This reconciles existing source, commits, and durable reports; it is not a new behavioral receipt.

Correction to the earlier scratch report: `/tmp/codex-open-ledger-triage.md` now states the tree was clean. My earlier “root-dirty” description was wrong; the command output contained only the SHA because `git status --short` was empty.

## #2097 — fourteen binding-reader rows

The premise that all fourteen were stale is **refuted**. `d334dd5ca` built the *enforcer*, `policy-binding-resolution`; it deliberately reports the migration set RED. It did not migrate the fourteen consumers. The full `policing-surface-audit-2026-09-12.md` says this explicitly in §5 B15, §7, §9, and STATE FOR RESUME: 23 effective findings in 14 modules, routed to `p-binding-readers`. `v-policing-audit-2026-09-12.md` independently confirmed the ten-member recognizer and the 23-finding/14-module real-tree census, while expressly declining to audit every site. This is enforcement evidence, not closure evidence.

Current source still contains the original forbidden call chain in thirteen modules. A literal scan of the exact fourteen files found the relevant `getDefinitionNodes`, `getAliasedSymbol`, `getValueDeclaration`, or Symbol-owned `getDeclarations` calls in lines 595–607. The policy is type/owner based, so the literal scan is only corroboration; the durable type-aware second opinion is the policy-family real-corpus arm. One module, `zod-error-issues-home`, was actually migrated and has a dedicated later CLOSED row (ledger line 809).

| ledger line / module | exact original state | current source result | proposed state cell |
| - | - | - | - |
| 595 `audit-client-tests` | `OPEN → p-binding-readers` | original `Symbol#getDeclarations()` remains at current `:221` | **unchanged: `OPEN → p-binding-readers`** |
| 596 `class-token-splice` | `OPEN → p-binding-readers` (+ API note) | `lexicalReferenceSymbol(callee)?.getDeclarations()` remains at `:149` | **unchanged** |
| 597 `context-definition-shape` | `OPEN → p-binding-readers` | `nameNode.getDefinitionNodes()` remains at current `:129` | **unchanged**; coordinate in defect text needs routine refresh from `:134`, but the defect is live |
| 598 `ct-no-oneshot-live-read-assert` | `OPEN → p-binding-readers` | `identifier.getDefinitionNodes()` remains at current `:203` | **unchanged**; coordinate refresh only |
| 599 `evaluate-no-scope-capture` | `OPEN → p-binding-readers` | alias/value-declaration chains remain at `:227-228`, `:249`, plus `:286` | **unchanged** |
| 600 `message-kind-policy-coverage` | `OPEN → p-binding-readers` | both original chains remain at `:77`, `:95` | **unchanged** |
| 601 `no-context-returntype` | `OPEN → p-binding-readers` | original chain remains at `:41` | **unchanged** |
| 602 `no-manual-token-estimate` | `OPEN → p-binding-readers` | alias/declarations chain remains at `:57` | **unchanged** |
| 603 `no-raw-zustand-persist` | `OPEN → p-binding-readers` | original chain remains at `:343` | **unchanged** |
| 604 `plugin-dump-guard` | `OPEN → p-binding-readers` | original chain remains at `:89` | **unchanged** |
| 605 `registry-context-via-mint` | `OPEN → p-binding-readers` | alias/declarations chain remains at current `:76-77` | **unchanged**; coordinate refresh only |
| 606 `section-factory-contribution-bundle` | `OPEN → p-binding-readers` | original chain remains at current `:94` | **unchanged**; coordinate refresh only |
| 607 `warning-code-coverage` | `OPEN → p-binding-readers` | original chain remains at `:98` | **unchanged** |
| 608 `zod-error-issues-home` | `OPEN → p-binding-readers` | chain is gone; current module delegates to `lib/type-member-origin.ts#resolveTypePropertyOrigin` | **`CLOSED — cce850dc1 (board #2194): resolveTypePropertyOrigin drives the BindingElement fixture and planted unresolvable; the module carries no raw declaration chain. Independently reviewed in v-wave-10-2026-09-13.md; the dedicated later ledger row at line 809 preserves the receipt.`** |

Durable receipt for line 608: `x-instruments-batch-2026-09-13.md` states only this #2097 site was changed and the other twelve then-named sites were untouched; `v-wave-10-2026-09-13.md` confirms the raw chain's absence and the helper controls; ledger line 809 already records `cce850dc1`, raw 8 = granted 8. The discrepancy “other twelve” versus this table's remaining thirteen comes from the audit/report's changing cohort, not proof that another row here closed; current source resolves it directly.

## #2267 — ledger line 761, `POPULATION_ROOTS`

Original state: `**OPEN** (board #2267)`.

The original defect is covered. Current `contract/population.ts` points to `tests/tooling/verify/contract/population.test.ts`. That test reads pnpm's own workspace resolution through `readPolicyWorkspacePackages`, compares it to `POPULATION_ROOTS` both directions, asserts the real member population is nonempty, plants missing-member, dead-root, wrong-path and stale-exclusion controls, and requires reasons on exclusions. This directly closes “a new workspace package joins no root and no instrument reports it.”

Durable receipts: implementation `26315e791`, integrated as current-main `007f8732a`; full report `x-test-population-2026-09-13.md` §#2267 records 78/78 scoped tests, package-roster green, and a removed live package plant that reddened the real-tree arm. Ledger line 936 already carries the same defect as `FIXED — #2267`.

Proposed state cell:

`**CLOSED — INDEPENDENTLY REVIEWED** (board #2267; lane 26315e791, integrated as 007f8732a): the native-workspace reconciliation holds POPULATION_ROOTS both ways, with non-vacuity, wrong-path and stale-exclusion controls. Full receipts: x-test-population-2026-09-13.md; the later duplicate ledger row at line 936 records the repair.`

This turn adds source/report reconciliation only; it does not add a fresh main run.

## #2109 — ledger line 764, stale `expectationFailure` coordinate

Original state: `**OPEN** (board #2109)`.

The exact defect is gone. Current `policy-proof-expectations.ts` says only that `expectationFailure` is in `ops/policy-conformance.ts`; it no longer pins `:184-216`. Commit `ee165b3a7` contains the one-line deletion. `v-wave-8a-2026-09-13.md` identified this as #2109's sole remaining item after accepting the load-time envelope substitution, and `adj-ledger-reconcile-2026-09-13.md` independently traces the deletion commit.

Proposed state cell:

`**CLOSED — ee165b3a7** (board #2109): the header names expectationFailure by symbol and owning module, with no line-range coordinate. Source/reconciliation review confirmed the original stale-coordinate defect is absent; prose-only scoped Biome/ESLint receipts are in the commit.`

No behavior changed and no behavioral proof is claimed.

## #1988 — ledger line 791, three effective verify-owned inline types

Original state: `**OPEN** (board #1988)`.

The exact three verify-owned declarations were removed from their forbidden homes:

- `lib/show-artifact.ts` now imports its report/view shapes from `contract/show-artifact.ts`;
- `lib/tenancy-scope.ts` now imports `ScopingRow` and `TableShape` from `contract/tenancy-scope.ts`;
- `ops/debt.ts` now imports `LiveAdmission` from `contract/debt.ts`.

`rg` finds no exported interface/type in the first two old homes; `ops/debt.ts` still exports the unrelated operational `Ledger` interface, while the row's cited `LiveAdmission` declaration is gone. Commit `f895d7348` preserves the exact moved shapes and package exports and removes the dead `Check`. Its commit receipt records 34/34 + 87/87 focused tests, tooling/root typechecks, scoped lint, and production `no-inline-types` at raw 6 = waived 5 + effective 1, whose sole effective finding is product-owned `BugReportSubmission`. `v-baseui-final-2026-09-13.md` independently records that same current population and sole product finding.

Proposed state cell:

`**CLOSED — INDEPENDENTLY VERIFIED** (board #1988; f895d7348): the three verify-owned verdict types moved intact to contract homes; production no-inline-types is raw 6 = waived 5 + effective 1, with the sole effective finding the product BugReportSubmission. Focused 34/34 + 87/87, native typechecks and scoped lint passed; v-baseui-final-2026-09-13.md independently confirms the resulting population.`

Limit: this closes the row's three verify-owned findings and ownership bar, not every future/product `no-inline-types` finding.

## #2287 — ledger line 841, UVD re-spelled tier members

Original state: `**OPEN** (board #2287)`.

The exact live copies named by the row are gone. Current UVD §3.1 says tier membership is registry data and `pnpm verify --list` is the roster. The `push` and `full` cells characterize purpose and route membership to that command; they no longer name `quality:cpd` or delegate to a note that declares `tests:tooling` membership. Commit `ee165b3a7` performs this exact change. Follow-ups `8f765deda` and `11a359f84` remove other stale current-tier copies and retired instructions, preserving history and conditional-membership semantics. Current later mention of `tests:tooling` at UVD line 356 explains the execution group and again routes its *current tier membership* to `pnpm verify --list`; it is not the copied tier roster this row describes.

Proposed state cell:

`**CLOSED — ee165b3a7** (board #2287; follow-ups 8f765deda, 11a359f84): UVD preserves tier purposes while routing current membership and order to registry.ts / pnpm verify --list; the push/full copies named by this row are absent. Independent full-source review accepted the follow-up range.`

No runtime or membership changed; this is documentation authority reconciliation.

## Net state proposal

- \#2097: **1 CLOSED, 13 remain OPEN**. Do not flip the cohort wholesale.
- Singles: **4 CLOSED** (#2267, #2109, #1988, #2287).
- Total proposed changes: **5 state cells** (ledger lines 608, 761, 764, 791, 841).
- Remaining behavioral work: the thirteen current #2097 source migrations. The existing hard policy and its real-corpus second opinion are enforcement, not their repair.

# Exact CSS/BaseUI ledger adjudication

Snapshot: clean main `da3f25f6303a87e1a0e007d92a201a119c3e3860`. Scope is only ledger rows 886, 888–891, 893, 895, 978–982, and 1000–1004. I read the pertinent builder and independent reports in full (`x-baseui-rework`, `v-baseui-final`, `x-css-family-unit`, `v-css-unit-2`, `x-css-train-fixes`) and inspected the current implementation and proof sites named below. I ran no tests; runtime counts are preserved report/main artifacts rather than a new run.

## Proposed state-cell replacements

| Ledger row | Original state | Proposed state |
| -: | - | - |
| 886 | **OPEN** (board #2297) | **CLOSED — SOURCE-CONFIRMED** (#2297; `27acc5617`) |
| 888 | **OPEN** (board #2297) | **CLOSED — CONTROL-VERIFIED** (#2297; `dea1061df`) |
| 889 | **OPEN** (board #2297) | **CLOSED — CONTROL-VERIFIED** (#2297; `f638436a2`) |
| 890 | **OPEN** (board #2297) | **CLOSED — CONTROL-VERIFIED** (#2297; `f638436a2`) |
| 891 | **OPEN** (board #2297) | **CLOSED — CONTROL-VERIFIED** (#2297; `f638436a2`) |
| 893 | **OPEN** (board #2297) | **CLOSED — CONTROL-VERIFIED** (#2297; `90a7a90db`) |
| 895 | **OPEN** (board #2297) | **CLOSED — CONTRACT RECONCILED** (#2297/#2309; `c8fccfa7c`) |
| 978 | **OPEN — #2314; B assigned** | **CLOSED — CONTROL-VERIFIED** (#2314; `913ac535c`) |
| 979 | **OPEN — #2314; B assigned** | **CLOSED — CONTROL-VERIFIED** (#2314; `913ac535c`) |
| 980 | **OPEN — #2294 (Ready)** | **CLOSED — CONTROL-VERIFIED** (#2294; `913ac535c`) |
| 981 | **OPEN — #2315; B assigned** | **CLOSED — DIFFERENTIAL-VERIFIED** (#2315; `913ac535c`) |
| 982 | **OPEN — #2294 (Ready)** | **CLOSED — SOURCE-CONFIRMED** (#2294; `913ac535c`) |
| 1000 | **OPEN — #2305; B assigned** | **CLOSED — CONTROL-VERIFIED** (#2305; `7bf03e12f`) |
| 1001 | **OPEN — #2305; B assigned** | **CLOSED — CONTROL-VERIFIED** (#2305; `7bf03e12f`) |
| 1002 | **OPEN — #2305; B assigned** | **CLOSED — SOURCE/CONTROL-CONFIRMED** (#2305; `7bf03e12f`) |
| 1003 | **OPEN — #2305; B assigned** | **CLOSED — SOURCE-CONFIRMED** (#2305; `7bf03e12f`) |
| 1004 | **OPEN — #2305; B assigned** | **CLOSED — SOURCE-CONFIRMED** (#2305; `7bf03e12f`) |

## Durable row evidence

### #2297

- **886, phantom citations:** current `baseui-surface-manifest.ts:43,88`, `baseui-anatomy-completeness.ts:49`, and `baseui-derives-not-respells.ts:62` name the existing `baseui-and-surface-family.repo.int.test.ts`; `27acc5617` repaired all six family citations, including the two older siblings. `x-baseui-rework` §4 enumerates every replacement and what its target proves. This closes the exact dangling-path defect.
- **888, three surface-manifest arms:** current `baseui-surface-manifest.ts:351-364` has separate exact rows for vanished part, vanished component, and version mismatch. `x-baseui-rework` §1 records pre-repair cut-clean for all three, then each cut killing exactly its own new row; `v-baseui-final` Claim 6 independently reproduced the three cuts and count-99 sensitivity.
- **889, unresolved carve:** current `baseui-anatomy-completeness.ts:280-281` renders the unresolved Backdrop and asserts silence; its `why` names the exact cut. The old misleading row is corrected at `:258-259`. Builder cut and independent Claim 7 both report that only the new `mustPass[5]` dies when the carve opens.
- **890, non-part carve:** current `baseui-anatomy-completeness.ts:286` plants an exposed `kind: "hook"` and asserts silence. Builder and independent review report it reds when `part.kind !== "part"` is removed.
- **891, comment/type-only blindness:** current guard is the shared AST predicate `baseUiBindings(sf).some(binding => !binding.typeOnly)` at `baseui-anatomy-completeness.ts:187`. Rows cover mid-file comment, type-only import, and a positive value import (`:75-84`, `:230`); independent Claim 7 confirms raw-text revert, bare-binding revert, fail-open, and fail-shut cuts discriminate.
- **893, reachable refusal statuses:** `baseui-and-surface-family.repo.int.test.ts:358-415` drives complete receipts, metadata unresolved, AST unresolved, and whole-package missing; its earlier JSON block covers missing/empty/unresolved. `x-baseui-rework` §3 derives why installed-package missing is shared while unresolved is per mode. `v-baseui-final` Claim 8 independently confirms the complete reader status set.
- **895, execution contract disagreement:** current `resource-policy-contract.md:122-143` now says `entire-population` is required for indivisible answers and `selected-files` is valid when selected members compose, then specifies resource-triggered reselection and complete resource availability. This is the exact Arm A selected by the independent review; `c8fccfa7c` reconciled the binding contract without changing the three correct selected-file policies. The historical defect is closed; the later #2309 selection implementation has separate accepted evidence.

The independent BaseUI report remains historically **PARTIAL** on an unqualified 12/12 replay statement, but that finding is not one of these seven rows; the tracked builder report now distinguishes 11/12 raw from 12/12 after marker translation. It must not keep these source/control rows open.

### #2294 / #2314 / #2315 resource and CSS-reader rows

- **978, token-contract unresolved:** `token-contract.ts:62-69` enumerates `ready|missing|empty|unresolved` and points the non-string-expressible case to `token-contract-family.test.ts:101-146`; that test plants invalid UTF-8 and asserts the complete unresolved refusal. The same family has a healthy complete-run receipt (`:185-187`).
- **979, product-css empty/unresolved for both consumers:** both gate headers now enumerate all reader statuses (`seed-theme-ink-contrast.ts:79-99`; the topology sibling has the parallel section). Each gate owns an empty `mustRefuse`; `seed-theme-ink-family.test.ts:314-363` and `css-home-topology-family.test.ts:170-193` plant invalid UTF-8 with healthy twins. `x-css-train-fixes` leg 6 records one-row deaths for empty cuts and exact refusal text.
- **980, authored-tree unresolved:** `css-home-topology-family.test.ts:103-163` derives `unresolved` from the tree reader, plants a real symlink, checks population-phase refusal, and has a same-substrate healthy twin. The current sanctioned-css header enumerates the status rather than retaining “both reachable”.
- **981, seed reader differential:** `seed-theme-ink.ts:17-48` carries the enumerated delta classes. `seed-theme-ink-family.test.ts:203-224` adds the previously absent no-semicolon, second-`@theme`, and nested-seed pins. `x-css-train-fixes` leg 6 records the frozen-reader versus current-reader matrix for all classes; this closes the exact missing pins and false four-delta prose.
- **982, issue citation:** `tests/tooling/token-contract.test.ts:199` now says #2182 and names `a97454714`; `x-css-train-fixes` records the bounded 12-site sweep that changed five drifted citations and preserved seven correct #2183 sites.

The combined implementation report records 87/87 focused tests, four selected production policies with nine findings all granted and zero alarms/tool errors/withheld, plus scoped lint and typechecks. These are historical receipts from `913ac535c`, not newly re-run here.

### #2305 CSS-family rows

- **1000, missing colorization member:** `css-family-ownership-health.ts:118-140` now has a distinct colorization-missing row using the complete sibling seam. `x-css-family-unit` final leg records the cut `CLIENT_COLORIZATION -> []` killing that row and not the density/blur rows.
- **1001, retired-ratchet discriminator:** the current header states three blur carriers/six declarations (`css-family-ownership-health.ts:28-30`), and the row at `:180-191` explains why six crosses the retired expected four while two carriers did not. The final report records the old two-carrier control surviving and the corrected third-carrier control dying under the retired comparison.
- **1002, fence measurements:** `css-family-policy.ts:516-518` now states 2 findings with the fence and 14 without and explicitly retracts the stale 2/5 sentence. The report records the fence cut killing exactly its row.
- **1003, fixture cardinality/deleted symbol prose:** `css-family-proof-fixtures.ts:109-132` now states one carrier/two declarations for each complete seam, explains the old arbitrary second carrier, and names presence coverage rather than the retired `size * 2` contract. Coupled gate prose was updated in the same commit.
- **1004, stale BaseUI successor claim:** `css-selector-has-a-writer-health.ts:20-38` now says vanished state directions moved to per-part writer proof and identifies vanished-part/component as already held by `baseui-surface-manifest` rows. Those rows are present at `baseui-surface-manifest.ts:351-358`; ancestry places `dea1061df` before `7bf03e12f`.

`x-css-family-unit` records the final focused source battery and mutation controls; main integration provenance in the reports identifies `7bf03e12f` as the residue repair. No unresolved gap remains in these five original rows.

## Limits

- No lifecycle conclusion is inferred; this proposes ledger state cells only.
- I did not re-run the focused batteries. The source controls are present on `da3f25f63`; execution receipts come from the tracked builder/independent reports and named main artifacts.
- \#2297's replay-port evidence row, #2318's sixth manifest consumer, and any newer findings outside the specified lines are separate rows and do not change these dispositions.
