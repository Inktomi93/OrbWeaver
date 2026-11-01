---
kind: tooling
status: open
updated: 2026-11-01
priority: P2
area: tooling
plan: type-law
---

# T8 pnpm brand-flow classifies widens correctly (contract and port layers) and matches a hand sample before its widen counts drive work

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Run `pnpm brand-flow`. It writes `reports/brand-flow/brand-flow.json` and `reports/brand-flow/brand-flow.md`.

The scan reads the declaration behind each widened slot. A slot built from `typeIdSchema` or `brandedId` is `schema-input`: its zod input type is `string` by design, so it is not a defect. A slot with no readable declaration is `unknown` and is never guessed. A React `key` prop is not a slot. A `contract/` directory in any package is the contract layer.

Production widens by layer: contract 214 (client 20, server 145, inference 42, contracts 7), port 0, client-state 53, local 466, library 128, schema-input 589, unknown 329. The earlier contract count was 743.

Hand sample: 36 production widens, six per layer, read at the use line and at the declaration. 30 of 30 classified sites match. The 6 unknown sites have no declaration site and stay unknown. Port has no site: no widen in the tree has a `*Port` owner, and the planted test finds a port slot.

Limit: 329 of 1779 production widens are `unknown`, so the layer counts are lower bounds. The largest groups are audit `entityId` (125) and tRPC input fields with no declaration site.

Floor: `pnpm test:tools tests/tooling/brand-flow`, `pnpm typecheck tooling/tsconfig.json tsconfig.node.json tsconfig.tests-iso.json`, scoped eslint, `pnpm depcruise`.
