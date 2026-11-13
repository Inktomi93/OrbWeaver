---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# One sheet composite draws the phone drawer chrome for the modal host and the plugin flank sheet

## What

The sheet chrome is written twice: in `packages/client/src/features/app-shell/components/modal-host.tsx` and in `packages/client/src/features/plugin/components/plugin-flank-sheet.tsx`, the only two importers of the drawer primitive. The two differ in header, focus mode, container and how they open. One sheet composite owns it, in the client components folder beside `FlowDialog` and `FormDialog`, with props for open state, title, an optional container, an optional final-focus resolver and the modal mode. Both callers take the sticky dialog header; the flank sheet's spacing changes to match and gets a rendered review. Sequenced after the plugin area's host work.

## Why

Two spellings of one chrome drift apart.

## Done when

Both files draw the one composite, no feature imports the drawer primitive, a component test covers each caller, and a rendered review has read the flank sheet.

## Sites

| Site | What it is |
| - | - |
| `packages/client/src/features/plugin/components/plugin-flank-sheet.tsx:45` | Phone sheet chrome written twice |
| `packages/client/src/features/app-shell/components/modal-host.tsx:121` | Phone sheet chrome written twice |

## Evidence

Filled at landing: what ran and where its output is.
