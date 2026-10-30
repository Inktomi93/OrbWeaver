---
kind: tooling
status: open
updated: 2026-10-30
priority: P2
area: architecture
---

# Enforce domain contract purity with a dependency-cruiser rule

## What

Add a `.dependency-cruiser.ts` rule so files under `packages/server/src/domain/<x>/contract/` import only their own `contract/`, `@orb/contracts`, `@orb/kit`, and type-only `@orb/db` and `@orb/inference`, never their domain's `verbs/`, `persistence/` or `substrate/`, nor `infra/` or `foundation/` at runtime. Fix every current violation at its source, with no exemption list.

## Why

A domain's `contract/` is its type surface (Core-0 §4) and the home its injected ops are typed in. The existing domain rules cover the front door, verbs, substrate mediation and cross-subsystem imports. Nothing keeps `contract/` types-only, so a runtime dependency there leaks into every consumer that derives from it, including the ports item 1439 now derives.

## Done when

The rule refuses a planted runtime import from `contract/` into `persistence/` and into `infra/`, accepts a type-only `@orb/db` import, and whole-tree `pnpm depcruise` passes with zero violations and no exemptions. Item 1423 covers the matching `substrate/` purity rule.

## Evidence

Filled at landing: what ran and where its output is.
