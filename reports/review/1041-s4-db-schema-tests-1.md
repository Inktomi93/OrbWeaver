# 1041 s4-db-schema-tests-1: db schema gates to runtime tests

Eight gates over the drizzle schema are retired. Their claims now live in three Node suites under `tests/db/schema/`, which run in per-push Node CI, plus one native lint rule. All eight records are `done`; two carry a recorded lost arm (db-enum-from-tuple, fk-ondelete-stated).

## Successors

| File | Judges |
| - | - |
| `tests/db/schema/table-integrity.suite.test.ts` | primary keys, FK child indexes, FK `onDelete`, soft references, ledger-rejected shapes, on `getTableConfig` of every export of `@orb/db/schema` |
| `tests/db/schema/module-structure.suite.test.ts` | barrel re-export of every schema module, producer domain per schema module |
| `tests/db/schema/enum-tuples.suite.test.ts` | every enum column is member-equal to an exported `@orb/contracts` or `@orb/kit` tuple, or a reviewed local storage tuple |
| `eslint.config.js` `DB_SCHEMA_RESTRICTIONS` (`orb/db-enum-from-tuple`), proved in `tests/tooling/verify/ops/native-restrictions.test.ts` | no inline array or call result as a column `enum` in `packages/db/src/schema/**` |

Every predicate also runs on small synthetic tables (positive and negative controls), and every real-schema test asserts a non-empty census, so a moved barrel cannot make a check pass by seeing nothing.

## Per gate

### table-explicit-primary-key
- Parity: 2 mustFlag / 4 mustPass ported (2 mustPass import-spelling rows are moot at runtime: the drizzle object is already resolved), 0 lost.
- Plant: a keyless `zz_keyless` table in a barrel-exported schema file. `pnpm test:scoped tests/db/schema/table-integrity.suite.test.ts` exit 1, `expected [ 'zz_keyless' ] to deeply equal []`.

### fk-columns-indexed
- Parity: 5 mustFlag / 6 mustPass ported (2 mustFlag and 1 mustPass are spelling rows, moot at runtime), 0 lost. Stricter than the gate: composite table-level FKs and `unique()` constraints are judged by the same rule (live tree: 1 composite FK, clean).
- Plant: FK `ownerRef` to `users` with no index. Exit 1, `expected [ 'zz_unindexed.ownerRef' ] to deeply equal []`.

### fk-ondelete-stated
- Parity: 2 mustFlag / 2 of 3 mustPass ported, 1 lost: the `@orb-waive fk-ondelete-stated(...)` per-site waiver row. No live waiver exists (the 2 markers were the gate's own fixture), and a deliberate NO ACTION FK states `onDelete: "no action"`. Also stricter: a table-level `foreignKey()` without `onDelete` fails.
- Plant: `references(() => users.id)` with no options. Exit 1, `expected [ 'zz_unstated.ownerRef' ] to deeply equal []`.

### no-untyped-soft-ref
- Parity: 5 mustFlag / 7 mustPass ported (3 spelling rows moot), 0 lost. The central stale-grant arm is ported as roster equality: the live set of id-shaped columns without an FK must equal the reviewed roster exactly.
- Id-shaped column types judged: text, json-text, integer, integer timestamp and boolean, matching the old gate's any-mode builder filter (the verifier's narrowing suspicion; live tree still clean).
- Grants rejudged: 13 grants, 13 reviewed entries in `SOFT_REFERENCES` with one reason each, 0 fixable without a schema migration. The 13 are the 13 live soft references, no more.
- Plant: `widgetId: text("widget_id")` in a new table. Exit 1, received list gains `zz_soft.widgetId`.

### schema-banned-shapes
- Parity: 10 mustFlag / 6 mustPass ported (5 mustFlag spelling rows moot), 0 lost. The rejected-shape table moved from `tooling/src/verify/lib/ledger-banned-shapes.ts` into the test. The contract partition stays with `contract-banned-shapes`.
- Plant: a `character_versions` table. Exit 1, `expected [ 'character_versions — D28 (the card is a flat characters row)' ] to deeply equal []`.

### db-structure
- Parity: 2 mustFlag / 1 mustPass ported, 0 lost. The barrel check is stronger than the gate: every runtime export of every module must be present, by identity, in `@orb/db/schema`, and a module with no runtime export is a finding.
- The EACCES/ENOENT refusal pin (`db-structure.int.test.ts`) was gate-mechanism proof and is deleted; the test reads the directory directly and throws.
- Plant: `packages/db/src/schema/share.ts` not in the barrel. `pnpm test:scoped tests/db/schema/module-structure.suite.test.ts` exit 1, `expected [ 'share.zzShares' ] to deeply equal []`.

### db-structure-producer-home
- Parity: 1 mustFlag / 1 mustPass ported, 0 lost.
- Grants rejudged: 4 grants (gallery, rate-limit, connection-bindings, sdk-session) became 4 reasoned entries in `NON_DOMAIN_PRODUCERS`, none fixable without moving files or domains. The dead `custom-types` reservation is dropped (no such schema module). A stale-ruling check fails when a ruled module gains its domain or goes away.
- Plant: a barrel-exported `zz-plant.ts` with no `domain/zz-plant`. Exit 1, `expected [ 'zz-plant' ] to deeply equal []`.

### db-enum-from-tuple
- Native split: lint rejects an array or call expression at any depth under an `enum` property (descendant selector `Property[enum] :matches(ArrayExpression, CallExpression)`), so any number of `as`, `satisfies`, `!` and parenthesis wrappers, as the old `unwrapSchemaExpression` loop covered (mustFlag rows 1 to 5); runtime test judges the values that reach drizzle. Fix after verifier refutation: the first selector looked one wrapper deep and passed `["a"] as const satisfies readonly string[]`. Red first: with the one-level selector `native-restrictions.test.ts` failed on exactly that case (`expected [] to have a length of 1 but got +0`); with the descendant selector 19/19 green. Real door: `pnpm exec eslint` on a plant with `as const satisfies`, `(... )!` and bare array exit 1, three findings (3:49, 4:49, 5:45); live `packages/db/src/schema` (32 ts files, 71 enum pairs, 0 tsx; ast-grep pair scan plus eslint) exit 0.
- Parity: 5 mustFlag ported to lint; 6 mustFlag (name-origin rows: computed local, mutable `let`, local-module import, non-`as const` array, spread over a call, spread over a widened array) ported in value form only; 11 mustPass ported (mustPass row 1, an overridden inline `["old"]`, is now a lint finding: stricter). Lost: the origin proof for a NAMED binding whose members happen to equal a canonical tuple still passes, because a runtime value carries no origin and an untyped selector carries no scope. Nothing on the live tree is affected (71 enum columns: 67 match a canonical tuple, 4 are reviewed local storage tuples; no inline array exists).
- Real door: `pnpm exec eslint packages/db/src/schema/zz-plant.ts` exit 1, three `orb/db-enum-from-tuple` findings (6:24, 7:30, 8:32). Runtime plant: named local tuple `ZZ_KINDS`, exit 1, `expected [ 'zz_enum.kind' ] to deeply equal []`. Red-first for the durable lint test: with the spread disabled, `native-restrictions.test.ts` failed at the first inline-array case; restored, 19/19 green.
- `drizzleSchemaConfigurationFact` is deleted (its only consumer). The `builderConfig` projection stays in the native fact store, fenced; it has no gate consumer now.

## Scaffolding removed

- Gates: the eight modules, `lib/db-schema-module.ts`, `lib/reviewed-grants-no-untyped-soft-ref.ts` (and its spread), `gates/db-structure.int.test.ts`.
- Grants: 4 rows from `reviewed-grants-dbstructureproducerhome-danglingrefcitations.ts` (the file keeps its name for the other gates' rows). Waiver budget rows `db-structure-producer-home` and `no-untyped-soft-ref` deleted, none raised.
- Liveness arms: 7 in `_liveness/product-db-server.ts`, 1 in `_liveness/resources.ts`.
- Authored-tree id `db-schema` (last reader gone) and its roster test row.
- `SCHEMA_BANNED_SHAPES` and the schema row interfaces (`contract/ledger-banned-shapes.ts`, `verify/index.ts`).
- Family-suite cases and imports in `schema-fact-wave-1`, `ordinary-visitors-family`, `reviewed-grants`, `schema-data-grants`, `ledger-banned-shapes` (suite and int), `native-schema-projection-delivery`, `native-enum-nullable-delivery`, `native-drizzle-policy-delivery`, `application-population`.
- Gate-id spellings in schema comments, `docs/law/Tier-1-DB.md`, ADRs 0107 and 0154, `services.ts`, `asset-refs-coverage.ts`, `column-reads.ts`, `schema-read.ts`, `own-tables-only.ts`, `contract-banned-shapes.ts`.

## Kept

`drizzle-schema-data` and the family `drizzle-schema` stay: `json-column-write-parity`, `owner-scoped-reads`, `ownerid-registry`, `schema-branding`, `table-scoping-class` and others read them.

## Incidental

- `application-population.suite.test.ts`: the schema-enforcement control used `schema-banned-shapes` and ran without `nativeTypeFacts`, so it was red on the unmodified tree ("native type fact context is unavailable"). It now drives `schema-branding` with `isolatedTypeFacts`, and passes.
- A fixture corpus with one `drizzle-schema` member is refused ("singleton family must equal its sole policy id"), so `native-enum-nullable-delivery` and `native-drizzle-policy-delivery` keep a second, unselected family member (`schema-branding`, `ownerid-registry`).

## Owed to primary

- `docs/law/Core-Enforcement-Active-Gates.md` (generated): 8 rows.
- `pnpm lint:eslint-scoped` for `eslint.config.js` (new `DB_SCHEMA_RESTRICTIONS`); the real-door proof above used `pnpm exec eslint`.
- Not run (whole-workspace or `projectCtx` on the repo root): `tests/tooling/verify/gates/schema-data-grants.suite.repo.int.test.ts`, the real-corpus liveness runner over `_liveness/product-db-server.ts` and `_liveness/resources.ts`, `real-corpus-liveness-manifest`, `check:structure`.
- `tests/tooling/verify/ops/native-drizzle-policy-delivery.int.test.ts` timed out on a quiet-box budget while the host load average was about 30 (each native fixture run took 50 to 60 s; the first two cases need five). Its subject proofs, bracket case and vector waiver case passed. A fixture probe with the new `ownerid-registry` sibling gave scoped exit 1 (Node) and 0 (browser world), as the test expects. Re-run it once on a quiet box.
- Unrelated findings seen: `tests/legacy/{inference,server/domain/embeddings,server/domain/search}/_support.ts` carry three root-program type errors; `eslint` reports a typed `Cross-tier factory exposure` finding at `packages/server/src/entry/compose/services.ts:61` (the edit there is a comment); `pnpm check:agents` reports three dead links in `docs/plans/test-foundation/design.md`.
- Typecheck: `pnpm typecheck --config tsconfig.json` shows only those three legacy errors. The `tooling/tsconfig.json` program was not run; the root program reaches the edited `tooling/src` files through the tests that import them.
- File name `native-enum-nullable-delivery.int.test.ts` and the const `REVIEWED_GRANTS_DBSTRUCTUREPRODUCERHOME_DANGLINGREFCITATIONS` keep their old spelling: the grants file is shared with the docs shard.
