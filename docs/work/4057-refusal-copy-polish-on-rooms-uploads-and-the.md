---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-a6726678d1a085caf
plan: unwired-code
---

# Refusal copy polish on rooms, uploads and the connection forms

## What

The rendered review of the client refusal codes found: room failure copy says room for every channel and names no action (packages/client/src/data/bus/room-failure-notice.ts); the add-connection form footer repeats the field copy with a capital after the colon (add-connection-form-model.ts); the avatar refusal lists the formats twice (upload-refusal-copy.ts); the Server URL refusal explains both cases instead of the one that applies (connection-refusal.ts); @orb/ui Field errors have no width cap; clearing Server URL or Name in the connection editor silently does nothing (connection-editor-essential.tsx).

## Why

Each makes a refusal harder to read or act on, or hides that an edit was dropped.

## Done when

Room copy names the channel kind and the action, the footer and avatar copy say each thing once, the Server URL refusal names the case that applies, Field errors take a measure cap, and clearing a required editor field says it was kept; each with a CT.

## Evidence

Filled at landing: what ran and where its output is.
