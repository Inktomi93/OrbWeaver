---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: snap
---

# The surface drive takes the chat list sentinel from the client

## What

tooling/src/snap/ops/appearance-surface-drive.ts spells the open-chat sentinel latest itself. The client owns the sentinel set in packages/client/src/dev/agent-nav/index.ts.

## Why

A renamed sentinel would leave the drive asking the bridge for a chat titled latest. The refusal would read as an empty list rather than a misspelled request.

## Done when

The sentinel lives in a zero-import module the client bridge and the tooling both import.

## Evidence

Filled at landing: what ran and where its output is.
