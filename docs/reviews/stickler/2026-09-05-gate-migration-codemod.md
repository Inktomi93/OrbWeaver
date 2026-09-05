---
kind: review
status: active
updated: 2026-09-05
---

# Gate migration codemod — stickler review

Verdict: **NOT MERGEABLE.** Ten confirmed findings remain: four P1, five P2, and one P3. The valid `no-decorators` path converts, loads through the final policy loader, and reports a planted decorator, but the codemod accepts gates the authoritative migration reports explicitly block, admits several final-runtime-forbidden source shapes, can write through a repository symlink, and can leave an apply half-written.

Scope: commit `bc9e982c2` on `codex/gate-migration-codemod`, reviewed in `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/codex-gate-migration-codemod`. Production code was not edited. Scratch probes lived only under the gitignored `reports/stickler/scratch/` tree.

## Confirmed findings

### P1 — `tooling/src/codemod/lib/gate-migration.ts:13` — manifest membership is self-asserted, so the command converts policies the authoritative reports classify as semantic-manual

The exact manifest schema contains `id`, destination metadata, and an optional proof path, but no eligibility class, evidence reference, or source digest. `migrateGates` consequently loops over every caller-supplied entry at lines 566–571 and treats a shallowly compatible descriptor as authorized. A user-supplied manifest is the intended interface; the absence of a checked-in manifest is not the defect. The defect is that the same untrusted input chooses which source has been mechanically proven.

Concrete failure: a migration manifest nominates `fetch-fn-in-features`, `discovery-no-stats-rollups`, `db-enum-from-tuple`, or `no-static-staletime`. Each converts successfully even though the checked-in reports require, respectively, canonical global-fetch, DB-symbol-origin, static Drizzle tuple, and TanStack static-value facts before conversion. The resulting policy preserves a spelling-based detector the destination program exists to remove, so aliases, shadows, wrappers, or unresolved values can still false-green behind the new descriptor.

Evidence produced this session:

```text
$ pnpm exec tsx reports/stickler/scratch/gate-codemod-probes.ts
SEMANTIC_MANUAL converted=true
SEMANTIC_discovery-no-stats-rollups converted=true
SEMANTIC_db-enum-from-tuple converted=true
SEMANTIC_no-static-staletime converted=true
```

The authority receipts are `docs/reviews/gate-runtime/simple-visitors-a-m.md:67,75-84` and `docs/reviews/gate-runtime/simple-visitors-n-z.md:61`: those rows say these gates are blocked/semantic-manual. The closed mechanical set is 14 gates, not the builder handoff's unsupported “15/69”: A–M names four at `simple-visitors-a-m.md:84`; N–Z contains ten exact `codemod-mechanical` rows at lines 39, 40, 43, 49, 72, 75, 78, 82, 93, and 97. The apparent fifteenth is `no-raw-interactive-intrinsics` at `simple-visitors-n-z.md:57`, whose cell says **“codemod plus grant migration”** and whose same row states `visitor + begin/finalize; burn-down`. The real-file probe refused it (`NO_RAW_INTERACTIVE converted=false`). The number 69 at `simple-visitors-n-z.md:13-23` is only the N–Z visitor intersection, not an A–Z mechanical denominator.

The manifest does not contain enough information to enforce eligibility: adding a caller-authored `conversion:"mechanical"` assertion would merely move the same trust decision into another self-asserted field. This temporary codemod can carry a closed `id -> expected source digest` table for the 14 authoritative rows, optionally with the report citation for diagnostics, and delete that table with the migration command at cutover. That is an execution-time evidence fence, not a second permanent policy registry. This violates the design's instruction that shared-reader consolidation precede gate conversion and that no gate is credited by existence alone (`docs/design/gate-runtime-standardization.md:95-106,148-156`).

### P1 — `tooling/src/codemod/lib/gate-migration.ts:350` — the source-shape check is narrower than the existing migration contract and accepts direct walks, private Projects, resource/marker/baseline machinery, and mutable module state

`hasTopLevelMutableAccumulator` recognizes only nine dotted mutator names on a direct identifier receiver. The conversion never invokes the already-built gate-contract analysis, whose source-shape arms cover ts-morph walks, gate-owned Projects, stable binding mutation, and baseline expressions (`tooling/src/verify/lib/gate-contract.ts:213-228,250-303`). Descriptor fields such as `fsBacked` and `begin` are refused, but equivalent source behavior remains admissible when it is expressed in ordinary code.

Concrete failure: an otherwise shallow visitor calls `node.getDescendants()`, constructs a private `Project`, reads the filesystem directly, owns an `@orb-gate-ignore` parser or `*.baseline.json` path, or mutates a module array with `pop()`. The command writes every one as a final policy even though the final design bans local walks, workspace Projects, resource loaders, gate-specific exemption grammar, baselines, and module state. An approved gate that changes after its census can therefore cross the destination boundary without a refusal.

Evidence:

```text
$ pnpm exec tsx reports/stickler/scratch/gate-codemod-probes.ts
DIRECT_WALK emitted=true
PRIVATE_PROJECT emitted=true
BASELINE_READER emitted=true
MARKER_PARSER emitted=true
FILESYSTEM_READER emitted=true
TOP_LEVEL_MUTABLE emitted=true
```

The specific `pop()` miss is visible in the code: `MUTATING_METHODS` at line 17 omits `pop`, `reverse`, `fill`, and `copyWithin`, while the established contract includes them at `tooling/src/verify/lib/gate-contract.ts:26-35` and also resolves aliases/standard-library ownership. Enforce the final source contract on each exact pre-migration file, and bind it to the eligibility digest so a post-review source change cannot reuse stale approval. This violates the final query/resource/authority boundary (`docs/design/gate-runtime-standardization.md:63-66,93-108,118-134,148-152`).

### P1 — `tooling/src/codemod/lib/gate-migration.ts:542` — a symlinked gate path writes outside the declared repository root

The plan declares `sourceFile.getFilePath()`, and the runner's path guard normalizes the lexical path only (`tooling/src/codemod/lib/plans.ts:64-72`). Neither boundary resolves the physical target or rejects a symlink. ts-morph retains the in-root symlink identity and saves through it.

Concrete failure: `tooling/src/verify/gates/sample-gate.ts` is a symlink to a file outside `repoRoot`. `--apply` previews one declared in-repo gate and reports success, while the bytes actually overwritten belong to the external target. This defeats both the repo containment guard and the touched-file declaration.

Evidence:

```text
$ pnpm exec tsx reports/stickler/scratch/gate-codemod-probes.ts
SYMLINK outcome=accepted targetChanged=true
```

The probe used a temp repo root under `reports/stickler/scratch/` and a target beside, not inside, that root. Reject any symlink in the gate path chain or compare `realpath` for both root and target before planning and again before saving. The kit contract promises that plans declare every path they may modify (`tooling/src/codemod/contract/types.ts:94-104`) and that codemod helpers refuse outside-repo writes (`tooling/src/codemod/lib/plans.ts:61-72`).

### P1 — `tooling/src/codemod/lib/run.ts:242` — multi-file apply is not atomic and has no rollback after a save failure

All in-memory validation happens before the write, but `project.saveSync()` persists dirty source files sequentially. There is no staging area, transaction, or restoration of snapshots if a later write fails.

Concrete failure: two declared gates are transformed; the first saves, the second hits an I/O failure. The command exits as a tool error after leaving the first gate converted and the second legacy, exactly the mixed runtime state the atomic migration forbids. Retrying may then take the weak migrated-no-op branch described below, so the partial state is not self-healing.

Evidence:

```text
$ pnpm exec tsx reports/stickler/scratch/gate-codemod-probes.ts
PARTIAL_SAVE outcome=refused:EISDIR: illegal operation on a directory, open '.../partial-save/z.ts'
             firstFile="export const a = 2;\n"
```

The probe declared and changed `a.ts` and `z.ts`, then made `z.ts` unwritable as a file before commit. `a.ts` was already changed on disk when `saveSync` threw. Stage every output first and restore the captured originals on any commit failure, with a planted two-file failure test. This violates the design's atomic-cutover guarantee (`docs/design/gate-runtime-standardization.md:144-156`) and the runner's “abort means no writes” contract (`tooling/src/codemod/lib/run.ts:217-223`).

### P2 — `tooling/src/codemod/lib/gate-migration.ts:146` — context rewriting recognizes only direct dotted calls and emits invalid final API calls for other legal legacy references

The guard inspects `PropertyAccessExpression` nodes only, then performs a text substitution for `.report(`. An element access, destructured report, context passed to a helper, optional call, or non-literal explicit finding bypasses the capability check. The context identifier is still renamed, so the output calls the final `report` object as though it were the old function.

Concrete failure: `ctx["report"](node)` becomes `policyContext["report"](node)`. The final context defines `report` as `{node,file}` (`tooling/src/verify/contract/policy.ts:50-55`), so the converted gate throws on its first finding instead of reporting it. `--no-diagnostics-check`, intentionally supported for the atomic train, writes the broken result.

Evidence:

```text
$ pnpm exec tsx reports/stickler/scratch/gate-codemod-probes.ts
ELEMENT_REPORT emittedBroken=true
```

Reject every reference to the bound legacy context except an AST-proven direct `ctx.report(node[, tokenDetails])` call, including refusing identifier arguments and element/optional/destructured forms unless each has its own semantics-preserving rewrite. The existing test at `tests/tooling/codemod/ops/migrate-gates.test.ts:55-89` covers only the dotted direct-call spelling.

### P2 — `tooling/src/codemod/lib/gate-migration.ts:519` — preflight validates stand-ins instead of the emitted message, fix, kinds, and visitor hook

The converter copies `message`, `fix`, and `kinds` text into the output, but the validation object at lines 525–540 substitutes `"migration validation"` and `[SyntaxKind.Identifier]` and uses an unrelated no-op visitor. It therefore proves the manifest and proof rows, not the descriptor it will write.

Concrete failure: a legacy descriptor with `kinds: []` is accepted and written. The final runtime then rejects the emitted hook because visitors require a nonempty, unique, in-range `SyntaxKind` array (`tooling/src/verify/lib/policy-validation.ts:190-210`). An empty or control-bearing message follows the same false-preflight path.

Evidence:

```text
$ pnpm exec tsx reports/stickler/scratch/gate-codemod-probes.ts
INVALID_KINDS emittedEmpty=true finalRuntimeRefuses=true
```

Validate the actual extracted values before constructing the edit, or parse/import the staged emitted module through the final loader in a temp root before commit. The final contract requires every byte and hook shape to pass runtime validation (`docs/design/gate-runtime-standardization.md:38-73`).

### P2 — `tooling/src/codemod/lib/gate-migration.ts:387` — the idempotence check treats an unbranded local `defineGate` lookalike with invalid hooks/proofs as already migrated

`migratedIsNoop` checks only callee text, the direct object-literal key set, and manifest metadata. It does not resolve `defineGate` to the Verify contract, validate values, validate `create()`, or require nonempty proofs. The final loader does all of those at `tooling/src/verify/lib/policy-loader.ts:27-45`.

Concrete failure: a file declaring its own `function defineGate` and returning `{create(){return {}}, mustFlag:[], mustPass:[]}` prints “Applied 0 plan(s). Wrote 0 file(s)” and exits clean. At cutover the final loader rejects it as unbranded, but the migration has already certified it as complete.

Evidence:

```text
$ pnpm exec tsx reports/stickler/scratch/gate-codemod-probes.ts
FALSE_NOOP unchanged=true localDefineGate=true
```

Make idempotence compare against a canonical output fingerprint or load the existing descriptor through `loadPolicyCorpus` and verify it is branded, exact, and behaviorally valid before returning no plan. This violates the direct, branded, exactly-one `defineGate` descriptor rule (`docs/design/gate-runtime-standardization.md:69-73`).

### P2 — `tooling/src/codemod/lib/gate-migration.ts:165` — the rewrite deletes load-bearing descriptor comments and can alter string/comment bytes inside shorthand visitor bodies

The descriptor is rebuilt from selected initializer text at lines 519–523, so comments between legacy properties disappear. The shorthand path then calls `replaceAll` over the entire body string at line 175, rather than replacing only the previously identified AST call span; any comment or string containing the same `ctx.report(` spelling is rewritten too.

Concrete failure: the report-authorized `no-caller-user-id` conversion deletes its in-descriptor “Pinned to packages+tests” rationale. A shorthand visitor containing a diagnostic string and explanatory comment with `ctx.report(node)` changes both to `ctx.report.node(node)`, altering user/operator text unrelated to the API migration.

Evidence:

```text
$ pnpm exec tsx reports/stickler/scratch/gate-codemod-probes.ts
NO_CALLER_COMMENT preserved=false
SHORTHAND_TEXT quoteChanged=true commentChanged=true
```

Apply AST-anchored replacements to the exact context call and descriptor properties while retaining leading/trailing trivia. The valid real `no-decorators` conversion showed that message/template proof bodies and the final visitor can survive; the defect is the unpreserved trivia and whole-body textual post-pass. This conflicts with the repository's rule that file comments hold present constraints and must be read/preserved at their seam (`docs/architecture/core/AGENTS.md:1-10`; `.claude/agent-doctrine.md` “Verify before building”).

### P2 — `tooling/src/codemod/lib/gate-migration.ts:52` — the “exact” JSON schema silently accepts duplicate object keys

`JSON.parse` collapses duplicate members before `exactKeys` runs, so the validator cannot know that the source manifest was ambiguous.

Concrete failure: a reviewed manifest contains `"version":2,"version":1` or two conflicting `analysis`, `population`, or `execution` members. The last spelling wins and the conversion proceeds, even though another reader or reviewer may have acted on the first value. Duplicate ids are correctly refused; duplicate JSON keys are not.

Evidence:

```text
$ pnpm exec tsx reports/stickler/scratch/gate-codemod-probes.ts
MANIFEST duplicate-json-key ACCEPTED
```

Use a JSON parse tree that preserves member occurrences and reject duplicate keys at every object level before materializing values. The same probe confirmed unknown entry keys, duplicate ids, and `../` proof-path traversal are refused.

### P3 — `tooling/src/codemod/cli.ts:49` — `--max-output-lines` is parsed and removed before `migrate-gates`, but never forwarded to its preview runner

The global CLI resolves `maxOutputLines`, then calls `migrateGatesOp(tail)` with only the remaining arguments. The op passes no `maxOutputLines` option at `tooling/src/codemod/ops/migrate-gates.ts:40-47`, so `runCodemod` falls back to 200 regardless of the operator's value.

Concrete failure: `pnpm codemod --max-output-lines=5 migrate-gates manifest.json --no-diagnostics-check` emits a 14-line preview without the required overflow file/banner. On the real 14-file wave, a bounded operator/agent view can therefore truncate the migration evidence the knob promised to preserve.

Evidence:

```text
$ pnpm exec tsx reports/stickler/scratch/gate-codemod-probes.ts
MAX_LINES status=0 truncated=false stdoutLines=14
```

Pass the resolved value into `migrateGatesOp` and then `RunCodemodOptions.maxOutputLines`; add a CLI assertion that a deliberately over-budget migration prints the repeated overflow pointer.

## Verified clean

- Read all ten touched files in full: `tests/tooling/codemod/cli.int.test.ts`, `tests/tooling/codemod/ops/migrate-gates.test.ts`, `tooling/src/codemod/cli.ts`, `contract/gate-migration.ts`, `index.ts`, `lib/gate-migration.ts`, `ops/manifest.ts`, `ops/migrate-gates.ts`, `ops/recipes.ts`, and `tooling/src/verify/index.ts`.
- Read the depended-on codemod runner/contract files in full: `contract/types.ts`, `lib/run.ts`, `lib/project.ts`, `lib/plans.ts`, `lib/errors.ts`, and `lib/diagnostics.ts`. Read the final Verify policy contract and front door in full, plus `policy-validation.ts`, `population-resolver.ts`, `policy-loader.ts`, `policy-pass.ts`, `policy-pass-context.ts`, `contract/policy-pass.ts`, the legacy descriptor/loader, and the temporary gate-contract/origin implementation. The codemod's cross-tool imports enter only through `#verify`; `rg -n '#verify|verify/(contract|lib|ops)' tooling/src/codemod tests/tooling/codemod` returned only the three sanctioned `#verify` imports. The generated gate's same-tool `../contract/policy.ts` import loaded successfully in the final-runtime probe.
- Read the governing doctrine, constitution, D-ledger redirect, Core-0, Core-Tooling-Law, Spine-Testing, `GATE-AUTHORING.md`, `gate-runtime-standardization.md`, and both simple-visitor reports. The checked-in reports, not the builder's summary, establish 4 A–M plus 10 N–Z mechanical gates. `no-raw-interactive-intrinsics` is the count error described above.
- Focused behavior: `pnpm test:scoped tests/tooling/codemod/cli.int.test.ts tests/tooling/codemod/ops/migrate-gates.test.ts tests/tooling/codemod/index.int.test.ts --maxWorkers=4` produced 29 passes, no type errors, and one five-second timeout in the pre-existing three-spawn help test while the 45-second migration suite ran beside it. Per load doctrine that combined timeout was a non-verdict. A quiet `pnpm test:scoped tests/tooling/codemod/cli.int.test.ts --maxWorkers=1` rerun passed all 8 tests; the first run's migration 7/7 and runner 15/15 were already green.
- The focused tests prove default dry-run writes nothing, explicit apply writes the declared file, a valid repeat is an idempotent zero-plan run, unknown/duplicate/conflicting flags are misuse, manifest unknown keys and duplicate ids are refused, missing `id`-named files are refused, and changed manifest metadata is refused. `tests/tooling/codemod/index.int.test.ts` also proves direct undeclared in-memory mutations are refused before any write.
- The scratch diagnostics control proved default apply refuses TypeScript diagnostics and leaves the source unchanged, while explicit `--no-diagnostics-check` applies. The invalid-`kinds` finding is independent of that opt-out because an empty array is type-correct and fails only final runtime validation.
- The real `no-decorators.ts` source converted using an explicit P9 population and default proof path. `loadPolicyCorpus` loaded exactly one branded final policy, and `runPolicyPass` over a planted decorated class produced one finding and `blocking=1`. This exercised the method-form visitor, proof string-to-map conversion, destination import, filename/id equality, final hook validation, and actual final dispatcher.
- Explicit lifecycle/resource controls: the committed suite refuses descriptor spreads, computed keys, `begin`, `fsBacked`, resource analysis, empty `why`, and missing proof paths. The real `no-raw-interactive-intrinsics` file also refused. The gaps are the equivalent source-code shapes in findings 1–2.
- Structural call-site sweeps used ast-grep over both language modes: 3,041 TS and 588 TSX files. `migrateGates`, `parseGateMigrationManifest`, and the named `runCodemod("migrate-gates", …)` invocation have the single live production call path in `ops/migrate-gates.ts`; no additional caller bypass was found. `git diff --check bc9e982c2^ bc9e982c2` passed.
- The plan and error ordering are deterministic for a fixed manifest: entries execute in manifest order, proof rows retain array order, and errors stop before save. The committed strict argv cases and the scratch unknown/duplicate/path controls were stable across repeated runs.

## Explicit exclusions

- Per the review brief, I did not run `pnpm check`, `pnpm check:structure`, `pnpm gate:contract`, a full typecheck, the full node suite, CT, or e2e. No rendered surface is touched.
- I did not independently full-read all 255 legacy gate modules. Eligibility judgments use the two durable, closed simple-visitor reports as the authority. The scratch command converted four report-classified semantic-manual real files to prove the boundary failure; it did not re-adjudicate those policies' complete semantics.
- The resource-host migration report and unrelated enforcement-catalog rows were outside this commit's conversion code and were not used to claim mechanical eligibility.

## Unconfirmed, low priority

None. Suspicions not reproduced or contradicted by the final runtime, focused suites, or scratch controls were dropped.

## Issue summary

Gate migration codemod `bc9e982c2` is not mergeable: 10 confirmed findings, severity ceiling P1. It correctly converts and executes real `no-decorators`, but user-supplied manifests are not bound to the authoritative 14 mechanically approved gates, final-runtime-forbidden source shapes pass the shallow filter, symlink paths escape the repository, multi-file apply can leave partial writes, and six descriptor/CLI exactness defects remain. Full review: `docs/reviews/stickler/2026-09-05-gate-migration-codemod.md`.
