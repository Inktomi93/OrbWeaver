---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: ui
lane: wt/agent-a88fe4fa1ec4fa014
plan: cross-surface-consistency
---

# Dialog title is squeezed to less than one line in a full dialog at 300% text

## What

`packages/ui/src/primitives/dialog/variants.ts:50` adds `truncate` under `dialog-short:glass-short`. `truncate` sets `overflow: hidden`, so the title's flex minimum height drops to zero. In a `DialogBody` whose content is taller than the dialog, the title shrinks below its line height and loses the bottom of its text. A CT read reproduced it: line height 66px, client height 55px. Titles seen: Rewrite the reply, Link a world book, Connect a persona, Book details, Add a connection. Shows at desktop 300%, phone 300% text on: Characters independent relations; Characters independent source-context; Chat existing engaged game room; Chat library and primary composer; Config independent category connections; Config independent category worldInfo.

## Why

A flex child with clipped overflow can shrink below its content, so a full dialog cuts its own title.

## Done when

The truncating title keeps its full line height in a full dialog. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: composer-chat-*, config-add-connection-empty-draft, config-world-info-details, copy-context-*, original-context-\*.

## Evidence

Filled at landing: what ran and where its output is.
