---
kind: adr
status: active
updated: 2026-09-23
---

# No gate forces Field.Control wrapping or namespaced Base UI type imports

## Context

A Base UI audit proposed two gates. One would require every `Field.Root` to wrap a literal `<Field.Control>`. The other would require namespaced type imports (`Select.Root.Props`) instead of flat aliases (`SelectRootProps`).

## Decision

<!-- @orb-waive ledger-symbol-liveness(@base-ui/react/field/control/FieldControl.d.ts): the installed package's own type declaration file, resolvable only under node_modules, never a repo-tracked path; ends if the citation ever needs to resolve on the tree -->

Neither gate exists. Base UI input components register with `Field` on their own. The doc-comment in `@base-ui/react/field/control/FieldControl.d.ts` says so: "You can omit this part and use any Base UI input component instead." The `Input` seal in `packages/ui/src/primitives/input/` renders Base UI `Input`, which is `Field.Control` underneath. A raw intrinsic control in `features/**` is already refused by `no-raw-interactive-intrinsics`. That is the only case where a missing `Field.Control` breaks association. The Base UI type tables sanction the flat alias when the namespace is not already imported. The `@orb/ui` seals use the flat aliases.

## Consequences

A `Field` that wraps a Base UI control needs no `Field.Control`. A seal may import a flat alias. Before you propose either gate again, re-read the `FieldControl` doc-comment and the type tables for the installed Base UI version. The `baseui-surface-manifest` gate tracks the installed surface.

## Alternatives rejected

A literal `Field.Control` gate. It reds correct call sites and our own `Field` primitive. A namespaced-import gate. It enforces a form the library does not require. No Base UI release marks the flat aliases as legacy.
