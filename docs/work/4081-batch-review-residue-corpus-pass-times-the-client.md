---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: tests
plan: test-foundation
---

# Batch review residue: corpus pass times, the client-abandon fake and persona audit mutants

## What

Review of the stamps, abort and backup batch found: tests/support/node/corpus-knowledge.int.test.ts and the Corpus CT cannot catch a max-to-min swap or the wrong pass's time because each pass table holds one computed_at shared across reads; tests/server/transport/trpc/client-abandon.int.test.ts fakes tag.listTagsWithUsage with vi.spyOn, which the checklist forbids; six mutants survive in persona import's audit metadata (packages/server/src/domain/persona/verbs/import.ts); D290 does not say that an old hash-less backup of a persona with art still mints a second persona on self-restore.

## Why

Each leaves a defect the tests or the ledger would not catch or explain.

## Done when

The corpus seeds distinct pass times so each read's projection is exact, the abandon case drives a real procedure with no spy, the persona audit mutants are killed, and D290's consequences name the hash-less backup case.

## Evidence

Filled at landing: what ran and where its output is.
