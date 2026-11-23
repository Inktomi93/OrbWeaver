---
kind: bug
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# A value held under an unconstrained library type parameter is never sent

## What

In tooling/src/unwired/graph/flows.ts, declaredPropertyType calls getNonNullableType. That turns an unconstrained type parameter V into V & {}, so the isTypeParameter check fails. A value held as stash<V>({ value: item }) is then never sent, and its members land in member-untouched.

## Why

A member-untouched row on a live member is a false dead verdict, and the delete trial would offer it for deletion.

## Done when

A planted stash<V>({ value: item }) case with an unconstrained V sends the held value, and its read member is no longer member-untouched. The case fails without the fix.

## Evidence

Filled at landing: what ran and where its output is.
