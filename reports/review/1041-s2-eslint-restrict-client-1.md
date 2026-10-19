# 1041 s2-eslint-restrict-client-1: seven client seal gates to native lint rules

Successor tool: `eslint-restrictions` (rows in `CLIENT_SEAL_RESTRICTIONS`, `eslint.config.js`, spread into `RESTRICTIONS`). Two rules have a hand body registered over the row's selector rule: `state-files` (per-file mint tally and the exported-handle spine walk) and `registry-context-via-mint` (per-file import identity and alias hops). Durable test for all seven: `tests/tooling/verify/ops/client-seals-native.suite.test.ts` (116 rows).

Redo after a refutation of the first attempt. Two lost arms of `registry-context-via-mint` were missing from its record; both are now expressed (type-alias hop, constructor-only alias) instead of recorded as lost, and the constructor identity moved from a written name to React's own import.

Second redo after the verifier refuted registry-assembly-at-door-only and registry-context-via-mint (unrecorded lost arms). Fixes: the assembly row now reads the factories through `memberNamed` (dotted, bracketed, template); the context rule treats a named or namespace import of `createContext` from a project module (relative, `#`, `@orb/`) as React's constructor, so a project re-export shim is judged. The verifier's suspicion (a namespace destructure `const { useFieldContext } = forms`) is also closed: the four written-name seals gained an `ObjectPattern > Property` arm via `sealedName`.

Third redo (rebased onto current main; conflicts resolved by dropping the arms of gates main already deleted). The verifier refuted registry-context-via-mint: a template-literal computed callee, React[`createContext`]<Registry<...> | null>(null), passed while React["createContext"] was flagged. `isCreateContextMember` in eslint.config.js now accepts a TemplateLiteral with no substitutions whose cooked text is `createContext`; a template with a substitution is not provable and is still not the constructor. Red first: the new row "template-literal constructor member" failed on the old config (expected 1, got 0), then 116/116 green. Real door (`pnpm exec eslint`, repo config): the template plant gives 3:41 `orb/registry-context-via-mint`; one plant per other rule also refused (bound-field 1:10, chat-stream 1:10, bus-on-data 4:5, selection-store 1:10, registry-assembly 1:10, state-files 2:14). Plants deleted. Census for the template spelling: ast-grep over packages/client/src (766 ts, 816 tsx files) for `$X[`createContext`]<$T>($$$)`, the string-computed, dotted and bare forms: 0 member-spelled hits in ts and tsx; only the bare `createContext<$T>($$$)` hits (3 ts, 5 tsx), all from "react".

Red first (second redo): the 9 rows added then failed (9 of 115) on the previous config, then 115/115 green.

Live tree (third redo, current main): the seven rules alone, per-file config from calculateConfigForFile, over all 1582 tracked packages/client/src ts/tsx files: 0 real findings (64 "Unused eslint-disable" messages are an artifact of running one rule). Active files per rule: context 1582, state-files 103, bound-field 13, chat-stream 1581, bus 13, selection 12, assembly 1569. Earlier census:  the seven rules alone (calculateConfigForFile + Linter) over 326 candidate files (every ts/tsx under packages, tests, tooling/src, scripts, playwright naming a sealed symbol or setState, plus flat state/, data/bus/, bound-fields/): 252 had a seal rule active, 0 findings. Census for the context change: `rg createContext packages/client/src` lists 7 files, all importing it from "react" (ast-grep `createContext($$$A)` ts 0 / tsx 0 because every call carries a type argument); `createRegistry($$$A)` ts 0 / tsx 3 over 1582 files, all in `compose/authed-composition.tsx` (a door).

Real door (`pnpm exec eslint`, repo config, exit 1): the verifier's counterexamples now refuse. `lib["createRegistry"](...)` 2:18 and lib[`createContributorRegistry`](...) 3:18 `orb/registry-assembly-at-door-only`; `import { createContext } from "./__v2c1-react-shim.ts"` over `Registry<...>` 3:32 `orb/registry-context-via-mint`; `const { useFieldContext } = forms` 2:9 `orb/bound-field-via-hook`. Plants deleted before commit.

## Per gate

| Gate | Parity | Lost claim |
| - | - | - |
| bound-field-via-hook | 6 mustFlag / 3 mustPass ported, 1 lost | mustPass "same name exported by another module": the rule matches the written name `useFieldContext`, so a same-named hook from another module is flagged (false positive), and a barrel that renames it on re-export is not followed (false negative). Home-moved refusal receipt gone. |
| chat-stream-writes-in-bus-only | 5 / 3, 1 lost | mustPass "same name, different module": same written-name limit, same barrel-rename limit, home-moved receipt gone. |
| bus-on-data-no-store-write | 2 / 6, 0 lost | none; 1 mustPass (waiver marker binding) retired because the waiver mechanism no longer applies. |
| selection-store-via-factory | 5 / 2, 1 lost | mustPass "same name, different module": written-name limit, barrel rename on re-export not followed, home-moved receipt gone. |
| registry-assembly-at-door-only | 3 / 4, 0 lost | none; 1 mustPass (waiver marker binding) retired. Computed and template member spellings and a destructured binding are now flagged. A barrel that re-exports the factories under another name is not followed (written-name limit; no live site: the only 3 call sites are in compose/authed-composition.tsx). |
| registry-context-via-mint | 6 / 5, 0 lost | none of the row claims; 1 mustPass (waiver marker position) retired. Residual limits, exact: (1) a registry type declared in ANOTHER module under a name that does not end in `Registry` and imported under that name is not recognized (the same-file alias chain, up to 8 hops, and any imported name ending in `Registry`, under any local alias, are); (2) any imported name ending in `Registry` counts as the vocabulary, so an unrelated imported `FooRegistry` type is a false positive; (3) a constructor taken by destructuring (`const { createContext } = React`) is not seen; (4) the home-moved refusal receipt is gone. (5) a project module that re-exports `createContext` under a different name (`export { createContext as makeCtx }`) is not followed; the census shows 0 project re-exports of it (7 client files use createContext, all import from "react"). Identity of the constructor is React's import or a project module's (relative, `#`, `@orb/`) name `createContext` (named, renamed, namespace, default, computed string or no-substitution template member); a createContext from another package passes (a same-named project function over a Registry type is a false positive); a `.createContext<T>()` on a non-import receiver is reported as unplaceable, as before. |
| state-files | 5 / 4, 0 lost | none; 1 mustPass (waiver marker binding) retired. The exported-handle arm now walks the callee spine to any depth, as the gate did. |

Family-wide: bound-field-via-hook, chat-stream-writes-in-bus-only and selection-store-via-factory now also flag a destructured binding of the sealed name (`const { chatStream } = state`), through the shared `sealedName` selector; whether the old identity gates caught that spelling was not provable without running them, so it is covered rather than recorded. Residual: a computed destructure key (`{ ["chatStream"]: x }`) is not matched, no live site (326-file census above).

Family-wide: homes. The 5 reviewed-grant rows became `homes` entries; a home that stops making the sealed read stays exempt until its path disappears, where the grant row used to go stale (a lost staleness check, D321 section 3 conversion).

## Waivers and grants

- 5 reviewed-grant rows (bound-field 1, chat-stream 1, selection 3): single-owner homes, now `homes` entries on the rule rows (use-bound-field.ts, chat-bus-writes.ts, create-drill-selection-store.ts, create-kinded-selection-store.ts, message-selection-store.ts). Rows deleted from `reviewed-grants-assets-to-home.ts` and `reviewed-grants-no-to-factory.ts`.
- Waiver budget rows removed: bound-field-via-hook, chat-stream-writes-in-bus-only, selection-store-via-factory.
- `@orb-waive` markers for the seven ids lived only inside the deleted gate files and deleted test rows; none remain in the tree.
- No inline disable, no bulk-suppression entry, no budget raised.

## Deleted

`tooling/src/verify/gates/{bound-field-via-hook,chat-stream-writes-in-bus-only,bus-on-data-no-store-write,selection-store-via-factory,registry-assembly-at-door-only,registry-context-via-mint,state-files}.ts`, their arms in `tests/tooling/verify/gates/_liveness/{authored,client-app,client-ui}.ts`, their cases in the five family suites and `native-origin-consumers-delivery.int.test.ts`, and the `bus-on-data-no-store-write` row in `tests/tooling/gate-spelling-twins.baseline.json`. Prose spellings repointed to `orb/<id>`.

Kept (other importers): `lib/project-home-origin.ts`, `lib/sealed-origin.ts`, `lib/reviewed-grant-findings.ts`, `lib/react-origin.ts`, `lib/origin-verdict.ts`, `gates/_proof/react.ts`. No fact producer was involved (`facts: []` on all seven).

## Owed to primary

- `docs/law/Core-Enforcement-Active-Gates.md` catalog regeneration.
- `pnpm lint:eslint-scoped` over `eslint.config.js`.
- `tests/tooling/gate-spelling-twins.int.test.ts` (whole-corpus census).
- `native-origin-consumers-delivery.int.test.ts` test "actual structure and scoped origin/query consumers..." (runs a structure verb on a scratch fixture; timed out at 60 s under the heavy lock, the other tests in the file passed; the four family suites passed).
- `tests/tooling/verify/gates/_liveness/*` real-corpus liveness suites (whole tree).
