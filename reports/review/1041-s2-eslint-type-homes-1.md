# 1041 s2-eslint-type-homes-1: type-home and shape gates to native enforcement (redo on current main)

Four gates are deleted with their scaffolding. `no-inline-types` and `no-inline-wire-interface` stay (escalate). The shard was redone on main after the 981 rework; the earlier uncommitted worker commit was not cherry-picked. Parts of it that still applied were re-derived and re-proved: the union-alias rule and test, the contract-derives test, the test-support union fixes and the prose edits.

pwd: `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/wf_4649b099-4cd-22`, branch `wt/wf_4649b099-4cd-22`.

## Gate records

### no-inline-union-alias: done

- Successor: `orb/no-inline-union-alias`, `eslint.config.js` `TYPE_SHAPE_RESTRICTIONS` (selector `TSTypeAliasDeclaration > TSUnionType[types.length>=3]` with every member a string `TSLiteralType`). Scope is `AUTHORED_SRC` minus `tests/legacy/**` (the nested `@legacy-tests` root, outside `@authored`) and `tooling/src/verify/gates/**`.
- Durable test: `tests/tooling/verify/ops/union-alias-native.suite.test.ts`. Red first against the unmodified config: `packages/contracts/src/x.ts: export type Mode = 'a' | 'b' | 'c';: expected [] to have a length of 1 but got +0`. Green after the row.
- Real door: `pnpm exec eslint packages/contracts/src/__plant_th2.ts` (`export type PlantTh2 = "a" | "b" | "c";`) exit 1, `1:24 error ... orb/no-inline-union-alias`. Plant deleted.
- Parity: 3 mustFlag / 3 mustPass ported (of 4), 1 lost. Lost claim: the line-local `@orb-waive no-inline-union-alias(<alias>)` door. Census: `rg '@orb-waive(-file)? no-inline-union-alias'` over the tree minus node_modules, docs/work and reports finds no marker outside the deleted gate and its fixtures (0 live). The exception doors are now `eslint-disable-next-line ... -- reason` and the bulk file.
- Live tree: ast-grep `type_alias_declaration` with a union value, `-l ts` and `-l tsx`, over packages, tooling, tests and scripts: 758 union aliases (8798 tracked `.ts`, 1654 `.tsx`). The rule ran on the 500 files that hold one (469 in rule scope). Nine sites were live on main: `tests/support/iso/bus-payload-policy.ts` (3), `tests/contracts/events/bus-payload-safety.test-d.ts` and `.dom.test-d.ts` (1 each), `tests/tooling/instrument-proof.int.test.ts:25`, `tests/tooling/tool-slot-template.int.test.ts:19`, `tooling/src/floor/code-facts/shape-association.ts:166` and `tooling/src/verify/lib/tenancy-direct-read.ts:55`. All but the last are fixed by deriving the union from an `as const` tuple. The last is a fenced analyzer file and goes to the bulk file: `pnpm exec eslint --suppress-rule orb/no-inline-union-alias tooling/src/verify/lib/tenancy-direct-read.ts`, which adds one `orb/no-inline-union-alias` entry (count 1) and nothing else. After the fixes only that site remains.
- Scaffolding removed: gate module, `_liveness/authored.ts` arm, `union-axis-family.suite.test.ts` arm-A cases, `lib/union-axis.ts` alias reader (`inlineUnionAlias`, `InlineUnionAlias`, `ALIAS_MIN_MEMBERS`) and the antipattern roster id. Stand-in gates for tests that borrowed the gate as a known syntax policy: `stale-draft-commit` (`tuple-vocabulary-fact.test.ts`), `ui-accname-survives-spread` (`population-resolver.test.ts`, `mirror-index-family.suite.test.ts`); `native-finite-types-delivery.int.test.ts` needs none. The `no-inline-union-redecl` family name moved from `union-axis` to its own id.

### no-inline-domain-interface: done

- Successor: `orb/no-inline-domain-interface`, row scope `packages/server/src/domain/**/*.gen.ts` minus `**/contract/**`, `contract.ts` and test mirrors, with the hand rule `interfacePlacementRule` (direct export, `export default interface`, local export list, `export default Name`). `orb/type-home-direct-export` owns every authored domain declaration (ece8bef2e5), so the row keeps only what native admission excludes. The row sits in the generated-source bypass list of `ORDINARY_CONFIG` so the generated-file ignore does not hide it.
- Durable test: `tests/tooling/verify/ops/interface-placement-native.suite.test.ts`. Red first: `packages/server/src/domain/x/result.gen.ts: ... expected +0 to be 1`. Green after the row. This is board item 1090's second option: the gate keeps a population native lint does not own, with a planted control.
- Real door: `pnpm exec eslint packages/server/src/domain/chat/__plant_th2.gen.ts` exit 1, `1:18 error ... orb/no-inline-domain-interface`. Plant deleted.
- Parity: 1 mustFlag / 4 mustPass ported (of 5), 1 lost. Lost claim: the positional-identity waiver row (`@orb-waive no-inline-domain-interface(Foo)`). Census: 0 live markers anywhere (rg over the tree).
- Live tree: `git ls-files '*.gen.ts'` returns only `packages/ui/src/tokens/themes.gen.ts`, outside this row. No generated domain file exists, so the live population is empty.
- Scaffolding removed: gate module, `_liveness/server-app.ts` arm, family-test cases in `type-home-native`, `type-home-declaration`, `shape-consumers.suite` and `ordinary-visitors-family.suite`, antipattern roster id.

### no-inline-package-interface: done

- Successor: `orb/no-inline-package-interface`, same hand rule. Scope: `*.gen.ts` under `packages/server` and `packages/inference`, `packages/server/src/index.ts`, and the ui authoring files (`@ui-authoring` minus `packages/ui/src` and `packages/ui/token-contract.ts`), minus domain, primitives, `contract/` and `contract.ts`. The message names `packages/ui/token-contract.ts`, which restores the UI-authoring fix text the custom reporter used to supply.
- Durable test: same file as above. Red first: `packages/server/src/foundation/result.gen.ts: ... expected +0 to be 1`.
- Real door: `pnpm exec eslint packages/ui/__plant_th2.ts` (a local interface published by `export type { PlantTh2 }`) exit 1, `1:11 error ... orb/no-inline-package-interface`. Plant deleted.
- Parity: 1 mustFlag / 5 mustPass ported, 0 lost rows. The waiver door of this gate had 57 markers (see below).
- Live tree: the rule ran on `packages/ui/token-contract.ts`, `tokens.build.ts`, `tokens.near-duplicate.ts` and `packages/server/src/index.ts` (3 in scope): 0 findings. The authored server and inference population is the typed rule's, and f1f056931e recorded zero findings there.
- Waivers rejudged: 57 `@orb-waive no-inline-package-interface(...)` markers in 36 files (all `entry/`, `transport/` and `infra/`, each "baselined when the gate landed; burn-down item 952"). `nativeTypeHomeAdmission(path) || serverTypeApiHome(path)` is true for all 36 files, so the gate never judged those sites after 981 and no marker was consumed. All 57 are removed as dead text. The `APPLICATION` waiver-budget row (206) is deleted.
- Scaffolding removed: gate module, `_liveness/multi-root-b.ts` arm, family-test cases in `type-home-native`, `type-home-declaration`, `shape-consumers.suite`, `ordinary-visitors-family.suite`, `server-factory-type-home` and `component-type-home` (its fixture gate is now defined inline), roster id, budget row.

### contract-derives-not-respells: done

- Successor: `tests/tooling/verify/ops/contract-derives-native.test.ts`, a Node test over the real `packages/db/src/schema`, `packages/contracts/src/*/**` and `packages/server/src/domain/*/contract/**` using the retained reader `lib/contract-derives-not-respells.ts` (plain ts-morph project, no workspace program). Both arms keep the gate's name matching.
- Red first (plant on the real tree): `packages/server/src/domain/chat/contract/__plant_th2.ts` (`export interface HandoffCardPair`) made `the real contracts, domain contracts and drizzle tables agree` fail with `__plant_th2.ts::HandoffCardPair respells @orb/contracts/chat`. Green after the plant was deleted.
- Parity: 3 mustFlag / 5 mustPass ported, 0 lost rows. Lost non-row claims: the reviewed-grant identity witness, the closed-marker alarm test and the real-corpus grant reconciliation. Census: the reconciliation test asserted `reviewedGrantsFor([policy])` is `[]` before deletion; `rg 'contract-hand-row|contract-respell|policyId: "contract-derives'` finds nothing outside the deleted gate and its tests. The reader stays: `contract-structural-copy` imports `DOMAIN_CONTRACT_RE`, and the test imports the rest.
- Scaffolding removed: gate module, `_liveness/server.ts` arm, `contract-shape-wave-1.suite.test.ts` (reduced to the serde seal case), fixture entries in `native-shape-delivery.int.test.ts`, roster id, prose citations. `contract-structural-copy` takes its own family id.

### no-inline-types: escalate

Kept. The native typed rule owns its server, inference, default-content and plugin-toolchain population. The remaining claims have no native successor: the client, tooling, tests and UI-authoring alias arm; the schema arm, which judges zod factory identity by module origin (`import { z as s }`, `import { discriminatedUnion }`, `import * as zod` rows cannot be selectors); and the `@ui` generated-token arm, which needs the token-contract resource. Only its header and the family tests were updated.

### no-inline-wire-interface: escalate

Kept per ruling 1764. Its plain-data check (`isPlainDataShape`) needs the type checker, which costs an extra TS program per owner. Gate and tests are unchanged apart from header prose.

## Checks

- Pass: `union-alias-native`, `interface-placement-native`, `contract-derives-native` (real-tree run under the heavy lock), `union-axis-family`, `contract-shape-wave-1`, `population-resolver`, `tuple-vocabulary-fact`, `mirror-index-family`, `ordinary-visitors-family`, `shape-consumers.suite`, `type-home-declaration`, `type-home-native`, `native-finite-types-delivery.int` (15 of 16 first, the 16th alone).
- Timeout, not an assertion failure, box load: `component-type-home.test.ts` (4 cases at the 5 s default; the case `actual conditional and immutable bound rendering` also times out alone), `server-factory-type-home.test.ts` Hono case (15 s), `native-shape-delivery.int.test.ts` first case (60 s, also alone). None references a changed line; the previous shard saw the same ones.
- Biome on the changed files: no errors. `pnpm check:agents`: three pre-existing missing-link findings in `docs/plans/test-foundation/design.md` lines 25, 41 and 49, none on an edited line.
- Typecheck (one run under the heavy lock): `tooling/tsconfig.json` pass; `tsconfig.json` fails only at the three existing `tests/legacy/**/_support.ts` sites.

Owed to primary: `pnpm lint:eslint-scoped` for `eslint.config.js`; regenerate `docs/law/Core-Enforcement-Active-Gates.md` (rows for the four deleted gates); quiet-box reruns of the timeout-bound tests (`component-type-home.test.ts` 4 cases, `server-factory-type-home.test.ts` Hono case, `native-shape-delivery.int.test.ts` first case); board item 1090 is satisfied by the interface row with its planted control.
