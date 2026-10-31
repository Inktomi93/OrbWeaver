---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: architecture
---

# Teach the port census and the derived-port rule the spread flow

## What

The census and `orb/derived-port-member` read property, variable, return and argument flows but not a `{ ...ops }` spread, so a hand-restated port wired by spreading the owner's ops never reports. A probe that read spreads found restated cross-domain ops behind `SeedAvatarOps`, `GalleryCharacterOps`, `ImageryRoomAccess`, `VectorSweepOps`, `MemoryEmbeddingOps`, `PersonaSeedSettings`, `SeedOwnerContext.hashPassword` and `ChatWorkloadDeps.isMemoryEnabled`. The unwired scan already reads spreads through `spreadFlowsAt` in `tooling/src/unwired/restated-port.ts`.

## Why

A gate that cannot see a flow reports a restated port as clean, which is the defect the rule exists to refuse.

## Done when

`flowsAt` returns spread member flows, the census and the rule report the restated ops it reveals, each is derived or moved to contracts by the 1439 rulings, and `pnpm unwired ports` reports zero open targets with a planted spread-restatement case in `tests/tooling/eslint-derived-port-member.test.ts`.

## Evidence

- `flowsAt` in `tooling/src/unwired/restated-port.ts` returns spread member flows. `spreadFlowsAt` is gone, and `tooling/src/unwired/language-service.ts` reads `flowsAt` alone. `orb/derived-port-member` visits `SpreadElement`.
- Red then green: three spread cases in `tests/tooling/eslint-derived-port-member.test.ts` failed on the old source and passed after the change, with two spread controls (a `Pick` port and an `Owner["m"]` member) green on both. The spread case in `tests/tooling/unwired/port-census.int.test.ts` failed with the spread branch disabled and passed with it.
- `pnpm unwired ports` reported `targets=29` with spreads read, and `targets=0` after the fixes.
- Each restated member now derives from its owner through a named op type in `packages/contracts` by owner area: `assets/seed-art.ts`, `character`, `chat` and `settings` index files, `embeddings/owner-ops.ts`. `SeedOwnerContext.hashPassword` derives from `PasswordHasher["hash"]`. `EmbeddingsStoreOp` keeps its `AbortSignal` in the chat contract and drops `StoreDigestParams`.
- Floor: `pnpm test:tools tests/tooling/unwired`, the rule test, `pnpm typecheck` across all worlds, `pnpm lint:eslint packages tooling tests`, `pnpm depcruise`, `pnpm knip:prod` and the server suites for assets, character, embeddings, persona, settings, sessions, imagery, databank and chat all passed.
