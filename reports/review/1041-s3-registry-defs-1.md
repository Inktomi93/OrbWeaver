# 1041 shard s3-registry-defs-1: chrome, config-group, home-tile and section registry definitions

Lane cb-1041-regdefs1. Refs: 1041 (never Closes). Patch base 779ab61b45, applied with `git apply --3way` onto 18d2715a96 (clean).

All four gates are retired in one commit. Their structural claims split three ways:

- `tsc` over the real unions and the existing `*.dom.test-d.ts` files (extended here).
- A runtime test over the real production door: `tests/client/state/registry-definitions.dom.test.ts`.
- Native ESLint restrictions in `eslint.config.js` (`CLIENT_DEFINITION_HOME_RESTRICTIONS`, `CLIENT_DEFINITION_LITERAL_RESTRICTIONS`, `CLIENT_CONFIG_HOST_RESTRICTIONS`), proven by `tests/tooling/verify/ops/client-definition-homes-native.suite.test.ts`.

The door `Record`s were already total over `SECTION_IDS`, `MODAL_SLOT_IDS` and `CONFIG_GROUP_IDS`. No registry data moved; these four gates carried no data table, only structural walls.

## Native rules added (eslint.config.js)

| Rule id | Replaces | Scope and shape |
| - | - | - |
| `orb/chrome-definition-home` | chrome co-location | `ChromeEntry` annotation outside `features/*/lib/*-chrome.{ts,tsx}` |
| `orb/home-tile-definition-home` | tile co-location | same, `HomeTileContribution`, `-tile` |
| `orb/section-definition-home` | section co-location | same, `SectionDefinition`, `-section`, plus factories by return type |
| `orb/config-group-definition-home` | group co-location | same, `ConfigGroupDefinition`, `-group` |
| `orb/collection-definition-home` | collection co-location | same, `CollectionContribution`, `-collection` |
| `orb/registry-definition-literal` | "Definition outside its home" and "Unreadable definition" | inside a home file the annotated declaration must initialise with an object literal |
| `orb/config-host-no-feature-import` | host-imports-no-body | `config-content-surface.tsx` may not import `#features/*` or leave `features/config/` by two relative hops |

## Per-gate record

Gate files were read to their last line at main (chrome 330, config-group 423, home-tile 349, section 277 lines).

### chrome-registry-completeness: done

- Successors: native `eslint.config.js:1427` (rule table) and `:1436` (home restriction); type `packages/client/src/state/chrome-registry.ts:61-69` (`ActionChromeEntry`, rail zone requires `mobile`); runtime `tests/client/state/registry-definitions.dom.test.ts` (unique ids, repeated id, zone outside `CHROME_ZONES` through `assembleChrome`, `packages/client/src/state/assemble-chrome.ts:95-104`); type test `tests/client/state/chrome-registry.dom.test-d.ts:14-20`.
- Parity: 7 mustFlag / 7 mustPass ported, 0 lost (details below).
- Deleted: `tooling/src/verify/gates/chrome-registry-completeness.ts`, its `_liveness/client-app.ts` arm, the "zone vocabulary stops resolving" family test.

| mustFlag row | Successor |
| - | - |
| outside home via cross-package const | `orb/registry-definition-literal` |
| not co-located | `orb/chrome-definition-home` |
| duplicate id | `assembleChrome` throws; runtime test |
| unknown zone (`"sidebar.top" as never`) | type test line 18 (plain literal), and the `as never` spelling through the runtime `assembleChrome` zone throw |
| rail widget missing `mobile` | existing type test `chrome-registry.dom.test-d.ts:9` |
| #944 imported definition | `orb/registry-definition-literal` |
| unreadable (computed) id | not an error in the successor: ids are read as values at runtime; the duplicate arm sees the real value |

mustPass rows (brand zone with `mobile`, topbar with `mobile`, full topbar widget, assembler array boundary, same-file indirection, shadow type, waiver identity) are covered by the native test's pass cases and the type test, with two deliberate differences recorded under "Differences" below.

### config-group-completeness: done

- Successors: native `orb/config-group-definition-home`, `orb/collection-definition-home`, `orb/registry-definition-literal`, `orb/config-host-no-feature-import`; type test `tests/client/state/config-group-registry.dom.test-d.ts` (rendered `create`, unwired `create`, `importFile` without `accept`); runtime `registry-definitions.dom.test.ts` (group sits under its own id, blank create/import copy, every `*-collection` file's export is registered by a group).
- Parity: 9 mustFlag / 5 mustPass ported, 0 lost.
- Deleted: `tooling/src/verify/gates/config-group-completeness.ts`, its liveness arm, the "RENAMED config content host" family test and the `CONFIG_GROUP_PRELUDE` scaffolding.

| mustFlag row | Successor |
| - | - |
| outside home via cross-package const | `orb/registry-definition-literal` |
| group not co-located | `orb/config-group-definition-home` |
| collection not co-located | `orb/collection-definition-home` |
| duplicate group id | registry `get(id).id === id` over `CONFIG_GROUP_IDS`, plus the door `Record` |
| rendered `create` | type test line 10 |
| `importFile` without `accept` | type test line 18 |
| orphan collection body | runtime "every collection body file is registered by a group" |
| decoy export (same word, other module) | same test: it compares exported value identity, not names |
| host imports a feature | `orb/config-host-no-feature-import` |

The old gate's blindness tripwire (a renamed host retires the import arm silently) is kept as a small retained check: the host test in `client-definition-homes-native.suite.test.ts` asserts the host file exists, with a message naming `CLIENT_CONFIG_HOST`. Red-first: pointing the test's `HOST` at `config-content-pane.tsx` fails it (`... moved: update CLIENT_CONFIG_HOST in eslint.config.js: expected false to be true`); restored, 22 of 22 pass.

### home-tile-registry-completeness: done

- Successors: native `orb/home-tile-definition-home` and `orb/registry-definition-literal`; type test `tests/client/state/home-tile-contracts.dom.test-d.ts:14-20` (dormant tile without `teaser`, without `reason`, existing "dormant cannot expose an action"); runtime `registry-definitions.dom.test.ts` (unique ids, honest dormant doorway over the real `homeTiles` list).
- Parity: 8 mustFlag / 6 mustPass ported, 0 lost.
- Deleted: `tooling/src/verify/gates/home-tile-registry-completeness.ts`, its liveness arm, four refusal-pin family tests (`home-tile-registry-completeness: ...`). The retired anti-god-map successor proof in `registry-family.suite.test.ts` stays, with its comment repointed.

### section-registry-completeness: done

- Successors: native `orb/section-definition-home` (constants and factories by return type) and `orb/registry-definition-literal`; type test `tests/client/state/section-registry.dom.test-d.ts` (planned content cannot carry list, header or context; a section declares content or a planned reason); runtime `registry-definitions.dom.test.ts` (each section sits under its own id, planned reason non-blank).
- Parity: 7 mustFlag / 5 mustPass ported, 0 lost.
- Deleted: `tooling/src/verify/gates/section-registry-completeness.ts`, its liveness arm.
- `registry-family.suite.test.ts` consumer swap: the per-kind provider test now uses `placeholder-copy-registry` as the section consumer, and `native-type-projection-delivery.int.test.ts:22` uses it as the companion.

## Differences from the old gates (no arm lost, three tightened or weakened with a census)

Censuses used `ast-grep run -p` with both `-l ts` (766 files scanned) and `-l tsx` (816 files scanned) over `packages/client/src`, for each of the five type names, with patterns `const $N: T = $I`, `type $A = T`, `$E satisfies T`, `$E as T`, `interface $A extends T {}`, `function $F($$$): T { $$$ }`, `const $F = ($$$): T => $B`, and declarations `interface|type|class T`.

- Alias, `satisfies`, `as` and `extends` spellings of the five types: 0 live sites in either language. The name selector does not see them; a new one would slip past `orb/*-definition-home`. Residual risk, accepted by census.
- Live definitions: 6 chrome, 7 tile, 4 section constants plus 5 section factories, 13 group, 3 collection. All 33 constants are object-literal initialised, all in their homes (this is what `orb/registry-definition-literal` and `*-definition-home` assert).
- Shadow type (same name, local declaration): 0 live. The old gate passed a same-named local type; the native selector flags a stray declaration annotated with it. Stricter, no live site.
- Same-file indirection (`const def = {...}; export const x: T = def`): old gate passed it; `orb/registry-definition-literal` flags it. Stricter, no live site (all 33 literal).
- Orphan collection: the runtime test requires every `*-collection.{ts,tsx}` file to export a value some group registers. A file holding two collections where only one is registered would pass. Census: 3 collection files, 1 collection each.
- Planned section and dormant tile arms: no live section is planned and no live tile is dormant today, so the runtime arms run vacuously on real data and bite when one lands. The judge tests prove the helper only. The `mustFlag` empty-reason and empty-teaser rows are held in the type test (missing field) and by this runtime test (empty string).
- Waiver-identity mustPass rows (4 rows, one per gate): they tested the `@orb-waive` marker mechanics of the retired policy. Nothing remains to waive. Not a lost claim.
- Factory returning a non-literal: the old section gate did not carry a mustFlag row for it, and the five live factories return literals. Not claimed.

## Waivers and grants

- `@orb-waive <id>` for the four ids: 0 markers (`git grep -E 'orb-waive (chrome|config-group|home-tile|section)-'` hits only `section-factory-contribution-bundle`, a different gate).
- `policyId` rows in `tooling/src/verify/lib/reviewed-grants*.ts`: 0.
- Waiver budget (`waiver-budget.ts`) and `tests/tooling/gate-spelling-twins.baseline.json`: 0 rows for any of the four ids (`git grep` of each hyphenated id over the whole tree excluding `reports/` and `docs/adr`: only the generated `docs/law/Core-Enforcement-Active-Gates.md` rows remain, 4 lines, owed to primary).

## Red-first evidence

Native lint, old config (the three `CLIENT_*_RESTRICTIONS` spreads removed from `RESTRICTIONS`): `pnpm test:scoped tests/tooling/verify/ops/client-definition-homes-native.suite.test.ts` exits 1 with 12 of 22 failed, for example `packages/client/src/features/x/lib/not-a-chrome-file.ts: expected [] to match object [ { ruleId: 'orb/chrome-definition-home' } ]`. Restored: 22 of 22 pass.

Native lint, real door (`pnpm exec eslint` with the repo config), planted file `packages/client/src/features/chat/lib/zz-probe-stray.ts` annotating five stray constants: five findings, `orb/chrome-definition-home` L4, `orb/home-tile-definition-home` L5, `orb/section-definition-home` L6, `orb/config-group-definition-home` L7, `orb/collection-definition-home` L8. A second plant `zz-probe-tile.ts` (home-named file, `const importedTile: HomeTileContribution = built`) gave `orb/registry-definition-literal L4`. Both deleted. The live definition files (`*-chrome|tile|section|group|collection.tsx`, the config host, `assemble-chrome.ts`, `compose/home-tiles.ts`): 84 files, 0 errors.

Runtime test, planted production violations (each reverted):

- `regex-collection.tsx` `create.label` set to a blank, plus a new `zz-orphan-collection.tsx`: 2 of 9 failed (`expected [ 'regex create.label' ] to deeply equal []`; `regex/lib/zz-orphan-collection.tsx is exported but no group's body.collection is it`).
- `bug-report-chrome.tsx` id set to `context-toggle`: the door throws `assembleChrome: duplicate chrome entry id "context-toggle"`, suite fails to load.
- `assemble-chrome.ts` zone check disabled: `assembling chrome refuses a repeated id and a zone outside CHROME_ZONES` fails (`expected [Function] to throw an error`).

Type tests, loosened production types (reverted): chrome `zone: string`, `DormantDoorway` fields optional, `CollectionContribution.create` widened and `useRun`/`accept` optional, `SectionDefinition` given a bare third arm. `pnpm typecheck --config <narrow program over the five test files>` exit 1, with `TS2578 Unused '@ts-expect-error' directive` at `chrome-registry.dom.test-d.ts:18`, `config-group-registry.dom.test-d.ts:14,16,18`, `home-tile-contracts.dom.test-d.ts:15,17`, `section-registry.dom.test-d.ts:24` (plus the pre-existing `chrome-registry.dom.test-d.ts:9` and `section-registry.dom.test-d.ts:14`, and expected consumer breakage elsewhere). Every new `@ts-expect-error` line bit. The scratch program config was not committed.

## Commands and results

- `pnpm test:scoped tests/tooling/verify/ops/client-definition-homes-native.suite.test.ts`: 22/22 pass.
- `pnpm test:scoped tests/client/state/registry-definitions.dom.test.ts`: 9/9 pass.
- `pnpm test:scoped tests/tooling/verify/gates/registry-family.suite.test.ts`: 20/20 pass.
- `pnpm test:scoped tests/tooling/verify/ops/native-type-projection-delivery.int.test.ts`: 4/4 pass, exit 0, no tree edits during the run.
- `pnpm test:scoped tests/tooling/verify/lib/registry-fact.test.ts tests/tooling/verify/lib/tuple-read.test.ts`: 17/17 pass.
- `pnpm test:scoped tests/tooling/verify/ops/native-restrictions.test.ts`: 18/18 pass.
- `pnpm exec biome check <21 changed files> --diagnostic-level=error`: clean.
- `pnpm check:agents`: red on three `docs/plans/test-foundation/design.md` links to `reports/review/*.md`, which are not in this worktree (gitignored reports). Unrelated, untouched.
- Typecheck, one invocation under the heavy lock, `--config tsconfig.tests-dom.json --config tsconfig.json --config tooling/tsconfig.json`: `tooling/tsconfig.json` PASS, `tsconfig.tests-dom.json` PASS, `tsconfig.json` FAIL on three errors, all in `tests/legacy` and none in a file this commit touches: `tests/legacy/inference/_support.ts(201,20)` TS2322, `tests/legacy/server/domain/embeddings/_support.ts(300,35)` TS2554, `tests/legacy/server/domain/search/_support.ts(296,33)` TS2554. Inherited, not investigated.

Flagged, not mine: `tests/tooling/verify/ops/client-registry-native.suite.test.ts` "actual native route restriction rejects the sections override map" times out at the 5 s default on the first ESLint config load (measured 5.7 s to 7 s on this box, with and without my rules). The file has no load budget; my new suite carries one (`scaledBudget(120_000)`). Not edited.

Owed to primary: `docs/law/Core-Enforcement-Active-Gates.md` regeneration (4 retired rows); `pnpm lint:eslint-scoped` for the new `RESTRICTIONS` rows (override rule 2); full-program `pnpm check` and `pnpm check:structure` on the merged tree.
