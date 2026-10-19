# 1041 shard s4-type-tests-1 (type-test)

Seven gates. Four deleted, three kept (the two form-reset gates and trpc-input-declarations). Each record below carries its own planted red, parity line and lost claim.
No structure run, no `lint:eslint-scoped`, no whole-tree check ran. One locked typecheck ran last (see Checks).

## Verdicts

| Gate | Verdict | Successor |
| - | - | - |
| no-form-reset-in-autosave | escalate (gate kept) | the strip type test is a supplementary pin; the cast-past-strip arm has no native owner |
| no-form-reset-in-autosave-health | kept-with-reason | restored with its family; deleted only together with the gate |
| contract-banned-shapes | done | `tests/contracts/identity/ledger-rejected-shapes.test-d.ts` |
| typeid-prefix-boundary | done | `brandedId` constraint in `packages/kit/src/ids/index.ts`, pinned by `tests/kit/ids/branded-id-boundary.test-d.ts` |
| no-handwritten-wire-json-schema | done with a recorded loss | `WireReady` on `ResponseFormat.schema`, pinned by `tests/contracts/role-clients/response-format-schema.test-d.ts` |
| empty-state-has-action | done | required `EmptyState` `action`, pinned by `tests/ui/primitives/empty-state/action-required.dom.test-d.ts` and `action-slot.dom.test.ts` |
| trpc-input-declarations | escalate (gate kept) | arm A pinned by `tests/server/transport/trpc/procedure-input.test-d.ts`; arm B has no native home |

## no-form-reset-in-autosave and -health (escalate, both kept)

A verifier refuted the earlier delete. ARM A (a `.reset(` on a form-shaped receiver in a file that imports `createAutosaveEntityForm`) has no successor: a client file that does `session.form as AppFormInstance<V>` then `.reset(...)` passes tsc, eslint and biome. The earlier claim that D325 assertion rules own it was false; those rules are scoped to `tests/**`. `character-editor-surface.tsx:205` is a live cast site in a file that imports the factory, and its comment relies on this gate.
Express-it would need typed linting on product client files or a cast ban that the live site violates on purpose, so this is a design decision: escalate.

- Restored byte-for-byte from main: both gate files, `lib/editor-form-factory.ts`, `form-factory-for-multifield.ts` (family `editor-form-factory` again, three members), the `_liveness` arms, the wave suite, the spelling-twins row, and every doc and comment that named the gate.
- Kept as a supplementary pin only: `tests/client/forms/editor/autosave-reset-strip.dom.test-d.ts` (strip, call and returned-property rows). Red on a planted `AutosaveForm = AppFormInstance`, green after restore. It does not replace the gate and no parity credit is claimed from it.
- Parity: not applicable (gate kept). Lost claim: none.

## contract-banned-shapes

Parity: 8 mustFlag / 5 mustPass ported, 0 lost.
Both subjects are real production types now (`Principal` has no `kind`, D60; `AppSettings` has no `guidedActions`, D33), so a rename or a move fails the import (the two blindness rows), an unresolvable shape widens the type and fails the positive control (the fail-closed row), and the extend, spread and computed-key rows are inferred. The mustPass rows are no-false-positive fences for a gate that matched by name; a type test has no such false positive.
`CONTRACT_BANNED_SHAPES`, `contractBanHome` and the two contract row interfaces are removed. `SCHEMA_BANNED_SHAPES` stays for `schema-banned-shapes`.

## typeid-prefix-boundary

Parity: 3 mustFlag / 3 mustPass ported, 0 lost.
`brandedId<T>()` takes a rest argument that is `[]` for a prefixless brand and a required placeholder when the brand label is any `ID_PREFIX` value (alone or inside a union). The 67 `TypeIdOf` aliases equal the 67 `ID_PREFIX` values, so the vocabulary matches the gate's derived set. Aliased type, renamed import and forwarded reference are refused. An unresolved door is TS2307.
Kept: `lib/id-brand.ts`, `gates/_proof/id-brand.ts`, `floor/code-facts/id-brand.ts` (`canonicalIdBrand`, `ID_BRAND_HOME`) for `no-raw-id`, `no-fake-disabled-id`, `no-loose-id-cast`. Removed as dead: `canonicalTypeIdPrefix` and `typeIdPrefixFromBrand`. `deriveCanonicalTypeIdPrefixes` stays: `scripts/codemods/typeid-prefix-boundaries.ts` reads it.

## no-handwritten-wire-json-schema

Parity: 6 mustFlag / 3 of 9 mustPass ported (projected, projected-in-const, spread of a projected schema), 1 lost (below). The other six mustPass rows are gate-machinery or no-false-positive rows (array schema, other field name, other tell key, waiver, population fence, member-mutated builder root).
`ResponseFormat.schema` is `WireReady`, and the only mint is `projectJsonSchema`. The six hand-written spellings (inline, `as const`, local const, const `type` value, computed key, imported const) all fail as assignments to `ResponseFormat`; the import hop does not change assignability.
Lost claim: `schema` fields typed `Record<string, unknown>` or `unknown` accept a hand-written literal. They are `PlannedResponseFormat.schema` and the agent-sdk `outputFormat` (inference planner output, downstream of the scrub), the refinery stored schemas (`Unprojected` by design), `plugin/host-v1` and the plugin membrane. Retyping the planner output is inference request shaping, so it is not done here.

## empty-state-has-action

Parity: 4 mustFlag / 4 mustPass ported, 0 lost.
`action` is required (`null` is the stated "no next step"). A null action now renders no slot (a wrapper div with `pt-row` padding rendered before). Identity, alias, barrel, paired tag and local-shadow cases follow from type identity.
Scope change: enforcement widens from `packages/client/src/features/**` to every caller. Two `packages/ui` callers (`labeled-chart-frame`, `table`) and twelve legacy CT calls took `action={null}`; four conditional-spread sites became explicit `action` props.
Rejudged markers (21 product sites, all genuine "no next step" under the old reasons) are `action={null}` with the old reason as the comment above.

## trpc-input-declarations (escalate)

Arm A (a handler reads `input` without `.input()`): `authedProcedure.query(({ input }) => input.id)` fails to compile; pinned. Parity for arm A: 3 of 5 mustFlag rows (the bare read and non-destructured read; the bracket spellings are the same type facts).
Arm B (pass-anything parser: `z.any`, `z.unknown`, `z.looseObject`, `.passthrough()`): 2 of 5 mustFlag rows have no type or native successor. It needs an `eslint-restrictions` row scoped to `packages/server/src/transport/trpc/**`. The gate stays until that row exists.

## Owed to primary

- Regenerate `docs/law/Core-Enforcement-Active-Gates.md` (rows for the four deleted gates: contract-banned-shapes, typeid-prefix-boundary, no-handwritten-wire-json-schema, empty-state-has-action).
- `pnpm check:ledgers-fresh`, `pnpm lint:eslint-scoped` on the changed files.
- Re-run on a quiet box: `tests/tooling/verify/ops/native-id-boundary-delivery.int.test.ts` (the "native mint" test, unchanged, times out at 5 s under load) and `native-sealed-reference-delivery.int.test.ts` (two unchanged `test.for` rows time out at the default budget under load). Both files were re-hosted off the deleted gates. The sealed-reference command test now runs one structure command; the `--file` run it also made went with `empty-state-has-action`, the only selected-files gate on a client file.
- Real-corpus liveness runner for the `_liveness/*` rosters touched (`client-app`, `client-ui`, `multi-root-a`, `multi-root-b`, `product-db-server`).
- Typecheck of `tsconfig.tests-dom.json` and `tsconfig.tests-legacy-dom.json` (the required `EmptyState` `action` touches 12 legacy CT edits and the variant-arm-matrix stories); only `packages/client/tsconfig.json` ran.
- Stale prose in other shards' files: `schema-banned-shapes.ts`, `windowed-infinite-query.ts`, `external-id-single-writer-health.ts` still name `contract-banned-shapes`; `lib/property-assignment-name.ts` still names `no-handwritten-wire-json-schema`.

## Checks

- Each new test: red on a planted production edit (exit 1, TS2578 unused `@ts-expect-error` or failed `expectTypeOf`), green after restore (exit 0). Commands are `pnpm test:scoped <path>`.
- Touched gate suites, all green: `ordinary-client-and-ct-wave`, `ledger-banned-shapes` (+ `lib/ledger-banned-shapes.int`), `id-brand-flow`, `origin-server-family`, `ordinary-visitors-family`, `lib/policy-descriptor-read`.
- `native-sealed-reference-delivery.int` (the re-hosted command test) green alone. The rest of that file passes except two `test.for` rows that hit the default ~5 s timeout under shared-box load (`no-direct-users-read`, `discovery-no-stats-rollups`); those rows are unchanged.
- `native-id-boundary-delivery.int`: 4 of 5 green. The fifth ("native mint", unchanged) times out at the default 5 s while it builds the ESLint config.
- The id-boundary fixture corpus gained `no-loose-id-cast` so `id-brand-flow` keeps two members after `typeid-prefix-boundary` left it.
- Biome on all changed files: clean. ESLint (`pnpm exec eslint`, repo config) on every changed source and test file: clean except `no-restricted-syntax` SkeletonRows findings in files this commit does not touch at those lines (the same finding appears in 20 client sites).
- One locked typecheck, last: `pnpm typecheck --config packages/client/tsconfig.json` exited 0 (`PASS`). That program covers client, ui, contracts, kit and the server `AppRouter` bridge, so the required `EmptyState` `action`, the `brandedId` constraint and the `WireReady` field are checked against every caller in it. Tests and tooling programs were not typechecked (one program per shard).
