---
kind: plan
status: active
updated: 2026-11-12
rank: 6
---

# An import survives bad input and reports each failure

## Goal

One unreadable or oversized card, chat or file never fails a whole import, never leaves a half-made record, never blocks the event loop and always reaches the person with a reason they can act on.

## Shape

Work the open import findings: per-item failure handling, depth and size limits that refuse and do not overflow, lifecycle of cancelled and poisoned rows, and identity in the preview.

## Rejected

A whole-batch failure for one bad item. A refusal that arrives only in the server log.

## Coupled sites

The card import copy home and the import result contract.

## Test plan

Each case runs through the production import door with a planted bad item beside good ones.
