---
kind: adr
status: active
updated: 2026-10-17
---

# Prototype exposure is a per-generation syntactic fact

## Context

Per-read prototype checks enlist unrelated computed reads and delay callable-origin analysis. Prototype mutation requires explicit source enforcement.

## Decision

Treat prototype exposure as one syntactic fact per complete native Program generation, keyed by the existing program-epoch owner. Reuse the existing inherited-read classifier for the census and report each exposure once at its mutation site. Land native lint against prototype mutation before replacing the per-read sweep. Preserve callable allocation, bindings, property paths, mutation and escape refusals. Invalidate the fact on generation changes; missing or stale evidence refuses. Qualify the unchanged original chat-accounting query and the complete owner-scoped-reads policy. If rejection is outside prototype-exposure inputs, report the measured cause and stop helper-specific repair.

## Consequences

Absent optional own-member reads consult the generation fact instead of repeating whole-Program semantic closure. Planted mutation controls fail under native enforcement. Keep complete native worlds and populations without increasing heaps. The census and its lint successor are not yet implemented.

## Alternatives rejected

Repeatedly repair individual helpers or computed accesses. Cache symbol names without allocation and epoch identity. Cut the analyzed population or increase memory limits.
