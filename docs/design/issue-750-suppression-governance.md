---
kind: design
status: active
updated: 2026-08-26
---

# Issue 750 — suppression governance scope

## Verdict

The active suppressions gate and its baseline generator share one exported repository-relative typed-source predicate. Its governed set is `packages/*/src/**/*.{ts,tsx}`, `tooling/src/**/*.{ts,tsx}`, and `scripts/**/*.{ts,tsx}`, excluding the captured foreign runtime at `scripts/probes/st-goldens/sillytavern-runtime/**`. Tests, generated captures, fixtures, and prose remain outside the budget unless they are authored source under one of those roots.

The detector accepts only exact suppression directive tokens at a comment opener. `biome-ignore-start` and `biome-ignore-end` are first-class tokens shared with the rule parser; prose and string mentions do not count. The old detector did not completely miss start/end: its unanchored `biome-ignore` alternative matched their prefix accidentally. That implicit partial match is replaced rather than preserved.

The census is produced by the same TypeScript/TSX project and `suppressionSites` detector as enforcement, partitioned by governed root and language with scanned-file counts. Raw grep totals are discovery evidence only and never become baseline budgets.

## Policy disposition

| policy | disposition |
| - | - |
| `lint/performance/useTopLevelRegex` | retire in Biome, assert the off-state in config tests, delete its four dead markers, and remove it from active-gates law |
| `lint/security/noSecrets` | remain globally off; delete all dead markers, its ratification row, and generated baseline residue |
| `lint/suspicious/noUnnecessaryConditions` | keep active with its exact cross-package narrowing reason |
| `lint/nursery/useNullishCoalescing` | keep active with its exact boolean-default reason |
| `lint/complexity/noExcessiveCognitiveComplexity` | keep active with its exact cohesive-fold reason |
| `lint/style/useErrorCause` | keep active with its exact constructor-analysis reason |
| `scripts/probes/st-goldens/**` naming markers | governed authored source; retain only markers whose narrower Biome override makes them live, then ratify their rule class honestly |

No universal allowlist or blanket debt allowance is added. Existing exact rule-class reasons remain the admission vocabulary; newly governed classes either receive a specific standing reason or their stale marker is removed.

## Coupled sites

| responsibility | coupled sites |
| - | - |
| governed source set | `tooling/src/verify/gates/suppressions.ts`; `tooling/src/verify/ops/gen/suppressions.ts`; `tooling/src/_shared/ts-workspace.ts` |
| detector and policy | suppression descriptor controls; `tests/tooling/suppressions.residual.test.ts`; generated suppression baseline |
| retired/dead rules | `biome.json`; affected TS/TSX marker sites; suppression ratification table; active-gates law |
| gate contract | descriptor `docRow`, scan root, missing/stale diagnostics, must-flag/must-pass controls, `Core-Enforcement-Active-Gates.md` |
| configuration proof | `tests/tooling/async-policy-config.int.test.ts` |
| authored design | docs catalog design lane, receipt, generated catalog/state |

Widening the shared TypeScript harness is limited to adding scripts and TSX parity; every gate still applies its own `scanRoot`. The generator uses the same workspace and exported predicate instead of the package-only baseline helper.

## Rejected alternatives

- Copying three path regexes into the gate and generator was rejected because scope drift caused this defect; one predicate owns inclusion and foreign-runtime exclusion.
- Budgeting raw `rg` matches was rejected because comments, strings, tests, and captured code are different semantic populations.
- Treating the accidental prefix match as start/end support was rejected because it does not prove an exact directive-token contract and admits prose mentions.
- Excluding all `scripts/probes/st-goldens/**` was rejected because the generator is authored governed TypeScript and a narrower Biome override re-enables naming enforcement there; only the captured runtime is foreign.
- Retiring the four behavior-sensitive rules was rejected by the owner ruling. Exact-site reasons preserve intentional semantics without making future suppressions free.
- A universal baseline or rule allowlist was rejected because it converts the gate from an ownership check into syntax-budget ceremony.

## Proof plan

1. On the pre-fix implementation, plant one real directive under each of `tooling/src` and `scripts`; prove the real gate remains green, then remove both plants.
2. Add config and residual assertions first. Preserve red results for `useTopLevelRegex`, newly governed roots, exact start/end tokens, prose/string mentions, captured-runtime exclusion, and missing/stale baseline entries.
3. Add descriptor controls for both new roots, start/end, fixture strings, authored golden source, captured generated source, and tests. Every must-flag plant must fail enforcement; every must-pass plant must remain clean.
4. Delete dead markers and regenerate the baseline only through the detector-equivalent generator. Record TS and TSX scanned counts plus site/rule/admission partitions in this design after the implementation settles.
5. Run the real gate clean and with a planted governed violation, gate conformance, focused residual/config tests, tooling typecheck, and scoped Biome/ESLint. The merge train owns whole-tree/static/hooks verification.

## Census receipt

Pending implementation. Final counts will name the invocation, scanned TS/TSX files for each governed root, directive sites, rule classes, admitted sites, and baseline-debt sites. A count without those partitions is not a budget receipt.
