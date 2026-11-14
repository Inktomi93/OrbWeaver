---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Controls that can still overflow at enlarged text

## What

Sites the round-two builders saw and did not own. The accordion panel in `packages/ui/src/primitives/accordion/variants.ts` clips a flush control's focus ring the way the collapsible panel did. List rows that pass their actions inside a wrapper Row keep them on one line: `packages/client/src/components/entry-list-editor.tsx`, `packages/client/src/features/preset/components/actions-view.tsx`, `packages/client/src/features/preset/components/prompt-assembly/section-row.tsx`, `packages/client/src/features/user-admin/components/admin-link-sso-section.tsx` and `packages/client/src/features/user-admin/components/admin-user-row.tsx`. The picker cell label in `packages/ui/src/primitives/picker-cell/variants.ts` and control values in `packages/client/src/components/character-picker.tsx`, `packages/client/src/components/regex-script-picker.tsx`, `packages/client/src/components/editable-tag-chip.tsx` and `packages/client/src/features/credentials/components/connection-editor.tsx` still end in an ellipsis. The tooltip popup does not break a long word. The card action row in `packages/client/src/features/chat/components/chat-controls-band.tsx`, the update verdict row in `packages/client/src/features/user-admin/components/about-section.tsx` and the download button in `packages/client/src/features/workloads/components/export-library-section.tsx` do not wrap. A toggle group breaks a one-word label only where its caller asks.

## Why

Each is the same defect the pass just fixed elsewhere, so the next walk at enlarged text will report it again.

## Done when

Each site has a reflow case at enlarged text on a phone that was red before its fix, and the fix sits in the shared piece where several sites share one cause.

## Evidence

Filled at landing: what ran and where its output is.
