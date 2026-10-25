---
kind: work
status: doing
updated: 2026-10-25
priority: P1
area: client
lane: closeout/dom
plan: css-system
---

# The client architecture gates the law names exist

## What

The UI law names gates that are not in `eslint.config.ts`, `tooling/src/eslint/` or `.dependency-cruiser.ts` (audit: `docs/plans/css-system/ui-law-enforcement-audit.md`, false-claim table): `no-effect-on-shared-selection`, `persistence-boundary`, `form-factory-for-multifield`, `no-form-reset-in-autosave`, `tanstack-form-only-in-shared`, `no-inline-invalidate-outside-seam`, `client-cache-surgery-only-in-data`, the `queryKey` `no-restricted-syntax` selector, `orb/modal-definition-home`, `orb/modal-definition-literal`, `orb/config-group-definition-home`, `no-multiplexed-mutation-error`, `no-parallel-section-map`. Several appear only as comments citing them.

## Why

A gate the law names and the tree lacks is a false guarantee; reviewers and lanes trust it.

## Done when

Each named gate either exists (ESLint `no-restricted-syntax`, a custom `orb/` rule, or a dependency-cruiser rule) with a planted control, and the current tree passes it or its sites are fixed; or the law drops the claim with a one-line reason the rule is not worth a gate. Comments that cite a gate cite only gates that exist. Candidate sites from the audit are judged, not assumed: the two `useEffect` files and the four raw-storage sites.

## Evidence

Rule tests: `tests/tooling/eslint-client-data-gates.test.ts` (planted positive and negative control per ESLint gate) and `tests/tooling/native-client-form-boundary.test.ts` (planted dependency-cruiser trees). The ESLint test failed first with the rules unregistered (`Could not find "persistence-boundary" in plugin "orb"`), then passed.

| Gate | Outcome |
| - | - |
| `no-effect-on-shared-selection` | Built: `orb/no-effect-on-shared-selection` (`tooling/src/eslint/client-data-policy.ts`), scope `features/**` minus `app-shell/`. It resolves each hook with the type checker to its declaring file: a pointer hook is declared in a `state/*-selection-store.ts` file or `state/active-chat-store.ts`, or its body calls one (one hop), and a parameter counts when a same-file call passes it one. Controls cover `usePersonaEditorId`, `usePluginPageKey`, `useCollectionSelection` and the wrapper `useActiveConfigGroup`. The audit's two files are not violations (`character-editor-surface.tsx` keys on props; `command-palette-surface.tsx` has an empty-deps effect). The rule found one real site, `config-list-surface.tsx`: its auto-open undo re-fired on the selection and wrote `closeConfigGroup`. The arrival default now selects through `arriveAtConfigGroup`, which does not write the disclosure memory, so the undo effect and `closeConfigGroup` are gone. Limit: a derived value, or a pointer handed through a prop or from another file, is not followed. |
| `persistence-boundary` | Built: `orb/persistence-boundary`, scope `packages/client/src`. The law sanctions the four homes itself (client-architecture-state-and-gates.md §10a, with each reason): `state/durable-local.ts`, `data/session-resume.ts`, `main.tsx` and `lib/probe-mode.ts`. `RAW_STORAGE_HOMES` in `eslint.config.ts` cites that section. |
| `client-cache-surgery-only-in-data` | Built: `orb/client-cache-surgery-only-in-data`, exempts `data/`. Zero sites outside `data/`. |
| `no-inline-invalidate-outside-seam` | Built: `orb/no-inline-invalidate-outside-seam`, exempts `data/invalidation.ts`. Its one call site is the seam. |
| `queryKey` selector | Built: native `no-restricted-syntax` block for `packages/client/src` in `eslint.config.ts`. Flags a `queryKey` property holding an array literal. The pre-auth HTTP reads keep named constant keys, which the selector does not see. |
| `orb/modal-definition-home`, `orb/modal-definition-literal`, `orb/config-group-definition-home` | Built in `client-data-policy.ts`. All 11 modal and 13 group definitions are `const x: <Def> = {…}` in `features/*/lib/`. Declared limit: only the annotated-const and `satisfies` spellings are judged. |
| `no-multiplexed-mutation-error` | Dropped by name. The one error slot is the `error` that `createEntityMutation` returns, so the true guard is confining `useMutation` to that file: built as `orb/mutation-only-in-factory` (zero sites outside it). |
| `tanstack-form-only-in-shared` | Built as dependency-cruiser `client-tanstack-form-only-in-forms-editor`. |
| `form-factory-for-multifield` | Dropped. The 3-field threshold is judgment. The structural half is `orb/no-direct-useform`, the new `client-tanstack-form-only-in-forms-editor`, and `client-forms-editor-front-door` (the editor internals, `useAppForm` included, are reachable only through `forms/editor/index.ts`, which exports the factories). |
| `no-form-reset-in-autosave` | Dropped. `AutosaveForm` omits `reset` from the type, and `tests/client/forms/editor/autosave-reset-strip.dom.test-d.ts` pins it. The tree has no `.reset(` on an autosave form. |
| `no-parallel-section-map` | Dropped. Keying data by a section or modal id is legitimate (`PanelOverrides`, `contentBySection`, `MODAL_CONTENT_LIFETIME`), so a type-key selector would need three exemptions and prove nothing. The wall is the total registries (type tests) and `assembleChrome` deriving from `sections.list()`. |

Comments that cited a dropped gate were rewritten; comments that cited a built gate now carry the `orb/` id. `DEVICE_LOCAL_REGISTRY` (`state/device-local-registry.ts`) exists and types the store door names, so the law keeps that sentence.
