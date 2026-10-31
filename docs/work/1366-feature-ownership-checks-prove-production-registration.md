---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: client
plan: test-foundation
---

# Feature ownership checks prove production registration

## What

The ownership check in `tests/client/feature-layout.suite.test.ts` accepts a definition-shaped filename without inspecting its exports or production registration. `tests/client/state/registry-definitions.dom.test.ts` checks recognized declarations separately. Reconcile these checks against the actual composition door and supported definition forms.

## Why

A correctly named helper can satisfy the ownership claim without providing a reachable feature. Filename presence is not registration evidence.

## Done when

Extend the existing native tests, without another policy framework. A definition-shaped helper and an unwired definition fail planted controls. Real registered constants and factories pass. Document recognition limits and correct claims that exceed them. Preserve the current naming and bucket checks. Add no baseline or exemption for a real violation.

## Evidence

`tests/client/state/registry-definitions.dom.test.ts` now proves ownership: a feature owns a definition only through a held annotated constant, an annotated factory, or an export of a definition-shaped lib file that `compose/` imports by name (the weaker proof, for context tabs and corpus modes, which no registry holds). Planted controls: a helper, an annotated constant the door does not hold, and a `satisfies` spelling all own nothing; a held constant, an `export { x as y }` alias and an annotated factory each own. Red: with filename-only ownership planted into the judge, 3 of 19 controls failed; restored, 19 of 19 pass, and the real tree passes with every feature owning a definition. The recognition limits are written above `DEFINITION_KINDS`. `tests/client/feature-layout.suite.test.ts` now says it reads names only, points at that proof, and gains the `-tile` stem (red: without it the tile row failed; 14 of 14 pass).
