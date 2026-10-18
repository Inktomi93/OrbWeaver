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
| first delivery | 74 | 12,006 | 130 |
| first delivery | 222 | 34,462 | 335 (110 live, 225 legacy) |

Projected over the tree's tests (sites per file held constant), the candidate would emit about 55,000 UNKNOWN lines and the first delivery about 6,700; the verifier round below corrects that delivery. That delivery's claim that each refinement was fail-closed was wrong for aliases, wrappers and containers (verifier F1 to F3).

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

## Verifier round: fail-open boundary and container identity

The verifier refuted `923036b272` (F1 to F4). The fix commit sits on a merge of main `0c00df426d`.

- F1/F2: boundary ownership came from the annotation's own symbol, so `type Page = Owner` and `Readonly<Owner>` lost the production owner. Ownership now comes from the resolved boundary type; an annotation still adds a production alias the resolution erased.
- F3: a union constituent counted as clean whenever it was not itself a named hand. Every union, intersection and type-argument constituent is now walked; clean means primitive, literal, `null`, `undefined` or a named shape that is not a judged hand.
- The existing `node-types` and `call-parameters` answers carry no type arguments or nested flags; judging with them alone made 20% of sampled sites UNKNOWN (6,990 of 34,351). With the coordinator's approval one bounded question kind, `shape-constituents`, joins the shared vocabulary (`type-observation-questions.ts`, `SHAPE_CONSTITUENT_DEPTH` and `SHAPE_ALIAS_ARGUMENT_LIMIT`, plus a seen-set), with one selector step, `alias-type-argument`, for library alias arguments. A depth or cycle stop reads UNKNOWN, never no-shape.
- Library origin is decided by the declaration's source file (`isInNodeModules`, which covers TypeScript `lib.*.d.ts`). A named library type with no type arguments is no-shape; a generic one is judged by its arguments; a library alias at a boundary, or an anonymous library structure at a boundary, stays UNKNOWN.
- Demand gating: the question runs only when the demand names it; the gate test spies the shared dispatcher and shows `message-kind-policy-coverage` never asks it while this gate does.
- Currentness: answers ride the same capture, demand schema and replay as every other question. The native fixture changes `rows: Hand[]` to `Derived[]` and the UNKNOWN for that site disappears.
- Expected extra capture cost: one walk of at most `SHAPE_CONSTITUENT_DEPTH` levels per value and target slot, plus up to `SHAPE_ALIAS_ARGUMENT_LIMIT + 1` alias-argument probes per aliased type, and call-parameter rows for calls that are themselves values. Not measured on the whole population.

Sample (same 222 files, 34,351 sites):

| Reader | UNKNOWN | Rate |
| - | - | - |
| `923036b272` (refuted) | 335 | 1.0% |
| existing observations only, strict | 6,990 | 20.3% |
| fix with `shape-constituents` | 634 | 1.8% |

Fix-round evidence:

| Command | Result |
| - | - |
| gate, reader and native tests with the source fix reverse-applied | red-first: 17 of 34 fail, covering every F1 to F3 shape, the wrapper, container and depth probes, demand gating and the native invalidation control |
| `pnpm test:scoped` gate, reader, native fixture, family suite, shared observation suites, shape consumers, shape copy, grants, ratchet | all pass, except load-only timeouts below |
| `native-type-projection.test.ts` alone | 4/4 pass (134.7 s); it timed out only beside 13 other files |
| `browser-mount-native.test.ts` and `test-mock-doctrine` proofs on exact parent bytes | same timeouts as on the fix, so inherited |
| `native-shape-delivery.int.test.ts` opposing-worlds case | inherited 60 s timeout, unchanged |
| Biome, HARD ESLint, ordinary ESLint on the changed files | pass, except `type-observation-questions.ts` `max-lines`: 851 lines on the parent and 853 now (one import and one registry row); the walk lives in `shape-constituents.ts` |
| `pnpm typecheck` tooling, tests-dom, tests-iso | pass; root keeps the inherited `tests/legacy/**/_support.ts` errors |

Known limit: a generic production parameter (`takeAll<T extends Owner>(owner: T)`) is judged at its instantiation, so a hand passed there is unassociated; seeing the declared constraint needs the signature-parameter observation on the callee, which this fix does not add.

## Owed

- Whole-population qualification: `pnpm check:structure --check=test-hand-shape`.
- Independent review.
- `pnpm check:ledgers-fresh` on the merged tree for the hand-edited catalog row.
- The plan's copy-family bullet still lists `test-hand-shape` in one copy family over the shape reader; the gate is now a reasoned singleton.
