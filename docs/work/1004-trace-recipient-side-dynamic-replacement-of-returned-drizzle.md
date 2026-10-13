---
kind: tooling
status: doing
updated: 2026-10-13
priority: P1
area: tooling
lane: codex/drizzle-facts-953
plan: test-foundation
---

# Trace recipient-side dynamic replacement of returned Drizzle builders

## What

Extend shared Drizzle return and caller observations to connect recipient modifiers to a producing query across function boundaries. The current statement traversal observes local dynamic chains but trusts a locally filtered non-dynamic return. Native dynamic mode remains accessible and can replace its filter. This is an observed reader limit, not a demonstrated production exploit.

## Why

A filter observed at construction does not prove that a recipient preserves owner scope before execution.

## Done when

A bounded native control rejects a recipient that obtains an owner-filtered builder, enables dynamic mode and replaces the owner predicate with a by-id filter. Matching scoped modifiers, unmodified filtered returns and executed async queries remain admitted. The regression fails on the existing reader before correction. Shared return/reference facts preserve snapshot and cycle refusals without a private gate reader or another compiler program.

## Evidence

The integrated shared statement, callable and reference readers supply the required source interfaces. The Drizzle acceptance batch owns native red-first controls and the recipient-flow correction. Complete repository output equivalence remains with that primary reader assignment; it does not block this bounded defect control.

Read-only preparation identifies local binding traversal and filtered non-dynamic return trust. It supplies no runtime verdict or production exploit. Native controls must prove actual builder replacement, producing-table identity, snapshot refusal and cycle handling before qualification.
