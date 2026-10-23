---
kind: plan
status: parked
updated: 2026-10-02
blocked: owner
---

# World state: durable narrative facts

## Goal

Retain useful narrative facts beside conversational memory when the owner resumes the program.

## Shape

The core concept distinguishes remembered dialogue from durable story facts. D55 and D94 retain their constraints; the storage, reconciliation and presentation design remains deferred. Production contracts are not yet built.

## Open questions

The owner resolves scope and terminology relative to RPG state before implementation.

## Rejected

A duplicate RPG tracker or an inherited feature list is not a committed design.

## Coupled sites

The live conversational-memory boundary is `packages/server/src/domain/chat/memory/`.

## Test plan

A resumed design must prove provenance, user-authored preservation, history changes and scoped reads.
