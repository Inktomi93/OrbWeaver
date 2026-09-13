---
kind: review
status: active
updated: 2026-09-13
---

# v-baseui-final — the FINAL independent verdict on #2297 and #2309 (lane `cb-v-baseui-final`)

Fresh-context adversarial verification of the two integrated repairs. Every number below is run output
produced in THIS session in THIS worktree; nothing is re-quoted from a commit message or a lane report.

## 1. Base and root

- Base sha: **`99acf985d`** (`git -C <wt> rev-parse --short HEAD`), tree clean at start AND at finish
  (`git status --short` empty, `git diff --stat` empty).
- Worktree: `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-ae9fce89f800ac10c`
- The five commits under review all resolve on this branch: `dea1061df` · `f638436a2` · `90a7a90db` ·
  `27acc5617` (#2297) and `57f7affdc` (#2309).
- **One brief premise was refuted and re-supplied mid-run.** The brief named
  `docs/reviews/gate-runtime/x-resource-selection-2026-09-13.md` "on main"; it does not exist on the tree or
  anywhere in history (`git log --all --pretty=format: --name-only | sort -u | grep -i resource-selection`
  → zero). SendMessaged; the orchestrator supplied the untracked copy in the lane's own worktree
  (`agent-ae026c897f4363636`), which I read read-only. My primary evidence is the code and my own runs.

### Probes, all restored

| Probe | Kind | State |
| - | - | - |
| `tooling/src/verify/lib/cbvbf-policy-pass-old.ts` | `git show 57f7affdc~1:` sibling copy (red-first control) | REMOVED |
| `tooling/src/verify/lib/policy-plan.ts` | `cp`-backed edit (fact paths back into the completeness denominator) | RESTORED via `mv` from `.cbvbf.bak`; `git diff --stat` empty |
| 9 × `tests/tooling/verify/lib/cbvbf-*.test.ts` | scratch probe suites | DELETED |
| N × `tooling/src/verify/gates/cbvbf-cut-*.ts` / `cbvbf-an-*.ts` / `cbvbf-legacy-*.ts` | one sibling scratch module PER CUT, serial in the name, `rmSync` in a `finally` | `ls tooling/src/verify/gates \| grep -c cbvbf` → **0** |

Cut-harness discipline followed: the anchor is asserted to occur **EXACTLY ONCE** or the cut REFUSES; an
UNPATCHED CONTROL copy ran first in every batch and reported 0 rows dead every time; each cut got its own
scratch filename with a serial (the `?query` cache trap).

## 2. Verdicts, one per claim

> ### **#2309 — CONFIRMED.**
>
> ### **#2297 — PARTIAL.** The four CODE repairs are confirmed (claims 6, 7, 8, 10). Claim 9's derives replay is
>
> ### the finding: **11/12 raw, 12/12 only after a SECOND undeclared fixture port** the commit and the lane
>
> ### report do not name — the same class as that lane's own LR-3, one module over.

---

### Claim 1 (#2309) — resource-only changed request re-judges the FULL dependent `@ui` population — **CONFIRMED**

The shipped family-test arm (`baseui-and-surface-family.repo.int.test.ts` §2309) drives a **one-file**
source population, where `effectiveSourcePaths: [the seal]` is simultaneously "the full population" and
"the intersection minus nothing". That cannot distinguish the two, so I rebuilt it on **THREE** seals.

Independent driver: `runPolicyPass` (the production dispatcher, the door `ops/scoped.ts:279` and
`ops/structure.ts:217` actually call), a real ts-morph Project with three `@ui` seals, the declared
`json:baseui-manifest` supplied through `resourceOptions.overlay`, both live siblings.

```
baseui-derives-not-respells       RES-ONLY src= [cbvbf-a.tsx, cbvbf-b.tsx, cbvbf-c.tsx]  findings=3  withheld=[]  toolErrors=0
baseui-derives-not-respells-health RES-ONLY src= [cbvbf-a.tsx, cbvbf-b.tsx, cbvbf-c.tsx]  findings=3  withheld=[]  toolErrors=0
```

**Selected source count: 3 of 3** — the complete declared population, not the intersection (which is `[]`).
Owner `{ status: "success", population: "complete" }`, zero tool errors, zero withheld. **The control is in
the same invocation**: the identical request against the ledger under which the seals are legal selects the
same three files and reports **0** findings, so the arm is not passing on an empty walk.

**RED-FIRST, produced by me, not re-quoted.** Same probe against `57f7affdc~1`'s dispatcher (materialised as
a sibling scratch module so no real file was touched):

```
AssertionError: expected [] to deeply equal [ 'cbvbf-a.tsx', 'cbvbf-b.tsx', 'cbvbf-c.tsx' ]
```

`effectiveSourcePaths: []` with `owner: success` — the false clean, reproduced.

### Claim 2 (#2309) — source-only request stays exact and keeps every declared resource — **CONFIRMED**

```
SRC-ONLY src= [cbvbf-b.tsx]  res= [tooling/src/verify/gates/baseui-surface.manifest.json]
receipts= [{"kind":"resource","source":"json:baseui-manifest","resources":1,"unresolved":0}]  toolErrors= []
```

Exactly the named source, the complete resource declaration, one `unresolved: 0` receipt, no withheld owner,
the finding reported on `[B]` only. Red-first on the pre-fix dispatcher, both siblings:

```
[{ policyId: 'baseui-derives-not-respells',        phase: 'create', message: 'resource request json:baseui-manifest is undeclared' }]
[{ policyId: 'baseui-derives-not-respells-health', phase: 'create', message: 'resource request json:baseui-manifest is undeclared' }]
```

Defect D reproduced and closed.

### Claim 3 (#2309) — planner/dispatcher agreement, with a discriminating break — **CONFIRMED (with one coverage note)**

Break performed exactly as the brief specified, `cp`-backed on the REAL `lib/policy-plan.ts`
(announced before and after): `declaredSourcePaths: [...declaredSourcePaths, ...factPaths]` — the pre-#2309
divergence, fact paths back in the planner's completeness denominator.

Driven through `planPolicyCommand` → `executePolicyPlan` on the fact-consumer fixture:

```
CBVBF planned mode = deferred  reason = entire-population policy requires its complete declared population
CBVBF executed = {"ok":false,"exitCode":2,"message":"policy execution population disagrees with its plan: fact-policy"}
```

**Exit-2 class, thrown, not drifted.** After `mv`-restoring the file, the same drive gives
`planned mode = run` / `executed { ok: true, exitCode: 0 }`, and `policy-plan.test.ts` returns to 37/37.

**COVERAGE NOTE, not a defect.** The pin that catches this cut is **`policy-plan.test.ts`'s "plans and
reconciles a provider's independent population" fact fixture** — not the four-shape `test.each` in
`policy-effective-population.test.ts`. That `test.each` drives `hybridPolicy`, which declares **no facts**,
so `dependencyPaths` is empty and the fact-denominator divergence is invisible to it. The agreement pin set
is complete only when both files are read together; a brief naming only the four-shape `test.each` as "the
agreement pin" would be naming the half that cannot fail.

### Claim 4 (#2309) — separation, deferral, shared-fact rules — **CONFIRMED**

- **A resource identity never appears in `run.files`.** Structural: `run.files` is built from
  `population.effectiveSourcePaths`, which `resolveEffectivePopulation` derives from `declaredSourcePaths`
  alone (`policy-pass.ts:333`). Driven both ways — a resource-only request and a `[manifest, seal-a]`
  request both selected `[a, b, c]` and neither contained the manifest path.
- **Entire-population deferral is bit-identical in effect**: `policy-effective-population.test.ts` 18/18,
  `policy-pass.test.ts` 56/56, `policy-plan.test.ts` 37/37 green at HEAD.
- **The conservative "a resource that CONTAINS its own subjects → whole-population" arm exists and is
  pinned** — `policy-effective-population.test.ts`, *"THE COUNTEREXAMPLE TO EXACTNESS, taken deliberately"*,
  with the DISJOINT twin beside it asserting the exact walk. Both green.
- One arithmetic change I checked for a hidden verdict flip: the deferral denominator moved from array
  lengths (`declared.length + resources.length`) to **Set** sizes (`owned`/`selectedOwned`). For a policy
  whose resource population overlaps its source population the old form double-counted; both forms scale
  identically, so the `<` comparison cannot flip. No behavioural difference.

### Claim 5 (#2309) — `requestStaysDeclared` deleted, the fences untouched — **CONFIRMED**

- **The fences are byte-unchanged.** `git show --stat 57f7affdc` names neither
  `lib/resource-policy.ts` nor `lib/resource-declaration.ts`; the last commits touching `resource-policy.ts`
  are `b2c6a8553` / `899ec74a7` / `4f9726e78`, all pre-#2309. The ruling survives, its INPUT changed:
  `allowedPaths` is still `context.resourcePaths` = `run.population.effectiveResourcePaths`
  (`policy-pass.ts:545,588`), which for a RUNNING owner is now the complete declaration.
- **Planted out-of-declaration read, WITH its positive control in the same invocation.** A fixture policy
  declaring `package-metadata:tooling` and reading `package-metadata:root`, driven in three scopes:

```
ROGUE whole         toolErrors=["resource request package-metadata:root is undeclared"] withheld=["cbvbf-fence"] owner=incomplete
ROGUE source-only   (identical)
ROGUE resource-only (identical)
HONEST whole / source-only / resource-only   toolErrors=[]  owner={success,complete}  withheld=[]
```

Still refused, in every scope. The deletion narrowed nothing.

- **No `lib`-exported contract type survived the home move.** `pnpm check:structure --check no-inline-types`
  (bounded, whole 3339-source population for that policy): **exit 1 · raw 6 = waived 5 + granted 0 +
  effective 1 · 0 alarms · 0 tool errors · 0 withheld**. The single effective finding is
  `packages/client/src/features/app-shell/lib/bug-report-capture.ts:200:13 BugReportSubmission` — the known
  pre-existing PRODUCT finding. **Zero verify-owned findings.**

---

### Claim 6 (#2297) — the three surface-manifest drift arms — **CONFIRMED**

My own harness, four cuts plus the state cut, control first:

```
CONTROL (unpatched copy)                                            0 failure(s)
CUT !(partName in installed.parts)      -> if (false)   →  mustFlag[3] ONLY  "expected effective finding count=2 but got 1"
CUT !(name in installed.components)     -> if (false)   →  mustFlag[4] ONLY  "expected at least one effective finding but got 0"
CUT installed.version !== manifest.ver  -> if (false)   →  mustFlag[5] ONLY  "expected at least one effective finding but got 0"
CUT identity() drops ${part.state…}                     →  mustFlag[2] ONLY  "expected at least one effective finding but got 0"
```

Each cut kills exactly its own row and no other — including the headline **version tripwire**, which
v-conversions-11 measured as enforced by nothing. `identity()`'s `state` term is **untouched** and the
state-only row (`mustFlag[2]`) is present and is the only row the `state` cut kills, so the retirement the
css-hook-provenance conversion leans on (#2305) is safe.

**Instrument control:** `count: 99` planted on each of the 11 `mustFlag` rows in turn (by source-text patch,
one scratch module per plant) — **all 11 die**, `[0,1,2,3,4,5,6,7,8,9,10]`. Every count is exact and the
instrument can fail.

### Claim 7 (#2297) — the anatomy blindness guard and the two carves — **CONFIRMED**

```
CONTROL                                                                 0 failure(s)
CUT guard -> raw sf.getText().includes("@base-ui/react")   → mustFlag[3] + mustFlag[4]  (both "count=1 but got 2")
CUT guard -> bare baseUiBindings(sf).length > 0            → mustFlag[4] ALONE
CUT guard -> if (true)   (failed SHUT)                     → 9 rows, INCLUDING mustFlag[5], the value-import twin
CUT part.disposition !== "unresolved" carve OPEN           → mustPass[5] ALONE
CUT part.kind !== "part" carve                             → mustPass[6] ALONE
count: 99 on each of the 6 mustFlag rows                   → all 6 die
```

- The guard IS the derivation's own admission predicate
  (`baseUiBindings(sf).some((b) => !b.typeOnly)`), and both false-positive spellings — the **mid-file
  comment** (`mustFlag[3]`) and the **`import type`-only importer** (`mustFlag[4]`) — report
  `NO_SEALS_SCANNED` today and both revert to `count=1 but got 2` under the text scan. The bare-bindings cut
  isolates the type-only half, so the lane's widening beyond the reviewer's probe is real, not decorative.
- The **positive value-import twin** (`mustFlag[5]`) dies when the guard is failed SHUT — without it the
  whole blindness block could be neutralised silently.
- Both carves red under their own cut, with the exact messages the fix spec predicted:
  `` `Select.Backdrop` is rendered at …:4, but the ledger rules it "unresolved" `` and
  ``the ledger rules `Select.useFilter` "exposed", but no @orb/ui seal renders it``.
- **`mustPass[2]`'s `why` is TRUE.** The `unresolved`-carve cut killed `mustPass[5]` and **only**
  `mustPass[5]`; `mustPass[2]` survived it, which is the receipt that its ROOT-ONLY fixture structurally
  cannot reach the carve — and the rewritten `why` says exactly that and points at `mustPass[5]`.

### Claim 8 (#2297) — the §4.5 pins — **CONFIRMED, and the reader's status set is fully covered**

Run: the family suite is **45/45** green (`reports/runs/test/agent-ae9fce89f800ac10c-408274-…`).

- `json:baseui-manifest` **EMPTY** is pinned for the four-consumer loop (`anatomyCompleteness`,
  `derivesNotRespells`, `derivesNotRespellsHealth`, `surfaceManifest`) plus `stateDataAttributes` in its own
  block — **five consumers**, as claimed.
- `installed-package:base-ui` **`metadata` unresolved** and **`ast` unresolved** each have their own pin,
  each reached by a different planted defect on a real tmpdir.
- The `missing`-not-per-mode limit is **asserted as its own test**, not left in prose. I re-derived its
  mechanism directly from the provider rather than trusting the test:
  `loadInstalledPackage` returns `{ status: "missing" }` from the `manifestPath(root, id, …)` catch
  **before** the `request.mode` branch (`ops/resource-installed.ts:150-157`), so `missing` is a property of
  the PACKAGE; and `evaluate` opens `ast` at `baseui-surface-manifest.ts:294` before `metadata` at `:295`,
  so the `ast` message is the one that surfaces. **The claim is true in the code, not only in the test.**
- **"Reach one status the pins do NOT cover":** **none exists in the reader's set.** The `json` provider
  emits `missing | empty | unresolved` only (`ops/resource-json.ts` header + its returns); `installed-package`
  emits `missing | unresolved` only (`ops/resource-installed.ts:34,156,160,163,166` — every non-`ready`
  return). `malformed` is emitted by `ops/resource-document.ts:126` and by nothing these two policies
  declare. All five non-ready statuses reachable through these two declarations are pinned.

**But the sixth consumer is not.** `tooling/src/verify/gates/css-selector-has-a-writer.ts:157` is a FINAL
`defineGate` policy declaring `json:baseui-manifest`, and **no test anywhere pins any of its three
reachable non-ready statuses** — `grep 'baseui-manifest'` over
`tests/tooling/verify/gates/css-hook-provenance-family.test.ts` returns **zero** (positive control: the same
grep over the six gate modules returns all six declarations). Driven, the refusal is reachable:

```
population: resource declaration json:baseui-manifest is empty: … withheld=["css-selector-has-a-writer"] owner=incomplete
```

Outside #2297's fence (its row named the baseui family), so it does not lower this claim's verdict — filed
as LR-1 below.

### Claim 9 (#2297) — the §4.6 replays, re-run — **PARTIAL. The derives number is overstated.**

Method: every LEGACY example from `1692583d6` materialised as REAL files on a fresh tmpdir per row (the
installed doors go through node's resolver and `readdirSync`, which no overlay reaches) and driven through
the FINAL policy via `runPolicyPass`. A legacy `mustFlag` reproduces when the final policy reports and the
legacy `messageIncludes` still matches (checking the per-finding message **and** the policy-level message —
the ordinary derives policy reports with no per-finding override, and a matcher reading only
`finding.message` under-reports by 3, which is how my own first pass produced a spurious 8/12).

| conversion | lane's claim | MY NUMBER | verdict |
| - | - | - | - |
| surface-manifest | 0/9 RAW, 7/9 ported | **0/9 RAW, 7/9 ported** | REPRODUCES exactly, same two deltas |
| anatomy | 6/7 | **6/7** | REPRODUCES, same delta |
| derives (both siblings) | **12/12** | **11/12 raw · 12/12 only after a SECOND port** | **DIFFERS — a finding** |

- **surface-manifest.** RAW 0/9: eight package-carrying rows die
  `[evaluate] … installed-package:base-ui:metadata … came back unresolved` (legacy `INSTALLED_ONE_PART`
  plants `{ "version": "9.9.9" }` with no `name`, verified textually at
  `1692583d6:baseui-surface-manifest.ts`), and `mustPass[2]` dies
  `[population] … json:baseui-manifest is missing`. Adding `"name"` → 7/9, with exactly the two deltas the
  commit classified: legacy `mustFlag[4]` (NO_PACKAGE) is now an `[evaluate]` tool error and legacy
  `mustPass[2]` (no ledger at all) is a `[population]` refusal. **The lane's LR-3 is correct and my run
  confirms it independently.**
- **anatomy 6/7**, delta `mustPass[3]` (no ledger) → `[population]` refusal. Confirms.
- **derives.** Arm ownership matches the commit exactly — legacy `mustFlag[0,1]` reproduce on `-health`,
  `[2,3,4]` on the ordinary sibling. But raw the score is **11/12**: legacy `mustPass[1]` supplies
  `// @orb-gate-ignore baseui-derives-not-respells(items): <reason>` and, under the final ordinary policy,
  **that marker suppresses nothing** — 1 effective finding where legacy passed. Replacing the opener with
  `@orb-waive` (`replaceAll` over the fixture text, nothing else changed) takes it to **12/12**.

```
CBVBF DERIVES raw=11/12
CBVBF DERIVES translated=12/12
CBVBF REPLAY derives RAW              mustPass[1] → NO  :: ordinary=1 finding(s) | health=silent
CBVBF REPLAY derives MARKER-TRANSLATED mustPass[1] → REPRODUCES :: ordinary=silent | health=silent
```

**Why this is a finding and not a nitpick.** `x-baseui-rework-2026-09-13.md` §6 states derives
*"REPRODUCES, and the arm ownership matches the commit exactly"* with no port named, while the SAME report's
LR-3 files the surface-manifest 7/9 as OPEN precisely because *"a replay that silently ports its fixtures
owes the port."* The derives 12/12 silently ports too — a different port (marker vocabulary rather than a
resource door), and one whose raw number, 11/12, is itself informative: it measures how much of the legacy
fixture corpus the marker translation invalidated. The conversion is not wrong; the evidence statement is.
LR-2 below.

### Claim 10 (#2297) — prose — **CONFIRMED, with the §3.4 residual restated and its cost newly measured**

**(a) The six phantom citations are gone and every replacement names something that exists.** A repo-wide
literal sweep for `baseui-family.test.ts` returns four gate-file hits, and **all four are dated CORRECTION
RECORDS**, not citations — each reads *"the path this line carried until 2026-09-13 — `baseui-family.test.ts`
— never existed"*. Every live citation now names
`tests/tooling/verify/gates/baseui-and-surface-family.repo.int.test.ts`, and every cited describe TITLE
exists verbatim:

| cited title | exists |
| - | - |
| `§4.5 — a broken ledger is a REFUSAL, never a finding and never a clean zero` | `:218` |
| `§4.5 — the baseui-read ledger consumers all refuse, and the phase depends on the KIND` | `:267` |
| `§4.5 — the installed-surface READER's own blindness, which no proof row can reach` | `:418` |

`baseui-portal-container-seam.ts:50` is the sharp one and is handled correctly: the paragraph is now
LABELLED as the §4.6 record (guide §4.6's second admissible arm) and states plainly that neither the file nor
the test title ever existed — **no test was minted after the fact**, which is the right call.

**(b) `pnpm check:structure --check finding-overload-provenance`: exit 1, ONE finding —**
`tooling/src/verify/gates/css-var-defined.ts:294:18 column-derived`. The two `baseui-derives-*` MALFORMED
rows are **gone**. Note against the lane report: it predicted 3 remaining (css-var + the
`seed-theme-ink-contrast` pair); the seed pair has since been removed by the later CSS integration, so the
true remaining count today is **1**, and the lane's own LR-1 (`seed-theme-ink-contrast:35,52`) is **closed by
someone else**, not still open.

**(c) The `-health` header vs #2309 — there is no execution-residual citation to be stale, and that is the
gap.** `baseui-derives-not-respells-health.ts:88` declares `execution: "selected-files"` with **no comment
at all**; the ordinary sibling at least carries a two-line per-file justification at `:107-108`. Neither
records the §3.4 deviation. v-conversions-11 row 11 is **UNCHANGED on this tree**, exactly as
`x-baseui-rework` §7 declares.

**(d) The §3.4 disagreement, stated precisely as an OPEN residual for root's prose reconciliation — and it
now has a cost I measured.** `resource-policy-contract.md` §1(4) and §3.4 require
`execution: "entire-population"` of every `analysis: "resource"` policy, reason
*"(a whole-tree/whole-manifest verdict cannot compose over a subset)"*, and add
*"where it disagrees with a module, the module is wrong"*. Census re-derived off the LOADED corpus (not a
grep), with a positive control:

```
final policies: 267 · analysis=resource: 43 · of those selected-files: 3
  → ["baseui-derives-not-respells-health", "baseui-derives-not-respells", "baseui-state-data-attributes"]
control (analysis="nonesuch"): 0
```

**THE NEW FACT, and it is the argument the residual was missing.** After #2309, `selected-files` is
load-bearing for these three in a way it was not before: `resolveEffectivePopulation`'s reselection rule
(rule 2) applies to a `selected-files` owner only — an `entire-population` owner takes the `deferred` branch
instead. Driven on the pure calculation with the same input:

```
selected-files    → run       effectiveSourcePaths = [a, b, c]   (the #2309 repair working)
entire-population → deferred  effectiveSourcePaths = []          (the repair's benefit gone)
```

So **arm B of the residual (flip both modules to `entire-population`) would VOID the #2309 repair for them**:
a changed-manifest run would defer instead of re-judging the seals — the false clean traded for a silent
skip. That is a receipt for the lane's recommended **arm A** (amend the contract clause), and it is not in
either report. **I do not judge the residual closed** — it remains root's prose reconciliation, and the
contract text still says the module is wrong. LR-3 below.

## 3. Broader program limits (claim 11 — NOT part of either row's verdict)

- **Other `selected-files` resource policies.** The census says three exist and all three are baseui-family.
  I verified the reselection behaviour on two of them (`baseui-derives-not-respells` and its `-health`
  sibling). **`baseui-state-data-attributes` was not driven under a changed request by me or by the shipped
  §2309 block** — it is in the same class and presumed covered by the shared calculation, but nothing pins it.
- **The other 40 `analysis: "resource"` policies** are `entire-population` and their deferral is untouched
  by construction; I confirmed that from the calculation and the three deferral pins, not by driving 40
  policies.
- **No whole-corpus verdict.** Every structure receipt here is a SELECTED `--check` run that publishes
  nothing (`reports/check-structure.json` was NOT republished). `pnpm check`, whole-tree `check:structure`
  and `check:policy-conformance` were fenced and not run; whole-tree checks are RED by construction mid-#1584
  anyway.
- **The four planter suites were not run** (`check-gates.repo.int`, `gate-ignore-grammar.repo.int`,
  `gate-conformance.repo.int`, `gate-spelling-twins.int`) — orchestrator-only, fenced. They remain owed at a
  quiet barrier.
- **No CT / rendered half.** Neither repair touches a rendered surface; `done ≠ rendered` does not bite here
  because the deliverable is a gate verdict, not a pixel.
- **The real-tree `--changed` drive over the whole 366-source + 1-resource Base UI population through the
  production dispatcher was NOT run** (parser-heavy slot; I did not request it, because the three-seal
  fixture already discriminates "full population" from "the intersection", which is the property in dispute).
  A real-tree drive would additionally prove the 366-file number; it would not change the verdict.
- **`--changed` cost across the corpus** is asserted by the #2309 lane and not measured by me.

## LEDGER ROWS (3 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `css-selector-has-a-writer` | v-baseui-final · `tooling/src/verify/gates/css-selector-has-a-writer.ts:157` · `tests/tooling/verify/gates/css-hook-provenance-family.test.ts` | §4.5 pin gap on the SIXTH `json:baseui-manifest` consumer. #2297 closed the gap for five (the four-consumer loop plus `baseui-state-data-attributes`), but this FINAL policy declares the same resource and **no test pins any of its three reachable non-ready statuses** (`missing`/`empty`/`unresolved`). `resource-policy-contract.md` §3.6 asks one pin per declared resource per reachable status. Outside #2297's fence — the row named the baseui family — but the identical class | §4.5 refusal coverage | **OPEN** | `/usr/bin/grep -rn 'json", id: "baseui-manifest"' tooling/src/verify/gates/` → **6** modules; `grep -n 'baseui-manifest' tests/tooling/verify/gates/css-hook-provenance-family.test.ts` → **0** (positive control: the same literal finds all six declarations). Driven through `runPolicyPass` with a zero-byte ledger: `[population] resource declaration json:baseui-manifest is empty: …`, owner `incomplete`, `withheldPolicyIds ["css-selector-has-a-writer"]` |
| `baseui-derives-not-respells` · `-health` | v-baseui-final · `docs/reviews/gate-runtime/x-baseui-rework-2026-09-13.md` §6 · `17297f298` commit message | The §4.6 derives replay is reported as **12/12** with no port named, while the SAME report's LR-3 files the surface-manifest 7/9 as OPEN because *"a replay that silently ports its fixtures owes the port."* Replayed as authored the derives answer is **11/12**: legacy `mustPass[1]` plants `// @orb-gate-ignore baseui-derives-not-respells(items): <reason>`, which the conversion's marker translation retired, so the final ordinary policy reports 1 finding where legacy passed. Translating the opener to `@orb-waive` — the ONE port, nothing else changed — yields 12/12. Neither number is wrong; the report never said which it measured, and the raw number is the one that prices how much of the legacy fixture corpus the marker translation invalidated | differential method / undeclared fixture port | **OPEN** (evidence statement only; no code change owed) | replayed both ways in this lane on real tmpdirs through `runPolicyPass`: `CBVBF DERIVES raw=11/12` · `CBVBF DERIVES translated=12/12`; the single differing row is `mustPass[1]` (`ordinary=1 finding(s)` / `health=silent` raw → `silent` / `silent` translated). Arm ownership reproduces exactly as the commit claims (legacy `mustFlag[0,1]`→`-health`, `[2,3,4]`→ordinary). surface-manifest `0/9`→`7/9` and anatomy `6/7` reproduce with the lane's numbers and deltas |
| `baseui-derives-not-respells` · `-health` · `baseui-state-data-attributes` | v-baseui-final · `baseui-derives-not-respells-health.ts:88` · `baseui-derives-not-respells.ts:109` · `docs/design/resource-policy-contract.md` §1(4), §3.4 | v-conversions-11 row 11 UNCHANGED — three `analysis: "resource"` policies declare `execution: "selected-files"` against a contract that requires `entire-population` and says *"where it disagrees with a module, the module is wrong"*, and no header records the deviation (the `-health` sibling's `:88` carries no comment at all). **NEW, and it decides the arm:** after #2309, `selected-files` is what makes the reselection rule apply — flipping to `entire-population` would DEFER these policies on the very request #2309 exists to fix, trading the false clean for a silent skip. So arm B is not a field flip and not merely a restructure; it VOIDS the repair. Arm A (amend the contract clause, record the deviation in all three headers) is the arm with a receipt | contract conformance / undocumented deviation | **OPEN** (root's prose reconciliation; NOT judged closed) | census re-derived off the loaded corpus with a positive control: `267 final · 43 analysis=resource · 3 selected-files` = the three named, control `analysis="nonesuch"` → 0. Driven on `resolveEffectivePopulation` with an identical input: `selected-files → run, effectiveSourcePaths [a,b,c]` vs `entire-population → deferred, []` |

ledger rows OWED: 3

## WHAT I DID NOT COVER

- **No whole-corpus `check:structure`, no `pnpm check`, no `check:policy-conformance`, no CT, no browser,
  no `__g_` planters** — all fenced by the brief. Every structure receipt above is a SELECTED `--check` run
  that explicitly did not republish `reports/check-structure.json`.
- **No real-tree `--changed` drive over the 366-source Base UI population** (parser-heavy slot; not
  requested — see §3 for why the fixture discriminates the property in dispute).
- **`baseui-state-data-attributes` was not driven under a changed request.** It is the third
  `selected-files` resource policy and nothing pins its reselection behaviour.
- **The §4.6 replay for `baseui-portal-container-seam`** (the both-sides-zero record at `:50`) was not
  re-run; I verified only that the paragraph is honestly labelled as the record and cites nothing phantom.
- **The other 37 non-baseui `analysis: "resource"` policies** were counted, not driven.
- **`pnpm check:docs` was not run** on this report beyond the catalog formatter.
- **I did not re-verify the #2309 lane's `--changed` cost claim** ("unchanged for the corpus").

## PROPOSED LESSONS (report text — the orchestrator owns the memory write)

**A one-file fixture population cannot distinguish "the full population" from "the intersection".**

Index entry: `[one-file population hides a selection bug](single-file-population-cannot-prove-reselection.md) — a scoped-selection pin whose fixture has ONE subject asserts the same array under both the correct and the broken calculation; use three`

Body: the #2309 production control asserts `effectiveSourcePaths: [the seal]` after a request naming only
the ledger. With one seal in the population that array is simultaneously the complete declaration and the
(empty-then-repopulated) intersection, so the assertion is one substitution away from proving nothing — it
only discriminates today because the PRE-fix answer was `[]`. Re-driven on three seals the assertion becomes
`[a, b, c]`, which no narrowing rule can produce. **How to apply:** any pin about a SELECTION rule needs a
population of at least three, with the requested subset a proper non-empty subset of it, so "all", "the
intersection" and "empty" are three different arrays.

**An agreement pin between two doors only covers the axes its fixture actually declares.**

Index entry: `[agreement pin covers only declared axes](plan-execute-agreement-pin-needs-the-fact-axis.md) — a four-shape planner/dispatcher test.each over a fixture with no facts cannot see a fact-denominator divergence`

Body: #2309's headline agreement pin is a `test.each` over four request shapes that plans AND executes, and
`applyOwnerPlan` throws on disagreement — so it reads as complete. Its fixture (`hybridPolicy`) declares no
facts, so `dependencyPaths` is empty and the exact divergence the repair was written to close (fact paths in
the planner's completeness denominator, planned `deferred` vs executed `success`) is invisible to it. Cutting
that divergence back in reds `policy-plan.test.ts`'s fact fixture and leaves the four-shape pin fully green.
**How to apply:** when a pin claims two implementations agree, enumerate the INPUT AXES of the shared
calculation and check the fixture exercises each; an axis the fixture leaves empty is an axis the pin does
not cover, however many request shapes it iterates.

**A conversion's fixture port is not one kind of thing — a marker-vocabulary retirement ports fixtures too.**

Index entry: `[marker translation is a second silent replay port](marker-translation-is-a-replay-fixture-port.md) — LR-3's "declare your substrate port" rule also covers a retired marker opener, and that port is invisible because the fixture still parses`

Body: `x-baseui-rework` correctly filed its own surface-manifest replay as owing a declared port (a new
`installed-package:metadata` door refuses a manifest missing `name`). The same report's derives replay
reports 12/12 and silently ports a DIFFERENT thing: legacy `mustPass[1]` carries an
`@orb-gate-ignore <id>(pos): reason` marker the conversion retired for `@orb-waive`, so replayed as authored
the row reports a finding and the raw score is 11/12. A resource-door port announces itself as a tool error;
a retired marker just stops suppressing, which reads as a catch-parity result rather than a substrate
difference. **How to apply:** before reporting a §4.6 number, list EVERY vocabulary the conversion retired —
resource doors, marker openers, message text, anchor positions — and replay once per port, reporting the raw
number beside the ported one. The raw number prices how much of the legacy corpus the conversion
invalidated, which is itself a conversion delta.

**An execution-mode "deviation from the contract" can become load-bearing after an unrelated repair.**

Index entry: `[execution mode became load-bearing](selected-files-became-load-bearing-after-2309.md) — flipping the three baseui resource policies to entire-population to satisfy resource-policy-contract §3.4 would now VOID #2309's reselection repair`

Body: v-conversions-11 filed `analysis: "resource"` + `execution: "selected-files"` as an undocumented
contract deviation, and the fix lane priced arm B ("change both modules to `entire-population`") as a
restructure. After #2309 it is worse than a restructure: `resolveEffectivePopulation` applies the
changed-input reselection rule to `selected-files` owners and takes `entire-population` owners down the
`deferred` branch instead, so the flip would make a changed-manifest run SKIP the seals rather than
re-judge them — the exact false clean #2309 closed, re-opened as a silent defer. **How to apply:** when a
recorded residual has priced arms, re-price them after any merge that touches the mechanism the arms select
between; "the ruling survives, its INPUT changed" applies to open residuals too, not only to closed ones.

## Issue summaries (paste-ready)

**For #2297 (PARTIAL).** Independently verified at `99acf985d` by `cb-v-baseui-final`. **CONFIRMED:** the
three surface-manifest drift arms are each killed by exactly their own cut (vanished-part → `mustFlag[3]`
`count=2 but got 1`; vanished-component → `mustFlag[4]`; version → `mustFlag[5]`), `identity()`'s `state`
term is untouched and its state-only row is the only row the `state` cut kills, and `count: 99` planted on
each of the 11 `mustFlag` rows kills all 11. Anatomy's blindness guard IS the derivation's own admission
predicate: the raw-`getText()` revert reds both the mid-file-comment row and the `import type` twin, the
bare-`length > 0` revert reds the type-only row alone, failing the guard SHUT reds 9 rows including the
positive value-import twin, and the two carves red under their own cuts (`mustPass[5]`, `mustPass[6]`);
`mustPass[2]`'s corrected `why` is true — it survives the carve cut, which is the receipt. The §4.5 pins
cover every status the two readers can emit (`json`: missing/empty/unresolved; `installed-package`:
missing/unresolved), and the `missing`-not-per-mode limit is true in the provider code, not just in its test.
All six phantom `baseui-family.test.ts` citations are gone; every replacement names a describe title that
exists verbatim; `finding-overload-provenance` is down to ONE pre-existing finding
(`css-var-defined.ts:294:18`) and the `seed-theme-ink-contrast` pair the lane left open has since been closed
elsewhere. Family suite 45/45; the six baseui policies `--check` clean (`raw 7 = waived 7 + effective 0`, 0
alarms, 0 tool errors, 0 withheld). **PARTIAL because of one evidence claim:** the §4.6 derives replay is
reported as 12/12 with no port named, but replayed as authored it is **11/12** — legacy `mustPass[1]`'s
`@orb-gate-ignore` marker was retired by the conversion, so the final ordinary policy reports where legacy
passed; translating the opener to `@orb-waive` gives 12/12. That is the same "a replay that silently ports
its fixtures owes the port" class the lane itself filed as LR-3 for surface-manifest (whose 0/9 → 7/9 and
anatomy's 6/7 both reproduce exactly, with the same deltas). Also open and unchanged: the §3.4
`execution: "selected-files"` residual, now with a measured cost — flipping to `entire-population` would
VOID the #2309 repair for these policies (`deferred`, zero selected sources), which is a receipt for arm A.
Three ledger rows in `docs/reviews/gate-runtime/v-baseui-final-2026-09-13.md`.

**For #2309 (CONFIRMED).** Independently verified at `99acf985d` by `cb-v-baseui-final`, red-first, on a
THREE-seal population (the shipped §2309 arm uses one seal, where "the full population" and "the
intersection" are the same array). Through the production dispatcher: a request naming ONLY the ledger
selects all three seals and reports three findings with zero tool errors and zero withheld, while the same
request against the ledger the seals are legal under selects the same three and reports zero — the arm
discriminates and is not an empty walk. A request naming ONLY one seal selects exactly that seal, keeps the
complete resource declaration, files one `unresolved: 0` receipt and reports one finding. Against
`57f7affdc~1` both fail exactly as filed: `effectiveSourcePaths: []` with `owner: success`, and
`[create] resource request json:baseui-manifest is undeclared` on both siblings. Planner/dispatcher
agreement breaks correctly: reintroducing the fact-denominator divergence in a `cp`-backed
`lib/policy-plan.ts` gives `planned deferred` → `executed { ok: false, exitCode: 2, "policy execution
population disagrees with its plan: fact-policy" }`, and restoring the file returns both to `run` / exit 0.
A resource identity never reaches `run.files` (structural and driven both ways); deferral and shared-fact
rules are unchanged (18/18 + 56/56 + 37/37 green, including the deliberate self-overlapping-resource
counterexample arm). The deleted `requestStaysDeclared` narrowed nothing: `lib/resource-policy.ts` is
byte-untouched by the commit, and a planted out-of-declaration read is still refused in whole, source-only
and resource-only scopes, with an honest-read positive control passing in all three in the same invocation.
The contract-home move left no `lib`-exported contract type — bounded `no-inline-types` over its full 3339-source
population is `raw 6 = waived 5 + effective 1`, the sole finding being the known product `BugReportSubmission`.
One coverage note, not a defect: the four-shape agreement `test.each` cannot catch the fact-dependency
divergence (its fixture declares no facts); the pin that does is `policy-plan.test.ts`'s fact fixture, and
the agreement claim is complete only across both files.

## Current-main integration disposition (2026-09-13)

This complete report preserves the independent verdict at `99acf985d`. Root read it in full. #2309 was
closed by Claude B on these independent receipts; the integrated production and 220-test receipts remain
in `x-resource-selection-2026-09-13.md`. The derives replay claim is corrected in
`x-baseui-rework-2026-09-13.md` at every unqualified summary: 11/12 raw, 12/12 only after translating the
retired marker opener in legacy `mustPass[1]`. The report's first ledger row is tracked by #2318.

The third row's contract premise is historical: later main commit `c8fccfa7c` revised
`resource-policy-contract.md` §3.4 to permit composable selected-source verdicts with complete resource
reads. Root is preserving that runtime behavior and reconciling the module explanations; it is not
flipping these owners to whole-population execution. The known product type-placement finding and
whole-program verification remain outstanding.
