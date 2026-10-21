---
kind: tooling
status: blocked
updated: 2026-10-21
priority: P1
area: tooling
blocked: owner
---

# Deliver verifier typed reads through native world owners

## What

D328 bounds remaining delivery; stop general callable closure and new MOVE/DELETE store ports. D321 migration continues independently. D320 excludes legacy typed populations, not regression execution or native typechecking.

Route maintained verifier typed reads through canonical native source and checker views. Preserve the separate cheap syntax scan and importing-world meaning. Reuse the run-owned lazy workspace without eager world enumeration or private compiler programs.

## Why

The ordinary syntax workspace does not establish native Node or browser ownership for typed readers.

## Done when

Structure and scoped entrypoints preserve native options, roots, closure and world meaning. Missing or stale native ownership refuses. Native entrypoint controls and finding equivalence distinguish correct Node and browser meanings without synthetic merged programs or compiler floods.

## Evidence

Detailed implementation and qualification evidence is preserved in `reports/review/tooling-park-2026-10-21/work-before/1027-deliver-verifier-typed-reads-through-native-world-owners.md`.

This work is owner-parked outside both test-rebuild plans. Preserve source, reports and unfinished qualifications; resume only with explicit owner authorization.
