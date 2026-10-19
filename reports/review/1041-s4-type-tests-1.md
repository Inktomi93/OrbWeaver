# 1041 shard s4-type-tests-1 (type-test), second attempt

Seven gates. Three deleted (contract-banned-shapes, typeid-prefix-boundary, empty-state-has-action), four kept (the two form-reset gates, trpc-input-declarations, no-handwritten-wire-json-schema). Each record carries its own planted red, parity line and lost claim.
No structure run, no `lint:eslint-scoped`, no whole-tree check ran. The cherry-pick of efa6533b7c onto current main conflicted in ten files; each was resolved by reading both sides (main had already deleted the schema partition of the ledger, `no-direct-users-read`, `client-structure` and the two table gates).

## Verdicts

| Gate | Verdict | Successor |
| - | - | - |
| no-form-reset-in-autosave | escalate (gate kept) | the strip type test is a supplementary pin; the cast-past-strip arm has no native owner |
| no-form-reset-in-autosave-health | kept-with-reason | deleted only together with the gate |
| contract-banned-shapes | done | `tests/contracts/identity/ledger-rejected-shapes.test-d.ts` |
| typeid-prefix-boundary | done | `brandedId` constraint in `packages/kit/src/ids/index.ts`, pinned by `tests/kit/ids/branded-id-boundary.test-d.ts` |
| no-handwritten-wire-json-schema | escalate (gate kept) | `tests/contracts/role-clients/response-format-schema.test-d.ts` pins only `ResponseFormat.schema`; the untyped-literal arm has no native owner |
| empty-state-has-action | done | required `EmptyState` `action`, pinned by `tests/ui/primitives/empty-state/action-required.dom.test-d.ts` and `action-slot.dom.test.ts` |
| trpc-input-declarations | escalate (gate kept) | arm A pinned by `tests/server/transport/trpc/procedure-input.test-d.ts`; arm B has no native home |

## Answers to the verifier findings

- typeid-prefix-boundary (P2, refuted: a placeholder string satisfied the rest parameter). Fixed. The refusal element is now `[useTypeIdSchemaForTypeIdBrands: never]` (`packages/kit/src/ids/index.ts:315-317`), so no value satisfies it short of a cast. Red first: two new rows in `branded-id-boundary.test-d.ts` (the exact placeholder string, and an arbitrary string on a union) failed with TS2578 on the old code at `:29`, exit 1; green after the change, exit 0. Census of callers: 112 `brandedId<T>()` calls (ast-grep `-l ts` and `-l tsx` over `packages` and `tests`, 10863 ts and 9224 tsx tracked files), every T concrete (none a type parameter), and the only `brandedId<T>(arg)` matches in the tree are the two new refusal rows.
- no-handwritten-wire-json-schema (P2, D328 does not apply; the untyped literal compiles). Escalate. The gate is restored byte-for-byte from main (`tooling/src/verify/gates/no-handwritten-wire-json-schema.ts`, 238 lines), with its `multi-root-b` liveness arm, its `origin-server-family` suite member and its spelling-twins row. The response-format pin test stays as a supplementary pin and claims no parity. Lost claim: none (gate kept).
- Suspicion: the typeid vocabulary comes from `ID_PREFIX` values, the gate's came from `TypeIdOf` aliases. Both are 67 today. A future `TypeIdOf<"x">` with no `ID_PREFIX` entry would pass `brandedId`. Left open: a type cannot enumerate aliases, and `deriveCanonicalTypeIdPrefixes` still derives the alias set for the codemod; a pairing check between the two sets belongs to the `id-brand-flow` family.
- Suspicion: `native-sealed-reference-delivery.int.test.ts` lost its only selected-files run on a client file. No remaining sealed-origin gate is selected-files on `@client`, so the combination no longer exists.

## no-form-reset-in-autosave and -health (escalate, both kept)

ARM A (a `.reset(` on a form-shaped receiver in a file that imports `createAutosaveEntityForm`) has no successor: a client file that does `session.form as AppFormInstance<V>` then `.reset(...)` passes tsc, eslint and biome. `character-editor-surface.tsx:205` is a live cast site and its comment relies on this gate. Expressing it needs typed linting on product client files or a cast ban the live site violates on purpose, so this is a design decision.
Kept as a supplementary pin only: `tests/client/forms/editor/autosave-reset-strip.dom.test-d.ts`. Parity: not applicable. Lost claim: none.

## contract-banned-shapes

Parity: 8 mustFlag / 5 mustPass ported, 0 lost (counted against main's gate file, which still carries 8 and 5 after the schema partition left it).
Both subjects are real production types (`Principal` has no `kind`, D60; `AppSettings` has no `guidedActions`, D33), so a rename or a move fails the import, an unresolvable shape widens the type and fails the positive control, and extend, spread and computed-key rows are inferred. The mustPass rows are no-false-positive fences for a gate that matched by name.
With the gate gone nothing reads the ledger table, so `lib/ledger-banned-shapes.ts`, `contract/ledger-banned-shapes.ts`, their `index.ts` exports and the gate's suite test are deleted. The D12 `noRestrictedImports` pin (`tests/tooling/verify/lib/ledger-banned-shapes.int.test.ts`, cited by `biome.json`) stays; its vocabulary-non-empty test went with the table.

## typeid-prefix-boundary

Parity: 3 mustFlag / 3 mustPass ported, 0 lost (the placeholder escape the verifier found is now closed).
`brandedId<T>()` takes a rest argument that is `[]` for a prefixless brand and one of type `never` when the brand label is any `ID_PREFIX` value (alone or inside a union). Aliased type, renamed import and forwarded reference are refused. An unresolved door is TS2307.
Kept: `lib/id-brand.ts`, `gates/_proof/id-brand.ts`, `floor/code-facts/id-brand.ts` for `no-raw-id`, `no-fake-disabled-id`, `no-loose-id-cast`. Removed as dead: `canonicalTypeIdPrefix`, `typeIdPrefixFromBrand`. `deriveCanonicalTypeIdPrefixes` stays for `scripts/codemods/typeid-prefix-boundaries.ts`.

## empty-state-has-action

Parity: 4 mustFlag / 4 mustPass ported, 0 lost.
`action` is required (`null` is the stated "no next step"). A null action renders no slot. Identity, alias, barrel, paired tag and local-shadow cases follow from type identity.
Scope change: enforcement widens from `packages/client/src/features/**` to every caller. Two `packages/ui` callers and twelve legacy CT calls took `action={null}`; four conditional-spread sites became explicit `action` props. Re-census on current main: 81 `<EmptyState` elements (ast-grep `-l tsx`, self-closing and with children, over `packages` and `tests`); the one without a literal `action` is `tests/legacy/ui/variant-arm-matrix.stories.tsx:102`, which spreads `props: EmptyStateProps` and so carries the required prop by type.
Rejudged markers (21 product sites, all genuine "no next step") are `action={null}` with the old reason as the comment above.

## trpc-input-declarations (escalate)

Arm A (a handler reads `input` without `.input()`) fails to compile and is pinned (3 of 5 mustFlag rows). Arm B (pass-anything parser: `z.any`, `z.unknown`, `z.looseObject`, `.passthrough()`): 2 of 5 mustFlag rows have no type or native successor and need an `eslint-restrictions` row scoped to `packages/server/src/transport/trpc/**`. The gate stays until that row exists.

## Owed to primary

- Regenerate `docs/law/Core-Enforcement-Active-Gates.md` (rows for contract-banned-shapes, typeid-prefix-boundary, empty-state-has-action).
- `pnpm check:ledgers-fresh`, `pnpm lint:eslint-scoped` on the changed files.
- Real-corpus liveness runner for the rosters touched (`client-ui`, `multi-root-a`, `multi-root-b`, `product-db-server`).
- Typecheck of `tsconfig.tests-dom.json` and `tsconfig.tests-legacy-dom.json` (required `EmptyState` `action`, legacy CT edits, variant-arm-matrix stories). Server program for the `brandedId` constraint (112 concrete callers, none generic).
- Stale prose in other shards' files: `lib/property-assignment-name.ts` still names `no-handwritten-wire-json-schema` (now correct again, gate kept).

## Checks

- `pnpm test:scoped tests/kit/ids/branded-id-boundary.test-d.ts`: red on the old rest element (TS2578 at `:29`, exit 1), green after (exit 0).
- Seven files green: both `.test-d.ts` pins, `origin-server-family`, `ledger-banned-shapes.int`, `id-brand-flow`, `ordinary-visitors-family`, `policy-descriptor-read`, `native-sealed-reference-delivery.int`, `native-id-boundary-delivery.int` (60 tests, 5 type tests). The tooling shard's teardown reported a working-tree guard error only because this report was written while it ran.
- Biome on 12 changed files: clean.
- One locked typecheck, last: `pnpm typecheck --config tsconfig.tests-dom.json` exited 0 (`PASS`).
