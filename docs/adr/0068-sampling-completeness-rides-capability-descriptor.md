---
kind: adr
status: active
updated: 2026-09-23
---

# Sampling completeness rides the capability descriptor

## Context

Not recorded in the ledger row.

## Decision

Sampling completeness rides the capability descriptor, never model-name sniffing. `minP` is a first-class preset param end-to-end (`UserIntent` → resolve → the chat-completions wire); the ST importer maps `min_p` and never drops it. `verbosity` lives on the openai-responses wire (`text.verbosity`) with a `verbosity_dropped` warning where unsupported.

The anth-direct clause shares D67's purge, noted with D121: `ANTH_DIRECT_SAMPLING` has zero declarations on the tree. Treat it as design-of-record, not built. Direct-transport per-model Claude sampling is fail-closed: the `ANTH_DIRECT_SAMPLING` table ships empty until a live probe validates each model's honored set. Absence means the knob does not render; never guess a default.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
