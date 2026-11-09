---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: ui
plan: surface-walk
---

# Popover popup is wider than the phone at enlarged text and cuts off its fields

## What

`packages/ui/src/primitives/popover/variants.ts:17` caps the popup at `max-inline-cq-24` and clamps only its block size to `--available-height`. Nothing clamps it to `--available-width`, so `body` clips the right of its fields. Consumers seen: the ColorField popover (Pick color and Hex), Add a character in `packages/client/src/features/chat/components/add-member-popover.tsx:47`, and Start a refinery session in `packages/client/src/features/refinery/components/start-session-door.tsx:54`. Shows at phone 200%, phone 300% text on: Characters independent look; Characters independent relations; Characters independent source-context; Chat existing engaged game room; Chat existing group room; Chat primary Context; Rail independent refinery.

## Why

A popup sized in rem outgrows a phone viewport at enlarged text, so its fields run off the screen edge.

## Done when

The popover popup fits the available width. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: context-chat-*, copy-context-*, look-colour-*, original-context-*, refinery-sessions-\*.

## Evidence

Filled at landing: what ran and where its output is.
