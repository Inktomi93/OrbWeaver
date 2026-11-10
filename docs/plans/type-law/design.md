---
kind: plan
status: active
updated: 2026-11-06
rank: 3
---

# Type law: the compiler and lint do the upkeep

## Goal

A wrong type or composition fails to build. Every item ends with its sites at zero and its rule on as an error, with no baseline; an exception cites a ruling.

## Shape

T1 writes the six laws first, in `docs/law/Spine-TypeScript-and-Patterns.md` (laws 1-4 and 6) and `docs/law/client-architecture-lockdown.md` (law 5). Server and contract steps go first; client and ui steps follow the CSS and lint branches. Evidence comes from pnpm brand-flow and pnpm ui-facts.

## Order

1. T1 (1792): the laws.
2. Contracts and server, in parallel: T2 (1793) strict wire objects, T3 (1794) casts, T4 (1795) derived mutation vars.
3. Brands: T8 (1799) fixes the scan first. Then T5 (1796) and T7 (1798) fix the sites. T6 (1797) turns on the cast rule once T5 is at zero.
4. Vocabularies and formats: T9 (1800), T10 (1801). T11 (1802) samples cost and epoch units.
5. Composites, after the CSS and lint branches: 1769, 1775, 1776, 1777, then 1780. The items before 1780 land before cross-surface consistency acceptance, because acceptance scores the surfaces they change.

## Rejected

Keep costs and epoch timestamps unbranded in the sampled paths.

- Cost. `embeddingCostOf` in `packages/inference/src/backends/wire/embedding-cost.ts` takes a measured USD charge or computes USD from tokens and a per-million-token rate. Chat estimates use the same units in `packages/inference/src/backends/v4/result.ts`. The model picker converts a per-token rate to a display string in `packages/client/src/features/credentials/lib/model-picker-model.ts`. These paths keep rates separate from charges.
- Epoch timestamps. The Agent SDK passes reset times in seconds to `secondsToMs` in `packages/inference/src/backends/agent-sdk/runner.ts`. Chat imports pass numbers with ambiguous units to `epochToMs` in `packages/server/src/primitives/serde/chat/index.ts`. Both converters normalize to epoch milliseconds in `packages/kit/src/time/index.ts`. A brand cannot identify the unit of an imported number.

Reconsider a brand when a production caller passes a rate as a charge or an epoch in the wrong unit.

## Coupled sites

Every file a lane must touch, one line each.

## Test plan

Each red-first test and its planted control; the suites that run.
