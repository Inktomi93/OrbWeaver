---
kind: review
status: active
updated: 2026-09-11
---

# The mixed production front door (#1584 §5 items 1–6, #1941, #1948)

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
| `schema-fact-health` mustFlag rows 0/1 | red on the unmodified tree (`FACT TOOL ERROR [drizzle-schema:receipt] fact receipt refused: … resolved zero members`), reproduced in this worktree | `pnpm test:scoped tests/tooling/verify/gates/schema-fact-wave-1.test.ts` → 1 failed / 1 passed |

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
   `gate module <rel>: exports a \`gate\` that is neither branded by defineGate nor a valid legacy descriptor: <legacy reason>`.
   The message ADDS a hint when the object carries the final contract's required keys (`id`, `family`, `authority`,
   `create`): "it has the final contract's shape but was not created through defineGate (a spread, clone or copy
   loses the brand)". The hint is text in the refusal; it is never a dispatch decision.
4. `mod.gate === undefined` but the module exports a branded value under another name → **tool error**
   (`exactly one defineGate descriptor named \`gate\``, the existing final-loader rule).
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
  to `runPolicyPass` pins in `schema-fact-wave-1.test.ts` over a real consumer; the module and its enforcement-doc row
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
- `tests/tooling/verify/ops/structure-mixed.int.test.ts` (new): spawned `cli.ts structure` + `show` over planted trees
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

(filled in below as each leg commits)
