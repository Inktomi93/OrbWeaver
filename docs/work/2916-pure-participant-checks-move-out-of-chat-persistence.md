---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# Pure participant checks move out of chat persistence

## What

`isArbiterEligible` and `assertForcedCharacterMember` in `packages/server/src/domain/chat/persistence/participant.ts` read no table. Substrate files import them from persistence, which keeps those files tied to a persistence module. Move both beside the other participant classifiers in substrate.

## Why

A pure helper in a persistence file makes its pure callers look like I/O and blocks the indirect-route policy.

## Done when

Both functions live in chat substrate, their importers are repointed, and their tests still run through the production entry.

## Evidence

Filled at landing: what ran and where its output is.
