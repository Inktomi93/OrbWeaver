---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: ui
lane: wt/agent-aeeecdd1ff632fbb2
plan: cross-surface-consistency
---

# Toasts cover the transcript's message actions at enlarged text

## What

The toast viewport at `packages/ui/src/primitives/toast/variants.ts:7` sits at the inline end below the chrome row with `max-inline-cq-24`. At enlarged text it covers the trailing third of the transcript, and the toast root takes the pointer over Edit message, Fork chat here, Add a reaction and More message actions. Seen with the fork and creation toasts. Shows at desktop 200%, desktop 300%, phone 200%, phone 300% text on: Characters independent library; Characters independent look-recovery; Chat disposable generation and cancellation; Chat disposable message operations; Chat maintained oracle commands; Chat reading style bubble; Chat reading style document; Chat reading style echo; Chat reading style flat; Chat reading style hush; Chat reading style ripple; Chat reading style tide; Chat reading style whisper; Rail independent home.

## Why

A rem-sized notice over the transcript blocks presses on the messages under it while it shows.

## Done when

The toast viewport leaves message actions pressable, or the walk shows that it does. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: chat-room-chat-*, generation-after-stop, home-native-*, look-failed-save-draft, look-keyboard-save-recovered, message-operations-\*, native-name-conflict, oracle-command-result.

## Evidence

Ruling (claude-b under delegation): an open toast is transient chrome with its own close and timeout, so the enlarged-text probe treats an open toast like pinned chrome rather than a cover of the controls under it; moving the stack cannot help because no transcript zone is free of message actions. Remaining work: the probe applies the ruling with a planted toast case.
