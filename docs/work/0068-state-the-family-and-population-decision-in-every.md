---
kind: tooling
status: open
updated: 2026-09-23
priority: P3
area: verify
---

# State the family and population decision in every final gate module header

## What

`tooling/src/verify/gates/GATE-AUTHORING.md` §7 requires every final policy header to state its family (the shared `lib/` declaration or a singleton reason) and its population (the port from the legacy population, or the intentional correction). A census of the top-level final gate modules finds headers that never mention a family or a population at all, for example `appearance-carrier-contract`, `assets-single-writer`, `contract-verb-presence`, `css-length-tokens` and `ct-config-mirror-parity`. Re-derive the list by reading each header whole (a word search over-reports and under-reports, so it only locates candidates), then write the missing statements from each module's own descriptor and source. Where a header cannot state a population port because the legacy module is gone, say what the population is and why.

## Why

The header is the only place a reader learns why a policy shares a reader and what it deliberately does not see. The gate-runtime reviews found this gap and left it open when the program closed, and no check enforces headers, so it stays open until someone does the reading.

## Done when

Every final policy header under `tooling/src/verify/gates/` states its family decision and its population, each checked against the module's descriptor.

## Evidence

Filled at landing: what ran and where its output is.
