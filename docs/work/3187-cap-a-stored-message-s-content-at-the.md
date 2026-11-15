---
kind: work
status: open
updated: 2026-11-15
priority: P1
area: chat
plan: import-robustness
---

# Cap a stored message's content at the commit door for every writer

## What

A stored message had no size bound: the send, commit and edit inputs were bare strings, the only limit was the request body size, and the column has no check. One contract constant now bounds a variant's content and its reasoning, checked in characters in the shared write builders of `packages/server/src/domain/chat/persistence/canon-write.ts` and in `packages/server/src/domain/chat/persistence/import-write.ts`, refusing by name and never truncating.

## Why

A stored message with no size bound is a missing boundary check whatever writes it: a script, a runaway model or an import. The regex output bound is the working limit; this is the backstop.

## Done when

Every content and reasoning write past the cap is refused by name at its door, a streaming reply that crosses it is stopped and its provider request aborted, an imported swipe past it is left out and named in the import report, and cases at the live commit door and at the import prove both.

## Evidence

Filled at landing: what ran and where its output is.
