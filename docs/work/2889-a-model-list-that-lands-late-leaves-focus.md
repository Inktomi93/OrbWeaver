---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# A model list that lands late leaves focus on the control the reader moved to

## What

In the Add a connection dialog the model picker takes focus when its list lands, unless focus is in a text field (`packages/client/src/lib/use-focus-on-mount.ts`, the picker in `packages/client/src/features/credentials/components/draft-models-check.tsx`). When the reader leaves the key field for a button such as Show key, the list lands and takes focus from that button.

## Why

Focus that moves while the reader is on another control sends the next key press to the wrong place.

## Done when

A component test leaves the key field for a button, lets the list land, and finds focus still on that button; the picker still takes focus after a saved-key choice and a provider pick.

## Evidence

Filled at landing: what ran and where its output is.
