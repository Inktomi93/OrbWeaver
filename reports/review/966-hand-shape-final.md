# 966 hand-shape gate: final lane delivery

## Outcome

`test-hand-shape` judges direct production-boundary association (Codex candidate `affa11ba8d`) and now reports coverage through the shared 1016 API. Every direct site is `supported` or `unknown`; an UNKNOWN is never a finding. The two obsolete `copies:` grants are deleted, not retargeted, and the application budget is zero. The calibrated overlap matcher has no caller left and is deleted. Qualification of the whole population is still owed (one focused structure run, requested below).

This subset does not close item 954's global shape-reader equivalence requirement.

## Integration

- Branch started at main `dd3b710c42`, reset to `affa11ba8d`, merged `dd3b710c42` with no conflicts (merge commit `d9b10065e0`).
- The merge's pre-merge-commit hook failed `types:native` only on root `tsconfig.json`, in `scripts/probes/**` and `tests/legacy/**/_support.ts`. Those files are byte-identical to main (`git diff --cached dd3b710c42 -- scripts tests/legacy` empty), so the red is inherited. The merge was committed with `LEFTHOOK_EXCLUDE=check`.

## Changes

| Path | Change |
| - | - |
| `tooling/src/floor/code-facts/shape-association.ts` | A value union is judged by its constituents (already captured by `node-types`); a union with no handwritten constituent is unassociated, one with a handwritten constituent is UNKNOWN. An erased value (`any`, `unknown`, type parameter) is unassociated only when the boundary resolves to whole named declarations with no production owner; otherwise UNKNOWN. Boundary resolution is one helper. |
| `tooling/src/floor/code-facts/shape-association-contract.ts` | `SHAPE_ASSOCIATION_UNKNOWN` holds every UNKNOWN reason; the unknown read carries only its typed reason. |
| `tooling/src/verify/gates/test-hand-shape.ts` | `ctx.report.analysis(site.value, …)`: `supported` for every judged site (finding or acquittal), the reader's `unknown` otherwise. Header and fix text updated. |
| `tooling/src/verify/lib/reviewed-grants-test-hand-shape.ts` | Deleted with its barrel import and spread in `reviewed-grants.ts`. |
| `tooling/src/verify/lib/waiver-budget.ts` | `test-hand-shape` application row removed (an absent row is zero). |
| `tooling/src/verify/lib/contract-structural-copy.ts` | `bestOverlapMatch`, `OVERLAP_FLOOR` and `DRIFTED_TYPE_ALLOWANCE` deleted: the gate was their only production caller (item 966 done: "the calibrated overlap threshold is gone"). Header no longer names this gate. |
| `tests/support/node/chat/tape.ts` | `ErrorOptions` derives as `Partial<Pick<ProviderErrorInit, "kind" \| "message" \| "retryable" \| "apiErrorStatus">>`. |
| `docs/law/Spine-Testing.md` §10 | The `test-hand-shape` sentence states the direct-boundary claim and UNKNOWN reporting. |
| `docs/law/Core-Enforcement-Active-Gates.md` | Own row only: family is `—` (singleton), matching `active-gates-index.ts` rendering of `family === id`. |
| `tests/tooling/verify/gates/test-hand-shape.test.ts` | New: coverage and authority through `runPolicyPass`. |
| `tests/tooling/floor/code-facts/shape-association.test.ts` | New union/erased-value control. |
| `tests/tooling/floor/code-facts/shape-copy.test.ts` | Overlap column removed with the matcher. |

## Why the reader changed

A literal wiring of the candidate reader reports almost every `boolean` or `string | undefined` argument in the test tree as UNKNOWN. A throwaway in-process sample over real test files with the production reader measured:

| Reader | Files sampled | Sites | UNKNOWN |
| - | - | - | - |
| candidate | 74 | 12,006 | 924 (473 primitive unions, 318 object unions, 128 `any`/`unknown`, 3 boundary, 2 union carrying a hand) |
| final | 74 | 12,006 | 130 |
| final | 222 | 34,462 | 335 (110 live, 225 legacy) |

Projected over the tree's tests (sites per file held constant), the candidate would emit about 55,000 UNKNOWN lines and the final reader about 6,700. Each refinement only converts an UNKNOWN to supported where no handwritten declaration can cross, so no finding is lost and no erased identity is called clean. The remaining UNKNOWNs are mostly `any`/`unknown` values at production-typed or opaque boundaries; about two thirds sit in `tests/legacy/`.

## Grants and budget

Both rows are obsolete under the direct-boundary claim (source adjudication in the candidate's `966-shared-relation-delivery.md`): `tape.ts` builds a fresh `ProviderError` argument from read fields, and `app-blocking-receipt.ts` has no production type import. Neither was retargeted to `boundary:`.

## Evidence

| Command | Result |
| - | - |
| `pnpm test:scoped tests/tooling/floor/code-facts/shape-association.test.ts` on candidate reader | red-first: the new union/erased control failed (all six sites UNKNOWN `erasedValue`) |
| same, final reader | 5/5 pass |
| `pnpm test:scoped tests/tooling/verify/gates/test-hand-shape.test.ts` with the source changes reverse-applied | red-first: coverage `analysis` undefined; real table raised two stale grants and a budget-2 fall |
| batch: shape-association, test-hand-shape, test-hand-shape-native.int, tests-run-the-product.suite, shape-copy, shape-consumers.suite, native-shape-delivery.int, reviewed-grants, waiver-ratchet | 36/38 pass; the 2 reds reproduce on exact parent bytes (below) |
| `pnpm test:scoped tests/tooling/verify/lib/reviewed-grants.test.ts tests/tooling/verify/ops/native-shape-delivery.int.test.ts` on parent bytes | same 2 reds: `no-untyped-soft-ref` fact `drizzle-schema-data` "native type fact context is unavailable"; `contract-structural-copy` opposing-worlds case times out at 60 s |
| `pnpm exec biome check … --diagnostic-level=error` (11 changed source and test files) | pass |
| `pnpm exec eslint --config eslint-hard.config.js …` (10 changed files; HARD admission is syntax-only) | exit 0 |
| `pnpm exec eslint --config eslint.config.js …` (same files; typed contexts tooling, root, tests-dom, tests-iso) | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.tests-dom.json --config tsconfig.tests-iso.json --config tsconfig.json` | tooling, tests-dom, tests-iso pass; root fails only on the inherited `scripts/probes/**` and `tests/legacy/**/_support.ts` set the merge hook saw on main-identical bytes |
| `pnpm check:docs` on the two docs | pass |
| `pnpm check:agents` | inherited red: three gitignored `reports/review` links in `docs/plans/test-foundation/design.md` |

## Owed

- Whole-population qualification: `pnpm check:structure --check=test-hand-shape`.
- Independent review.
- `pnpm check:ledgers-fresh` on the merged tree for the hand-edited catalog row.
- The plan's copy-family bullet still lists `test-hand-shape` in one copy family over the shape reader; the gate is now a reasoned singleton.
