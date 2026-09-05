---
kind: review
status: active
updated: 2026-09-05
---

# Gate-runtime standardization foundation — stickler review

Verdict: **NOT MERGEABLE.** Six confirmed findings remain: four P1 and two P2. The temporary census reproduces the committed 255-module / 1,579-finding total, but its source-shape readers can return a clean result while forbidden descriptor fields, repository walks, Project construction, mutable module state, and baseline paths remain. The whole static battery also has two mechanically-enforced coupled-site blockers from this range: the new test is absent from the monotonic test manifest, and the changed design has no catalog receipt/catalog regeneration.

Scope: committed range `e8e829a3b..26ec2f7d3` in the `codex-gate-tsmorph-standardization` worktree. A docs-only follow-up advanced the worktree HEAD to `90575addc` during the review; all tooling/test files in this range stayed byte-identical, and every logic probe below imported those bytes. The whole-static receipt therefore covers the same implementation but the worktree's later design text.

## Confirmed findings

### P1 — `tooling/src/verify/lib/gate-contract.ts:230` — spread and computed descriptor indirection can retain legacy fields while the census reports zero findings

`inspectDescriptor` resolves one object literal, then examines only that literal's direct properties. It never expands spread assignments and `staticName` treats a computed identifier as its identifier text rather than resolving its constant value. This leaves both of these forbidden shapes invisible: `defineGate({ ...legacy, create() { ... } })` where `legacy` owns `run`/`scanRoot`, and `defineGate({ [RUN]() {}, ... })` where `RUN = "run"`. The first is especially load-bearing because TypeScript excess-property checking does not reject legacy fields introduced by a spread.

Concrete failure: a migration lane wraps a legacy descriptor with `defineGate`, spreads the old `run`/`scanRoot` fields into the direct object-literal argument, and sees its `gate:contract` row reach zero. The old hook still exists in the module even though the closed migration plan says all such fields are gone; a runtime that ignores the extra field silently drops that policy behavior at cutover.

Evidence produced against the committed inspector:

```text
$ node --input-type=module <<'NODE'  # in-memory ts-morph source; calls inspectGateContract
descriptor-spread       -> findings=[]
descriptor-computed-const -> findings=[]
NODE
```

The planted source for the first row was:

```ts
const legacy = { run() {}, ["scanRoot"]: () => true };
export const gate = defineGate({ ...legacy, create() { return { visitors: {} }; } });
```

This contradicts the design's direct-literal/no-indirection rule (`docs/design/gate-runtime-standardization.md:69`), zero-legacy acceptance (`:178`), and syntax-variant acceptance (`:181`). `GATE-AUTHORING.md` §5 requires static authored values to be resolved through the shared readers and unsupported shapes to fail closed. Expand same-file object spreads and computed constants through the shared static reader; report an unresolved spread/key rather than skipping it. Add planted spread, computed-constant, and unresolved/dynamic controls to `tests/tooling/verify/lib/gate-contract.test.ts`.

### P1 — `tooling/src/verify/lib/gate-contract.ts:243` — traversal and Project detection uses member/import text rather than symbol identity, producing both false cleans and false accusations

Direct walks are found only when the forbidden member is the immediate callee, and Project constructors are matched against a set of imported local names. No binding flow follows destructuring, local aliases, `.bind`/`.call`, computed constants, or other wrappers; `getSourceFileOrThrow` is absent from the source-lookup vocabulary. In the other direction, any unrelated method named `getSourceFiles` is reported, and a parameter shadowing an imported `Project` name is reported as the ts-morph constructor.

Concrete failure: a migrated gate writes `const { getSourceFiles } = ctx.project; getSourceFiles()` or `const Workspace = Project; new Workspace()`. Both forbidden operations survive a zero census. Conversely, a legal domain registry helper named `getSourceFiles` or a locally supplied constructor parameter named `Project` blocks the migration even though neither resolves to ts-morph.

Evidence produced in one in-memory inspector run:

```text
walk-aliases-and-wrappers -> findings=[]
project-alias             -> findings=[]
missing-source-file-or-throw -> findings=[]
walk-unrelated-method     -> [direct-walk]
project-shadow            -> [gate-owned-project]
```

The clean walk probe included a bound member, a property alias, a destructured `getSourceFiles`, a const-computed element access, and a cast-wrapped member call. The false-positive probes used `{ getSourceFiles() { return ["logical records"] } }.getSourceFiles()` and `function make(Project) { return new Project(); }` beneath a real `ts-morph` import. This contradicts the type-qualified ban in the design (`Project#getSourceFiles`, `SourceFile#getDescendants*`, and `new Project` at `docs/design/gate-runtime-standardization.md:91`) and its promised alias/computed/wrapper/shadow coverage (`:95-102`, `:181`). Resolve call/constructor origin through symbols and local binding aliases; treat a dynamic/unresolved origin conservatively, and add positive plus nearest-legal-negative controls for every supported spelling.

### P1 — `tooling/src/verify/lib/gate-contract.ts:265` — the module-state census loses mutations through local aliases and unsupported write forms, while method-name collisions are reported as proven mutation

The detector identifies only identifier-named top-level variables, then walks back from the immediate assignment/update/mutator receiver to that exact declaration. A local alias of a module object breaks the chain. So do const-computed mutator keys, non-null wrappers, `delete`, `Object.assign`, and `.add.call(...)`. The reverse is also unsound: calling any method named `add`, `set`, `sort`, and so on is classified as mutation even when that method returns a new immutable value and does not mutate its receiver.

Concrete failure: a legacy accumulator stays module-scoped as `STATE`; a helper binds `const alias = STATE` and mutates `alias.nested.add(...)`, or calls `Object.assign(STATE, ...)`. The command reaches zero even though state still survives across gate invocations and conformance examples. A pure module vocabulary object exposing immutable `add()` is meanwhile forced into `create` as if it were state.

Evidence produced against the committed inspector:

```text
module-mutation-aliases      -> findings=[]
module-mutator-false-positive -> [module-mutation on IMMUTABLE via add()]
non-null-wrappers            -> no module-mutation finding
caught-direct-mutations      -> four expected findings for assignment, ++, push(), and computed set()
```

The clean alias probe performed all of `alias.nested.add`, `STATE.nested[ADD]`, `delete STATE.count`, `Object.assign(STATE, ...)`, and `STATE.nested.add.call(...)`; none was reported. The direct positive shows the test harness itself was live rather than a vacuous zero. The design requires invocation-local state (`docs/design/gate-runtime-standardization.md:63`), stable binding resolution through writes (`:95`), and zero mutable module accumulators (`:178`). Follow local aliases/destructuring to the module declaration, cover the language's assignment/delete and known mutating-call shapes, and use symbol/type identity or an explicit fail-closed unresolved result instead of declaring mutation from a method name alone.

### P1 — `tooling/src/verify/ops/gate-contract.ts:16` — an empty corpus exits clean, so a broken glob can certify a completed migration

`runGateContract` derives its exit solely from `report.findings.length`; it never requires a non-zero module population or the closed 255-module denominator. `inspectGateContract([])` likewise returns `{ files: 0, findings: [] }`.

Concrete failure: the corpus directory is renamed, the glob is mistyped, or the command is driven with a wrong root. The tool prints `0 finding(s) across 0 gate module(s)` and exits 0, which is indistinguishable from the intended terminal migration state to automation or a reviewer reading the result.

Evidence produced through the real op:

```text
$ node --input-type=module -e 'import { runGateContract } from "./tooling/src/verify/ops/gate-contract.ts"; process.exitCode = runGateContract("/definitely-missing-orbweaver-root");'
gate-contract: 0 finding(s) across 0 gate module(s)
exit 0
```

This violates the design's missing/empty population refusal (`docs/design/gate-runtime-standardization.md:85`) and the repo's fail-loud scan-health rule (`GATE-AUTHORING.md` §1: a zero real-tree scan is tool error/exit 2). Require the expected non-zero corpus and fail with `EXIT.toolError` when discovery resolves zero modules; while the plan is explicitly closed at 255, also reconcile the discovered module count with the loader-derived migration manifest so a shrunken corpus cannot masquerade as progress.

### P2 — `tooling/src/verify/lib/gate-contract.ts:295` — a statically composed `*.baseline.json` path is invisible to the baseline-retirement census

`inspectBaselines` checks only `StringLiteral` and `NoSubstitutionTemplateLiteral` nodes whose individual bytes end in `.baseline.json`. It does not evaluate constant concatenation or template expressions even though those are statically knowable and the design assigns static string resolution to the shared reader layer.

Concrete failure: a gate retains a baseline reader under `const rel = "tooling/src/verify/gates/x.baseline" + ".json"`; the baseline survives, the census reports zero for that category, and the atomic cutover lands with the legacy ledger reader still present.

Evidence:

```text
$ node --input-type=module <<'NODE'  # inspectGateContract over one in-memory gate
const one = "tooling/src/verify/gates/a.baseline" + ".json";
baseline-concatenation -> {"files":1,"findings":[]}
NODE
```

The acceptance rule is no baseline JSON (`docs/design/gate-runtime-standardization.md:121`, `:182`) and the shared query boundary explicitly owns static string resolution (`:97`, `:102`). Evaluate ordered static strings through that shared reader, including const aliases, `+`, and template expressions; an unresolved path supplied to a baseline/resource reader must refuse rather than disappear.

### P2 — `docs/design/gate-runtime-standardization.md:28` — the design carries stale `scanRoot` and `run` denominators that contradict its own closed census

The rationale says 189 gates have `scanRoot` and 91 have a free-form `run`. The closed migration census later says 188 population predicates and classifies 86 run-only plus 13 mixed modules, i.e. 99 `run` hooks. The committed inspector confirms the latter values directly: 188 `scanRoot` legacy fields and 99 `run` legacy fields.

Concrete failure: a lane or owner uses the first inventory to size/close the population or run-hook waves and either searches for a nonexistent 189th predicate or declares the run migration complete with eight hooks still outstanding. The same active design offers two answers to the denominator its manifest is supposed to lock.

Evidence:

```text
$ node --input-type=module <<'NODE'  # aggregate inspectGateContract over the real 255-module corpus
{
  "scopeSafety": 255,
  "scanRoot": 188,
  "begin": 66,
  "run": 99,
  "finalize": 80
}
NODE
```

The live hook-shape derivation also returned 86 run-only and exactly the 13 tabled mixed modules. Reconcile lines 28-29 to 188 and 99 (or state a different unit if one was intended) so the design has one closed inventory.

## Verification and mechanically-enforced blockers

- Read in full: `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`, `Core-Laws-and-Precedents.md`, `Core-0-Architecture-and-Structure.md`, `Core-Tooling-Law.md`, `Core-Enforcement-Active-Gates.md`, `Spine-Testing.md`, `Spine-TypeScript-and-Patterns.md`, `tooling/src/verify/gates/GATE-AUTHORING.md`, all 11 files touched by `e8e829a3b..26ec2f7d3`, and the unchanged `_shared/ts-workspace.ts` seam. No touched-file region was omitted.
- `pnpm gate:contract` exited 1 with exactly 1,579 findings across 255 modules. Programmatic aggregation matched the design's category row exactly: 255 descriptor wrappers, 688 legacy fields, 436 direct walks/source lookups, 2 gate-owned Projects, 40 module `let`/`var` statements, 145 module mutations, and 13 baseline literals.
- `pnpm test:scoped tests/tooling/verify/lib/gate-contract.test.ts tests/tooling/verify/cli.int.test.ts --maxWorkers=4` passed 2 files / 33 tests with no type errors. The six inspector unit tests cover direct properties/calls/constructors/mutators/literals; the adversarial reproductions above show the missing syntax and identity controls.
- Whole-graph `ast-grep` sweeps for `inspectGateContract(...)`, `runGateContract(...)`, and `refuseVerbTail(...)` scanned 3,017 TS plus 588 TSX files. They found exactly two inspector call sites (the op and its unit-test helper), one real `runGateContract` dispatch from `cli.ts`, and one `refuseVerbTail` front-door call. `git diff --check e8e829a3b..26ec2f7d3` was clean.
- `pnpm check` completed and exited 1. Green: Biome, ESLint, all five type programs, execution membership, DB baseline, Drizzle, agent config, depcruise, Knip, and docs formatting. The full 255-gate structure log was read; its sole violation is `packages/client/src/features/config/components/config-list-collection-group.tsx` at 460 lines, a file outside this range and therefore not a finding here.
- Two static blockers belong to this range and are already mechanically caught: `ledgers:fresh` reports `tests/tooling/verify/lib/gate-contract.test.ts` missing from `docs/test-baseline/manifest.json`; `docs:catalog` reports `docs/design/gate-runtime-standardization.md` missing its receipt and `docs/catalog/catalog.json` stale. They are recorded here rather than counted as novel review findings because the gate battery already diagnoses them exactly.
- The worktree advanced from `26ec2f7d3` to docs-only `90575addc` while the whole-static run was active. The implementation/test bytes under review did not change; the static docs-catalog receipt covers the later design bytes as well as the range.

## Regions not reviewed line-by-line

None among the 11 touched files. The 255 existing gate modules were measured structurally and only `ratchet-row-integrity.ts` was read in full to adjudicate baseline-fixture behavior; this review did not re-review the policy logic of the existing gate corpus.

## Unconfirmed, low priority

None. Suspicions without an in-session reproduction were dropped.

## Issue summary

Gate-runtime standardization foundation stickler verdict: NOT MERGEABLE — 6 confirmed findings (4 P1, 2 P2), severity ceiling P1. The temporary census currently reproduces 255 modules / 1,579 findings, but confirmed descriptor, traversal/Project, module-state, baseline, and zero-population holes mean a terminal zero would not prove the closed migration complete; the design also carries stale 189/91 denominators against the measured 188/99 inventory. The static battery additionally catches the new test's missing monotonic-manifest row and the design's missing catalog receipt/catalog regeneration. Durable report: `docs/reviews/stickler/2026-09-05-gate-runtime-foundation.md`.
