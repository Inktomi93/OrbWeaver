# 1041 shard s2-eslint-restrict-ids-1

Four ID and cast gates became native ESLint rules `orb/<id>` in `eslint.config.js` (`ID_BRAND_RESTRICTIONS`, spread into `RESTRICTIONS`).
Rule bodies: `no-fake-disabled-id` and `no-loose-id-cast` are esquery selector rows; `no-raw-id` is `rawIdRule` and
`wire-json-parsed-at-consumer` is `wireJsonRule`, both hand rules over the ESLint scope manager (syntax only, no type program).
The brand roster for the double-cast arm is derived from the kit ids home by `deriveCanonicalBrandTypeNames`
(`tooling/src/floor/code-facts/id-brand.ts`) and hashed into the block settings.

Durable test: `tests/tooling/verify/ops/id-brand-native.suite.test.ts` (105 rows, drives the configured rules through the real flat config).
Red first: with the `...ID_BRAND_RESTRICTIONS` spread commented out, 58 of 96 failed; restored, 96 of 96 pass.
Refutation fixes, red first: the 9 added rows (stacked-assertion sentinel x2, `z.coerce.string`, bare `coerce`, const-bound builder x3 plus 2 controls)
against the previous `eslint.config.js`: 7 failed (2 fake-disabled, 5 no-raw-id), 98 passed; against the fix: 105 of 105 pass.
Real door for the fixes: `pnpm exec eslint` on a planted contracts file (`z.coerce.string()`, `const str = z.string; str()`) and a planted client file
(`castId("" as string as string)`): exit 1, `orb/no-raw-id` 4:29 and 5:29, `orb/no-fake-disabled-id` 3:18. Plants deleted.

Real door (repo config, no lock): `pnpm exec eslint packages/client/src/data/__plant-ids1.ts packages/contracts/src/__plant-ids1.ts`
exit 1, findings `orb/no-fake-disabled-id` (4:25), `orb/wire-json-parsed-at-consumer` (5:91), `orb/no-loose-id-cast` (6:50 and 7:53),
`orb/no-raw-id` (contracts 3:41). Plants deleted before commit.

## Waiver and grant disposition (README rule 3)

Inline `eslint-disable` plus a new `suppressions` grant row was rejected: the `suppressions` policy yields one finding per (rule, scope)
class and its APPLICATION 57 / IMPLEMENTATION 5 rows are exact-equality budgets that may not rise, so each new class would breach them.
Every former `@orb-waive` site therefore became a plain reason comment (non-legacy) or was dropped (tests/legacy), and the live
findings went into ESLint's native bulk file through `eslint --suppress-rule orb/no-raw-id --suppress-rule orb/no-loose-id-cast`
(`eslint-suppressions.json`, only shrinks): `orb/no-raw-id` 37 sites in 13 files (equals the retired budget row of 37),
`orb/no-loose-id-cast` 12 sites in 7 files outside legacy (editor forms 6, tests/tooling 6) plus 29 sites in 20 tests/legacy files.
Budget rows `no-raw-id` (37) and `no-loose-id-cast` (6 application, 15 implementation) were deleted, never raised.
Two live violations had no marker and were FIXED, not suppressed: `surfaceId: z.string().regex(PLUGIN_SURFACE_ID_RE)` in
`packages/contracts/src/plugin/index.ts` and `tests/support/iso/corpus-plugin.ts` now use the named `pluginSurfaceIdSchema`
(`packages/contracts/src/plugin/ui.ts`).

## Per gate

### no-fake-disabled-id
parity: 3 mustFlag / 2 mustPass ported, 1 lost.
Lost: the origin identity (a local function named `castId` is now flagged by spelling; mustPass "local same-named function"),
static folding of a const alias (`const e = ""; castId(e)`; the import-alias ban still covers the aliased-import half of mustFlag[1]),
an assertion/satisfies stack deeper than two layers (`castId("" as string as string as string)`; one and two layers are flagged and tested),
and the third-answer "unreadable door" report text (the call is still flagged, only the message differs).
Census for the lost arms (rider): `ast-grep run -l ts -p 'castId($X as $T)'` and `-l tsx` over packages, tests, scripts, tooling
(8780 ts + 1653 tsx tracked files): 0 matches each; `rg 'castId\([^)]* as '` over the same roots: 1 hit, the planted fixture string in
`id-brand-native.suite.test.ts`. `castId("")`: 0 matches in ts and tsx. No live site, waiver or grant hits any lost arm.
Const-alias census (the arm the `castId($X as $T)` scan does not measure), redo: the rule's population is `@client`, so I listed EVERY
`castId` call there with an `ast-grep scan` rule (kind call_expression whose function is the identifier `castId`; a plain
`ast-grep run -p 'castId($A)'` misses the `castId<T>(...)` form), `-l ts` over 768 files and `-l tsx` over 816 files of `packages/client`:
13 + 32 = 45 calls, 0 with an empty-literal argument, 23 with an identifier argument, and 0 of those identifiers bound to an empty
literal (`const|let|var X = ""` / `''` / backtick pair) in the call's own file. Second method: `rg 'castId' packages/client` lists the same 29 files.

### no-loose-id-cast
parity: 8 mustFlag / 9 mustPass ported (the 4 waiver-coordinate rows are replaced by the line-permission test), 0 lost rows; mustRefuse
(unnameable waiver coordinate) is moot under a rule-named disable.
Lost claim (not covered by any row): the checker-backed brand property test. The native arm names a double cast by the type names in
the kit ids home only. Not seen: (1) a brand alias declared in another module, which today means six live brands: `ProviderId`
(contracts/src/inference/provider-id.ts:10), `PluginHandlerRef`, `PluginSlug`, `PluginBundleHash`, `ChatHandle` (contracts plugin) and
`PluginPageKey` (client/src/state/plugin-page-selection-store.ts:20); (2) an alias of an alias; (3) an import-renamed brand
(`import type { UserId as Who }` then `value as unknown as Who`), the sibling of the castId import-alias loss.
Census for the lost arms (rider): `rg 'as unknown as (ProviderId|PluginHandlerRef|PluginSlug|PluginBundleHash|ChatHandle|PluginPageKey)\b'` over
packages, tests, scripts, tooling: 0 hits (the only `as PluginHandlerRef`/`as PluginPageKey` sites are single casts, which this gate never covered).
Renamed brand imports: `ast-grep scan` rule (kind import_specifier with an alias, imported name matching `\w+Id|Branded|TypeIdOf|<the six>`) over the
same roots, 8780 ts files: 2 hits (`variantCellId as buildCellId`, `loadPresentHostUserId as readHost`, both functions, not brands); 1653 tsx files: 0.
No live site, waiver or grant hits any lost arm.
Second set of lost arms (verifier refutation, recorded here): the checker-backed gate also flagged a double cast whose target REACHES a brand
without naming it as the whole annotation: (4) a type parameter constrained to a brand (`<T extends UserId>(v) => v as unknown as T`),
(5) an intersection (`UserId & { readonly tag?: 1 }`), (6) an indexed access (`Row["id"]` with `Row.id: UserId`), (7) a utility type
(`NonNullable<UserId | null>`), (8) a local alias (`type Local = UserId`). The roster selector accepts a `TSTypeReference` whose name is a
roster brand only, so none of (4) to (8) is flagged; I kept the selector rather than add a descendant match, because a descendant match would
also flag `Array<UserId>` and `Promise<UserId>` targets the old brand-property test never flagged.
Census (rider): `ast-grep run -l ts -p '$X as unknown as $T'` and `-l tsx` over packages, tests, scripts, tooling (8777 ts + 1653 tsx files):
314 + 60 = 374 double-cast sites. I listed every distinct target (about 200 spellings). The only bare-identifier targets that are not a concrete
non-brand type are `T` (2, both unconstrained `<T>() => ({}) as unknown as T` stubs in tests/legacy/server/entry), `TKey`
(`packages/client/src/data/use-gated-query.ts:28`, `TKey extends QueryKey`), `Row` (tests/legacy/contracts/refinery/schema-forge.contract.test.ts:125,134,
a local row shape), `Defaults`, `Lib`, `Can`, `Route`, `Discovery`, `Args`, `string`, `never`; the indexed-access targets are `NotificationEvent["type"]`,
`(typeof X)[number]`, `TurnRequest["prompt"]`, `WorkloadFrame[...]` and `BridgeTarget["bridge"]`, all object or enum slices, and the two
utility-type spellings are `NonNullable<ChatContext["rpg"]>` and `Awaited<...>` over service shapes. None targets or reaches a canonical
brand. The two object-literal targets that mention a brand (`{ ruleId: AutomationRuleId; ... }`, `{ hidden: DocumentId[] }`) are not a
brand and the old test did not flag them. Live population of every lost arm: 0; no waiver or grant names one.
`@typescript-eslint/no-unsafe-type-assertion` stays the generic fallback.
Scope now includes tests/legacy (the old population did); its 29 casts are in the bulk file.

### no-raw-id
parity: 4 mustFlag / 6 mustPass ported, 3 lost.
Lost mustFlag rows: zod reached through a re-export barrel, an opaque `any` builder root, an imported opaque nested member (the old
fail-closed "unreadable" arm). The live tree has no zod re-export barrel (rg 0), and the gate header measured 0 unreadable roots.
Zod identity is now by import binding (`zod`, `zod/*`, alias, namespace, bare `string`), shadowing is respected.
Refutation fix: `z.coerce.string()` (also a bare `coerce` import) and a builder bound through up to four single-write consts
(`const str = z.string; { chatId: str() }`) are now flagged, with rows. Still not followed: a builder bound by destructuring
(`const { string } = z`), an `export const`-ed builder imported from another module (the lost "imported opaque member" arm), and a
`let` that is ever reassigned. Census (rider): `ast-grep run -l ts -p 'z.coerce.string($$$A)'` and `-p 'const $N = z.string'`, plus the same
under `-l tsx`, over packages, tests, scripts, tooling: 0 matches each (8780 ts, 1653 tsx files); `rg 'coerce\.string|import \{[^}]*coerce'`: 3 hits,
all fixture strings in `id-brand-native.suite.test.ts`. A control pattern (`const $N = z.object($$$A)`) matched, so the scan was live.

### wire-json-parsed-at-consumer
parity: 8 mustFlag / 4 mustPass groups (11 cases) ported, 0 lost.
Lost: nothing measured. The global `JSON` is matched by spelling as before.

## Scaffolding removed
`tooling/src/verify/gates/{no-fake-disabled-id,no-loose-id-cast,no-raw-id,wire-json-parsed-at-consumer}.ts`,
`tests/tooling/verify/gates/{no-raw-id-origin,wire-json-parsed-at-consumer}.test.ts`, their `_liveness` arms, `idCastProofModule`,
waiver-budget rows, the `cast` antipattern class and gate names in `antipatterns.ts`. `typeid-prefix-boundary` stays (family is now itself).
`native-cast-delivery.int.test.ts` now drives `typeid-prefix-boundary` for the native-service delivery cases.
`resolveFactoryCallFromPackage` keeps only its test importer (flag for Knip).

Stale prose naming the deleted gates was repointed to the `orb/` rules (`packages/contracts/src/rpg/snapshot.ts`,
`packages/client/src/features/refinery/hooks/use-refinery-sessions.ts`, `tests/legacy/client/data/use-gated-query.ct.tsx`) or dropped
(`tooling/src/verify/lib/react-origin.ts`); `bus-belt-total.ts` no longer exists on this base.

## Owed to primary
`pnpm lint:eslint-scoped` (eslint.config.js changed), the generated `Core-Enforcement-Active-Gates.md` catalog rows, `check:ledgers-fresh`.
