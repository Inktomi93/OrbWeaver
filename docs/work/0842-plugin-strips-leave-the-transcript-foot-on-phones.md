---
kind: work
status: doing
updated: 2026-10-11
priority: P2
area: client
lane: wt/agent-a9603c332ec7acdab
---

# Plugin strips leave the transcript foot on phones

## What

On phones, chat-flank plugin surfaces and the Plugin panels bar sit under the last message and eat transcript height. There is no room-header anchor (CHAT_SURFACE_ANCHORS in packages/client/src/lib/contribution-contracts.ts:30), and the This chat drawer section is host-only. Proposed by the mobile lane: a room-header anchor with one icon that opens a sheet holding the flank surfaces, mounted once by a coarse-pointer predicate so no plugin frame mounts twice.

## Why

Owner approved moving the plugin strip off the transcript on phones; deferred because it needs a new anchor.

## Done when

On coarse pointers the flank surfaces mount once inside a header-opened sheet, never twice, with a CT for single mounting and member visibility. Every plugin chat panel carries a one-tap Hide action with undo, and each plugin's row in the Plugins pane has a Show in chat switch that brings it back; the choice is per plugin, per user, across all rooms, stored in user settings (no DB schema change), with CTs for hide, undo and re-show.

## Evidence

Filled at landing: what ran and where its output is.

Owner ruling: plugin panels show by default with a one-tap hide on the panel, and the per-plugin Show in chat switch lives on the plugin's row; scope is per plugin for that user in every room.
