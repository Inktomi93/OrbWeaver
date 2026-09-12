---
kind: review
status: active
updated: 2026-09-12
---

# Authority-migration census, re-derived (lane cb-v-authority-census)

Parent program: [#1584](https://github.com/Inktomi93/orbweaver/issues/1584); input for the spine lane
`p-authority-migration` ([#1922](https://github.com/Inktomi93/orbweaver/issues/1922)). Base:
`6b1d01be0`, isolated worktree, 2026-09-12. Every number below was produced in this session; the
2026-09-05 census (`53bb2d35f`) is treated as a hypothesis, not a source.

## 0. Instruments, and the one that lied first

- **Legacy roster:** `pnpm -s gate:contract` → `gate-contract: 421 finding(s) across 297 gate module(s)`;
  60 distinct modules carry a `[descriptor-wrapper]` finding. The brief's 60 is CONFIRMED.
- **Blocker columns** (direct-walk sites, module state, `baseline-ledger`, `gate-owned-project`) are the
  live gate's own findings from that run, not a re-read.
- **Table rows** are counted by a purpose-built parser with a PLANTED CONTROL in the same invocation
  (`empty=0`, `one=1`, `three-with-trailing-comma=3`, `array-with-comments=3`; 4/4 OK).
  **The first version of that parser was off by one on every trailing comma** and would have published
  "nearly every census row has drifted". It had not. The control is why this document says the opposite.
- **`ExemptionTable` declarations** cross-checked by two methods: the parser (45) and `ast-grep`
  (`const $N: ExemptionTable = $V` → 31, `const $N: ExemptionTable<$T> = $V` → 14; sum 45) at
  `scannedFileCount=578, skippedFileCount=0`.
- **Marker counts** use the guide §7 predicate (a comment whose CONTENT BEGINS with the opener), with a
  PLANTED POSITIVE control (+1 on every measured form) and a NEGATIVE control (an in-string mention does
  NOT move the count). A loose `grep -F "// @opener"` returns 86 central markers; the anchored predicate
  returns **10**. The 76-marker difference is fixture strings — exactly the inflation §7 warns about.
  All probes were planted and removed inside this lane's own worktree; `git status --short` is empty.

## 1. Headline

| Question | 2026-09-05 census | playbook §Phase D (2026-09-12) | measured today |
| - | - | - | - |
| legacy modules | n/a (255-module corpus) | 60 | **60** (confirmed) |
| authority letters | classified **27** of today's 60 (20 `X`, 2 `O`, 2 `MI+X`, 2 `B+X`, 1 `MI`) — the other 33 sat in the first-wave/resource cohorts and were never given a letter | "only TWO are `O`, **the other 58 are `X`**" | **not 58/2** — see §2 |
| `ExemptionTable` | 97 decls / 73 files / 319 rows / 14 empty | — | **45 decls / 34 files / 213 rows / 7 empty** |
| `SANCTIONED_HOMES` consumers | 25 tables, 24 gates + 1 local twin | — | **8 modules import `lib/sanctioned-home.ts`; only 3 are legacy** |
| central legacy markers | 631 opener candidates | 681 naming 36 gates, 578 of them `caught-failure-ownership` | **10 anchored (9 in source + 1 doc quote), naming 3 legacy gates** |
| central FINAL waiver | — | — | **1199 `@orb-waive` openers** — the spelling MOVED; every census row keyed on `@orb-gate-ignore` counts is stale by construction |

**The `58 X / 2 O` figure is a default, not a measurement.** It is right that
`appearance-carrier-contract` and `firehose-import-allowlist` are the census's two `O` rows — but those
two came from the 27 rows the census actually classified, and the remaining 33 legacy modules were
assigned `X` by residual, not by reading them. On the tree today **eight** legacy modules carry
no gate-owned exemption artifact of any kind (§3, class `H`), and **two more are standing conversion
REFUSALS** that should not be in the denominator at all. Planning authority migration for 58 modules
overstates the work and hides the two blocked ones.

**One `H` row died under its own full re-read.** The first draft classed nine modules `H` in §3 while
§2 listed eight — and `test-presence-client`, the ninth, moves to `X`: `CLIENT_EXCLUDE_FILES:20`
subtracts `data/trpc.ts` BY NAME with a cited reason and **no stale arm**. A skeleton read missed it
because the artifact is a bare `readonly string[]` whose `why` lives in the comment above it — the exact
shape both censuses' type-keyed predicates cannot see. The other three re-reads held (§3a).

## 2. Authority classes measured today

The census notation (`O` ordinary shared marker · `X` gate-local artifact · `MI` marker-immune ·
`B` baseline ratchet) has **no letter for a gate with no exemption door at all**. Eight legacy modules
are in that state and the notation forces them into `X`. This report uses `H` (hard — no artifact) for
them and recommends the letter be added to the notation.

| class | count | modules |
| - | -: | - |
| `MI` | 4 | `bus-payload-allowlist` (MI+X) · `finding-overload-provenance` (MI+X) · `gate-ignore-inventory` (MI) · `no-blanket-suppression` (MI, REFUSED) |
| `B` | 6 | `density-tier` · `duplicate-action-doors` · `suppressions` · `test-presence` · `ratchet-row-integrity` · `monotonic-tests` (the `docs/test-baseline/manifest.json` ledger, not a `*.baseline.json`) |
| `O` | 3 | `appearance-carrier-contract` · `firehose-import-allowlist` (both census-confirmed) · **`baseui-derives-not-respells`** (its ARM B door is the shared marker and nothing else — a third `O` the playbook does not name) |
| `H` | 8 | `baseline-single-migration` · `baseui-anatomy-completeness` · `baseui-surface-manifest` · `css-selector-has-a-writer` · `devtools-frontend-assets` · `enforcement-registry-parity` · `test-layout` · `tokens-contract` |
| `X` | the rest | see the per-module table; **`test-presence-client` joined `X` on a full re-read** (it read `H` in the first draft's §3 row) |

Counts overlap where a module is `B+X` or `MI+X`.

## 3. Per-module table (60 rows)

`fs` = `fsBacked: true`. `dw` = direct-walk sites from `gate:contract`. `st` = module-scope state
findings (mutation + let). Rows marked **EMPTY** are the 2026-09-12 trap: a ruled disposition around a
table that has since drained.

| module | today | artifacts (`file:line` · rows) | census disposition, and does it hold | reads / kind | split | blockers |
| - | - | - | - | - | - | - |
| appearance-carrier-contract | O | none (policy data: `EDITOR_BINDINGS:20` 7 rows, `PORTAL_BY_CARRIER:214`) | `O`; holds | `appearance-carrier-contract-ast` exists; needs a source-lookup fact | 1 | dw=3 `getSourceFile` `:206,317,318`; st=4 `:42-45` |
| assets-single-writer | X | regex zone `SANCTIONED:26` (1) + stale arm `:115-126` | "reviewed home grant"; holds | write/call-origin fact | 1 | dw=2 `:88,119`; zone is a DIRECTORY grant (model mismatch 3) |
| baseline-single-migration | H | none; `LAUNCHED:12` is a designed sunset switch, not an exemption | not classified; new | fs · `resource-path`/`resource-json` | 1 | fs; none |
| baseui-anatomy-completeness | H | none (reads `baseui-surface.manifest.json` = policy data) | not classified; new | fs · `baseui-read` exists | 1 | fs; none |
| baseui-derives-not-respells | **O** | none. 7 LIVE central markers in `packages/ui` (combobox `:41,50,53`, autocomplete `:45,60,62`, select `:140`) | not classified; playbook counts it `X` — **refuted** | fs · `baseui-read` exists | **2** (ARM A hard, no door · ARM B ordinary) | dw=3 `:157,178` |
| baseui-surface-manifest | H (full read) | none in-module. Its adjudication rows (`disposition` + `why`, incl. `sealed-away`) live in the GENERATED `baseui-surface.manifest.json`, owned by `ops/gen/baseui-surface.ts` | not classified; new | fs · installed-package resource | 1 | fs. Every finding is file-level (`fileFinding:63`) so there is no node for a marker to bind to — no door by construction |
| biome-grant-liveness | X | `EXEMPT:80` (1) · `RATIFIED_PATTERNS:126` (1) | "2 rows"; **holds exactly** | fs · `lib/grant-liveness.ts` (shared with 3 twins) | 2 (path liveness · rule liveness) | RUNS REAL BIOME over a mutated copy of `biome.json` at the repo ROOT — needs an execution capability, and a lane must not run it on a shared tree |
| bus-payload-allowlist | MI+X | `SANCTIONED_FIELDS:196` (1) | "1 safe wire field"; holds | `tuple-read` + a transitive payload reader | 2 (reviewed field · hard health) | dw=1 `:339`; st=8 `:222-244` (the worst state load in the set) |
| chat-viewer-plane-canon-reads | X | `ALLOWLIST:81` `ReadonlyMap` (**3**) — a non-`ExemptionTable` collection | in the "20 equivalent collections" bucket, never itemised | canonical call-graph fact | 2 (ordinary reach · hard matrix health) | dw=9 `:306-608` — the heaviest walk in the set |
| contract-verb-presence | X | `DEFERRED:32` (2) | "2 W1i rows, cite prose not a work item"; **holds, and the rows are unchanged** | `ast-read` service/verb facts | 2 (hard presence · warning debt) | dw=5; st=1 `:48`; rows need `workItem` (§12.5) and have none |
| css-family-ownership | X | none in-module, but the five `censusControlFiles` rows are a HAND-SPELLED count oracle for `lib/css-family-census.ts` | "CSS five-home counts + total RETIRE"; holds | fs · `css-*` libs exist | 1 | count ratchet: §12.5 forbids current-population counts |
| css-length-tokens | X | `STRUCTURAL_DECLARATIONS:31` (**9**, each with `count`) · `STRUCTURAL_QUERIES:95` (3, with `count`) · `STRUCTURAL_CLASS_FILES:105` (4, with `count`) | **NOT IN THE CENSUS AT ALL** | fs · `css-rules`, `static-class-expression` | 1 | **16 rows carrying explicit CARDINALITY** — the sharpest instance of final-model mismatch 2; st=2 |
| css-selector-has-a-writer | H | none | not classified; new | fs · `css-selector-writers` exists | 1 | fs |
| css-var-defined | X | `EXPECTED_VENDOR_USE:15` · `EXPECTED_MIRROR_FILES=49` · `EXPECTED_VENDOR_PROPERTIES=43` · `EXPECTED_VENDOR_MEMBERSHIPS=19` · `EXPECTED_RUNTIME_USE/PRODUCERS` | not itemised | fs · `css-var-resolution` exists | 1 | four current-population COUNT constants |
| dangling-refs | X | `ARM3_ALLOW:764` (7) · `ARM4_ALLOW:777` (16) · `GITIGNORED_ABSENT:826` (2) = **25** | census: "`:764,777,832` — 27 grants". **DRAINED by 2 and the third line moved `832`→`826`** | fs · own reader | 3 (path grants · symbol grants · absent-by-design) | `gate-owned-project` (`new Project`); dw=2 |
| db-structure | X | `NON_DOMAIN_PRODUCERS:26` (6) · `BASELINE_RIDER_PRODUCERS:56` (**0, EMPTY**) | "6 producer identities" holds; the empty rider table is one of the census's 14 and is **still empty** → delete still holds | fs · schema-file fact | 1 | dw=1 `:119` |
| density-tier | B+X | baseline `density-tier.baseline.json` · `ELEVATED_ALLOW:61` (**11**, a `readonly string[]` the census never itemised) | "23 rows / 60 occurrences ratified"; baseline half holds | `static-class-expression`, `tiers.css` resource | 3+ (A1-A3 budgeted · A4/A6 born-sealed · A5 stale) | dw=8; st=7; baseline-ledger finding |
| devtools-frontend-assets | H | none | not classified; new | fs · `resource-vendor`/`resource-json` | 1 | fs |
| dialog-via-composite | X | `ALLOWLIST:27` (**12**) | "10 permanent + 2 temporary (`rename-chat-dialog`, `invite-dialog`) to warning debt"; **holds — both temporary rows are still there, still with no work item** | canonical import origin | 2 (reviewed grants · warning debt) | st=1; file-key grants suppress every occurrence in the file |
| duplicate-action-doors | B+X | baseline (via `_shared/trpc-doors.ts`) · `EXEMPT_PROCEDURES:55` (1) | "6 rows / 12 occurrences"; the procedure exemption was never itemised | `trpc-doors`, `tuple-read` | 2 (door budget · exemption liveness) | dw=5; a per-file COUNT budget |
| enforcement-registry-parity | H (full read) | none. `(@mirrors-message)` is opt-IN to a STRICTER check and the module says so at `:101-103` ("not a suppression … it carries no reason: the reason is the byte-equality it promises") | not classified; new | fs · gate-corpus reader | 4 arms, one authority (roster parity · count · second-count-home · mirror) | `gate-owned-project` (`new Project`, `:280`); **must convert LAST** — it reads BOTH contracts and the doc roster. NUANCE: its SUBJECT includes `"(N registered gates)"`, a current-population declaration count §12.5 retires — the count lives in the law doc, not the gate, so the class is unchanged but the retirement clause reaches it |
| finding-overload-provenance | MI+X | grammar `@finding-overload-ok` (`:37-39`), consumption map, stale/over-exempt/malformed sweep `:244-270`. **6 live markers** | census: "Delete with obsolete raw-Finding provenance gate". **STALE** — the module header states the ban SURVIVES #828 with a changed reason, and the gate is not obsolete | gate-corpus + finding-shape fact | 1 | baseline already deleted 2026-08-23 (born-compliant); st=8 |
| firehose-import-allowlist | O+X | `ALLOWED:42` — **3 regex zones** | "three `ALLOWED` regexes at `:42`"; **holds exactly** | `symbol-reference` exists | 1 | dw=1 `:96`; directory permissions, not population |
| gate-ignore-inventory | MI | none of its own; it IS the central legacy marker's auditor | "becomes obsolete when central authority owns them"; holds, **but only at Phase F** | fs · gate-corpus | 1 | **must convert after the LAST legacy marker is translated**; st=2 |
| gate-modernization | X | `EXEMPTION_NAME_RE:37` — the detector that decides what counts as an exemption table | "the name detector and its limits"; holds | fs · gate-corpus | 4 arms (A descriptor · B exemptions · C citation · D admitted) | dw=4; baseline-ledger finding; it audits the corpus, so it converts late |
| json-column-write-parity | X | `ALLOWLIST:74` (6) · `GUARD_EXEMPT:98` (4) · `EXEMPTION_ROW_COUNT:117` derived | census: "`:74,86` — 5 permissions". **GREW to 10 and the second table moved `:86`→`:98`** (the module's own comment at `:113-116` records the 7-vs-10 drift) | `schema-fact` exists | 2 (column parity · guard domination) | dw=9 |
| knob-wire-coverage | X | `DOORWAY:32` (1) · `DEFERRED:42` (**5**) | "5 D107 remediation rows citing law/audit prose, not a work item"; **holds exactly** | `tuple-read` + settings-knob facts | 2 (sanctioned doorway · warning debt) | dw=**15**, the largest walk count; rows need `workItem` |
| list-row-adoption | X | `ALLOWLIST:28` (**0, EMPTY**) | one of the census's 14 empty tables; **still empty** → delete holds | callback-JSX/component origin | 1 | dw=3; st=1; **convert by DELETING the table, no grant needed** |
| macro-resolution-home | X | `SANCTIONED:66` — 4 regex+why rows | "exact reviewed home grants"; holds | source-origin fact | 1 | dw=1 `:166`; 1 in-module marker mention |
| monotonic-tests | B | `docs/test-baseline/manifest.json` `deletions` ledger + its stale arm | "2,427 file rows + 76 deletion rows — the prohibited every-file manifest shape"; holds | fs-ish · test-baseline resource | 2 (pseudo-skip · deleted-spec) | also exports a legacy `Check` (`monotonicTests:195`) — a SECOND consumer to re-home |
| no-arbitrary-tw-values | X | `ALLOWLIST:19` (2) | "2 path-only file rows, cannot be copied verbatim"; **holds** | `static-class-expression` | 1 | st=1; file-key over-grant |
| no-blanket-suppression | MI | **none by design** (header: "NO allowlist, NO baseline, `markerImmune`") | not classified | needs a STAGED-BLOB resource kind | 1 | **CONVERSION REFUSED** 2026-09-11 (#1930), re-derived 2026-09-12 (#2013): the 18-kind vocabulary is frozen and a one-consumer kind was deliberately not minted. NOT authority-migration work |
| no-floorless-control-in-wrap | X | `JUDGMENT_DEFERRED:70` (2) | "2 PERMANENT geometry rulings despite the misleading name — belong under reviewed grants"; **holds; both rows still say PERMANENT** | class/pitch facts | 2 (run arm + visitor arm) | dw=4; st=1 |
| no-interactive-role-in-features | X | `BURN_DOWN:49` (**0, EMPTY**) | census's 14-empty list; **still empty** → delete holds | `symbol-reference` + JSX/ARIA origin | 1 | dw=3; st=1; **convert by deleting the table** |
| no-legacy-react-api | X | **re-implements the central grammar**: `IGNORE_WORD:30`, `MARKER_RE:32`, own `markerSites`/`usedMarkerSites` sets `:56-58`, own stale sweep `:162-167`. 1 live marker (`packages/ui/src/markdown/dialogue-paragraph.tsx:12`) | "pure duplication and deletes"; **holds exactly, unchanged** | React import/member fact | 1 | st=2; the duplicate parser deletes with the conversion |
| no-manual-memo | X | `EXEMPTIONS:31` (3) | "3 compiler/tooling rulings"; **holds** | `sanctioned-home` mention only; needs React-Compiler denylist resource | 2 (memo ban · denylist tripwire) | fs; st=1 |
| no-nul-bytes-in-source | H\* | `SKIP_DIRS:15` + `TEXT_EXT_RE` are a POPULATION fence, not an exemption | not classified | `resource-tree`/tracked-file resource | 1 | fs; the fence is population algebra (§12.5 keeps it) |
| no-pointer-variants-in-features | X | `SANCTIONED_HOMES:19` (1) via `lib/sanctioned-home.ts` | in the 42-row sanctioned-home bucket | shared `sanctioned-home` → central grant | 1 | st=1; DIRECTORY-key grant |
| no-raw-z-index | X | `SANCTIONED_HOMES:30` (2) via the shared helper | same bucket | same | 1 | fs |
| no-test-fabrication | X | custom grammar `FABRICATION-OK` (`:16-19`) + malformed/stale/over-broad arms. **424 LIVE anchored markers in 197 files (423 `tests/`, 1 `scripts/`)** | **NOT IN THE CENSUS'S ELEVEN-GRAMMAR TABLE AT ALL** (that table totals 158 openers) | test cast fact | 1 | **the single largest marker translation in the whole program**, and the grammar has no `(position)` today while `@orb-waive` REQUIRES one; dw=2 |
| open-json-column-key-parity | X | `DOORWAY:44` (1) · `DEFERRED:66` (1, `messageVariants.metadata` → #184) | "1 row tied to issue #184"; **holds exactly** | `schema-fact` exists | 2 (doorway grant · warning debt) | dw=11; this is the ONE warning-debt row that already names a work item |
| platform-spellings | X | 4 ruled ADOPT/AVOID arms, all at ZERO on the tree; 2 in-module marker mentions | "deferred rows"; the arms are at zero, so the deferred claim is **not reproducible** | platform/static spelling facts | 4 arms, one authority | dw=3; a live-verified zero population needs a fail-closed empty control |
| playwright-css-topology | H | none (imports `SANCTIONED_CSS_HOMES` from its sibling) | not classified; new | fs · `config-static-read` exists | 1 | dw=1; **coupled to `sanctioned-css-homes` by import — convert together** |
| query-freshness-coverage | X | `STATIC:48` (**34**) · `DEFERRED:197` (1, `automation.listChatActivity`) | "34 static classifications" + "1 row citing B6 design work, not a work item"; **both hold exactly** | tRPC query/invalidation origin | 2 (hard policy data · warning debt) | dw=7; 1 in-module marker mention |
| query-machine-seals | X | 3 regex zones `EXEMPT_DATA:16` · `EXEMPT_COLLECTION:17` · `EXEMPT_TEST:18` + two stale arms | **NOT NAMED IN THE CENSUS** | source lookup | 2 (seam ban · zone liveness) | dw=2; **1 live marker (`tests/client/lib/_ct-stories.tsx:16`) AND 7 literal pins in `tests/tooling/gate-ignore-grammar.repo.int.test.ts`** |
| ratchet-row-integrity | B | judges EVERY `*.baseline.json` under `tooling/src` via `_shared/ratchet-rows.ts` | "becomes obsolete when central authority owns them"; holds | fs · ledger discovery | 4 arms, one authority | **must convert AFTER the six baseline owners**; baseline-ledger finding |
| sanctioned-css-homes | X | `SANCTIONED_CSS_HOMES:9` (**6**) + a two-sided missing-home arm | "closed six-home CSS registry — hard policy data"; **holds** | fs · `resource-tree` | 1 | exported and imported by `playwright-css-topology` |
| seed-theme-ink-contrast | X | `DECORATIVE_STROKE_CARRIERS:63` (**9**) | "9 decorative-stroke grants"; **holds exactly** | fs · `seed-theme-ink` exists | 1 | carries 1 `@finding-overload-ok` marker (parked with its owner) |
| stale-draft-commit | X | `ALLOWLIST:27` (**0, EMPTY**) | census's 14-empty list; **still empty** → delete holds | condition/member origin | 1 | dw=4; st=1; **convert by deleting the table** |
| suppressions | B+X | baseline `suppressions.baseline.json` · `RATIFIED_RULES:39` (**46**) · `RATIFIED_TEST_RULES:194` (**7**) | "46 source and 6 test rule classifications" — the TEST table **grew by 1**; "27 burnable occurrences across 20 files, no work-item identity" | `suppression-directive` exists | 2 (source scope · test scope, different WHY) | baseline-ledger finding; kind 7 is an EXPLICIT NON-MIGRATION (native directives) |
| test-layout | H (full read) | none. Its subtractions are POPULATION predicates in code — the `support`/`e2e` non-mirror trees (`:55-57`), the `mirror === "suite"` kind exemption (`:82-84`), and the tooling no-src-twin / flat-file tier (`:110-118`) — all kind- or tree-scoped, never a named-file grant | not classified; new | fs · `test-kinds` + tracked-file resource | 1 | none. §12.5 keeps population algebra, so this is the cheapest conversion in the set |
| test-presence | B | baseline `test-presence.baseline.json` (2 debt rows) | "2 debt rows tied to board item #772"; holds | fs · ratchet ledger | 2 (domain arm · tier arm) | dw=1; baseline-ledger finding |
| test-presence-client | **X** (was H; refuted by the full read) | `CLIENT_EXCLUDE_FILES:20` — **1 named-file exemption** (`data/trpc.ts`), `why` in the comment at `:17-19`, NON-EMPTY, **no stale arm in either direction**. `CLIENT_EXCLUDE_NESTED:16` (2) is population algebra by contrast (a nested bucket is not a direct child) | not classified; new | fs · store/mirror facts | 3 clauses (A per-file · B group · C action-by-name) | dw=1; the exclusion is §12.5's banned "sanctioned implementation home surviving as `notUnder` subtraction" and needs a reviewed grant or a real fix. Clause C was silently inert on 15 of 34 stores until #619 — the conversion owes an empty-population control |
| tokens-contract | H | none | not classified; new | fs · `resource-json` + vendored schemas | 1 | reaches `@orb/ui/token-contract` across the package boundary |
| tooling-slot-template | X | `BASH_FRONTED_TOOLS:21` (1) · `CORPUS_SLOTS:31` (1) | "`:18,28` — 2 tool-slot classifications"; **holds** (both lines moved +3) | fs · `resource-tree` | 2 (slot shape · corpus slot) | dw=1 |
| tsconfig-entry-liveness | X | `EXEMPT:78` (1) · `RATIFIED:106` (**8**) | "`:53,80` — 4 rows". **GREW to 9 and both lines moved** | needs a `jsonc` reader | 2 (path liveness · pattern liveness) | **CONVERSION BLOCKED 2026-09-11 (#1930): the `jsonc` ResourceHost kind was RULED OUT.** Not schedulable |
| ui-primitive-structure | X | `VARIANTS_EXEMPT:32` · `TEST_EXEMPT:34` · `PROVIDER_ALLOW:37` · `COLOR_LITERAL_TEST_EXEMPT:217` — 4 gate-local exempt consts | **NOT NAMED IN THE CENSUS** | fs · `comment-spans` + fs facts | 8 clauses (5 AST + 3 filesystem) | dw=**12**; the highest split arity in the set |
| ui-size-via-variant | X | `ALLOWLIST:117` (2) | census: "3 path-only rows". **DRAINED to 2** | `sanctioned-home` mention | 1 | st=2 |
| ui-skin-fragment-purity | X | `SANCTIONED_HOMES:25` (1) via the shared helper | in the 42-row bucket | shared `sanctioned-home` | 1 | 1 in-module marker mention; DIRECTORY-key grant |
| wire-schema-vocab-one-home | X | `ALLOWLIST:24` (2) | "`:24` — 2 exact schema homes"; **holds exactly** | keyword/static-string origin | 2 (vocabulary ban · home liveness) | dw=4 |

### 3a. The four full re-reads (the skeleton-read `H` rows, now settled)

Every `H` claim below rests on a full end-to-end read of the module, not a skeleton.

| module | verdict | what the full read found |
| - | - | - |
| `baseui-surface-manifest` | **H HOLDS** | No table, no marker door, no baseline. All four arms report through `fileFinding` (`:63`) — file-level findings have no node, so there is no marker door by construction. The adjudication vocabulary (`disposition` + `why`, incl. `sealed-away` with its reason) is real authority but it lives in the GENERATED `baseui-surface.manifest.json`, produced by `ops/gen/baseui-surface.ts` — **a RESOURCE-resident exemption vocabulary, which is a home none of the census's five buckets names**. Flagged, not reclassified: the gate owns no table. |
| `enforcement-registry-parity` | **H HOLDS** | No table, no marker, no baseline. `(@mirrors-message)` is an opt-IN stricter check and the module states the distinction itself at `:101-103`. Its only debt-shaped artifact is the `"(N registered gates)"` count it CHECKS, which lives in the law doc. Ordering is the real constraint: `new Project` at `:280` plus a both-contracts reader means it converts last. |
| `test-layout` | **H HOLDS** | No table, no marker, no baseline. Its three subtractions are population predicates — the `support`/`e2e` non-mirror TREES (`:55-57`), the `suite` KIND exemption (`:82-84`), and the tooling no-src-twin / flat-file tier (`:110-118`). §12.5 keeps population algebra, so none of them is authority. Cheapest conversion in the set; the C3 pricing stands. |
| `test-presence-client` | **H REFUTED → `X`** | `CLIENT_EXCLUDE_FILES:20` is a named-file subtraction of `data/trpc.ts` from a population it otherwise belongs to (it IS a direct child of the included `data/` home), carrying a cited reason at `:17-19` and **no stale arm in either direction** — nothing reds when the file disappears or grows bespoke logic. That is a one-sided gate-local exemption, i.e. `X`, and it is §12.5's named ban on a sanctioned implementation home surviving as subtraction. `CLIENT_EXCLUDE_NESTED:16` (2 rows) is genuinely population and stays out of the count. |

## 4. Delta against the 2026-09-05 census, per artifact

**Rows that STILL HOLD EXACTLY** (verified, unchanged): `biome-grant-liveness` 2 · `bus-payload-allowlist`
1 · `contract-verb-presence` 2 · `db-structure` 6 · `dialog-via-composite` 12 (10 permanent + the 2
temporary chat rows, still work-item-less) · `knob-wire-coverage` 5 · `no-arbitrary-tw-values` 2 ·
`no-floorless-control-in-wrap` 2 · `no-manual-memo` 3 · `open-json-column-key-parity` 1 ·
`query-freshness-coverage` 34 + 1 · `sanctioned-css-homes` 6 · `seed-theme-ink-contrast` 9 ·
`tooling-slot-template` 2 · `wire-schema-vocab-one-home` 2 · `no-legacy-react-api`'s duplicate parser ·
all four still-EMPTY tables. **The census is substantially accurate.** That finding is itself load-bearing:
a lane can trust the census's per-row analysis and must re-derive only the counts flagged below.

**Rows that MOVED:**

1. `json-column-write-parity`: 5 → **10** rows; second table `:86` → `:98`.
2. `tsconfig-entry-liveness`: 4 → **9** rows; both lines moved.
3. `dangling-refs`: 27 → **25** rows; third table `:832` → `:826`.
4. `ui-size-via-variant`: 3 → **2** rows.
5. `suppressions` test-rule table: 6 → **7**.
6. `ExemptionTable` corpus-wide: 97/73/319/14 → **45/34/213/7**.
7. `SANCTIONED_HOMES`: 25 tables across 24 gates → **8 consumer modules, 3 of them legacy**.

**Artifacts the census could not see** (wrong type, or inside a module it did not classify):

- `css-length-tokens` — **16 rows across three tables, each row carrying an explicit `count`**
  (`:31`, `:95`, `:105`). A per-row cardinality grant. This is the hardest single case against
  final-model mismatch 2 and it is not in the census.
- `no-test-fabrication`'s `FABRICATION-OK` grammar — **424 live markers, 197 files**. The census's
  eleven-grammar table totals 158 openers; this one grammar is 2.7× that whole table.
- `ui-primitive-structure` — 4 gate-local exempt consts.
- `query-machine-seals` — 3 regex zones with two stale arms.
- `chat-viewer-plane-canon-reads` — `ALLOWLIST` `ReadonlyMap`, 3 rows.
- `density-tier` `ELEVATED_ALLOW` — 11 rows, `readonly string[]`.
- `css-var-defined` — four current-population COUNT constants.
- `assets-single-writer` — a regex directory zone with a stale arm.

**`ExemptionTable` still inside FINAL modules — the brief expected eight; there are eight modules and a
ninth home:** `contract-derives-not-respells:59` (3) · `depcruise-grant-liveness:52` (0, EMPTY) and
`:74` (4) · `eslint-grant-liveness:21` (6) · `injected-op-caller-param:53` (8) ·
`lifecycle-portability:114` (18) · `no-raw-spacing-in-features:39` (3) ·
`no-raw-typography-in-features:39` (3) · `runner-config-path-liveness:106` (0, EMPTY) — **9 declarations
in 8 final gate modules, 45 rows** — plus **`tooling/src/verify/ops/new-gate.ts:43` `ALLOWLIST` (0)**,
the SCAFFOLD, which will keep minting the legacy shape into every new gate until it is rewritten
(the guide's Phase-F list already names `gate:new`; this is its concrete row).

**Marker-form delta.** The central legacy marker drained from 681 (2026-09-11) to **10 anchored** because
`caught-failure-ownership` converted and took 578 markers with it (`@orb-waive caught-failure-ownership`
is 582 today). What remains, exhaustively:

| marker | count | sites |
| - | -: | - |
| `@orb-gate-ignore baseui-derives-not-respells` | 7 | `packages/ui/src/primitives/combobox/combobox.tsx:41,50,53` · `autocomplete/autocomplete.tsx:45,60,62` · `select/select.tsx:140` |
| `@orb-gate-ignore no-legacy-react-api` | 1 | `packages/ui/src/markdown/dialogue-paragraph.tsx:12` |
| `@orb-gate-ignore query-machine-seals` | 1 | `tests/client/lib/_ct-stories.tsx:16` |
| `@orb-gate-ignore caught-failure-ownership` | 1 | `docs/reviews/gate-runtime/v-gate-batch-2026-09-12.md:51` — a doc QUOTE, not a marker |
| `@finding-overload-ok` | 6 | correctly parked: owner still legacy, disposition is delete-with-gate |
| `FABRICATION-OK` | 424 | `tests/**` (423) + `scripts/` (1), 197 files |
| `@swallowed-ok` | 3 | `packages/db/src/schema/relations.ts:20` + 2 fixtures in `tests/tooling/ast/index.test.ts` |

**Guide §7's parked-grammar table is stale in its REASON.** It lists `@sub-floor-ok` (2),
`@swallowed-ok` (8) and `@surface-focus-elsewhere` (2) as "PARKED — owner still legacy". None of
`sub-floor-disclosure`, `detached-work-traced` or `surface-a11y-focus` is in today's legacy roster: all
three are FINAL. `@sub-floor-ok` and `@surface-focus-elsewhere` are now at **0** (translated with their
owners, as designed). `@swallowed-ok`'s remaining 3 are the **kind-9** AST-lens consumers
(`tooling/src/ast/ops/swallowed.ts`), which the guide itself rules are NOT an alias — so they are
correctly parked for a different reason than the table gives.

## 5. Chunk proposal for `p-authority-migration`

Dependency-ordered. Each chunk names its prerequisite; a chunk whose prerequisite is unmet is not
schedulable.

**C0 — REMOVE FROM THE DENOMINATOR (0 conversions, 1 doc edit).** `no-blanket-suppression` (#1930/#2013,
staged-blob kind deliberately not minted) and `tsconfig-entry-liveness` (#1930, `jsonc` kind ruled out)
are standing REFUSALS. The program's remaining-legacy arithmetic should read **58 convertible + 2
refused**. Prerequisite: none.

**C1 — Empty-table deletions (4 modules).** `list-row-adoption` · `no-interactive-role-in-features` ·
`stale-draft-commit` · `db-structure`'s rider table. Each converts by DELETING an empty table and its
stale arm; no central grant is minted at all. Prerequisite: none. **This is the cheapest chunk in the
program and the `58 X` framing hides it entirely.**

**C2 — Path-keyed grants (6 modules, 8 rows).** `no-pointer-variants-in-features` (1) · `no-raw-z-index`
(2) · `ui-skin-fragment-purity` (1) · `no-arbitrary-tw-values` (2) · `ui-size-via-variant` (2) ·
**`test-presence-client` (1, added after its full re-read — §3a)**. The first three share
`lib/sanctioned-home.ts` (already proven by 5 FINAL twins); all six share one question.
Prerequisite: **a ruling on whether a reviewed grant may key a DIRECTORY or a FILE** — every row here is
one, and model mismatch 3 says copying the key preserves the over-grant. `test-presence-client`'s row is
the only one with **no stale arm at all**, so it needs a real disposition (fix or grant), never a copy.

**C3 — `H`-class hard conversions (7 modules, 0 authority work).** `baseline-single-migration` ·
`baseui-anatomy-completeness` · `baseui-surface-manifest` · `css-selector-has-a-writer` ·
`devtools-frontend-assets` · `test-layout` · `tokens-contract`. All `fsBacked` except `test-layout`'s
tracked-file read; all have a landed reader. Prerequisite: none. **Not authority migration at all** —
schedule as ordinary conversions and stop counting them as `X`. **`enforcement-registry-parity` is
`H` too but is NOT in this chunk** — it reads both contracts and the doc roster, so it belongs to C9.
**`test-presence-client` was priced here in the first draft and has been REMOVED (§3a):** it carries a
one-sided named-file exemption and belongs with C2's grant work, not with the free conversions.

**C4 — Ordinary-marker owners (3 modules, 9 markers).** `baseui-derives-not-respells` (7 markers,
2-policy split) · `no-legacy-react-api` (1 marker + delete its duplicate parser) · `query-machine-seals`
(1 marker + 3 zones). Prerequisite: the §7 fence — markers translate IN THE SAME COMMIT as their owner.
**Coupled site to brief:** `tests/tooling/gate-ignore-grammar.repo.int.test.ts` pins
`query-machine-seals` ×7 and `no-test-fabrication` ×4 BY LITERAL and is a `--full`-only suite, so
`pnpm check` will not catch its breakage.

**C5 — Schema / JSON-column family (5 modules).** `db-structure` (6) · `json-column-write-parity` (10) ·
`open-json-column-key-parity` (2) · `contract-verb-presence` (2) · `knob-wire-coverage` (6). One reader
(`lib/schema-fact.ts`, landed). Prerequisite: **`workItem`-linked warning debt**, which now exists
(§12.5 + the `--fail-on-warnings` door, #2025) — but four of these tables cite PROSE, not an issue, so
each owes a work-item mint before its rows can become warnings.

**C6 — Count-ratchet family (4 modules).** `css-length-tokens` (16 rows with per-row `count`) ·
`css-family-ownership` (5 census-control rows) · `css-var-defined` (4 count constants) ·
`duplicate-action-doors` (per-file door budget). Prerequisite: **an owner ruling on cardinality** —
§12.5 bans count ratchets outright and model mismatch 2 says a grant has no cardinality, so these four
cannot convert without either an occurrence-unique subject or a hard algorithm that owns the count.

**C7 — Baseline ratchets (5 modules, then their auditor).** `density-tier` · `suppressions` ·
`test-presence` · `monotonic-tests` · `duplicate-action-doors` (also C6), **then**
`ratchet-row-integrity` LAST — it judges every `*.baseline.json`, so it cannot convert before its
subjects retire. Prerequisite: #1922's per-ledger disposition (fix / exact grant / `workItem` warning).

**C8 — `no-test-fabrication`, alone.** 424 markers in 197 files, a grammar with no `(position)`, and a
final marker that requires one. Position derivation must come from the CONVERTED policy's own reported
`token` per guide §7's DEAD/MULTI/UNWAIVABLE classification, not from a text codemod. Prerequisite: C4
completed as the rehearsal.

**C9 — Meta-gates, last (4 modules).** `gate-modernization` · `finding-overload-provenance` ·
`gate-ignore-inventory` · `enforcement-registry-parity`. All four read the CORPUS; each must convert
after the last module it audits, and `gate-ignore-inventory`'s parser plus
`finding-overload-provenance`'s grammar delete at Phase F. Prerequisite: every other chunk.

**Unchunked remainder** (each an ordinary single-module conversion with one small grant):
`appearance-carrier-contract` · `assets-single-writer` · `bus-payload-allowlist` ·
`chat-viewer-plane-canon-reads` · `dangling-refs` · `dialog-via-composite` · `firehose-import-allowlist` ·
`macro-resolution-home` · `no-floorless-control-in-wrap` · `no-manual-memo` · `no-nul-bytes-in-source` ·
`platform-spellings` · `playwright-css-topology` + `sanctioned-css-homes` (import-coupled, one lane) ·
`query-freshness-coverage` · `seed-theme-ink-contrast` · `tooling-slot-template` ·
`ui-primitive-structure` · `wire-schema-vocab-one-home`.

## LEDGER ROWS (10 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| the `58 X / 2 O` split | cb-v-authority-census L1 · `docs/design/gate-runtime-orchestrator-playbook.md:936` · `docs/design/gate-runtime-read-first.md:128-130` | the figure is a RESIDUAL, not a measurement: `exception-authority-census.md` gave an authority letter to only **27** of today's 60 legacy modules, and the other 33 (the first-wave/resource cohorts) were assigned `X` by default rather than by reading them. Measured today: 3 `O` · 8 `H` · 4 `MI` · 6 `B` | other (unmeasured count in a planning doc) | **OPEN** | replace both sentences with the measured partition and the re-derivation command, so the spine lane prices 58 modules of authority work only where authority exists |
| the authority notation | cb-v-authority-census L2 · `docs/reviews/gate-runtime/uncovered-gate-conversion-census.md:71-72` · `docs/design/gate-runtime-standardization.md:1050-1053` | the four letters (`O`/`X`/`MI`/`B`) have **no letter for a gate with no exemption door at all**, so eight legacy modules that own no artifact are forced into `X` and priced as authority migration | other (notation gap) | **OPEN** | add `H` (hard — no gate-owned exemption artifact) to both notation homes, defined as: no table, no zone, no custom grammar, no baseline, no marker door |
| `no-blanket-suppression` · `tsconfig-entry-liveness` | cb-v-authority-census L3 · `no-blanket-suppression.ts:17-34` · `tsconfig-entry-liveness.ts:22-24` | both are standing conversion REFUSALS ruled 2026-09-11 (#1930) against the frozen 18-kind vocabulary — a staged-blob kind deliberately not minted, a `jsonc` kind ruled out — and `no-blanket-suppression`'s was re-derived and re-dated 2026-09-12 (#2013). Both are still counted inside the remaining-legacy 60 | other (denominator) | **OPEN** | state the remaining legacy as **58 convertible + 2 refused** wherever the count is published, so a lane never picks a refused module off the roster |
| `no-test-fabrication` | cb-v-authority-census L4 · `no-test-fabrication.ts:16-19` | its `FABRICATION-OK` grammar is **absent from both censuses** and from guide §7's eleven-grammar table, while carrying **424 live anchored markers across 197 files** — 2.7× that whole table's 158 openers. The grammar also has no `(position)`, which `@orb-waive` requires | §7 kind 3 (gate-owned custom grammar) | **OPEN** | add the row to the eleven-grammar disposition table (making it twelve), and plan the translation as its own lane whose positions DERIVE from the converted policy's reported `token`, never from a text codemod |
| `finding-overload-provenance` | cb-v-authority-census L5 · `exception-authority-census.md:65` vs `finding-overload-provenance.ts:1-14` | the census's disposition — "Delete with obsolete raw-Finding provenance gate" — is STALE: the module's own header records that **the ban SURVIVED #828 with a changed reason**, so the gate is not obsolete and its 6 live markers are parked for a reason the census does not state | other (stale disposition) | **OPEN** | rewrite the census row to "delete WITH ITS GATE, whenever that gate retires — the ban is live", and keep the markers parked |
| guide §7 parked-grammar table | cb-v-authority-census L6 · `docs/design/gate-runtime-standardization.md:1069-1078` | the table's REASON is refuted: `sub-floor-disclosure`, `detached-work-traced` and `surface-a11y-focus` are **all FINAL today** (none is in the 60-module legacy roster), so "PARKED — owner still legacy" is false for all three. `@sub-floor-ok` and `@surface-focus-elsewhere` are now **0**; `@swallowed-ok`'s remaining **3** are the kind-9 AST-lens consumers, a different disposition entirely | §7 kind 9 vs kind 3 | **OPEN** | re-derive the live column, drop the two centralized rows, and re-file `@swallowed-ok` under kind 9 with its own migrate-or-retire decision |
| `css-length-tokens` | cb-v-authority-census L7 · `css-length-tokens.ts:31,95,105` | **16 grant rows carrying an explicit per-row `count`** across three tables — the sharpest live instance of final-model mismatch 2 ("reviewed grants have no cardinality") — and it appears in neither census because none of the three is an `ExemptionTable` | other (count ratchet, §12.5 ban) | **OPEN** | rule cardinality ONCE for this module plus `css-family-ownership`, `css-var-defined` and `duplicate-action-doors`: an occurrence-unique subject, or a hard algorithm that owns the count |
| `ops/new-gate.ts` | cb-v-authority-census L8 · `tooling/src/verify/ops/new-gate.ts:43` | a NINTH `ExemptionTable` home the "eight in FINAL modules" expectation does not cover: the `gate:new` SCAFFOLD still emits the legacy table shape, so every gate minted before Phase F is born owing an authority migration | other (generator emits retired shape) | **OPEN** | the guide's Phase-F list already names `gate:new`; this is its concrete row — rewrite the template against `defineGate` + central grants, or stop emitting the table |
| the marker-census predicate | cb-v-authority-census L9 · guide `docs/design/gate-runtime-standardization.md:1080-1085` | a loose `grep -F "// @opener"` reports **86** central markers where the guide's own anchored predicate reports **10** — the 76 difference is fixture strings inside gate proofs. Any grammar counted the loose way is inflated, which is the failure §7 already warns about and which this lane reproduced on itself | other (instrument) | **OPEN** | every marker count in this program cites the anchored predicate and ships a positive AND a negative control in the same invocation; state that where §7 states the predicate |
| `test-presence-client` | cb-v-authority-census L10 · `tooling/src/verify/gates/test-presence-client.ts:20` | `CLIENT_EXCLUDE_FILES` subtracts `data/trpc.ts` BY NAME from a population it otherwise belongs to (it IS a direct child of the included `data/` home), with its reason in the comment at `:17-19` and **no stale arm in either direction** — nothing reds when the file disappears or grows bespoke logic. §12.5's named ban: a sanctioned implementation home surviving as `notUnder` subtraction. Invisible to both censuses because it is a bare `readonly string[]`, and invisible to a skeleton read of this module | other (one-sided exemption) · §12.5 | **OPEN** | give it a real disposition — either test `data/trpc.ts` and delete the row, or mint a reviewed grant with `why` + `endsWhen` and a liveness arm. Never copy the path key forward |

## WHAT I DID NOT COVER

- I did **not** read all 60 modules end to end. **Full reads (15):** `tokens-contract` ·
  `baseline-single-migration` · `devtools-frontend-assets` · `no-nul-bytes-in-source` ·
  `sanctioned-css-homes` · `css-selector-has-a-writer` · `ratchet-row-integrity` ·
  `ui-skin-fragment-purity` · `query-machine-seals` · `baseui-anatomy-completeness` ·
  `assets-single-writer` · **`baseui-surface-manifest` · `enforcement-registry-parity` ·
  `test-layout` · `test-presence-client`** (the last four added 2026-09-12 on the coordinator's warm
  leg — verdicts in §3a; one of the four, `test-presence-client`, was REFUTED by its own full read).
  **Every `H` row now rests on a full read.** Everything else was a SKELETON read (header block +
  every top-level declaration + the descriptor fields + a full window around each artifact). A
  skeleton read locates; it does not conclude, and every `split` figure in the table is a claim about
  the arms I saw, never a proof of arity.
- **The `H` claims for the other four modules — `baseline-single-migration`,
  `baseui-anatomy-completeness`, `css-selector-has-a-writer`, `devtools-frontend-assets`,
  `tokens-contract` — did come from full reads, but `test-presence-client` proves the shape a full
  read must hunt for:** a bare `readonly string[]` of paths whose `why` sits in the comment above it.
  Any remaining `X`-classed module may hold a SECOND such artifact I did not itemise; the table's
  artifact lists are complete for typed tables and named collections, not provably complete for
  comment-justified path arrays.
- The census's **"20 equivalent non-`ExemptionTable` collections / 79 rows"** bucket is **not**
  re-derived as a total. I itemised eight such collections the census missed; I did not re-run its
  structural predicate, so I cannot say whether the bucket grew or shrank.
- **No baseline JSON row counts were re-derived.** The nine `*.baseline.json` populations
  (density 23/60, suppressions 274/572, etc.) are quoted from the census, unverified.
- **No conversion was attempted and no policy was driven.** Split arities are unbuilt claims; guide
  §12.6's own warning applies — check each predicate count against its module before building.
- `@public` is reported as **0 line-comment openers**, which is a statement about the FORM only: that
  family lives in JSDoc (`/** @public twin: */`, `tooling/src/ast/lib/public-markers.ts:49,51`) and my
  predicate does not admit a `*` continuation carrier. Its population is unmeasured here.
- I ran `pnpm -s gate:contract` (exit 1, the expected legacy count) and no other gate or suite. No
  `pnpm check`, no `check:structure`, no tests.
