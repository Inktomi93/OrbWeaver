---
kind: review
status: active
updated: 2026-09-11
---

# The mixed production front door (#1584 §5 items 1–6, #1941, #1948)

> [!NOTE]
> **HISTORICAL rider (2026-09-18).** This record describes the MIXED legacy+final gate runtime. `b1e5e3e30`
> retired the frozen-legacy-replay differential suites (`registry-definitions-legacy-replay.test.ts`,
> `schema-fact-parity.test.ts` and siblings) and `df2a54b09` then deleted the legacy runtime entirely
> (`check-gates.repo.int.test.ts` removed, `structure-mixed.suite.int.test.ts` renamed to
> `structure-corpus.suite.int.test.ts`) — the declared `mustFlag`/`mustPass` proof rows on each final policy,
> checked through `structure:policy-conformance`, are the live oracle now
> (`tests/tooling/verify/ops/policy-conformance.test.ts`). The dated counts and cited suites below are
> preserved as the record of that transition, not current-tree fact.

Design first, then receipts. Lane `p-mixed-runtime`, isolated worktree off `main`; merge-base `205540e98` (the base every receipt below was taken against). The program
guide is [gate-runtime-standardization.md](../../design/gate-runtime-standardization.md); this file is the lane's
durable design plus the receipts the guide's §5 asks for. It records the alternatives rejected and why, the coupled
sites enumerated before building, and the proof plan — not a task roster.

## 1. What the tree is at the base (re-derived, two methods)

| Fact | Value | Receipt |
| - | - | - |
| gate modules | 271 `tooling/src/verify/gates/*.ts` (`_proof/` is a sub-dir the loader glob never sees) | `ls` |
| final (`export const gate = defineGate(`) | 163 | `rg --files-with-matches --fixed-strings` |
| legacy (`export const gate: GateDescriptor = {`) | 108 | `rg --files-with-matches --fixed-strings` |
| modules matching neither spelling | 0 | `comm -23` over the two file lists |
| production front door | `ops/structure.ts:152` → `loadGateCorpus` → `assertMeta` throws at `lib/loader.ts:25` on the first final module (`descriptor.name (undefined) must equal the filename`) | read |
| the scoped door | `ops/scoped.ts:287` → `loadGates` → the same throw | read |
| `enforcement-registry-parity` | reads `name`/`status` off an `ObjectLiteralExpression` initializer (`gates/enforcement-registry-parity.ts:201-210`); a `CallExpression` initializer yields nothing, so every final policy's doc row reads as an ORPHAN | read |
| `gate-modernization` arm A | `descriptorOf` (`:80-82`) is `asKind(ObjectLiteralExpression)`; a final module reads as "exports no `gate` descriptor" and its message asserts the loader skips it — false under the mixed door | read |
| `check-gates.repo.int.test.ts` | scrapes `renderPass`'s exact line shapes (`:60-63`); `GATE_FILES` (271 basenames) must all appear in the scraped registry; `UNFIXTURABLE_GATES` has 20 rows | read |
| `schema-fact-health` mustFlag rows 0/1 | red on the unmodified tree (`FACT TOOL ERROR [drizzle-schema:receipt] fact receipt refused: … resolved zero members`), reproduced in this worktree | `pnpm test:scoped tests/tooling/verify/gates/schema-fact-wave-1.suite.test.ts` → 1 failed / 1 passed |

Premise checks against the brief: "271 modules: 163 defineGate, 108 legacy" holds byte-exactly. "21 converted modules
imported by no test" was not re-counted — the conformance stage makes it moot by construction.

## 2. Loader identity rules (deliverable 1)

One discovery, one import loop, one classification, three views. `lib/loader.ts` owns all of it; `lib/policy-loader.ts`
keeps the final-contract validation (`assertPolicyModule`) and becomes a VIEW over the shared load rather than a second
discovery.

Classification of one module `rel`, in this order, by exact contract identity:

1. `mod.gate` is **branded** (`isDefinedGatePolicy`, the `WeakSet` minted by `defineGate` in `contract/policy.ts`) →
   **final**. Then the existing final rules apply unchanged: exactly one branded export and it is named `gate`
   (`policy-loader.ts:29-35`); `assertGatePolicyDescriptor`; `id === basename`; ids unique across the final set;
   singleton families equal their id.
2. `mod.gate` is **not branded** but is an object → it must validate as a **legacy** `GateDescriptor` through the
   existing fail-closed `assertDescriptor` (`name === basename`, `docRow`, `message`, `status`, `scopeSafety`, a
   visit/visitFile/run hook, ≥1 mustFlag + ≥1 mustPass); names unique across the legacy set. A legacy module
   genuinely missing `name` still refuses loudly with the path and the reason — that door is unchanged.
3. `mod.gate` is **not branded** and fails legacy validation → **tool error**: the loader throws
   ``gate module <rel>: exports a `gate` that is neither branded by defineGate nor a valid legacy descriptor: <legacy reason>``.
   The message ADDS a hint when the object carries the final contract's required keys (`id`, `family`, `authority`,
   `create`): "it has the final contract's shape but was not created through defineGate (a spread, clone or copy
   loses the brand)". The hint is text in the refusal; it is never a dispatch decision.
4. `mod.gate === undefined` but the module exports a branded value under another name → **tool error**
   (`` exactly one defineGate descriptor named `gate` ``, the existing final-loader rule).
5. `mod.gate === undefined` and no branded export → **unregistered** (recorded on the roster as today; the run
   manifest reconciles it into `incompleteReasons` and exit 2 — the #410 control stays green).
6. An import-time throw (syntax error, missing dependency) stays FATAL, attributed to the path in sorted order
   (`loader.ts:89-90`'s ruling; `structure.int.test.ts` control 2 pins the in-flight stub).

Never by filename, never by the presence of a property named `mustFlag`, never "try the legacy loader and catch".
Reserved probe files (`__g_*`, `__dc_*`) stay out of the corpus as today (`PROBE_GATE_FILE_RE`, the #410 comment:
they are source inputs to gates, never gate modules).

**Duplicate module identity.** The same descriptor OBJECT reached through two files is impossible by construction
once both filename laws hold: `y.ts` re-exporting `x.ts`'s gate carries `id`/`name` `x` ≠ basename `y` and refuses at
rule 1/2 with both spellings named. A separate object-identity `Set` would be an arm no proof could turn red (the
wave-5 lesson), so it is NOT added; the mixed test plants exactly that re-export shim and asserts the filename
refusal names the re-exported id.

**Cross-contract id collision** is also impossible by construction (both ids equal their basenames, one directory).

Roster shape (`contract/gate-corpus.ts`, new — exported shapes live in `contract/`, Core-Tooling-Law §2.5):

```ts
interface MixedGateCorpus {
  readonly files: readonly string[];        // every corpus module the loader considered, sorted
  readonly legacy: readonly GateDescriptor[];
  readonly final: readonly GatePolicy[];
  readonly families: readonly string[];     // derived from `final`
  readonly unregistered: readonly string[]; // modules exporting no `gate`
}
```

`files.length === legacy.length + final.length + unregistered.length` is the accounting the run manifest reconciles.
Views: `loadGateCorpus` → `{ gates: legacy, files, unregistered }` (every existing legacy caller keeps its type and
STOPS throwing on final modules); `loadGates` → `legacy`; `loadPolicyCorpus` → `{ gates: final, files, families }` and
KEEPS refusing a corpus that holds any legacy module (its documented contract and its pin; the planner CLI is the
final-only door). `loadMixedGateCorpus` is the front door's loader.

## 3. One invocation, two dispatchers, one report (deliverable 2)

`ops/structure.ts#runStructure`:

```
corpus = await loadMixedGateCorpus(root)
ctx    = projectCtx(root)                                  // ONE getWorkspace Project, shared
legacy = runPass(corpus.legacy, ctx)                       // legacy dispatcher, unchanged
final  = corpus.final.length === 0 ? null :
         runPolicyPass({ knownPolicies: corpus.final, policies: corpus.final, root,
                         project: ctx.project, reviewedGrants: REVIEWED_GRANTS, failOnWarnings: false })
```

- **Shared Project.** `runPolicyPass` takes `input.project` and filters `getSourceFiles()` through
  `isPolicySourceCandidate` (`.ts`/`.tsx`); `projectCtx`'s `harnessGlobs` are `.ts`/`.tsx` only over
  `packages/*/src`, `tests`, `tooling/src`, `scripts` — the same universe every composed baseline in the checkpoint
  loaded. The lazy checker is `project.getTypeChecker()` on both sides (ts-morph caches it on the Project). Both
  dispatchers bracket their own `beginReferencePass`/`endReferencePass`; they run sequentially. Measured in §8.
- **Grants.** The door passes `reviewedGrantsFor(corpus.final)` — the brief's spelling, and the only one that keeps a
  PARTIAL roster honest: with the whole table, every planted tree and every future scoped policy selection drowns in
  `invalid-grant` errors for rows naming policies it never loaded (measured while writing the mixed test: ~100 per
  planted run). The silence that filter would otherwise buy — a row naming a legacy gate or a deleted policy vanishing —
  is closed where it is a WHOLE-corpus fact: the conformance stage validates `REVIEWED_GRANTS` against the whole final
  roster on every check (`validateReviewedGrants`, `lib/gate-authority-validation.ts:55-76`: unknown policy, wrong
  authority, duplicate id/identity are tool errors naming the row). Two doors, one loud answer each.
- **Empty final roster** (a planted tree with only legacy gates): `runPolicyPass` refuses an empty policy array, so the
  door records `policy: null` and the manifest says `final.registered: 0`; the legacy half is unchanged
  (`structure.int.test.ts`'s planted controls keep their meaning).
- **Probe artifacts.** `stripProbeFindings` for the legacy pass; the final pass's EFFECTIVE findings are filtered by
  the same `PROBE_ARTIFACT_RE` (`stripProbePolicyFindings`, same file, same env opt-out `ORB_GATE_FIXTURES=1`).
  Waived/granted findings and alarms are not touched (they are not findings on the report).

### 3.1 Exit classes (unchanged vocabulary, one composition)

`max(legacyExit, policyPassExitCode(final))` where legacy exit is today's rule (tool error on tool errors / blind gates
/ refused populations / incomplete run; violations on findings) and the final exit is the planner-owned
`policyPassExitCode` (`lib/policy-plan.ts:417-422`: 2 on fact/pass/authority tool errors, 1 on `verdict.blocking > 0`,
else 0). Kept in one home, not re-spelled. `waiverCarrierRefusals` are reported, never exit-affecting — the planner's
existing ruling; a follow-up if the owner wants them promoted.

### 3.2 Routing (who may consume which door)

| Door | Reaches | Wrong side |
| - | - | - |
| `// @orb-gate-ignore <name>…` (+ private markers) | legacy owners only (`lib/pass.ts` suppression, `gate-ignore-inventory` audits) | a marker naming a final policy: `gate-ignore-inventory` UNREGISTERED arm today derives names from filenames, so it reads as REGISTERED and then STALE (nothing consumed it) — a reconciliation finding, not silence |
| `// @orb-waive <id>(<pos>): <reason>` | final ORDINARY policies only (`lib/ordinary-waiver.ts`) | naming a legacy gate → `unknown-policy` alarm; naming a hard/reviewed-grant final policy → `wrong-authority` alarm |
| `REVIEWED_GRANTS` row | final reviewed-grant policies only | naming an ordinary/hard final policy → `invalid-grant-authority` tool error; naming a legacy gate or nothing → `invalid-grant` tool error |

Nothing on the legacy side reads `@orb-waive`; nothing on the final side reads `@orb-gate-ignore`. The mixed test drives
each row of the table. DECLARED LIMIT (the engine's, pre-existing): the final side acquires `@orb-waive` carriers only
from its policies' EFFECTIVE populations (`policy-pass.ts#ordinaryWaiverAcquisition`), so a marker in a file no final
policy covers is unread — on the real tree every authored TS/TSX path sits in some final population; in a partial
roster it may not (the mixed test plants its alarm carrier inside `@client` for that reason).

### 3.3 Report schema mapping (`reports/check-structure.json`, one artifact, one reader)

ONE `gates[]` roster, rows discriminated by `contract`:

```ts
type StructureGateRow =
  | { readonly contract: "legacy"; …GateResult }                           // today's row + the discriminator
  | { readonly contract: "final"; readonly name: string; readonly family: string;
      readonly authority: GateAuthority; readonly severity: GateSeverity; readonly workItem: number | null;
      readonly ok: boolean; readonly owner: GateOwnerCompletion; readonly withheld: boolean;
      readonly population: { declaredSourcePaths; declaredResourcePaths; effectiveSourcePaths; effectiveResourcePaths; requestedPaths: number | null }; // COUNTS
      readonly receipts: readonly PolicySemanticReceipt[];
      readonly violations: readonly Violation[];                            // EFFECTIVE findings, with severity
      readonly waived: number; readonly granted: number; readonly timing: PolicyTiming };
```

- `Violation` (`contract/harness.ts`) widens by optional `column`, `token`, `severity` — additive; legacy rows keep
  `{file,line,message}`.
- Population is carried as COUNTS: 163 policies × ~7,300 paths as lists would make the artifact unreadable and
  `check:show` unusable; the per-policy receipts (semantic members) stay whole.
- `run` (`contract/run-manifest.ts`) gains `legacy: { registered, active, ran }` and `final: { registered, ran, withheld }`;
  the totals `registered/active/ran` become the sums, so `show`'s `ran/active` reading is unchanged.
- A new report-level `policy` block carries the final side's aggregate: `facts` (id, status, population counts,
  receipts, timing, error), `factErrors`, `toolErrors`, `waiverCarrierRefusals`, `authority` (alarms, toolErrors,
  withheldPolicyIds, ordinaryConsumption, reviewedGrantConsumption, verdict), `timing` (`PolicyPassTiming`).
- `total` = legacy violations + final BLOCKING effective findings (errors; warnings only under promotion) + authority
  alarms. Warnings are visible in the row's `violations` (`severity: "warning"`) and in `policy.authority.verdict`.
- `ok` = legacy ok-conditions ∧ final has no fact/pass/authority tool errors ∧ `verdict.blocking === 0`.
- `incompleteReasons` gains the final side: every final policy owes a `PolicyTiming` over `POLICY_PHASES`
  (`policyTimingAlarms`, `lib/timing.ts`, same refusal class as the legacy untimed-gate arm) and the manifest
  reconciles `final.ran === final.registered`.

`check:show` renders both: a legacy row exactly as today; a final row as
`✗ <id> [final · <authority>/<severity>] (N violation(s))  ·  population S source · R resource · waived W · granted G · owner <status>`,
then its occurrences; the report-level policy block prints alarms, fact receipts, withheld ids and carrier refusals
beside the legacy tool errors. `--gate`/`--file`/`--errors-only`/`--limit` apply to both because both are rows of the
one roster. Pre-mixed artifacts (no `contract` field, no `policy` block) still read: an absent `contract` is legacy.

Console (`renderPass` unchanged for legacy; `renderPolicyPass` new in `lib/render.ts`): one line per final policy in the
same `  ✓ <id>` / `  ✗ <id> (N)` prefix shape with a `  ·  final <authority>/<severity> · population …` suffix, grouped
occurrences under a failing policy exactly as legacy groups, then the final footer (`final policies: N ran · raw R =
waived W + granted G + effective E (e error, w warning) · A alarm(s) · T tool error(s)`), the combined completeness line
and the two timing lines.

### 3.4 The scoped door (`ops/scoped.ts`)

Same loader, same two dispatchers: the legacy incremental-safe gates over the scoped fileset (unchanged), and
`runPolicyPass` with `requestedPaths` = the scoped repo-relative fileset. The dispatcher already defers
`entire-population` policies under a proper subset (`resolveRun`: `not-applicable … deferred for a proper subset
selection`) and skips empty intersections — that IS the final contract's whole-project fence, so the deferred notice
lists the deferred final policies beside the deferred legacy gates. `ScopedResult` gains `policy: PolicyPassResult | null`.
Exit: the same `max` composition. The scoped door writes no artifact today and still does not.

## 4. Whole-corpus conformance stage (deliverable 3, #1941)

- verb `policy-conformance` on the ONE front door (`contract/verbs.ts` → `cli.ts` VERB_HELP/dispatch → `lib/verb-tail.ts`
  `none`); op `ops/policy-conformance-stage.ts#runPolicyConformance(root)`; script `check:policy-conformance`; registry
  row `structure:policy-conformance` in `group: "structure"`, `tiers: STATIC`, `classify: ownScheme`, whole-only.
- It loads the mixed corpus and runs `verifyPolicyProofs(corpus.final)`. Zero final policies is exit 2 (a bare zero is
  "I could not measure"); any failure is exit 2 (a mis-proven policy is a checker whose claim about itself broke — the
  house classification for conformance, `contract/scoped.ts:16-18`); clean is 0. Each failure prints
  `<policyId> · <arm>[<index>] · <why> · <detail>`.
- Not a new CLI entrypoint (a verb on the existing one), not a second registry (a row in the one registry), not a path
  table, not a scope predicate. `verify-registry-parity` reconciles the new script against the new row.

## 5. `enforcement-registry-parity` reads both contracts (deliverable 5)

`descriptorOf` gains the final shape: when the `gate` initializer is a `CallExpression` whose callee resolves through
`lib/gate-contract-origin.ts#isCanonicalDefineGate` (the census's own identity reader — import-origin traced to
`contract/policy.ts`'s `defineGate`, never a bare name match), the descriptor meta is `{ name: <id literal>,
status: "active", message: <evaluated message> }` read off the call's object-literal argument. A `defineGate` call
whose callee is NOT canonical is not a descriptor (the doc row for it then reads as an orphan, which is the loud
direction). Proof rows: a planted canonical final module (with a planted `contract/policy.ts` stub the origin reader can
resolve) with its doc row → passes; without its doc row → `DOC_ACTIVE_MISSING`; a doc row for a final id whose module
is gone → orphan. The `(N registered gates)` count becomes legacy-active + final. The int test's real-tree arm is the
receipt; the doc's count line and any missing/orphan rows are coupled edits recorded in §8.

`gate-modernization` arm A: `armDescriptor` recognises a canonical `defineGate(...)` module as REGISTERED and returns
`undefined` for it (arms B/C/D are legacy-only by contract — `policy-validation.ts` already requires ≥1 mustFlag/mustPass
and forbids every legacy field, so nothing is re-implemented). Receipts required by the orchestrator: the mustPass row
(a canonical module is silent) AND a planted break proving arm A still bites on a legacy module whose `gate` export is
renamed in a scratch copy.

## 6. `check-gates.repo.int.test.ts` re-derived (deliverable 5)

- The scrape regexes accept both line suffixes (legacy `scanned N/M files…`, final `final …`), anchored as before.
- The registry-vs-files arm keeps its meaning over the whole 271 (every basename must be printed by the mixed run).
- The anti-drift FIRED arm applies to LEGACY rows only: a final policy's bite receipt is the conformance stage running
  its own rows through the production dispatcher; the test derives the final id set from `loadMixedGateCorpus` and
  names that successor in the exemption. `UNFIXTURABLE_GATES` loses every row that is now a final policy (they were
  carried only because the legacy anti-drift arm could not fixture them) — re-derived against the mixed roster.
- The SCAN-DENOMINATOR arm applies to legacy rows; final rows must carry `population` on their line (the same
  "a verdict without a denominator is unauditable" claim in the final vocabulary).
- Budgets: the mixed pass costs the legacy pass plus the final pass; `PER_PASS_BUDGET` is re-based on the §8
  measurement, never on hope.

## 7. Deletions (deliverable 6) and the retirement (deliverable 8)

- `expect(result.authority.effectiveFindings).toEqual([])` deleted from both grant-liveness int tests; runnability arms
  kept; each header records that the front door owns the real-tree verdict now.
- `schema-fact-health` RETIRED (owner-ratified fork A, arm 1): the fact status union is closed at four members
  (`schema-fact.ts:397/403/407/425/433/464`), `receipt()` at `:368` sums tables+columns+fks+indexes, every non-ready
  branch passes `[]` for tables (members 0) and missing/unresolved set `unresolved: 1` (`:523-524`), and `ready` is
  reachable only past the `calls.length === 0` guard (`:407`) so it always carries members ≥ 1; `factReceiptFailures`
  (`policy-pass.ts:642`, ab675b23b) refuses members 0 or unresolved > 0 and withholds every consumer before `evaluate`.
  The mapping is total: `if (fact.status !== "ready")` in the health policy is provably dead. The two guarantees move
  to `runPolicyPass` pins in `schema-fact-wave-1.suite.test.ts` over a real consumer; the module and its enforcement-doc row
  are deleted; the conformance stage would have caught the dead rows (exit 2 on this exact tree before the retirement).

## 8. Rejected alternatives

| Alternative | Why not |
| - | - |
| Route the whole-tree final pass through `planPolicyArgv`/`executePolicyPlan` | The planner resolves scope from the git inventory + compiler programs and `executePolicyPlan` refuses when the Project resolves a different population than the plan (`policy-plan.ts:496-514`); the structure door has no argv and builds the harness Project. Forcing agreement means a second Project or a second population algebra. `runPolicyPass` is the only dispatcher either way; the planner stays the argv door. |
| A second `structure` artifact / a `policies[]` array beside `gates[]` | "no second artifact, no second reader"; two arrays would split the roster and every `check:show` filter would need two loops. One discriminated roster keeps every existing reader working on the union. |
| Synthesising a legacy `GateScan` for final rows | An adapter making a policy look like a descriptor at the report layer; final rows carry their own population/receipt vocabulary instead. |
| Collect loader refusals and continue (a `refused[]` roster) | Both loaders' law is fail-closed at load with the path in sorted order; the #410 controls pin the in-flight stub for load failures. A refused load is not a verdict at all, which is honest. Recorded as the alternative; revisit at legacy deletion. |
| `REVIEWED_GRANTS` whole at the front door | Buries every partial roster under `invalid-grant` errors (planted trees, scoped selections); the whole-table check is whole-corpus by nature and lives in the conformance stage (§3, §4). |
| Skip `@orb-waive` acquisition for scoped runs | The engine's alarms are completion-bound already; nothing to add. |
| Make `factReceiptFailures` presence-only again for #1948 | Reopens the fail-open fact hole ab675b23b closed, against §12.3; its four controls would go red. |
| Special-case health policies in the dispatcher | An adapter by another name. |
| Object-identity `Set` for "duplicate module identity" | Unreachable by construction (filename law); an arm no proof turns red. |

## 9. Coupled-site inventory (enumerated before building)

New verb: `contract/verbs.ts` · `cli.ts` (`VERB_HELP` record + `dispatch`) · `lib/verb-tail.ts` (record) · `index.ts` export ·
`package.json` script · `lib/registry.ts` row · `tests/tooling/verify/lib/registry.test.ts` pin ·
`tests/tooling/verify/cli.int.test.ts` (`test.for(VERIFY_VERBS)` picks it up; `TAIL_REFUSALS` gains a row) ·
`tests/tooling/verify/ops/run.int.test.ts` static-order list (`:379-401`) · `verify-registry-parity` (data, no edit).
New contract shapes: `contract/gate-corpus.ts`, `contract/structure-report.ts` (the report row/block shapes move out of
`ops/structure.ts` into `contract/` where `show.ts` and the tests can read them). Widened: `contract/harness.ts` `Violation`,
`contract/run-manifest.ts`, `contract/scoped.ts`. Readers: `ops/show.ts` views. Tests touched: `structure.int`,
`scoped.int` (imports a real legacy descriptor `no-manual-memo` — still legacy, unchanged), `render.int` (legacy renderer
unchanged), `policy-loader.test` (refusal wording unchanged), `check-gates.repo.int`, `enforcement-registry-parity.int`,
both grant-liveness ints, `schema-fact-wave-1`. Ledgers: `docs/test-baseline/manifest.json` (new specs), the enforcement
doc's count line and rows, this file's catalog receipt.

## 10. Test plan

- `tests/tooling/verify/lib/loader.test.ts` (new, the mirror of `lib/loader.ts`): the six classification rules over a
  scratch corpus of real-shaped modules — a branded module, a legacy descriptor, an unbranded final-shaped lookalike
  (spread copy), a `defineGate` under another export name, a re-export shim under the wrong filename, a duplicate final id,
  a duplicate legacy name, a module exporting nothing; the three views' accounting identity.
- `tests/tooling/verify/ops/structure-mixed.suite.int.test.ts` (new): spawned `cli.ts structure` + `show` over planted trees
  whose gates dir holds RE-EXPORT SHIMS of one REAL legacy descriptor (`assumes-single-replica`) and REAL final policies
  (`baseui-render-prop-composition` ordinary; `no-raw-matchmedia` reviewed-grant; `verify-registry-parity` hard/resource)
  — the shims import the real modules by absolute file URL so the objects ARE the real branded descriptors. Arms: both
  execute in one invocation and land in one `gates[]`; id/authority/severity/owner/population/timing distinguishable per
  contract; the routing table (§3.2) in both directions; a real resource policy failing at population (no `package.json`)
  withholds only itself with explicit failure state while the ordinary policy still reconciles its waiver; exit and JSON
  deterministic across two runs. Every arm is planted-broken in a scratch copy (record in §11).
- Conformance stage: `tests/tooling/verify/ops/policy-conformance-stage.int.test.ts` — clean planted final corpus → 0;
  a planted failing row → exit 2 naming policy/arm/index/why; zero final policies → 2.
- `registry.test.ts` row; `cli.int` tail row; `run.int` static list.
- Parity gate: proof rows + the int test's real-tree arm on the mixed roster.
- The baseline (deliverable 7) as measured, verbatim.

## 11. Receipts (appended as the build lands)

### 11.1 Commits (this worktree, merge-base `205540e98`)

| Leg | Commit | What |
| - | - | - |
| 1 | `2c24d62e7` | mixed loader (`lib/loader.ts`, `lib/policy-module.ts`, `contract/gate-corpus.ts`), the two singleton-family renames, `tests/tooling/verify/lib/loader.test.ts` (10 arms), this doc |
| 2 | `c05dcad77` | the front door (`ops/structure.ts`), the scoped door, `contract/structure-report.ts`, `lib/structure-report.ts`, `lib/render.ts#renderPolicyPass`, the final timing ledger in `lib/timing.ts`, `lib/pass.ts#stripProbePolicyFindings`, `check:show` + `lib/show-policy.ts` |
| 3 | `d9fe852ce` | `structure:policy-conformance` (verb, op, script, registry row, pins, planted-tree int test); the stale `lint:hook-syntax` pin repaired |
| 4 | `ff67d9c70` | `tests/tooling/verify/ops/structure-mixed.suite.int.test.ts` (9 arms; landed as `structure-mixed.int.test.ts`, renamed in `983b0d640`); `reviewedGrantsFor` at the door, whole-table validation in the stage |
| 5 | `aef57f16d` | `enforcement-registry-parity` + `gate-modernization` read both contracts; the nine missing doc rows + count 271; `check-gates.repo.int.test.ts` re-derived (§11.6) |
| 6 | `b5a966db4` | the two grant-liveness verdict lines deleted after the front-door transfer was proven (§11.7) |
| 7a | `72dcffd18` | the stage judges the grant table whole only where the table is part of the corpus (§11.8) |
| 7b | `983b0d640` | the mixed test takes the `.suite.int.test.ts` kind; `docs/test-baseline/manifest.json` regenerated |
| 8 | (this commit) | `schema-fact-health` retired (#1948) with its successor pins; §11.6–11.9 (§11.9) |
| 9 | (next) | the doc-catalog receipts for this file and the enforcement doc — docs plumbing only, after the retirement by the catalog's own two-commit rule |

Floors per leg are in each commit message; every count was read off the run (scoped-test logs in the session
scratchpad; `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` exit 0 after every leg).

### 11.2 Loader census on the real corpus (leg 1, `loadMixedGateCorpus` in-process)

271 files → 108 legacy (all active) + 163 final + 0 unregistered; 110 families; 351 ms; the accounting identity holds.
`baseui-render-prop-composition` loaded as final WITHOUT an edit — the legacy loader's throw was its misreading, and
classification by identity makes it impossible. Two final modules the mixed door was the first loader ever to run
violated the singleton-family law and were renamed to their ids with header notes: `no-raw-color-in-css` (was
`css-literal-geometry`, its 14 siblings still legacy) and `no-chat-trpc-in-surface` (was `trpc-proxy-origin`).

### 11.3 First real mixed `pnpm check:structure` on this worktree (leg 2, `/usr/bin/time -v`, box quiet)

- run COMPLETE: ran 271/271 (108/108 legacy · 163/163 final); no tool errors, no scan alarms, no population alarms,
  no withheld owners, no authority tool errors, no waiver-carrier refusals; 5 facts ready (bus-definitions 8,
  bus-producers 66, drizzle-schema 1,288, registry-definitions 99, tuple-vocabularies 2,138 members).
- exit 1; `total` 959 = 525 legacy violations + 434 final blocking (434 error, 0 warning, 0 alarms).
- wall 2:53.18; peak RSS 7.72 GB (7,718,808 kB); legacy pass 129.2 s (gates 125.3 s); final pass 37.8 s
  (policies 30.7 s, facts 2.5 s, dispatcher 4.7 s) sharing the legacy Project — against 2:03 / 6.55 GB for the
  isolated composed pass in the checkpoint. Slowest legacy: caught-failure-ownership 13.1 s, gate-ignore-inventory
  8.3 s, knob-wire-coverage 8.0 s, enforcement-registry-parity 7.7 s, dangling-refs 7.0 s. Slowest final:
  test-world-browser-contracts 4.1 s, ct-poll-schedule-and-paint 4.0 s, eslint-grant-liveness 3.9 s.
- legacy violations by gate: gate-modernization 173 (163 = the final modules, arm A's false "exports no `gate`
  descriptor"; 6 `_proof/` files; 4 other), enforcement-registry-parity 155 (doc rows for final policies read as
  orphans/missing), diagnostic-legibility 83 (final policies' `message` strings judged by the legacy pointer law —
  every site a gates/\*.ts final module), test-layout 22 (21 family/wave tests with no source mirror),
  caught-failure-ownership 19, suppressions 16, gate-ignore-inventory 15 (STALE markers naming converted gates — the
  marker backlog seen from the legacy side), no-test-fabrication 15, tooling-shared-plumbing 12,
  no-inline-union-redecl 8, dangling-refs 3, monotonic-tests 3, playwright-css-topology 1.
- final effective by policy: ct-no-oneshot-live-read-assert 315 (the ONESHOT-OK backlog), owner-scoped-writes 32 +
  owner-scoped-reads 26 (the @owner-scope backlog), test-determinism 25 (the same sites as the 15 stale legacy
  markers), no-inline-types 18 (waived 5), tooling-size 10 (hard: bus-fact 635, ordinary-waiver 640, policy-pass 870,
  pass.ts 483 — pass.ts was 459 at the base), brand-in-name-position 2 (waived 73), no-hardcoded-side-gen-sampling 2
  (#1816), test-fixture-imports 2, component-size 1, fetch-fn-in-features 1. Waived 181, granted 105 (every grant row
  consumed exactly once).
- `check:show` could not be read after this run: the `cli.int` heap-ceiling control ran `structure` in this checkout
  and died, leaving an abandoned slot newer than the run — the #1029 refusal, correct; read again after the final run.

### 11.4 Whole-corpus conformance stage on the real corpus (leg 3)

163 final policies · 1,434 proof rows · 97 failures · 10.4 s → exit 2, RED BY CONSTRUCTION and pre-existing: every
failure is `ab675b23b`'s fact-receipt refusal (`fact receipt refused: population "…" resolved zero members / left N
unresolved`) withholding fact consumers before `evaluate` — the registry-definitions family 94 rows
(modal-registry-completeness 16, section-factory-contribution-bundle 16, config-group-completeness 12,
placeholder-copy-registry 12, section-registry-completeness 12, chrome-registry-completeness 11,
modal-body-not-placeholder 9, config-anchor-in-registry 6: one aggregate receipt over six kinds, so a one-kind fixture
leaves five homes unresolved), schema-fact-health 2 (#1948), bus-fact-health 1. None of policy-pass.ts, registry-fact.ts,
bus-fact.ts, schema-fact.ts, contract/fact.ts or policy-validation.ts differs from the merge-base.

Diagnosis (orchestrator, 2026-09-11, recorded in `docs/design/gate-runtime-standardization.md` §12.3 — cite it, do not
re-derive it): a provider is atomic by contract, so "one kind failed" is not a representable state of a single
`defineFact`; `registry-fact.ts:300-304` sums `members`/`unresolved` across six kinds that every consumer reads one at a
time through `forKind`. The fix is a provider split (six providers, one physical walk, zero contract change) — #1953,
READY, a diagnosed and filed defect with a known fix, not a ruling in flight. The refusal itself stays exactly as
`ab675b23b` wrote it: unsupported or absent input is an unresolved fact or a tool error, never absence. The registry family
is out of this lane's fence. `bus-fact-health`'s zero-members arm is the same class and rides #1953's row.

Caveat, so this section does not overclaim: a GREEN conformance run means every proof row RAN through the production
dispatcher and held, not that the rows are strong — 39 mustFlag rows across 14 modules carry no `expect` (a bare row
asserts only "at least one finding") and 57 of 86 ordinary policies have no positive identity arm (#1952). The stage is the
foundation those rows will be strengthened on; it is not their strength.

### 11.5 Planted-break receipts for the mixed test (leg 4; scratch-copy break → run → restore; worktree clean after)

| Arm | Break (file, neutralization) | Result |
| - | - | - |
| one invocation, one roster | `ops/structure.ts`: the final dispatcher never runs | RED (that arm and every arm reading a final row) |
| legacy marker → legacy owner only | `lib/pass.ts`: node-arm suppression neutralized | RED |
| `@orb-waive` → final ordinary only | `lib/policy-pass.ts`: no TypeScript carriers acquired | RED (+ the roster and withheld arms) |
| grant → reviewed-grant only | `ops/structure.ts`: the door hands no grant rows | RED (+ show and roster arms) |
| unbranded lookalike refuses | `lib/loader.ts`: the lookalike hint unreachable | RED |
| duplicate id refuses | `lib/loader.ts`: uniqueness never judged | RED |
| failed owner withheld, siblings reconcile | `lib/structure-report.ts`: `withheld` always false | RED |
| deterministic exit + JSON | `lib/structure-report.ts`: a random value in a kept row | RED (+ grant and roster arms) |
| `check:show` renders both | `lib/show-policy.ts`: the contract word dropped | RED |

### 11.6 Both contracts in `enforcement-registry-parity` and `gate-modernization`; `check-gates` re-derived (leg 5, `aef57f16d`)

- Parity red-first on the unmodified reader against the real tree: 155 findings (`declares "255 registered gates" but
  there are 108 active gate descriptors` + 154 live doc rows for converted policies read as orphans). After the
  both-contract reader and BEFORE the doc edit: exactly 10 (the count 255 vs 271, and the nine `-health`/fact-health
  policies that had no row at all); after the nine rows + count 271: 0. `verifyGateProofs`: 18/18 rows (five new,
  all through the fs-backed substrate with a planted `contract/policy.ts`). The int test's real-tree arm: 20.4 s
  (8.4 s before the origin reader); timeout base raised 30 s → 60 s from that measurement.
- Fork B arm 1 (WIDEN), both required receipts: the mustPass row (a canonical `defineGate` module with a planted
  policy.ts stub is silent — 18/18 proof rows) AND the planted break on a REAL legacy module: `gates/test-layout.ts`
  copied to `.p-mixed-runtime.bak`, `export const gate` renamed, the gate driven over the real gates dir → 5 findings,
  the new one ``test-layout.ts:1 … exports no `gate` descriptor object and no canonical `defineGate` policy``;
  restored → 4 (the pre-existing arm-B rows: no-raw-spacing-in-features, no-raw-typography-in-features,
  serde-core-seal, vector-scope-derived — the baseline's "4 other", outside this lane's fence: each carries its stale
  arm in its `-health`sibling module, which arm B cannot see from the sibling's file). Arm A on the real gates dir:
  173 → 4 (163 final modules + 6 `gates/_proof/` surfaces stop reading as unregistered).
- `check-gates.repo.int.test.ts`: 10/10 in 451 s (two mixed passes). BLIND_RE had spelled `!` while the renderer
  has printed `⚠` since 68c8f42d6 — the zero-scan arm was an unfailable empty set; repaired, and it now also covers a
  final owner failure/withhold. Seven UNFIXTURABLE rows named converted policies (eslint-grant-liveness,
  depcruise-grant-liveness, warning-code-coverage, verify-registry-parity, bus-producer-coverage,
  message-kind-policy-coverage, ct-poll-schedule-and-paint-health); the new two-sided arm REDs such a row. Its
  positive control was taken at predicate level only: the roster script printed exactly those seven under
  "UNFIXTURABLE rows now FINAL" (the same `legacyNames.has` membership over the same loader output) before they were
  removed — a full 7.5-minute run with a re-planted row was not spent; the caveat is recorded here.
- Pre-existing catalog mismatches seen while checking docs (Core-Audits-and-Debt.md, Spine-Identity-and-Auth.md,
  plugin-ui-plane.md, seven `docs/reviews/gate-runtime/*` debt paths): none touched by this lane.

### 11.7 The grant-liveness verdict transfer (leg 6, `b5a966db4`)

Owner challenge honoured before deletion. Roster: both policies on the mixed manifest as final rows, owner success,
population complete (eslint 108 native-config rows + 9,426 tracked files; depcruise 210 rows + 9 package facts +
9,426). Plant: one dead FILE-EXACT grant in each real config (a trailing `{ files: ["packages/kit/src/p-mixed-runtime-
dead.ts"] }` in eslint.config.js; a `forbidden` rule with `from.path "^packages/kit/src/p-mixed-runtime-dead\.ts$"`
in .dependency-cruiser.cjs), ONE mixed run (exit 1) → `✗ eslint-grant-liveness (1)` at `eslint.config.js:1:1` token
`config[26].files[0]` and `✗ depcruise-grant-liveness (1)` at `.dependency-cruiser.cjs:1` token
`packages/kit/src/p-mixed-runtime-dead.ts`; every other final policy at baseline except tooling-size 10 → 11 (the
planted line); both configs restored, `git status` showed only the two test files. Neither policy is in the #1947
class at repo scope, so no arm is kept as a deviation. Tests: 6/6.

### 11.8 The stage's whole-table grant judgment, fixed (`72dcffd18`, stacked before the retirement; the mixed test's `.suite` rename + manifest is `983b0d640`)

A leg-4 defect caught by the lane's own pin on the leg-7 floor: judging the whole `REVIEWED_GRANTS` table
unconditionally made every planted proof root exit 2 ("105 grant rows · 105 invalid"). Rule now: the whole table is
judged exactly when the table's own module lives under the root being judged (the real tree); otherwise only rows
naming loaded policies. Controls at the CLI door: a one-policy root judges that policy's own rows (`route-imports-no-
feature`, a singleton family — a lone member of a two-policy family is the loader's refusal, found the hard way with
`zod-error-issues-home`), and the same root plus a re-export of the real table at its own path exits 2 with every
`[invalid-grant] … unknown policy` row, invalid == rows − own rows read off the two runs. 4/4.

### 11.9 The retirement (#1948) and the final read

- `schema-fact-health` deleted; its doc row (added in leg 5) removed; count 271 → 270; `gate:contract` 815 → 815
  findings across 271 → 270 modules (the module carried none). Successor pins in `schema-fact-wave-1.suite.test.ts`
  (5/5): the two fixtures through `runPolicyPass` over `schema-branding` — `factErrors` exactly
  `[{ factId: "drizzle-schema", phase: "receipt", message: "fact receipt refused: population "drizzle-schema"
  resolved zero members" }]` (impostor: `… ; population "drizzle-schema" left 1 unresolved`), the consumer's owner
  `incomplete` with `declared fact failed: drizzle-schema: …`, zero effective findings; a healthy control resolves.
- Final mixed `pnpm check:structure` (this tree, `/usr/bin/time -v`, box otherwise idle): run
  `agent-a4e4f512e6acc5d96-2393157-2026-09-11T19-05-39-047Z` COMPLETE, 270/270 (108/108 legacy · 162/162 final),
  exit 1, total 635 = 200 legacy + 435 final (435 error, 0 warning, 0 alarms, 0 tool errors, 0 withheld, 5 facts
  ready); waived 181, granted 105. Wall 4:01.81, peak RSS 6.57 GB; legacy hooks 187.8 s (slowest:
  enforcement-registry-parity 26.0 s — the origin reader over 163 modules, was 7.7 s — caught-failure-ownership
  18.2 s, dangling-refs 11.6 s, gate-ignore-inventory 11.5 s, knob-wire-coverage 9.6 s); final slowest
  ct-poll-schedule-and-paint 4.7 s, test-world-browser-contracts 4.3 s, eslint-grant-liveness 4.2 s.
  Legacy deltas against §11.3: enforcement-registry-parity 155 → 0, gate-modernization 173 → 4,
  diagnostic-legibility 83 → 81 (the retired module's two message-pointer rows), test-layout 22 → 23 → 22 after the
  mixed test took the `.suite.int.test.ts` kind. Final deltas: tooling-size 10 → 11 (`lib/pass.ts` is at 483
  lines against the 450 cap since leg 2 — recorded in §11.3; `tooling-size` is a hard policy and the row is real:
  the split is owed and deferred to the orchestrator's call, since pass.ts was 459 at the base and already over).
  `pnpm check:show` read the same run: `✗ check:structure FAILED — 635 violation(s)`, both contracts rendered.
- Floors on the retirement tree: the scoped battery over 14 files → 13 passed / 1 failed (the stage pin that found
  §11.8's defect, green after the fix: 4/4); typecheck PASS tsconfig.json + tooling/tsconfig.json; `pnpm verify --list` shows `structure:policy-conformance [structure] whole-only` under changed/static/push/full.
