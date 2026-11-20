---
kind: tooling
status: open
updated: 2026-11-20
priority: P3
area: tooling
plan: unwired-code
---

# Router procedures no client calls are found and judged

## What

No current scan reports a tRPC procedure that no client calls; the earlier unfired-procedure check was deleted, and a reviewer found persona.get exposed with only a type import on the client.

## Why

An exposed procedure nobody calls is attack surface with no purpose.

## Done when

The unwired scan reports procedures with no client call site, following the client proxy chain including subscriptions, with a planted positive and the known type-only case as fixtures, and each finding is judged.

## Evidence

Filled at landing: what ran and where its output is.
