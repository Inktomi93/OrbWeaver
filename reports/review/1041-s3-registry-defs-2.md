# 1041 s3-registry-defs-2

Shard: type-registry. Gates: modal-registry-completeness, modal-body-not-placeholder, section-factory-contribution-bundle, placeholder-copy-registry. Branch `wt/wf_4649b099-4cd-38`.

Outcome: three gates done, one escalated (section-factory-contribution-bundle).

## Successors

| Gate | Successor | Home |
| - | - | - |
| placeholder-copy-registry | runtime test over the real section registry | `tests/client/compose/authed-composition.dom.test.ts` |
| modal-registry-completeness | `orb/modal-definition-home` (declarator and function-return forms, bare or qualified type name), `orb/modal-definition-literal`, `orb/modal-definition-spelling` (alias and renamed import), plus the runtime test (id alignment with `MODAL_SLOT_IDS`, one `mobile-tab`, non-empty planned reason, surface reachability, every modal-home export assembled) | `eslint.config.js` `CLIENT_REGISTRY_RESTRICTIONS`; `tests/tooling/verify/ops/client-registry-native.suite.test.ts` |
| modal-body-not-placeholder | `orb/modal-body-not-placeholder`: no `SectionPlaceholder` import, re-export or member read in `packages/client/src` outside `features/app-shell/components` and `features/app-shell/surfaces` | same two files |
| section-factory-contribution-bundle | none. Escalated | gate stays |

## Survey

- codegraph_explore, one per gate: `modal-registry-completeness ModalDefinition modal-registry openModal MODAL_SLOT_IDS`; `modal-body-not-placeholder SectionPlaceholder modal body planned`; `section-factory-contribution-bundle makeCharactersSection SectionDefinition ContributorRegistry`; `placeholder-copy-registry SectionDefinition placeholder title description section-registry`.
- Scan base: `packages/client/src` holds 766 `.ts` and 816 `.tsx` files on disk.
- ast-grep `const $N: ModalDefinition = $V` over `packages/client/src`: `-l tsx` 11 hits (the 11 `features/*/lib/*-modal.tsx` homes), `-l ts` 0 hits. Second method: `rg ModalDefinition` outside the homes finds only imports, parameter types and comments, no stray annotation or return type.
- ast-grep `import { SectionPlaceholder } from $S` over `packages`: `-l tsx` 3 hits (`modal-host.tsx`, `section-context-host.tsx`, `app-shell.tsx`, all shell), `-l ts` 0. Second method: `rg SectionPlaceholder` outside the shell finds `SectionPlaceholderCopy` and one comment.
- `pnpm ast` was not run (owner rule: no whole-tree runs).

## Red first and planted violations

Native suite (`pnpm test:scoped tests/tooling/verify/ops/client-registry-native.suite.test.ts`):

- Against the previous attempt's config the new rows failed: `expected [] to deeply equal [ 'orb/modal-body-not-placeholder' ]` (body reached through a non-shell module) and `expected [] to deeply equal [ 'orb/modal-definition-home' ]` (qualified `S.ModalDefinition`). Exit 1, 2 of 9 failed.
- Then the function-return and `export { SectionPlaceholder as Empty }` rows failed on the config without those selectors (2 of 9 failed), and passed once the selectors landed (9 of 9).

Runtime test (`pnpm test:scoped tests/client/compose/authed-composition.dom.test.ts`), production plants, each reverted by edit:

- `corpus-section.tsx` description set to `""`: `empty copy: corpus`, exit 1.
- `imagine-modal.tsx` placement `mobile-tab`, `new-chat-modal.tsx` body `{ planned: "" }`, `imagery-store.ts` `openModal("imageDetail")` changed to `"imageEdit"`: `empty planned reason: newChat`, `duplicate mobile-tab: imagine repeats you`, `unreachable surface modal: imageDetail`, exit 1.
- New file `features/imagery/lib/zzv-unassembled-modal.tsx` (inline literal, `id: "you"`, `mobile-tab`, `planned: ""`) never assembled: `unassembled modal: features/imagery/lib/zzv-unassembled-modal.tsx exports zzvUnassembledModal`, exit 1.

Real door, `pnpm exec eslint <planted files>` with the repo config, exit 1 each time:

- `S.ModalDefinition` stray outside a home: `orb/modal-definition-home` 3:14.
- stray `S.ModalDefinition` with a `SectionPlaceholder` body: `orb/modal-body-not-placeholder` 2:10 and `orb/modal-definition-home` 4:14.
- `zzv-body.tsx` (feature module importing `SectionPlaceholder`, referenced as `body: ZzvBody` from a home): `orb/modal-body-not-placeholder` 1:10.
- `type Alias = Renamed` after `import { ModalDefinition as Renamed }`: `orb/modal-definition-spelling` 1:15.
- `makeModal = (): ModalDefinition => ...` outside a home: `orb/modal-definition-home` 3:26.
- `export { SectionPlaceholder as Empty } from ...` outside the shell: `orb/modal-body-not-placeholder` 1:10.

All plants deleted. The 11 live modal homes and the 3 shell importers lint clean (exit 0). Lint ids only; other repo rules on the plants are not claimed.

## Parity (mustFlag and mustPass rows of the deleted gate files)

### placeholder-copy-registry: parity 6 mustFlag / 8 mustPass ported 4 / 4, K lost 2

- Ported mustFlag: duplicate pair, empty title (`"" as string`), factory-authored duplicate, aliased copy (identical resolved strings).
- Lost: builder definition and computed title. Runtime values are always readable, so these unreadable arms disappear (audit target states this).
- Ported mustPass: distinct pairs, shared title with different description, whole placeholder from a shared constant, factory with distinct copy.
- Moot mustPass: absent placeholder (the field is required by `SectionDefinitionBase`), same-file indirection, local-type shadow, waiver identity.
- Lost claim, scope narrowing: the gate judged every `SectionDefinition` declared anywhere in `@client`; the test judges the sections the production door assembles. A section declared in a home and never assembled is not compared. The registry is total over `SECTION_IDS`, so such a section is never rendered.
  - Census (no live population): `ast-grep run -l tsx -p SectionDefinition packages/client/src` finds the import in 9 section homes (`config-section`, `presets-section`, `databank-section`, `refinery-section`, `corpus-section`, `characters-section`, `extensions-section`, `chats-section`, `home-section`) plus consumers; `-l ts` finds only `state/section-registry-context.ts`, `state/assemble-chrome.ts`, `state/index.ts`. 9 declaring homes against 9 `SECTION_IDS` (`packages/client/src/state/section-ids.ts:18`), and the runtime test asserts the door assembles exactly `SECTION_IDS`. Scanned 766 `.ts` and 816 `.tsx` files under `packages/client/src`.

### modal-registry-completeness: parity 9 mustFlag / 7 mustPass ported 9 / 4, K lost 0 rows

- Ported mustFlag: cross-package const (`-literal`), not co-located (`-home`), imported initializer (`-literal`), builder (`-literal`), empty planned (test), duplicate singleton (test), duplicate id (test), unreachable surface (test), local `openModal` is not an opener (scan control in the test).
- Ported mustPass: full modal (live registry), planned surface (control), aliased import (scan control), `satisfies` wrapper (lint).
- Divergent mustPass, stricter, no live site: same-file indirection is refused by `-literal`; a local type named `ModalDefinition` outside a home is refused by the name selector (type identity is by name, not by declaration); waiver identity has no successor because no waiver mechanism exists.
- Recorded lost claims:
  - Type identity is by name. `ModalDefinition` reached by a bare, `S.`-qualified or `import("x").`-qualified reference, a type alias, a renamed import or re-export, and a return type of a function outside a home are all refused. Not matched by lint, and the old gate flagged them: (a) a definition typed only by inference (no annotation, `satisfies` alone: the old gate did not flag a `satisfies`-only stray either, so that is not a loss), (b) an annotation that resolves to `ModalDefinition` without spelling it, namely `typeof someModal` and a generic identity alias such as `Id<ModalDefinition>`. The runtime test still judges (a) and (b) when the door assembles the definition or a home exports it.
  - Census for (b), no live population: `ast-grep run -l ts -p 'const $N: typeof $X = $V' packages/client/src` 0 hits and `-l tsx` 0 hits (766 `.ts` and 816 `.tsx` scanned; positive control on `packages/server/src/infra/network/egress.ts:1346` matched with the same pattern over `packages`). `rg 'typeof \w*[mM]odal\b|<ModalDefinition>|ModalDefinition>|ReturnType<typeof \w*[mM]odal' packages/client/src --glob '*.{ts,tsx}'` 1 hit, `state/modal-registry-context.ts:10` `type ModalRegistry = Registry<ModalSlotId, ModalDefinition>`, a registry type, not a definition annotation. `ModalDefinition` appears in 19 files under `packages/client/src`; the 11 annotated declarations are all bare `const $N: ModalDefinition` in `features/*/lib/*-modal.tsx` (`ast-grep -l tsx` over `packages tests`, 0 hits `-l ts` in `packages`). No waiver or grant names these forms.
  - The old header says assembled-list tests do not replace unassembled definitions. The runtime test now imports every `features/*/lib/*-modal.{ts,tsx}` and names any exported definition the door does not assemble. A definition in a home that is not exported and not assembled is invisible; it cannot be opened.
  - Unreadable definitions (a builder in a home) are refused by `-literal` instead of reported as unreadable.

### modal-body-not-placeholder: parity 3 mustFlag / 7 mustPass ported 3 / 4, K lost 0 rows

- Ported mustFlag: direct import, aliased import (`as Empty`), builder (`-literal`).
- Ported mustPass: planned body, real body, local component shadow, same-file indirection.
- Divergent mustPass, stricter: a placeholder rendered inside an imported non-shell component, and an impostor-typed modal that imports the real `SectionPlaceholder`, are refused at the importing module (the import ban has no subject); waiver identity has no successor.
- Recorded lost claims (D328 retained-unqualified):
  - Origin resolution: the rule matches the name `SectionPlaceholder`. It sees imports, re-exports by `export { SectionPlaceholder as X }`, and namespace member reads. It does not see a module that re-exports the shell file with `export * from`, and it does not see a shell component other than `SectionPlaceholder` itself (for example `ModalHost`) that a body references. No live site: no module outside the shell mentions `SectionPlaceholder`.
  - Subject identity is gone because the ban is not scoped to modal bodies. It covers all of `packages/client/src` outside `features/app-shell/components` and `features/app-shell/surfaces`, so a body written as a reference to an imported component is caught at that component's module.

### section-factory-contribution-bundle: parity 7 mustFlag / 8 mustPass ported 0 / 0, K lost 7. ESCALATE

- The audit selector `params.length>1` reds the live legal factory `makeCharactersSection(detailContributors, chatsProjection)` (one registry plus one render prop, §12 row 5 Arm A). Accepting it changes the law and the factory API.
- A faithful port needs type identity (barrel re-export, renamed import, eleven-hop alias chain, aliased render prop, same-name impostor). That needs a typed lint rule and a program per owner.
- Deleting the gate breaks `tests/tooling/verify/ops/native-type-projection-delivery.int.test.ts`, which imports it as the section member of the native type-projection delivery cohort (its proof rows are the cohort's retained controls).
- Gate, family test pins and liveness arm stay. No code change was made for this gate.

## Verifier round 2 (finding on modal-registry-completeness, P3)

- Refuted claim: `const x: import("<path>").ModalDefinition = {...}` outside a home passed lint, because `eslint.config.js` `typeReferenceNamed` and the declarator pinned `TSTypeReference`, and typescript-estree parses an import type as `TSImportType` (name under `qualifier`, not `typeName`). The old gate flagged it.
- Fix, covered not recorded: `typeReferenceNamed` now also matches `qualifier.name` and `qualifier.right.name`, and the `type='TSTypeReference'` pins are dropped, so the home, literal and spelling rules all see the import-type form (declarator, function return type, alias).
- Red first: `pnpm test:scoped tests/tooling/verify/ops/client-registry-native.suite.test.ts`, 1 of 9 failed, `expected [] to deeply equal [ 'orb/modal-definition-home' ]` at the new import-type row. Green after the fix, 9 of 9.
- Real door: planted `packages/client/src/features/imagery/lib/vq-import-type.ts` (`export const vqImportType: import("../../../state/index.ts").ModalDefinition = {...}`). `pnpm exec eslint <file>`, exit 1, `1:14 error ... orb/modal-definition-home`. Plant deleted. The 11 modal homes, `modal-host.tsx` and `modal-registry.ts` lint clean (exit 0).
- Live census of the widened selectors: ast-grep `const $N: import($S).ModalDefinition = $V` and `type $N = import($S).ModalDefinition` over `packages` and `tests`, `-l ts` and `-l tsx`, 0 hits each (positive control on a scratch file matched). `rg 'import\(.*\)\.ModalDefinition' packages tests` 0 hits. Client scan base 766 `.ts` and 815 `.tsx` files.
- Docs nit: G13 row in `client-architecture-state-and-gates.md` and the list in `UI-Gates-and-Lessons.md` now name `orb/modal-definition-spelling`.
- Cherry-pick conflicts (`client-architecture-lockdown.md`, `client-architecture-state-and-gates.md`) resolved by keeping main's G11, G12, G14 rows and this shard's G13 row.
- Still owed: `lint:eslint-scoped`, regeneration of `docs/law/Core-Enforcement-Active-Gates.md` (fenced, still lists the deleted ids).

## Scaffolding removed

- `tooling/src/verify/gates/{modal-registry-completeness,modal-body-not-placeholder,placeholder-copy-registry}.ts`.
- `tests/tooling/verify/gates/_liveness/client-app.ts`: three imports and three arms.
- `tests/tooling/verify/gates/registry-family.suite.test.ts`: three imports, three proof-list entries, the placeholder refusal pin and its constants, the four modal-body pins and their constants. The blind-provider isolation test pairs `home-tile-registry-completeness` with `section-registry-completeness`.
- Repointed comments: `tooling/src/verify/lib/registry-fact.ts`, `topbar-trail.tsx`, `extensions-copy.ts`. Law prose: `client-architecture-state-and-gates.md` G13 row, `client-architecture-lockdown.md`, `UI-Gates-and-Lessons.md`, `UI-Architecture-and-Layout.md`. ADR 0073 enforcer list now names the runtime test.
- Grants, waiver-budget rows and spelling-twin rows: none existed for these ids.
- Kept producers: `registry-definitions-modal` and `-section` facts, `readJsxTagFact` (read by `tests/tooling/verify/lib/registry-fact.test.ts`). Section-factory and section-registry gates still read the section fact. They retire in s6-delete-facts-1.

## Waivers

The `@orb-waive` markers for the three deleted ids sat in the deleted gate files (fix text and fixture rows). They are gone with the files, disposition removed-dead. No marker, grant or budget row remains. The `section-placeholder.tsx` markers waive `empty-state-has-action`, not these gates; one text names `modal-body-not-placeholder`, which the native rule keeps as its id.

## Test budget

The first test of `client-registry-native.suite.test.ts` pays the cold ESLint config load; its budget is 120 s. No assertion changed.

## Owed to primary

- `pnpm lint:eslint-scoped` after the `eslint.config.js` edit.
- `pnpm check:ledgers-fresh` (`docs/law/Core-Enforcement-Active-Gates.md` still lists the three deleted gates; generated).
- `_liveness` runner and the wider verify battery.
- Inherited: `tests/tooling/verify/gates/_support.ts` has three type errors.

## Redo (verifier round 3)

- ADR 0073 is immutable; the earlier edit to its enforcer list is reverted. The surface-reachability arm now lives in `tests/client/compose/authed-composition.dom.test.ts`, named in the law prose only.
- The `typeof` and generic-alias annotation forms are recorded as lost for `modal-registry-completeness` with the census quoted above.
- Re-run on this tree: `client-registry-native.suite.test.ts` 9 of 9, `authed-composition.dom.test.ts` 8 of 8. Real-door plant (`S.ModalDefinition` stray importing `SectionPlaceholder`): `orb/modal-body-not-placeholder` 2:10 and `orb/modal-definition-home` 4:14, exit 1. Runtime plant (corpus description `""`): `empty copy: corpus`, exit 1. Both plants removed.
- `section-factory-contribution-bundle`: escalate. The audit selector `params.length>1` reds the live legal `makeCharactersSection(detailContributors, chatsProjection)` (`packages/client/src/features/character/lib/characters-section.tsx:47`); accepting it changes the §12 row 5 law and a factory signature with callers in `compose/authed-composition.tsx`, `features/character/index.ts` and `tests/support/browser/ct-data-providers.tsx`. Faithful identity (barrel, rename, alias chain, aliased render prop) needs a typed rule per owner program. The gate also anchors `tests/tooling/verify/ops/native-type-projection-delivery.int.test.ts`.
