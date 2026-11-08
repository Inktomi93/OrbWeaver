---
kind: work
status: doing
updated: 2026-11-08
priority: P2
area: tests
lane: wt/agent-a255419bb88fd5e35
plan: test-foundation
---

# Derive the ui test values the derivation audit found copied

## What

The same audit's tests/ui rows (reports/test-derivation-audit/shard-a.md): the hand-typed glyph and inline step lists in button-family.ct.tsx instead of BUTTON_BOX_OVERFLOW (U1); a test-side framebuffer() copied from a private kit function in tone-knobs.test.ts (U5, verify); the seed-plus-custom-scope case table and story wrapper rebuilt in several files; parsed(), HEARTH_ACCENT and the mid-grey constant declared more than once.

Scope is the whole file, not only the audit rows. Rewrite each test file the newest additions touched onto the testkit: every helper a file defines locally moves to its testkit home under `tests/support/` in the right world (`iso`, `node`, `browser`) and is published through the door its callers need, with duplicates merged to one; every value, roster, table and shape derives from production; every seed runs a production verb, a root seed or a corpus builder; every case mounts the real door. A file whose cases already meet this is left alone.

## Why

Spine-Testing section 9; one home per concept.

## Done when

No test file in scope defines a helper that belongs in the testkit or another file already defines. Every tests/ui row in the shard-a report is fixed or ruled with a cited reason; the shared seed-and-scope case table has one testkit home; U1 fails when a new step is added to the production table without a case.

## Evidence

Filled at landing: what ran and where its output is.
