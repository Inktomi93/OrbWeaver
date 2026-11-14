---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: identity
plan: typed-enforcers
---

# One funder brand for every account that model work spends

## What

`roleClientsFor` (`packages/contracts/src/role-clients/index.ts`), the host principal resolver every spend door uses (`createHostPrincipalResolver` in `packages/server/src/entry/auth/seam.ts`, which reads no `enabled`), the inference resolve ops and the workload start doors take a plain `UserId`. `ConsentingHostId` covers only the room-turn doors, so `ChatContext.summarize`, `summarizerContextTokens`, `summarizeAvailability`, `embedContextTokens`, `ResolveMemoryEmbedSpaceOp`, `ExtractQuietParams.funderUserId` and the workload funder still accept any id. Make an admitted-funder brand minted only at the existing proofs: `hostConsentOf`, the request `Principal`, the plugin standing read in `packages/server/src/domain/chat/verbs/plugin-authority.ts`, the automation author standing read in `packages/server/src/domain/automation/persistence/authority.ts`, the deferred drain's `hostConsentOf` over the frozen host, and the workload run-account check in `packages/server/src/domain/workloads/substrate/params.ts`. `ConsentingHostId` becomes one of its mints.

## Why

The spend chokepoint mints a `Principal` for any id, enabled or not, so every door the host brand does not reach still depends on each caller remembering the consent read. The memory backfill estimate is a live case of that.

## Done when

The spend doors named above take the funder brand; a stored workload funder is re-proved at claim before it is branded; `tsc` refuses a plain `UserId` at each, shown by a type test; the mint homes are expression-scoped `UNSAFE_CAST_HOMES` entries; Spine-Identity-and-Auth §2c states the rule.

## Evidence

Filled at landing: what ran and where its output is.
