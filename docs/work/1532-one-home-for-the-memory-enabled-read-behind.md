---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: embeddings
plan: unwired-code
---

# One home for the memory-enabled read behind the compose let hop

## What

packages/server/src/domain/embeddings/contract/reindex.ts VacuousMemoryReceiptDeps.isMemoryEnabled hand-types what IsMemoryEnabledOp in packages/contracts names. The census misses it because the value passes through a mutable local in entry/compose/services.ts. Type the member by the contracts op, and teach the census to follow a value through a local binding or record why it cannot.

## Why

One home per concept; a let hop is a blind spot in the port census.

## Done when

The member types by IsMemoryEnabledOp, and the census either reports a planted let-hop restatement or the plan records the limit.

## Evidence

- `VacuousMemoryReceiptDeps.isMemoryEnabled` in `packages/server/src/domain/embeddings/contract/reindex.ts` is typed by `IsMemoryEnabledOp`.
- The `let isMemoryEnabled` in `packages/server/src/entry/compose/services.ts` is a `createBinding` holder bound once chat exists.
- The census cannot follow a `let` soundly: it is rebound, so no one member stands behind the name. The limit is recorded in `docs/plans/unwired-code/design.md` under "Judging a finding", with the case `a member a let hop carries to the port` in `tests/tooling/eslint-derived-port-member.test.ts`.
- `pnpm test tests/server/domain/embeddings` and the typecheck of `packages/server/tsconfig.json` pass.
