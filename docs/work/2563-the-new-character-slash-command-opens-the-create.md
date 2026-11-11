---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
---

# The new-character slash command opens the create form

## What

The new-character slash command lands on the Characters section because no dedicated create-character flow exists to route to (packages/client/src/features/character/components/slash-new-character-mount.tsx). Lint refuses a marker comment for unbuilt work, so the gap is recorded here.

## Why

A command named for creating a character should open the form, not the list.

## Done when

The command opens the character create form directly, focused on its first field, with a component test through the palette. If the owner rules the list is the intended landing, the command's label says so and this item closes with the reason.

## Evidence

Filled at landing: what ran and where its output is.
