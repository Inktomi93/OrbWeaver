---
kind: work
status: blocked
updated: 2026-11-02
priority: P3
area: security
blocked: owner
---

# Check the owner's rooms for malformed standalone variable deltas left before the parse fix

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.
Check existing rooms for poisoned deltas. A room already holding a malformed standalone delta degrades to `[]` on read and the next write drops those batches; the fix stops new ones but heals none. Done: a one-off query of `chats.standalone_variable_deltas` on a copy of the owner's DB. Not run.

Reading the owner's data needs the owner's approval: run the query on a copy, never on the live database, and commit nothing from it.
