---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: import
plan: import-robustness
---

# An imported SillyTavern message written before ISO dates shows its time shifted by the writer's zone offset

## What

Older SillyTavern messages and every chat creation date carry a local wall time with no zone. The import reads them as UTC, stores that instant, and the client shows it in the viewer's zone, so a message written at a local afternoon hour shows shifted by the writer's offset from UTC. The import identity must keep reading the text as UTC so the same folder gives the same identity on every host. The stored display instant is a separate value: let the importer say which zone the source chats were written in, defaulting to the importing browser's zone, and store the instant from that while the identity stays as it is.

## Why

The owner's library holds many messages in the zone-less form and each shows the wrong hour; the true zone is known to the person importing and to nobody else.

## Done when

An import with a stated source zone stores zone-less dates as the right instant, dates that carry a zone or are an epoch number are unchanged, the import identity of every file is identical with and without a stated zone, and already imported rooms have a stated way to be corrected or the item says why not.

## Evidence

Filled at landing: what ran and where its output is.
