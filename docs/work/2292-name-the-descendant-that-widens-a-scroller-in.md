---
kind: tooling
status: open
updated: 2026-11-09
priority: P2
area: testing
plan: surface-walk
---

# Name the descendant that widens a scroller in the sideways finding

## What

`sidewaysColumns` in `tests/support/browser/enlarged-text-geometry.ts` names only the scroller. These scrollers scroll sideways with no clipped control to attribute them: `message-list-scroll` at `packages/ui/src/primitives/message-list/message-list.tsx:678`, `databank-content` at `packages/client/src/features/databank/surfaces/databank-detail-surface.tsx:56`, `menu-popup` at `packages/ui/src/primitives/menu/menu.tsx:83`, `shell-panel-body` at `packages/client/src/features/app-shell/components/panel-chrome.tsx:171`, `scroll-area-viewport` at `packages/ui/src/primitives/scroll-area/scroll-area.tsx:50`, a message `p`, and the home, refinery, corpus and character pane scrollers. Shows at phone 200%, phone 300% text on: Characters independent library; Characters independent trust-actions; Chat disposable generation and cancellation; Chat disposable held arrival; Chat disposable lifecycle commands; Chat disposable message operations; Chat existing engaged game room; Chat existing group room; Chat library and primary composer; Chat maintained arcade guest; Chat maintained oracle commands; Chat maintained polish and undo; Chat primary Context; Chat reading style bubble; Chat reading style document; Chat reading style echo; Chat reading style flat; Chat reading style hush; Chat reading style ripple; Chat reading style tide; Chat reading style whisper; Rail independent corpus; Rail independent databank; Rail independent home; Rail independent refinery; Refinery disposable stage execution and versions.

## Why

Without the widening element the finding cannot be filed against its component.

## Done when

The sideways finding names the widest descendant past the scroller's edge, a red-first control proves it, and the next text walk files each cause. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: bulk-selected, categorized-library, chat-arrival-first-read, chat-room-chat-*, composer-chat-*, context-chat-*, corpus-requested-pane-composition, databank-disposable-*, databank-document-*, generation-after-stop, generation-visible-held-stream, home-native-*, home-requested-pane-composition, home-whole-*, message-operations-*, reading-assistant-*, reading-user-*, refinery-execution-*, refinery-refinery-*.

## Evidence

Filled at landing: what ran and where its output is.
