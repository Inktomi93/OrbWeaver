---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: snap-secret-hygiene
---

# Redact the operator's request-log filter word by value

## What

`tooling/src/snap/lib/request-log.ts` echoes the operator's own request filter word raw in the log header, and `tooling/src/snap/ops/arms/requests.ts` writes it raw to the JSON, while the no-match body's copy of the same word is redacted.

## Why

The filter word can be a value the run treats as private, and the code beside it already redacts the other copy.

## Done when

The header and the JSON carry the filter word through the same redaction the no-match body uses, with a red-first canary.

## Evidence

Filled at landing: what ran and where its output is.
