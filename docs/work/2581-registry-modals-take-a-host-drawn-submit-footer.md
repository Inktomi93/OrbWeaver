---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Registry modals take a host-drawn submit footer

## What

A registry modal that commits hands its submit to the host, and the host draws the footer. `ModalDefinition` in `packages/client/src/state/modal-registry.ts` gains a commit kind whose body is a hook-shaped function that returns its content and a submit typed as `FormDialogSubmit` from `packages/client/src/components/form-dialog.tsx`. `ModalHost` calls it inside a component keyed by the modal id and draws Cancel and the submit through `CommitRow`, in the dialog and the drawer presentations. The add-document, imagine and plugin command bodies move to that kind; each add-document mode returns its own submit. The plugin command body moves after the plugin host change it depends on. A context that a body registers its submit with is refused: a body that never registers would compile and show no footer.

## Why

These bodies build their own footers, so Cancel and the submit differ from every form dialog in order, wording and busy state. Type law 5 in `docs/law/client-architecture-lockdown.md` asks that a wrong composition fails the typecheck, and a commit body with no submit compiles today.

## Done when

A commit-kind modal with no submit fails the typecheck, shown by a type test. Component tests on the production add-document and imagine modals show the host-drawn Cancel and submit in the dialog and the drawer presentations, with the submit disabled and busy states read from the body. No registry modal body renders a footer of its own.

## Sites

| Site | What it is |
| - | - |
| `packages/client/src/features/databank/components/add-document-body.tsx:323` | Registry modal footers built by each body |
| `packages/client/src/features/databank/components/add-document-body.tsx:368` | Registry modal footers built by each body |
| `packages/client/src/features/databank/components/add-document-body.tsx:483` | Registry modal footers built by each body |
| `packages/client/src/features/imagery/components/imagine-body.tsx:223` | Registry modal footers built by each body |
| `packages/client/src/features/plugin/components/plugin-command-args-body.tsx:205` | Registry modal footers built by each body |

## Evidence

Filled at landing: what ran and where its output is.
