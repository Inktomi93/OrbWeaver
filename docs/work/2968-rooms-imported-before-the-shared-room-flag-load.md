---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: authorization-and-visibility
---

# Rooms imported before the shared-room flag load the host's global variables

## What

A room that was shared and then imported before the flag existed reads never shared, because the import wrote every user line under the importer and kept no trace of other authors (`packages/server/src/primitives/serde/chat-bundle/index.ts`, `packages/server/src/domain/import/verbs/import-chat-bundle.ts`). No statement can find those rooms. Only the owner's install exists. A file without the flag now imports as shared. A file that matches a room already in the library is skipped by byte equality, and a current export always writes the flag, so a file that says shared or omits the flag never matches an unflagged room.

## Why

Such a room can hold another person's text, and its host's global variables still load there.

## Done when

The owner rules the gap accepted or names a marker.

## Evidence

Filled at landing: what ran and where its output is.
