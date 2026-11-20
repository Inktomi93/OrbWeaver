---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: world-info
---

# Another tab cannot overwrite a lorebook entry edit

## What

The entry update in `packages/server/src/domain/world-info/verbs/entries/update.ts` replaces keys and metadata whole and carries no revision, so a stale tab overwrites a newer save of the same entry. Carry the revision the editor read, refuse a stale write with a typed outcome, and show the conflict in the entry editor.

## Why

Keys and metadata are replaced as a unit, so the lost edit is the entire keyword set or every activation setting.

## Done when

A server test updates an entry with a stale revision and gets the typed refusal with the stored row unchanged, and a client test shows the conflict in the editor.

## Evidence

Filled at landing: what ran and where its output is.
