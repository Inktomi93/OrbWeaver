---
kind: bug
status: doing
updated: 2026-10-18
priority: P2
area: import
lane: codex/corpus-smoke-matrix-898
plan: test-foundation
---

# Persona import review tolerates malformed numeric descriptors

## What

Repair numeric descriptor conversion in the production persona importer. Preserve accepted imported data and fallback metadata through the public uploaded-profile review.

## Why

Decoded JSON can shadow numeric conversion members and throw before profile review completes, contrary to the parser contract.

## Done when

Real uploaded JSON fails on the original production parser and passes after repair. Meaningful scalar and array compatibility, persona retention and metadata fallbacks remain intact. Scoped checks and independent security review pass.

## Evidence

Public uploaded-JSON regressions fail at the original numeric reads and pass after native coercion. Scalar and array compatibility remains intact. Scoped runtime, Biome and server compilation pass; Node diagnostics remain unchanged. Independent security review confirms the bounded repair. Evidence: `reports/review/982-persona-import-current-salvage.md` and `reports/review/1047-persona-import-independent.md`.
