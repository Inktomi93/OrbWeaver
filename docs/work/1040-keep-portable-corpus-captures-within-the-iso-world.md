---
kind: bug
status: doing
updated: 2026-10-16
priority: P1
area: tests
lane: codex/corpus-row-clocks
plan: test-foundation
---

# Keep portable corpus captures within the iso world

## What

Remove corpus imports from iso support into Node router helpers. Derive finite portable captures from canonical production contracts. Move required input schemas from routers to contracts without changing validation. Keep exhaustive AppRouter input and wire-output conformance in Node.

## Why

Type-only imports currently bring Node and server dependencies into portable support. Moving router aliases elsewhere preserves the defect.

## Done when

The complete portable corpus import and compiler closures contain no Node or server dependencies. Every published route retains canonical input presence and serialized output conformance. Hydration, private-material refusal and maintained consumers pass. Router validation and cross-tenant behavior remain unchanged.

## Evidence

Canonical validator moves and portable captures pass one combined security review. Ordinary behavior and cross-tenant checks pass. Contracts, server, iso and browser types pass; exhaustive Node route assertions pass. The complete Node program retains only its unchanged inherited diagnostics. Scoped lint and native closure checks pass; committed corpus bytes stay unchanged.

Evidence: `reports/review/1040-portable-corpus-ordinary.md` and `.claude/worktrees/codex-corpus-row-clocks/reports/stickler/2026-10-16-1040-corpus-boundary-security-review.md`. Complete store, replacement-suite and hosted-cost acceptance remain open.
