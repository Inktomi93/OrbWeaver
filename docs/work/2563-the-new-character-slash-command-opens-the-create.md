---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: client
---

# The new-character slash command opens the create form

## What

The palette's new-character command does not open the create form. The request channel in `packages/client/src/lib/open-request-channel.ts` keeps nothing for a listener that mounts later, the palette closes its own modal before the command runs, and two shell layouts of the Characters section mount no listening door. Build a request store in client state after the pattern of `packages/client/src/state/connection-editor-request-store.ts`, taken once by a host mounted in every layout of the Characters section that renders the existing new-character dialog. The command switches to the Characters section, then files the request. When the dialog closes, focus lands on the section's New door, or on the section heading where no door is mounted.

## Why

A command named for creating a character should open the form, not the list.

## Done when

The command opens the create form from any section and any shell layout with focus on its first field, closing it lands focus by the rule above, and a component test drives it through the palette on desktop and phone.

## Evidence

Filled at landing: what ran and where its output is.
