---
kind: review
status: active
updated: 2026-09-05
---

# Final policy planner and CLI integration

## Outcome

The final policy runtime now has one strict command parser, one deterministic planner, and one executor seam through the existing `@orb/tooling/verify` front door. The implementation is based on confirmed integration tip `073520068` and consumes the reviewed six-kind `PolicyScopeResolution`, the discriminated `defineGate` corpus, compiler membership, and an externally resolved exact resource-path manifest. It does not add a CLI entrypoint, registry, path table, scope predicate, legacy adapter, or gate conversion.

The current `pnpm check:structure` command, legacy gate corpus, run manifest, `reports/check-structure.json`, and `pnpm check:show` remain unchanged. Activating the final runtime at that door belongs to the atomic fleet conversion in [gate-runtime-standardization.md](../../design/gate-runtime-standardization.md).

## Delivered interface

| Home | Responsibility |
| - | - |
| `tooling/src/verify/contract/policy-plan.ts` | Parsed commands, roster rows including warning work-item ownership, planned policy populations, compiler/resource manifests, and execution result shapes |
| `tooling/src/verify/lib/policy-command.ts` | Strict argv grammar for tier, six scopes, check/family selection, strict scope, warning promotion, list/explain, and JSON mode |
| `tooling/src/verify/lib/policy-plan.ts` | Loaded-corpus validation, deterministic selection and inspection, requested/effective population planning, strict defer/refusal, pass execution, population reconciliation, and exit classification |
| `tooling/src/verify/contract/policy-pass.ts` | Planner-owned owner disposition and exact-population input for coordinated dispatch |
| `tooling/src/verify/lib/policy-pass.ts` | Applies and validates the planner disposition before any policy hook runs; direct/conformance callers retain the existing derivation path |
| `tooling/src/verify/index.ts` | The existing programmatic front door for parser, scope, loader, planner, pass, and executor |
| `tooling/src/verify/contract/stage.ts` | The single tier vocabulary shared by the live stage runner and final policy planner |

`planPolicyArgv` is the CLI composition seam: parse argv, resolve its exact `PolicyScopeResolution`, then plan against the loaded corpus. `executePolicyPlan` runs that plan through `runPolicyPass`; the pass constructs and binds the production `ResourceHost` once per invocation. Execution refuses when the supplied Project resolves a different population than the plan.

## Behavioral proof

The initial approved skeleton compiled but refused planning. Red-first run `b1b7b5` produced 25 expected failures and one independent exit-class pass with zero type errors. A second planted control exposed duplicate pass-facing paths when Git carried both deleted and added identities for one replacement: the focused run produced 1 failure and 14 passes before `requestedPaths` became a normalized set while the semantic manifest retained both rows.

The preliminary cold review refuted the first committed candidate: strict scope classified an entire-population policy as skipped when its only in-population identity was deleted or renamed outside the population. Two planted cases failed before the repair. Planning now tests current and prior semantic identities against the source/resource population, defers the relevant entire-population owner, and keeps an explicit non-source same-root control skipped.

The warm combined review found the executor still let `runPolicyPass` reclassify that planned defer as an empty-intersection skip. The planted execution check failed for both deleted and rename-out cases. The dispatcher now consumes the planner's exact population and owner disposition, refuses plan-versus-dispatch disagreement before hooks, and returns the planned defer reason byte-for-byte.

The focused suites cover:

- whole, changed, file, folder, package, and project scope parsing;
- add/delete/replacement/rename semantic identity and compiler ownership handoff;
- exact check and family selection, duplicate/unknown/ambiguous refusal, and deterministic diagnostics;
- selected-file execution, entire-population deferral, and strict-scope refusal;
- warning work-item ownership, visibility, and opt-in promotion;
- exact requested/effective source and resource manifests;
- production `ResourceHost` acquisition and receipt binding;
- plan-versus-Project population mismatch refusal;
- deterministic list/explain JSON data;
- stable clean/violation/tool-error/misuse exit classes.

## Preserved contracts

- `pnpm verify --list` remains the stage registry and derives its tiers from the same tuple used by final policy parsing.
- The existing bare `--static`, `--push`, and `--full` spellings remain accepted by the stage parser; the final parser accepts them too.
- `runPolicyPass` remains the only final policy dispatcher and the only owner of context-bound `ResourceHost` composition.
- Full semantic scope identity stays on `PolicyRunPlan.requestedPaths`; the pass-facing `PolicyPopulationReceipt.requestedPaths` remains the normalized string set its contract requires.
- A planning or scope failure is exit 2, malformed/ambiguous argv or strict-scope refusal is exit 3, completed findings are exit 1, and a clean completed pass is exit 0.

## Verification

| Command | Result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/lib/policy-command.test.ts tests/tooling/verify/lib/policy-plan.test.ts --maxWorkers=4` | 44/44 focused parser/planner/executor tests green |
| `pnpm test:scoped tests/tooling/verify/lib/policy-pass.test.ts tests/tooling/verify/lib/policy-plan.test.ts --maxWorkers=4` | 42/42 dispatcher/planner coordination tests green |
| `pnpm test:scoped tests/tooling/verify/ops/run.int.test.ts --maxWorkers=4` | 56/56 live stage-planner compatibility tests green |
| `pnpm test:scoped tests/tooling/verify/cli.int.test.ts --maxWorkers=4` | 27/27 CLI help/refusal tests green under the 512 MB adversarial ceiling |
| `node scripts/ts7.cjs --noEmit --pretty false -p tooling/tsconfig.json` | Green |
| `node scripts/ts7.cjs --noEmit --pretty false -p tsconfig.json` | Green |
| `pnpm exec biome check <touched source and tests> --diagnostic-level=error` | Green |
| `pnpm exec eslint --max-warnings 0 <touched source and tests>` | Green after the final authority integration |

## Remaining atomic cutover seams

- Do not point `tooling/src/verify/cli.ts structure` at `loadPolicyCorpus` until the gate fleet is converted. The final loader correctly refuses the current legacy descriptors.
- The descriptor-to-resource population resolver remains external foundation work. The planner accepts only an exact `resourcePathsByPolicy` manifest and does not guess paths or expose a callback escape hatch.
- The cutover must map final owner/authority/tool-error/population/timing data into the existing structure run manifest and JSON schema, then update `check:show` in place. No second artifact or reader was added here.
- Global test/catalog baselines were intentionally not regenerated. The parent merge train owns their one-time reconciliation after all #1584 lanes drain.
- Whole-tree structure, full test, differential, performance/RSS, and cutover acceptance remain parent responsibilities; this report claims only the planner/CLI interface and its focused behavioral proof.
