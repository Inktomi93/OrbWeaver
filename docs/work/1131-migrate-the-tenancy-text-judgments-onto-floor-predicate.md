---
kind: bug
status: open
updated: 2026-10-20
priority: P2
plan: test-foundation
---

# Migrate the tenancy text judgments onto floor predicate facts

## What

tooling/src/verify/lib/tenancy-read.ts still judges predicatesOwnId and namesSchemaTable by regex over source text, and predicatesTableColumn by comparing receiver text. The floor's declaration-based column and predicate facts answer the same questions. Found by the 953 lane, which left it because it changes a security judgment. Security: route to security-executor.

## Why

A third, text-based reader of the same predicates inside a security gate can disagree with the floor facts the other gates use, and a text match can be fooled by spelling.

## Done when

The three judgments read floor facts; planted cross-tenant negatives fail under them; every existing refusal holds; owner-scoped-writes, owner-scoped-upserts and membership-write-fan findings are unchanged or corrected with recorded proof.

## Evidence

Filled at landing: what ran and where its output is.
