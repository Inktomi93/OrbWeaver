---
kind: adr
status: active
updated: 2026-09-25
---

# Gemini limits come from curated rows, not a native Google catalog

## Context

Direct Gemini reaches orbweaver only through a custom-openai row against Google's OpenAI-compatible layer, whose model list carries ids and no limits. Google's native list publishes input and output limits, but no built-in provider row targets it.

## Decision

Gemini context and output limits come from the curated rows in packages/inference/src/capability/sources/curated/google.ts, keyed on the compatibility-layer ids. There is no Google provider row and no native catalog path. A host states a missing or wrong limit through the declared capability override, the top evidence tier. OpenRouter's advertised limits keep supplying Gemini reached through OpenRouter. The check is the curated table test under tests/inference/capability/sources/curated/.

## Consequences

Each Google release needs a curated row edit with a cite. An unmatched Gemini id resolves to the estimated floor, which the UI labels as estimated, until a row or a declared value states it.

## Alternatives rejected

A native Google catalog read: it needs a new dialect or catalog strategy, which is a database enum and a migration, a second key shape and a firewall review, to save editing a data file for a route that is not a built-in provider.
