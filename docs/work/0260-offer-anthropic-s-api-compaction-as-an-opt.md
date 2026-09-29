---
kind: work
status: open
updated: 2026-09-27
priority: P3
area: chat
---

# Offer Anthropic's API compaction as an opt-in marker source

## What

Owner ruling: the memory and digest system stays; the API compaction is an optional enhancement. Add a preset knob beside carryReasoning (for example compactionBackend house or api, default house) that makes the compaction verb (packages/server/src/domain/chat/verbs/compaction.ts) build its marker through the Messages API's on-demand compaction (beta `compact-2026-09-04`), keeping recent turns word for word, instead of the house quietGenerate call. Storage, the coverage point and the manual verb stay. Gate it on a new capability axis for native Anthropic connections only, and fall back to the house path everywhere else. Needs an @ai-sdk/anthropic version that sends the compaction parameter, or a provider option. Measure whether per-turn lore and world-info prefix changes defeat the kept thinking.

## Why

On a prefix-bound Claude model the API's signed compaction keeps thinking valid across a compaction, which the house marker cannot; the cost is about the same as the house call.

## Done when

With the knob on, a native Anthropic chat compacts through the API with the tail kept verbatim, a non-Anthropic chat silently keeps the house path, and tests pin both plus the billed usage read from usage.iterations.

## Evidence

Filled at landing: what ran and where its output is.
