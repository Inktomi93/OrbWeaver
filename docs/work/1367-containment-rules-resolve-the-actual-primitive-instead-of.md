---
kind: tooling
status: open
updated: 2026-10-25
priority: P2
area: client
---

# Containment rules resolve the actual primitive instead of its JSX name

## What

The containment selectors in `tooling/src/eslint/ui-feature-policy.ts` trust names such as Container, Section, Stack and a Dialog or Drawer suffix. The surface-purity check in `tests/client/feature-layout.suite.test.ts` uses a literal JSX-name pattern. Resolve supported imports and aliases so recognition follows the actual containment owner.

## Why

A renamed primitive can escape a name-based restriction, while an unrelated component name can appear to provide containment. File-level JSX presence does not prove rendered containment.

## Done when

Add planted alias, namespace and unrelated-name controls before changing the retained rules. Preserve real dialog anchors and the documented inside-surface anchor form. Reconcile current sites without baselines. Distinguish static identity checks from runtime containment proof; qualify affected rendered geometry without claiming arbitrary render-path analysis.

## Evidence

Resolution: `tooling/src/eslint/ui-containment.ts` holds `orb/surface-consumes-container` and `orb/anchor-provides-container`. Both resolve a JSX name through `importedSymbol` (`tooling/src/eslint/static-values.ts`), which follows a named import, an alias, a namespace member and a destructured namespace. A name that comes from a relative or `#` import is then traced with the type checker (`nativeOf` in `tooling/src/eslint/test-routes.ts`) through every re-export to the file that declares it, so a feature module that re-exports an `@orb/ui` primitive under any name keeps its identity. A same-named symbol declared in another module does not. A file without type information is judged by its import door alone. `ui-feature-policy.ts` keeps only the selectors that need no resolution (`SURFACE_SELECTORS`); the name-based selectors are deleted.

- Container, or Section and Stack with `container` on, from `@orb/ui/layout` own containment however they are renamed. A same-named local component or one from another module does not.
- A `container` flag or spread on any element still counts in a surface, because it declares containment whatever the element is.
- A dialog box is a `*Dialog` or `*Drawer` export of `#components`, a sibling anchor file or a sealed `@orb/ui` modal door, returned by the anchor and not nested in another element. A local component or another package's export with a dialog name is not one.
- The surface-purity check is part of `orb/surface-consumes-container`. It resolves the `Dialog`, `AlertDialog` and `Drawer` roots from `@orb/ui/dialog`, `@orb/ui/alert-dialog` and `@orb/ui/drawer`, so a comment or an unresolved name is not a finding. `tests/client/feature-layout.suite.test.ts` keeps the naming and layout checks only.

Proof of re-export resolution: `tests/tooling/eslint-containment-reexport.int.test.ts` lints real fixture files with type information through the production config. A re-exported `Dialog`, a re-exported and renamed `AlertDialog`, a re-exported `Container` and a re-exported `Stack` with a computed `container` are findings in a surface, and a re-exported `Container` provides containment in an anchor. Against the rules without the checker step those cases failed. A `Container` and a `Dialog` declared by another module are not findings in a surface, and an anchor that renders that `Container` is a finding.

Proof: `tests/tooling/eslint-container-ownership.test.ts` (run with `pnpm test:tools`) holds the planted alias, namespace, destructured-namespace, computed-prop and unrelated-name cases beside the passing controls. Run against the previous name-based rules, the alias, namespace, destructured and unrelated-name cases failed. They pass against the resolved rules.

Reconciliation: `pnpm lint:eslint packages/ui/src packages/client/src` is clean, so no site needed a change and no baseline exists. Every anchor under `packages/client/src/features/*/anchors/` resolves (Container from `@orb/ui/layout`; FormDialog, FlowDialog and PickerDialog from `#components`; the gallery dialog by relative import). Client comments that cited the purity regex name the rule, and `docs/law/UI-Architecture-and-Layout.md` states the resolved behavior.

Limit: the rules follow a static import chain and re-exports. They do not prove that a render path mounts the container. Still uncaught: an identifier spread such as `<Stack {...p}>` where `p` carries `container`, `createElement(Dialog)` and any other non-JSX mount, and a container passed as a prop or built by a factory. Rendered geometry stays with the CTs that assert containment, for example `tests/ui/layout/container-props.ct.tsx`.

Cost: the checker step runs only for a name imported from a relative or `#` source, in surface and anchor files. The new rules do not appear in the `TIMING=1` slowest-rule table for the whole-tree run.
