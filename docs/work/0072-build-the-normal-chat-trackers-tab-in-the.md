---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: client
plan: world-state-clips
---

# Build the normal-chat Trackers tab in the context pane

## What

Add a Trackers tab to the context pane of a normal (non-game) chat, rendering the chat's trackers with the tracker block kit in `packages/client/src/components/tracker-blocks/`. The chat section's context tabs are members, settings and preview today.

## Why

The context panel program specified this tab and left it unbuilt: it depends on the world-state layer or the steering wave. The world-state-clips plan names it.

## Done when

A normal chat with trackers shows a Trackers tab that renders them with the block kit, and a chat without trackers shows no empty tab. A CT pins both cases.

## Evidence

Filled at landing: what ran and where its output is.
