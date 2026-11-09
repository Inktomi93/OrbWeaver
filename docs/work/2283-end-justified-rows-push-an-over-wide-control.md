---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: ui
plan: cross-surface-consistency
---

# End-justified rows push an over-wide control past the start of its scroller at enlarged text

## What

The dialog footer at `packages/ui/src/primitives/dialog/variants.ts:54` and the Row `justify` end step at `packages/ui/src/layout/variants.ts:180` use `justify-end`, not the safe form. When one nowrap control is wider than its line, the overflow goes past the start edge, where no scroll position reaches it. Examples: Fetch and add in `packages/client/src/features/databank/components/add-document-body.tsx:470`, Add selected in `packages/client/src/features/chat/components/gallery-add-picker.tsx:207`, and the refinery apply row at `packages/client/src/features/refinery/components/apply-row.tsx:35`. Shows at desktop 200%, desktop 300%, phone 200%, phone 300% text on: Characters independent commands; Characters independent greeting; Characters independent trust-actions; Chat existing engaged game room; Chat library and primary composer; Config independent category connections; Config independent category personas; Rail independent databank; Rail independent refinery; Refinery disposable stage execution and versions.

## Why

Content past a scroller's start edge cannot be scrolled into view, so the control is lost.

## Done when

End and centre alignment in `@orb/ui` falls back to the start when its content overflows. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: commands-bulk-tag-create, config-add-connection-empty-draft, config-persona-original-editor, context-chat-*-tabs-*-*-disclosure-*, databank-add-*, gallery-candidates-loaded, gallery-copy-empty, greeting-preview-*, message-message-*-independent-menu-safe-drill-Edit-message, refinery-execution-*, refinery-refinery-\*.

## Evidence

Filled at landing: what ran and where its output is.
