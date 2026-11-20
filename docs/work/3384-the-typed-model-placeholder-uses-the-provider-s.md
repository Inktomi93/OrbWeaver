---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
---

# The typed model placeholder uses the provider's own id spelling

## What

NanoGPT and LiteRouter show e.g. gpt-5 (packages/client/src/features/credentials/lib/add-connection-form-model.ts:147), but both spell ids with a vendor prefix.

## Why

The notice beside it says to type the id as the provider spells it, and the example contradicts it.

## Done when

Each built-in row's placeholder shows an id that provider accepts.

## Evidence

Filled at landing: what ran and where its output is.
