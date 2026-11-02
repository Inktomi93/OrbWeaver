---
kind: work
status: open
updated: 2026-11-01
priority: P2
area: server
plan: type-law
---

# T5 Laundered brands: each slot that takes a branded id as string declares the brand (the proven sites in the brand-flow report)

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

- The lint branch (b7b7b94c17) left 23 laundered-brand sites for this item.
- Two production compares stay plain on purpose. `packages/client/src/data/stale-session.ts` compares the handle a sibling tab broadcasts, which is untrusted channel text and is never stored or forwarded. `packages/client/src/state/rule-creation-store.ts` reads by the rule-draft store's generic key, which holds both rule ids and creation ids.
