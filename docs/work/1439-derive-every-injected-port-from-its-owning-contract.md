---
kind: work
status: open
updated: 2026-10-30
priority: P1
area: architecture
---

# Derive every injected port from its owning contract and keep the unwired scan

## What

Rewrite every injected port that restates a member type its owning service or contract already declares, so it derives that member instead: `Pick<Owner, "a" | "b">` for a whole slice, or `Owner["a"]` per member. Add a lint rule that refuses a port member whose hand-written function type duplicates the owner's member. Keep the type-aware unwired scan as `pnpm unwired`, then judge every member it reports.

Examples: `packages/server/src/entry/http/auth-routes.ts` `AuthSessionsPort` restates `SessionsService.create`, `revokeByToken`, `provisionIdentity` and `revokeByExternalId`. `packages/server/src/domain/automation/contract/runtime-ops.ts` restates `ToolUseService.executeToolCalls`. `packages/server/src/entry/compose/automation-plugin.ts` already derives with `Pick`.

## Why

AGENTS.md rules one home per concept: a second copy of a shape is a defect. A hand-restated port can drift from its owner unnoticed. It also breaks every reference search at the composition root, because structural assignability creates no symbol link. A type-aware scan found members that no production code reaches (`ChatService.editReasoning`, the `DiscoveryService` hub-score verbs, `ChatContext.getGroupConfig`), but restated ports hide which members are really reached.

## Done when

- No port member restates an owner's member type. The lint rule refuses a planted restated port and accepts a derived one, and the whole tree lints at zero.
- `pnpm unwired` runs the TypeScript language service and the TS 7.1 language server in every typecheck world. It reports a member only when both find no production use, with no assignability heuristic.
- Its fixtures pass: a wired member, a builder-only member, a test-only member, a member reached through a derived port, and one reached across packages.
- Every reported member is wired, deleted or recorded as deliberate with a cited reason, and each gets its own board item where it needs product work.

## Evidence

Filled at landing: what ran and where its output is.
