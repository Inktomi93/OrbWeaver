---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: architecture
---

# Close the type-only hole in domain-no-cross-feature and move cross-domain shapes to contracts

## What

`domain-no-cross-feature` in `.dependency-cruiser.ts` exempts every type-only import (`dependencyTypesNot: ["type-only"]`), so about 60 files under `packages/server/src/domain` import another domain's types (for example rpg to chat, import to regex, databank to search, admin to sessions). Move each shared shape to `packages/contracts`, then narrow the exemption to the D117 `WorkloadContribution` front door only.

## Why

`docs/law/Core-0-Architecture-and-Structure.md` §4 rules no sideways import between domains, and AGENTS.md homes domain-to-domain shapes in `packages/contracts`. D117 sanctions one type-only exception: `WorkloadContribution`, which carries `AbortSignal` and so cannot live in isomorphic contracts. The gate is wider than the law, so the law is not enforced.

## Done when

No file under `packages/server/src/domain/<x>/` imports from `packages/server/src/domain/<y>/` except the D117 workloads contribution door. The rule refuses a planted type-only cross-domain import, and `pnpm depcruise` passes on the whole tree. Shapes that carry node-only types are listed with a ruling for each.

## Evidence

Filled at landing: what ran and where its output is.
