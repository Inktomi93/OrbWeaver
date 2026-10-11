---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Plugin strips leave the transcript foot on phones

## What

On phones, chat-flank plugin surfaces and the Plugin panels bar sit under the last message and eat transcript height. There is no room-header anchor (CHAT_SURFACE_ANCHORS in packages/client/src/lib/contribution-contracts.ts:30), and the This chat drawer section is host-only. Proposed by the mobile lane: a room-header anchor with one icon that opens a sheet holding the flank surfaces, mounted once by a coarse-pointer predicate so no plugin frame mounts twice.

## Why

Owner approved moving the plugin strip off the transcript on phones; deferred because it needs a new anchor.

## Done when

On coarse pointers the flank surfaces mount once inside a header-opened sheet, never twice, with a CT for single mounting and member visibility.

## Evidence

Filled at landing: what ran and where its output is.
