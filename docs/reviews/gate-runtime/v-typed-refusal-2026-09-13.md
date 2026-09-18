---
kind: review
status: active
updated: 2026-09-13
---

# `v-typed-refusal` — independent verification of #2320 (ARM D) and #2327/#2330 (refusal debt)

Lane `cb-v-typed-refusal`, read-only verifier for claude-b. Neither stack's worktree was written to. Every
number below was produced in THIS lane's worktree
(`/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-a299e46ff676e838d`, base
`b1a23e534`) by applying the stack's files with `git show <sha>:<path> > <path>`, running the check, and
restoring with `git show HEAD:<path> > <path>`. `git status --short` was EMPTY before this report was
written. Neither lane's report was taken as evidence for anything.

| | |
| - | - |
| stack A | `f95d26233` (`a9536a2cb` → `ebdab0a62` → `f95d26233`), base `d7ceedfb1` — identical to my HEAD for the two touched source paths (`git diff --stat d7ceedfb1 HEAD -- <paths>` empty) |
| stack B | `630793eb7` (seven commits), base `db6e5bbd6` — my HEAD differs from that base only in two unrelated suites (`eslint-grant-liveness.int.test.ts`, `mirror-index-family.suite.test.ts`), neither naming a module in the debt set |

## Module verdicts

- **A · `policy-legacy-imports` ARM D — PARTIAL.** The code is a strict improvement and every pinned form
  works; **the CLOSURE CLAIM is refuted with a matched control pair.** Land the code; do NOT land the
  sentence. Specifically: #2320 must not close as "the relocation escape is closed", the module header's
  *"ARM D closes the RELOCATION escape completely and permanently"*, report §1/§4's closure sentence and the
  §7 proposed `Core-Enforcement-Active-Gates.md` text all overstate coverage, and the existing ledger row
  `cb-adj-authority L1` (refutation ledger line 1014) is **narrowed, not closable**.
- **B · `policy-refusal-coverage` #2327/#2330 — CONFIRMED.** Every claim reproduced, including the 17-name
  arithmetic re-derived from both ends. One INTEGRATION HAZARD for root that belongs to neither lane (L4).

## Per-claim verdicts

### A1 — ARM D reports a value received by ORIGIN, alias-in, same-name-out · **PARTIAL**

Confirmed halves: an import ALIAS of the canonical type inside the target still flags (probe P8: target
`import type { ExemptionTable as Table }` + `export const SANCTIONED_HOMES: Table` → **1 finding**,
identical message to the un-aliased control P3), and a same-spelled foreign `ExemptionTable` acquits (the
module's `mustPass` "IDENTITY, NOT SPELLING" row, run green through `verifyPolicyProofs` in the family
suite, 15/15).

**Refuted half — a LOCAL TYPE ALIAS in the `lib/` target defeats the arm.** `canonicalExemptionName`
prefilters on the NAME via `lib/origin-verdict.ts#referenceNamesExport`, which follows an import specifier
and one const-alias hop (`origin-verdict.ts:98-116`) and **not** a `TypeAliasDeclaration`. The identity
resolver is therefore never reached and the door is acquitted on a spelling — the exact failure the module's
own `other-vocabulary` `mustPass` row says the arm is not ("a string match wearing a resolver's clothes"),
inverted.

Driven through `runPolicyPass` on a virtual project, same receiving gate module and same door in all four
(scratch harness in this worktree, deleted after the run):

| # | `tooling/src/verify/lib/relocated.ts` declares | findings |
| - | - | -: |
| P3 (control) | `export const SANCTIONED_HOMES: ExemptionTable = {…}` | **1** |
| P1 | `type Homes = ExemptionTable;` `export const SANCTIONED_HOMES: Homes = {…}` | **0** |
| P15 (control) | `export const SANCTIONED_HOMES: Readonly<Record<string, ExemptionRow & { plane: string }>> = {…}` | **1** |
| P14 | `type FreshnessRow = ExemptionRow & { plane: string };` `export const SANCTIONED_HOMES: Readonly<Record<string, FreshnessRow>> = {…}` | **0** |

**P14 is not hypothetical — it is a LIVE corpus shape.** `tooling/src/verify/gates/domain-freshness-plane.ts:95`
declares `type FreshnessRow = ExemptionRow & { readonly plane: …; readonly roomReach: … }` over the table
`DOMAIN_FRESHNESS`, and that module is one of the five ARM A findings today, i.e. one whose repair is
exactly the "one hop into `lib/`" move ARM D exists to stop. `gates/db-structure.ts:32` carries the same
idiom (`type ProducerRow = ExemptionRow & {…}`). The value's type identity in both is the canonical
`ExemptionTable`/`ExemptionRow`, so this is NOT the declared RETYPE limit (which is a module declaring its
OWN row interface, `lib/injected-op-caller-param.ts#CallerFreeOpRow`); it is a one-line alias over the
canonical type.

The family test's second opinion cannot catch it either: `EXEMPTION_CONST_RE` demands the literal
`export const <NAME>: Exemption(Table|Row)`, so BOTH sides of the two-sided check are blind to the same
spelling — a relocation of this shape lands unaccused and green. The fix is shared-reader BUILD work (a
type-alias hop in `referenceNamesExport`, or an equivalent), not a gate-local patch; per §3's
shared-reader-gap ruling that is build work, never a recorded refusal.

### A2 — the direct typed default, one canonical resolver · **CONFIRMED**

Source read of the landed module: exactly one `assertedTypeNode` (`policy-legacy-imports.ts:452-461`),
called from BOTH `exemptionTypeOf`'s `ExportAssignment` branch and its `VariableDeclaration` branch, both
feeding `canonicalExemptionInAnnotation` → `canonicalExemptionName`. No second resolver and no
initializer-shape heuristic exist in the file. Parentheses transparent and deeper assertions read: probe
P11 (`{…} as unknown as ExemptionTable`) → 1, P12 (`{…} as const satisfies ExemptionTable`) → 1. The two
committed rows for `satisfies`/`as` pass, and CUT 2 (below) proves they are the rows that die without the
assertion read. Codex's refutation of `a9536a2cb` is repaired at `ebdab0a62`.

### A3 — the other positives and the controls · **CONFIRMED**

`pnpm test:scoped tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts` with stack A applied:
**exit 0, 15 passed / 15**, including `verifyPolicyProofs(FAMILY)` (which runs every `mustFlag`/`mustPass`/
`mustRefuse` row of this module through the production dispatcher: alias, namespace, identifier-behind-
default, two-hop shim, `ExemptionRow`; and the `StageTrigger`, reader-parameter, retype, foreign-same-name
and migrated-exemplar negatives) and the real-corpus arm (no tool errors, nothing withheld, closed classes
at zero). Log:
`/tmp/claude-1000/-home-inktomi-inktomi-stack-development-orbweaver/b854b7b8-801a-4bcf-a9d5-219b85ce2f5e/scratchpad/cbvtr-famA.log`.

### A4 — an unreadable binding REFUSES · **CONFIRMED**

The `mustRefuse` row is real and enforced (it dies under CUT 1, below). Independently observed live: a
joint-cut run over an ordinary `as const` target produced
`toolErrors: ["BINDING UNREADABLE (#2320, #944 fail-closed): …"]` with **0 findings**, i.e. a refusal, not a
silent zero.

### A5 — the discriminating cuts · **PARTIAL** (CUT 2 exact; CUT 1's published count is stale)

Method: the module is copied to a SIBLING scratch module in `tooling/src/verify/gates/` (so relative
imports resolve), the anchor is asserted to occur EXACTLY ONCE before patching, the scratch module is
imported and driven through `verifyPolicyProofs([gate])`, and `rmSync` runs in a `finally`. The real module
was never modified. Baseline: the unmodified module has **0 failing rows**.

| cut | rows that died |
| - | -: |
| ARM D dispatch (`exemptionValueDoor` always acquits) | **10** — `mustFlag[21…29]` (all nine ARM D rows) **+ `mustRefuse[1]`**, nothing else |
| the `ExportAssignment` assertion read | **2** — `mustFlag[24]` and `mustFlag[25]` only, exactly as claimed |
| the `as const` guard in `assertedTypeNode` | **0** |

The stack's report §3 says the ARM D dispatch cut kills *"exactly 8 failing rows — the 7 ARM D `mustFlag`
rows and the ARM D `mustRefuse` row"*. That number is **dated to `a9536a2cb`** and was not re-measured after
`ebdab0a62` added the two direct-default rows; the current module has NINE ARM D `mustFlag` rows and the cut
kills 10. The property claimed (only ARM D rows die, no `mustPass` dies) HOLDS; the count in the receipt does
not describe the committed module.

The third cut is classified rather than left clean (§4.1 procedure): with the guard removed the run is still
silent, because `canonicalExemptionName`'s NAME PREFILTER independently rejects the `const` type reference.
Cutting **both** makes the run REFUSE on an ordinary `as const` literal (`BINDING UNREADABLE`, 0 findings).
So the guard is **MUTUALLY REDUNDANT with the prefilter**, not unenforced — but the header presents it as
independently load-bearing (*"it is why this guard exists rather than a comment saying it cannot happen"*),
which the joint cut shows is not the case as landed.

### A6 — the real-tree named set · **CONFIRMED**

`pnpm check:structure --check policy-legacy-imports` in this worktree with stack A's two files applied:
exit 1, `raw 11 = waived 0 + granted 0 + effective 11 (11 error, 0 warning) · 0 alarm(s) · 0 tool error(s) ·
0 withheld`, population 309 source, slot
`agent-a299e46ff676e838d-1649042-2026-09-13T10-29-33-901Z`. The eleven are exactly the report's §2 list — five
ARM A (`depcruise-grant-liveness`, `domain-freshness-plane`, `eslint-grant-liveness`, `lifecycle-portability`,
`runner-config-path-liveness`) and six ARM D (`contract-derives-not-respells`,
`contract-derives-not-respells-health`, `no-raw-spacing-in-features`, `spacing-tier-home-health`,
`no-raw-typography-in-features`, `typography-tier-home-health`), no module in both arms. One position differs
from the report's BEFORE table by two lines (`eslint-grant-liveness:15:37` here vs `:10:37` there) — an
unrelated intervening edit on my base, not a discrepancy in the arm.

### B1 — every pin drives the ACCUSED policy and asserts the DISPATCHED refusal · **CONFIRMED**

Read in full, one group at a time; all five groups meet the bar — each pin builds a fixture, calls
`runPolicyPass` with the accused policy as BOTH `knownPolicies` and `policies`, and asserts the dispatched
state (phase-tagged `toolErrors` / `refusalShape` / `withheldPolicyIds` / empty `effectiveFindings`), never a
name or a coincident assertion. Every group also carries a healthy twin asserting the RECEIPT and a
"control for the control" that makes the twin's silence a READ:

| group | sample checked | dispatched state asserted | twin + read-control |
| - | - | - | - |
| package-metadata | `verify-registry-parity` ×4 statuses | `populationRefusal(… is missing/empty/unresolved …)`, `refusalShape` whole | `package:root` receipt `resources: 1, unresolved: 0`; an unregistered verification-shaped script accuses |
| authored-tree (decl. 1) | `feature-owns-definition` ×3 | same, on a REAL `mkdtemp` scratch root (the overlay cannot express an empty directory) | 4-member receipt; an unowned feature dir accuses |
| authored-tree (decl. 2) | `feature-structure` / `client-structure` ×2 declarations | per-declaration, each holding the other tree healthy | per-tree receipts |
| registry facts | `home-tile-registry-completeness`, `modal-body-not-placeholder` | `toolErrors [{phase: "receipt", message: /resolved zero members/}]` + `withheldPolicyIds` | `members: 1` census receipt; a mis-homed tile / placeholder body accuses |
| `drizzleSchemaFact` ×10 | the whole loop | `phase: "evaluate"` with the exact `empty` message and a `/^drizzle schema fact unresolved: /` match, `owner.status === "incomplete"` | `owner.status === "success"` + `drizzle-schema` receipt `members: 2` |
| the withhold arm | `domain-freshness-plane`, `nullable-column-inequality`, `own-tables-only` | fact-phase withhold before `evaluate` | — |

The `missing` status is declared unconstructible with its reason (the provider's own population resolution
refuses one phase earlier), which is the honest §4.1 fourth outcome rather than a fixture proving itself.

Executed: `pnpm test:scoped` over all five stack-B suites — `resource-layout-wave-1` 16, `-wave-2` 14,
`-wave-3` 7, `schema-fact-wave-1` 38, `registry-family` 30 — **all green**.

### B2 — the #2330 recognizer fix · **CONFIRMED**

`bindsShorthandValue` is gate-local (`policy-refusal-coverage.ts`), is OR-ed into `hopParameter`'s existing
guard, and feeds the unchanged `declaringFunction(node, name)` hop, which still demands an ancestor
function-like declaring a parameter of exactly that name — so the widening is fail-closed. The shared
`lib/policy-descriptor-read.ts#bindsParameter` is untouched: the stack's diffstat shows `policy-refusal-coverage.ts`
as the only `tooling/` file in the seven commits. The object-pattern shape is landed as a `mustFlag` that
ACCUSES (a fail-closed declared limit that goes red the day the walk learns object patterns), which is the
correct direction.

**My own discriminating cut** (`cp`-backed, anchor asserted unique, restored, diff vs `630793eb7` empty
afterwards): disabling `bindsShorthandValue` while keeping all #2327 pins moves the real tree from **0 to
exactly 1** finding — `tooling/src/verify/gates/freeze-provenance-write-pairing-health.ts:78:3`, the named
false accusation, and nothing else. That is the claim's receipt reproduced from the other side of the
11 → 10 probe.

Residual, NOT probed and NOT charged to this stack: `declaringFunction` resolves by NAME up the ancestor
chain, so a shorthand `policies` whose own binding is unresolvable (e.g. a `let`) inside a function nested
in one whose parameter is also named `policies` would credit the outer function's call sites. `collectDriven`
resolves an identifier through `stableTerminal` first, so no live instance is expected; I did not search for
one.

### B3 — 17 → 0 by NAME · **CONFIRMED, re-derived from both ends**

- With stack B's gate applied but the five pin files reverted to my HEAD:
  `raw 16 = … effective 16 (0 error, 16 warning) · 0 tool error(s) · 0 withheld` — and the sixteen named
  modules are exactly the report's §1 list of seventeen MINUS `freeze-provenance-write-pairing-health`,
  which is the one the recognizer repair retires. That independently confirms both the base set and the
  "sixteen were genuine, one was false" split.
- With the whole stack applied: `✓ policy-refusal-coverage · final ordinary/warning · population 401 source ·
  final policy modules: **267 member(s)** · raw 0 = waived 0 + granted 0 + effective 0 · 0 alarm(s) ·
  0 tool error(s) · 0 withheld`, exit 0.
- The per-group after-counts (16 → 13 → 11 → 1 → 0) are consistent with the group membership I verified in
  B1; I did not re-run each intermediate commit.

Note on a number that moves: the population reads 404 in my first run and 401 in the later ones. The
difference is MY OWN three scratch probe files, which live under `tests/tooling/verify/gates/` and therefore
join this policy's population. They also caused the only red I saw all session —
`policy-fixture-substrate` correctly accused `cbvtr-cut.repo.int.test.ts` in the family suite's real-corpus
arm. Deleted; the clean re-run is 15/15. **Lesson for any future probe lane: a scratch test file in
`tests/tooling/verify/gates/` is inside the gate corpus's own population and will be judged.**

### B4 — warning/workItem coupling · **CONFIRMED**

At `630793eb7` the descriptor is `authority: "ordinary"` · `severity: "warning"` · `workItem: 2184`
(`policy-refusal-coverage.ts:474-476`); the severity flip is not taken, and the header says so and says why.
Reproduced the load refusal in MY copy (`cp` backup, key deleted with python, `mv` restore, diff vs
`630793eb7` empty afterwards): `pnpm check:structure --check policy-refusal-coverage` exits **2** with
`TOOL ERROR (thrown): Error: gate module tooling/src/verify/gates/policy-refusal-coverage.ts: Invalid gate
policy: descriptor.workItem must be an own enumerable property when severity is warning`. The message's home
is `lib/policy-validation.ts:427`, thrown through `lib/policy-module.ts:50` — the header's citation of
`policy-module.ts:51` names the catch line rather than the call, which is accurate enough to follow.

**The barrier overlap, by line** (flagged, not fixed):

| | `c40752560` (`wt/agent-a413f153774cb57e9`) | `630793eb7` (stack B) |
| - | - | - |
| header | hunk `@@ -24,7 +24,13 @@` — replaces the single line 27 (`// THE FLIP CONDITION IS AN EVENT, NOT AN ASPIRATION: flip to …`) with a 5-line `THE OWNER IS #2327 SINCE 2026-09-13` paragraph, a blank comment line, and a 2-line rewritten opener of the same paragraph | hunk `@@ -30,6 +30,32 @@` — inserts a 26-line block AFTER old line 32, i.e. after the `…17 is the real remaining debt.` paragraph |
| descriptor | `workItem: 2184` → `2327` at old line 423 | untouched |

The two changed regions are ~5 old lines apart with overlapping context windows, so expect either a clean
3-way merge or one adjacent-hunk conflict. **Union resolution:** keep the barrier's owner paragraph AND its
rewritten flip-condition opener, then stack B's 26-line block, and take `workItem: 2327`. Stack B's paragraph
was written for this: it owns the STATE (*"warning and its workItem move together"*) and explicitly defers the
id to "one paragraph up", which after the barrier says #2327. No semantic conflict; a line-level one only.

## LEDGER ROWS (4 rows)

FOUR new rows (V1–V4), in the grammar of
`docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md`. A fifth, separate obligation — an edit to an
EXISTING row rather than a new one — is stated immediately below and is counted on its own line at the end
of the section, never inside the four.

**OWED EDIT TO AN EXISTING ROW — ledger line 1014 (`policy-legacy-imports` · cb-adj-authority L1).** ARM D
(`f95d26233`) NARROWS this row and does not close it: the plain relocation it describes now reds (11 findings,
six of them ARM D), but the same move with a one-line local type alias over the canonical type is still
invisible (row V1 below). The row **stays `OPEN`** — its EVIDENCE is what changes: record that `f95d26233`
narrowed it to the alias residue and name V1 as that residue. It must not be closed on this stack.

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `policy-legacy-imports` | cb-v-typed-refusal V1 · `tooling/src/verify/gates/policy-legacy-imports.ts:395-410` (`canonicalExemptionName`) → `tooling/src/verify/lib/origin-verdict.ts:98-116` (`namesExport`) | **ARM D acquits a canonical `ExemptionTable`/`ExemptionRow` value whose annotation names a LOCAL TYPE ALIAS of that type, so the relocation escape the arm exists to close survives a one-line edit in the `lib/` target.** The identity resolver is never reached: the NAME prefilter follows an import specifier and one const-alias hop and NOT a `TypeAliasDeclaration`, so the door is acquitted on a spelling. This is NOT the declared RETYPE limit — the value's type identity IS the canonical type. The shape is LIVE: `gates/domain-freshness-plane.ts:95` (`type FreshnessRow = ExemptionRow & {…}` over `DOMAIN_FRESHNESS`, a module currently ARM-A red, i.e. one whose repair is exactly this move) and `gates/db-structure.ts:32`. The family test's `EXEMPTION_CONST_RE` second opinion is blind to the same spelling, so BOTH sides of the two-sided check miss it. FIX is shared-reader BUILD work (a type-alias hop in `referenceNamesExport`, or an identity read that does not depend on the prefilter's spelling), never a gate-local patch | coverage gap (false clean under a one-line alias) | **OPEN** | Driven through `runPolicyPass` on a virtual project in `agent-a299e46ff676e838d` with stack A applied, matched control pairs in one invocation: `export const SANCTIONED_HOMES: ExemptionTable` → **1 finding**; `type Homes = ExemptionTable; export const SANCTIONED_HOMES: Homes` → **0**; `Readonly<Record<string, ExemptionRow & {plane}>>` inline → **1**; the same via `type FreshnessRow = ExemptionRow & {plane}` → **0**. Import-alias control (`ExemptionTable as Table`) → 1, so the prefilter's OTHER hop is live and the zero is a measurement |
| `x-typed-import-arm-2026-09-13.md` · `policy-legacy-imports` | cb-v-typed-refusal V2 · `docs/reviews/gate-runtime/x-typed-import-arm-2026-09-13.md` §3 (the cut receipt) | **The published discriminating-cut receipt describes a module that no longer exists.** §3 states the ARM D dispatch cut kills *"exactly 8 failing rows — the 7 ARM D `mustFlag` rows and the ARM D `mustRefuse` row"*; that count is dated to `a9536a2cb` and was not re-measured after `ebdab0a62` added the two direct-default rows. The committed module has NINE ARM D `mustFlag` rows. The claimed PROPERTY (only ARM D rows die; no `mustPass` dies) holds — only the count is stale, which is the class §4.1 warns about when a receipt is quoted rather than re-run after the code changes under it | receipt staleness (a count not re-derived after the repair) | **OPEN** (repair is a one-line edit to §3) | Re-run in `agent-a299e46ff676e838d` on `f95d26233`, scratch sibling module, anchor asserted to occur exactly once, `rmSync` in `finally`: baseline 0 failing rows; ARM D dispatch cut → **10** (`mustFlag[21…29]` + `mustRefuse[1]`); assertion-read cut → exactly `mustFlag[24]`, `mustFlag[25]` |
| `policy-legacy-imports` | cb-v-typed-refusal V3 · `tooling/src/verify/gates/policy-legacy-imports.ts:452-461` (`assertedTypeNode`, the `CONST_ASSERTION` guard and its header) | **The `as const` guard is MUTUALLY REDUNDANT with the name prefilter, while its header presents it as independently load-bearing** (*"an arm that resolves it refuses the whole run on the corpus's commonest literal shape … it is why this guard exists rather than a comment saying it cannot happen"*). As landed, removing the guard changes nothing, because `canonicalExemptionName`'s prefilter rejects the `const` type reference before any resolution. §4.1's classification applies: two fences guard one subject, so neither is individually cuttable, and the honest output is to say so rather than to leave a clean cut looking like an unenforced fence. Not a false clean and not a behaviour defect — a header accuracy row, kept because the next reader will otherwise re-measure it | header accuracy / §4.1 classification (mutually redundant, documented as sole) | **OPEN** (low) | Same harness: guard cut alone → 0 rows died AND the real-shaped `as const` fixture stays silent (0 findings, 0 tool errors); prefilter cut alone → also silent; BOTH cut → the run REFUSES (`BINDING UNREADABLE …`, 0 findings). The joint cut is what makes the subject reachable |
| `policy-refusal-coverage` · integration | cb-v-typed-refusal V4 · `tooling/src/verify/gates/policy-refusal-coverage.ts:476` (`workItem`) × `c40752560` × `630793eb7` | **After both branches land, `workItem: 2327` names a row whose entire work is complete, and closing #2327 without flipping severity or repointing re-creates the #2070 rot for the THIRD time on this same pointer** (#626 → #2024 → #2184 → #2327, each closed on a receipt while the debt was live). `lib/workitem-liveness.ts` (#2070's judge, present only on the barrier branch) asks the board whether the number is OPEN, so the sequence "land B, close #2327" turns that judge red on this module. Neither lane can fix it: B correctly left the pointer alone and the barrier correctly could not know B would zero the count. It is an ORDERING decision for the integrator. **PREVENTION CONDITION: flip `hard`/`error` and drop `workItem` in the same commit that closes #2327, or give the pointer a LIVE SUCCESSOR `workItem` in that same breath — never close #2327 while a `warning` descriptor still points at it.** Nothing is broken on either branch today; this row exists so the sequence does not create the defect | integration hazard (prospective) — no current code defect; the rot is created only by a specific landing order | **OPEN** | Measured in `agent-a299e46ff676e838d`: stack B at `630793eb7` gives `effective 0` over 267 members; `c40752560` sets `workItem: 2327`; `git ls-tree c40752560 -- tooling/src/verify/lib` carries `workitem-liveness.ts`, which does not exist on `b1a23e534` |

**ledger rows OWED: 4 new** (V1 · V2 · V3 · V4 — the four table rows above, all `OPEN`)

**existing-row edit OWED: 1** — ledger line 1014 (`policy-legacy-imports` · cb-adj-authority L1): state
stays `OPEN`, evidence narrowed by `f95d26233` to the alias residue, V1 named as that residue. Not one of
the four above and not a new row.

## Owed combined checks (NOT run here, by the lane's load fence)

- whole `pnpm check:policy-conformance` — **owed** for both stacks, on the merged tree.
- whole `pnpm check:structure` (unscoped) and `pnpm check` — **owed** at the barrier. Both are RED by
  construction mid-migration (#1584 standing exception); the value is the delta, not the verdict.
- `pnpm typecheck`, `pnpm exec biome check`, `pnpm exec eslint` on the merged set — **owed**; I ran none of
  them. Each lane reports exit 0 on its own files; I did not reproduce those.
- `pnpm gate:contract` before/after — **owed**.
- The five stack-B suites and the `policy-soundness` family suite must be re-run ON THE MERGED tree: I ran
  each stack's suites against the OTHER stack absent, so no cross-stack interaction was measured.

## What I did NOT cover

- **No cross-stack tree.** A and B were applied and measured separately. They touch disjoint modules, but the
  merged tree was never built or run here.
- **No merge attempt** of `c40752560` with `630793eb7`; the overlap above is a by-line reading of the two
  diffs, not an executed 3-way.
- **No `export *` / `export * as ns` probe** for ARM D (the report itself marks it as code-path-only, not
  separately pinned), and no probe of a door resolving into an installed package (declared out of scope).
- **No search for a live instance** of the `declaringFunction` name-shadowing residual in B2.
- **No re-run of stack B's intermediate commits**; I measured the two endpoints (16 accused pre-pins, 0 after)
  and read the group membership, so the intermediate 13/11/1 rest on the lane's own receipts.
- **Nothing about #1922/#2147** authority migration state, and no board or ledger file was written.
