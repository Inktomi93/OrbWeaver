# 1110 id-brand union (lane cb-1110)

The ids shard (7d264ac29f, s2-eslint-restrict-ids-1) is applied on main next to the merged type-tests shard
(1900e9d330 via 27ec80e986). `typeid-prefix-boundary` stays deleted. With both shards in, the `id-brand-flow`
policy family and the `id-brands` native type-fact family have no consumer, so both are retired here.

## What landed

- Cherry-pick of 7d264ac29f with conflicts resolved by hand:
  - `eslint.config.js`: main's side kept whole (`evaluate-no-scope-capture`, `assumes-single-replica`, `commentedCodeRule`,
    `assumesSingleReplicaRule`). The ids hunks were applied with `patch`: the `deriveCanonicalBrandTypeNames` import, the
    `ID_BRAND_RESTRICTIONS` block (`eslint.config.js:1604`), the `rawIdRule` and `wireJsonRule` bodies (`:5458`, `:5514`),
    their plugin entries (`:5639-5640`) and the `ID_BRAND_NATIVE_SETTINGS` hook (`:5715`). `...ID_BRAND_RESTRICTIONS` is
    added to `RESTRICTIONS` after `...TOOLING_LITERAL_RESTRICTIONS` (`:2357`). No top-level name is declared twice
    (a scan of every top-level `const`/`function`/`let` found no duplicates), and the spread count went from 27 to 28.
  - `typeid-prefix-boundary.ts`: kept deleted (modify/delete conflict resolved to the delete).
  - `tests/tooling/verify/gates/id-brand-flow.suite.test.ts`: deleted; the family has no member.
  - `native-id-boundary-delivery.int.test.ts`: dropped the gate-driven tests (missing-service withhold through
    `no-fake-disabled-id`, the structure/scoped run of `no-fake-disabled-id`) and the sealed `idBrands` door test, whose
    family is retired. Kept the `createSemanticWorkspace` world test (canonical, wrong-prefix and prefixless brands
    through `canonicalIdBrand`) and the `orb/no-mint-via-cast` test. Added the alias, plain, counterfeit and nullable
    cases of `canonicalIdBrand` that used to sit in the families suite beside the retired `nativeIdBrand` comparison;
    `canonicalIdBrand` stays live (`tooling/src/floor/code-facts/schema-value.ts:278`, which feeds `schema-branding`).
  - `enforcement-antipatterns.md` and `antipatterns.ts`: see below.
- Retired the `id-brands` inventory family on the pattern of the `cast-relations` retirement (cead362888):
  `INVENTORY_FORMAT` 23 to 24; the family, partition field, record table, build/option queries, reader, query,
  extractor visitors, worker coverage assertions, `NativeTypeRequest` kind, `NativeTypeFactReader`/`NativeTypeContext`/
  `NativeTypeFacts` members, the policy-pass passthrough and the isolated-proof reader are gone. `'id-brands'` stays in
  the physical `inventory_family` CHECK (`semantic-inventory-records.ts`), next to `'cast-relations'`, so committed
  historical generations still survive a family-table rebuild.
- Dead helpers removed: `nativeIdBrand` (code-facts), `possibleKitIdCall`, `prepareKitIdCall`, `kitIdCallServices`
  (verify lib), `tooling/src/verify/gates/_proof/id-brand.ts` (`idBrandProofModule`; the item text calls it
  `lib/_proof`, the file lived under `gates/_proof`), the `brand-coverage` stage fault, and
  `tests/tooling/floor/code-facts/native-id-brand-demand.test.ts`.
- Kept, with their live consumers: `ID_BRAND_HOME`, `requireEntityIdTypeNames`, `deriveCanonicalBrandTypeNames`,
  `nativeCanonicalIdBrand` (`eslint.config.js:117`), `canonicalIdBrand` (`schema-value.ts:278`, the codemod),
  `deriveCanonicalTypeIdPrefixes` (`scripts/codemods/typeid-prefix-boundaries.ts:25`), `createKitIdCallMatcher`
  (`eslint.config.js:4301` in `mintViaCastRule`, the codemod at `:277`).
- Tests that used `id-brands` as a convenient scalar family now use `declaration-outputs` or `runtime-exports`
  (families, family-cases, declaration-output and runtime-export delivery). The upgrade fixture writes an `id-brands`
  family row for every prior schema from format 5 on.

## Census (no consumer remains)

Taken on the finished tree, before commit.

- codegraph_explore over `nativeIdBrand readInventoryBrands idBrandDemand collectBrandTarget idBrandProofModule
  possibleKitIdCall kitIdCallServices prepareKitIdCall idBrandOptions`: none resolves to a symbol. The only related
  symbol it returns is `createKitIdCallMatcher`, called by `mintViaCastRule` and `scanTypeIdBoundaries`.
- ast-grep over `packages tests tooling scripts eslint.config.js` (devtools-frontend vendored assets excluded),
  one run per language, scanned counts from `--inspect summary`:

  | Pattern | ts (8777 files) | tsx (1657) | js (14) |
  | - | - | - | - |
  | `"id-brands"` | 1: `semantic-inventory-families.test.ts`, the assertion that the retired tag is refused | 0 | 0 |
  | `$X.idBrands($$$)` | 0 | 0 | 0 |
  | `$X.idBrand($$$)` | 0 | 0 | 0 |
  | `nativeIdBrand($$$)` | 0 | 0 | 0 |
  | `readInventoryBrands($$$)` | 0 | 0 | 0 |
  | `idBrandProofModule($$$)` | 0 | 0 | 0 |
  | `possibleKitIdCall($$$)` / `prepareKitIdCall($$$)` / `kitIdCallServices($$$)` | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
  | `canonicalIdBrand($$$)` (kept) | 4 in 3 files: codemod, `schema-value.ts`, `native-id-boundary-delivery.int.test.ts` | 0 | 0 |
  | `createKitIdCallMatcher($$$)` (kept) | 1: codemod | 0 | 1: `eslint.config.js` |
  | `nativeCanonicalIdBrand($$$)` (kept) | 1: `code-facts/id-brand.ts` | 0 | 1: `eslint.config.js` |

- Literal `rg` over the whole worktree (generated catalog, population ledgers, `reports/`, `docs/work/` and
  `eslint-suppressions.json` excluded) for `"id-brands"|\bidBrands?\b|idBrandQueries|nativeIdBrand|idBrandProofModule|
  idCastProofModule|possibleKitIdCall|prepareKitIdCall|kitIdCallServices|readInventoryBrands|id-brand-flow|_proof/id-brand`:
  the only hits are the schema-projection `typeOverride.idBrand` field (`schema-model-contract.ts:67`,
  `schema-projection*.ts`, `schema-branding.ts:37,60-61`, two schema tests), which is the schema-data family's column
  override and not this family, plus the families-test assertion above.
- The same `rg` for the five deleted gate ids outside `orb/` spellings: only the `ID_BRAND_RESTRICTIONS` ids and plugin
  keys in `eslint.config.js` and the unrelated `typeid-prefix-boundaries` codemod. Hidden dirs (`.claude`, `.agents`,
  `.codex`, `.github`) and `AGENTS.md`: 0.

## Successor map, per old proof row

The old rows are the `mustFlag`/`mustPass`/`mustRefuse` arrays of the gate modules at HEAD before this commit. Suite
lines are `tests/tooling/verify/ops/id-brand-native.suite.test.ts`. Lost arms and their zero-population census are
recorded in `reports/review/1041-s2-eslint-restrict-ids-1.md` and are not repeated here.

### no-fake-disabled-id: `orb/no-fake-disabled-id` (`eslint.config.js:1606`, scope `@client`)

| Old row | Successor |
| - | - |
| mustFlag[0] direct empty sentinel | suite `:75` (also `:76-:86` quote, template, typed, cast, satisfies, two-layer stacks) |
| mustFlag[1] import alias and static string alias | suite `:89` (alias import refused outright); const-folded alias is a recorded lost arm |
| mustFlag[2] fail-closed unreadable door | suite `:90` (an unresolvable door is still flagged by spelling) |
| mustPass[0] nonempty id | suite `:91` |
| mustPass[1] local same-named function | lost by design: flagged by spelling, recorded in the ids report |
| mustPass[2] positional identity (callee token) | the waiver coordinate grammar does not apply to an eslint-disable; the line-permission test (`:100`) proves the disable names the rule and is consumed |

### no-loose-id-cast: `orb/no-loose-id-cast` (`eslint.config.js:1622`, scope `@product` and `@tests`)

| Old row | Successor |
| - | - |
| mustFlag[0] `as never` | suite `:116` |
| mustFlag[1] tests are judged | suite `:136` (and legacy `:139`) |
| mustFlag[2] parenthesized operand | suite `:117` |
| mustFlag[3] parenthesized const assertion | suite `:121` |
| mustFlag[4] parenthesized complete inner cast | suite `:120` |
| mustFlag[5] parenthesized inner operand | suite `:122` |
| mustFlag[6] satisfies around the double cast | suite `:123` |
| mustPass[0] explicit helper | suite `:127` |
| mustPass[1] single cast into a brand | suite `:128` |
| mustPass[2] double cast to a non-brand | suite `:130` |
| mustPass[3] satisfies around a single cast | suite `:129` |
| mustPass[4] scripts outside the population | suite `:141` |
| mustPass[5-7] positional identity and waiver binding | line-permission test, suite `:144` |
| mustRefuse[0] unnameable coordinate | moot: a rule-named disable has no coordinate to refuse |
| checker-backed brand property | brand roster derived from the ids home, suite `:156`; reach-through arms are recorded lost arms |

### no-raw-id: `orb/no-raw-id` (`rawIdRule`, `eslint.config.js:5458`, scope `AUTHORED_SRC`)

| Old row | Successor |
| - | - |
| mustFlag[0] raw id field | suite `:166` |
| mustFlag[1] aliases and wrapper chains | suite `:167`, `:168`, `:170` |
| mustFlag[2] bare builder import (red-first row) | suite `:169` |
| mustFlag[3] namespace spelling | suite `:171`, `:172` |
| mustFlag[4] fail-closed opaque root | lost arm (no live zod barrel), recorded in the ids report |
| mustFlag[5] imported opaque nested member | lost arm, recorded in the ids report |
| mustPass[0] canonical validating schema | suite `:185`; the remedy's `brandedId` path is itself constrained by `brandedId` (`packages/kit/src/ids/index.ts:319,324`, pinned by `tests/kit/ids/branded-id-boundary.test-d.ts`) |
| mustPass[1] local same-named builder | suite `:188` (and shadowing `:189`, project `z` `:190`) |
| mustPass[2] ordinary strings | suite `:186` |
| mustPass[3] central positioned waiver | line-permission test, suite `:199`; live findings moved to `eslint-suppressions.json` |

### wire-json-parsed-at-consumer: `orb/wire-json-parsed-at-consumer` (`wireJsonRule`, `eslint.config.js:5514`, scope `@client`, `@server`, `@inference`)

| Old row | Successor |
| - | - |
| mustFlag[0] server exclusion removed | suite `:333` |
| mustFlag[1] inference plain-fetch | suite `:337` |
| mustFlag[2] founding awaited cast | suite `:214` |
| mustFlag[3] unawaited Promise cast and satisfies | suite `:215`, `:216` |
| mustFlag[4] then callback, expression and return | suite `:218`, `:223` |
| mustFlag[5] JSON.parse over text | suite `:227` |
| mustFlag[6] `as unknown` step and held const or let | suite `:229`, `:234`, `:239`, `:244` |
| mustFlag[7] bracket spellings | suite `:249`, `:254`, `:259` |
| mustPass[0] reassigned local, parameter and block shadowing | suite `:311`, `:316`, `:321` |
| mustPass[1] tooling outside the population | suite `:344` |
| mustPass[2] bracket remedy, json-with-argument, unknown target | suite `:279`, `:284`, `:288`, `:289` |
| mustPass[3] position is the `json` name | the line-permission test (`:350`); the planted run below reports the `json` token column |

## native-cast-delivery now drives `no-opaque-test-fixture`

Census: 97 gate modules declare `analysis: "types"`; 41 of them are `selected-files`. Of those, the ones that read a
native fact through `ctx.nativeTypes` are `audit-client-tests`, `domain-inference-dispatch`, `membership-enforcer`,
`no-opaque-test-fixture`, `route-trpc-no-broad-spread`, `test-determinism`, `test-mock-doctrine` and `verb-naming`.
`no-opaque-test-fixture` (`tooling/src/verify/gates/no-opaque-test-fixture.ts:89-119`) has the same delivery shape as
the retired `no-loose-id-cast`: ordinary authority, typed, selected-files, `@tests` population, and one native fact
request per authored node. Its verdict is a pure type answer (is the declared output `unknown`), so the Node/DOM
`ReturnType<typeof setTimeout>` flip changes the finding without touching syntax.
`native-declaration-output-delivery.int.test.ts` already drives this policy through `--file` selection; the moved
rows drive it through whole-population `--check` and `--scope tests` runs, which nothing else covers. The
registration-session test is kind-agnostic and now registers `declaration-outputs`.

## Families

Census over all 170 gate modules (`defineGate` blocks): 170 policies in 117 families, no empty family, no singleton
whose family differs from its id (`mirror-index` and `tooling-artifact` each have two members). `id-brand-flow` has no
member and no remaining reference. Every policy named in a `native-*deliver*` test (`--check=`, `verify/gates/<id>.ts`
or `POLICY = "<id>"`, 62 references across 29 files) exists as a gate module.

## Red and green

- Plants `packages/client/src/data/__plant-cb1110.ts` (castId(""), `as unknown as ChatId`, `as never`,
  `(await res.json()) as {...}`) and `packages/contracts/src/__plant-cb1110.ts` (`z.object({ chatId: z.string() })`),
  run with `pnpm exec eslint <both plants>` and the repo config:
  - red, with the `...ID_BRAND_RESTRICTIONS` spread removed: exit 0, no findings;
  - green, union config: exit 1, `orb/no-fake-disabled-id` 3:25, `orb/no-loose-id-cast` 5:10 and 7:23,
    `orb/wire-json-parsed-at-consumer` 9:21 (the `json` token), `orb/no-raw-id` contracts 3:44. Plants deleted.
- Retired family tag: with `'id-brands'` dropped from the family CHECK, `semantic-inventory-upgrade.test.ts` fails 40 of
  50 (`CHECK constraint failed` on the format 5 and later rebuilds); restored, it passes.

## Checks

- `pnpm test:scoped` id-brand-native.suite, ast/ops/antipatterns, lib/policy-scope, lib/policy-pass: 4 files, 187 of 187 pass.
- `pnpm test:scoped` native-id-boundary-delivery.int and native-cast-delivery.int: 8 of 8 pass.
- `pnpm test:scoped` semantic-inventory-upgrade: 50 of 50 pass (red-first above). module-reach: 4 of 4 pass.
- `pnpm test:scoped` native-drizzle-identities: 16 of 16 pass (the worker still loads `code-facts/id-brand.ts` through `schema-value.ts`).
- Inherited reds, reproduced with the same tests and the same causes on a clean worktree of this base (HEAD 24c2bc4c6c, removed afterwards):
  - semantic-inventory.test.ts: 12 of 40 fail on both trees (format 1-9 adoption time out at 5 s; the two indexed round-trip tests miss `referenceNames` in the test's `completePartition`; legacy analysis eligibility).
  - semantic-inventory-families "closed family presence ...": times out at 5 s on both trees (a synchronous worker-building test with no timeout); its assertions pass on this tree.
  - native-declaration-output-delivery (3 of 6) and native-runtime-export-delivery (2 of 7): 5 s timeouts and `Cannot redefine property: getTypeChecker` in `native-policy-cases.ts:149`, on both trees.
- `pnpm test:scoped tests/tooling/doc`: 195 of 197; the 2 reds are only the `docs/plans/test-foundation/design.md` `reports/review` links that fail in worktrees.
- Config load, `pnpm exec eslint --print-config` exit 0 for `packages/server/src/entry/index.ts`, `packages/client/src/main.tsx`, `tooling/src/verify/cli.ts`, and with `--config eslint-hard.config.js` on the server entry; the client config carries all four `orb/*` rules at error.
- `flock <heavy.lock> pnpm typecheck --config tooling/tsconfig.json`: PASS.
- `pnpm exec biome check --diagnostic-level=error` on the 25 changed code files: clean (one scoped `--write` for formatting).

## Owed to primary

- `pnpm lint:eslint-scoped` (or the whole-repo native lint) for `eslint.config.js`; the bulk file `eslint-suppressions.json`
  is the ids shard's. None of its 40 suppressed files changed on main between the ids base (bf24d71984) and this base.
- Regenerate `docs/law/Core-Enforcement-Active-Gates.md` (rows for the four retired gates), `pnpm check:ledgers-fresh`.
- Typecheck of the root program (`tsconfig.json`, which holds `tests/tooling`). The edit hook's incremental check shows
  only the three inherited `tests/legacy/server/domain/chat/_support.ts` errors (lines 201, 296, 300), which are not in
  this diff. The tests-dom and legacy programs were not run.
- The real-corpus liveness runner for the `_liveness` rosters the ids shard touched (`client-app`, `product-db-server`,
  `tooling-and-authored`).
- Knip: `resolveFactoryCallFromPackage` keeps only its test importer (flagged by the ids shard).
- The local `.cache/semantic-inventory.sqlite` of any checkout keeps an orphan `inventory_brand` table; nothing reads or
  writes it, and format 24 never reuses the old partitions.
