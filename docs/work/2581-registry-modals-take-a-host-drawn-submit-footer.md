---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# Registry modals take a host-drawn submit footer

## What

The registry modal path has no explicit-submit owner, so the add-document, imagine and plugin command argument bodies each build their own footer. ModalDefinition gains an explicit-submit footer the host draws and those bodies use it. The plugin command body sits in the plugin area; sequence it after the plugin host branch.

## Why

With no owner for a commit, each body builds its own footer and they differ.

## Done when

Those bodies build no footer, and the host's footer is tested on the phone sheet and on the centered dialog.

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
