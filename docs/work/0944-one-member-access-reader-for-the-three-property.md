---
kind: tooling
status: doing
updated: 2026-10-12
priority: P2
area: tooling
lane: wt/agent-ae7442fc5a59398c8
plan: test-mirror
---

# One member-access reader for the three property-read spellings

## What

Two readers answer the same question for the three property-read spellings (dot, optional and bracket): readMemberAccess in tooling/src/verify/lib/symbol-reference.ts (widely used by gates) and a ReferenceFact-returning twin in tooling/src/floor/code-facts/reference-fact.ts (used by the floor). Item 941 routed two gates through the verify one. Make one home in the floor that both the gates and the floor facts call, and delete the other.

## Why

One home per concept; two spellings of one reader drift, and the gate-spelling-twins suite only guards the gates that already use one of them.

## Done when

One member-access reader in tooling/src/floor/code-facts, every caller repointed, the other deleted, and gate-spelling-twins.int passes.

## Evidence

Filled at landing: what ran and where its output is.
