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

Cross-domain shapes move to `packages/contracts` (`docs/law/Core-0-Architecture-and-Structure.md` §4: never a sideways import). The same legs also move every type-only cross-domain import's shape there. Then `domain-no-cross-feature` in `.dependency-cruiser.ts` narrows its type-only exemption to the D117 `WorkloadContribution` door, which absorbs item 1440.

Ruling for shapes that name runtime types (`AbortSignal`, `@orb/db` handles, `@orb/inference` types): split the shape, never rehome it into `packages/server/src/primitives` (no domain there; Core-0 §4 bans a shared drawer).

- The domain data inside (params, results) moves to `packages/contracts`.
- Runtime types stay with their owners. `AbortSignal` is a platform global; `@orb/db` and `@orb/inference` are packages every domain may import. Both sides import them from there.
- The op's function signature stays with the consuming domain's `contract/` (Core-0 §4). The owner's verb satisfies it, and the composition root wires it. Once the data comes from contracts, the signature is not a restated concept, so `orb/derived-port-member` does not report a signature whose only non-contracts types come from a platform or a lower package. The unwired scan follows the composition-root flow.
- A cross-domain op that passes `StatementToken`, `SQL` or a batch handle is checked against the ledger. A ruled joint batch moves its assembly to the composition root. An unruled one is a defect to redesign, each with its own item.

Remaining work after legs B–F (ruled):

- Never move a whole service interface. A consumer depends on the narrow op it calls, typed in its own `contract/` (Core-0 §4), with the data inside from `packages/contracts`. The service stays in its domain.
- Never merge by shape alone. A shape-only match (for example a `{principal, chatId}` look-alike) stays separate unless a real flow or the same concept links it.
- Tool registry: `ToolDefinition` data (name, description, schema) moves to contracts; a handler signature carrying `AbortSignal` stays with its consumer; `ResolvedToolSet` stays private to tool-use as an opaque type parameter.

Order:

1. Census tightening: `NonNullable<Owner["m"]>` counts as derived, shape-only matches become `review`, targets group by owning concept, and the known-bad targets are fixed.
2. Cluster legs, each owning one concept end to end (owner plus every consumer), two at a time on disjoint contracts areas: character ops with platform (sessions, admin, workloads, connection), then retrieval (search, embeddings, stats, tag) with the tool registry. Remaining derives against contracts ops leg D added fold into the cluster that owns them.
3. The cross-domain database handle cases are ruled one by one against the ledger (their own board item).
4. Close-out: enable `orb/derived-port-member` at zero, narrow `domain-no-cross-feature` to the D117 door, delete the `ports.mjs` workaround, and write the full `pnpm unwired` report.

## Why

AGENTS.md rules one home per concept: a second copy of a shape is a defect. A hand-restated port can drift from its owner unnoticed. It also breaks every reference search at the composition root, because structural assignability creates no symbol link. A type-aware scan found members that no production code reaches (`ChatService.editReasoning`, the `DiscoveryService` hub-score verbs, `ChatContext.getGroupConfig`), but restated ports hide which members are really reached.

## Done when

- No port member restates an owner's member type. The lint rule refuses a planted restated port and accepts a derived one, and the whole tree lints at zero.

- `pnpm unwired` runs the TypeScript language service and the TS 7.1 language server in every typecheck world. It reports a member only when both find no production use, with no assignability heuristic.

- Its fixtures pass: a wired member, a builder-only member, a test-only member, a member reached through a derived port, and one reached across packages.

- Every reported member is judged: wired, deleted, recorded in `tooling/src/unwired/deliberate.ts` with a cited ledger or law line, or listed with its decision in a bundled board item.

- The scan counts a member reached when production hands it into a used slot or derives a used member from it, and its fixtures pin both.

- No file under `packages/server/src/domain/<x>/` imports from another domain except the D117 workloads door. `domain-no-cross-feature` refuses a planted type-only cross-domain import, and `pnpm depcruise` passes on the whole tree.

## Evidence

The close-out ran on the lane branch after it merged local main.

- `pnpm unwired ports` reports no open target. Every remaining target is informational: `ruled` (a handle pass `tooling/src/unwired/ruled-ops.ts` names under D337 or D259) or `distinct` (a look-alike `tooling/src/unwired/distinct-lookalikes.ts` records with its reason). The run prints `targets=0` and the counts by kind; its output is `reports/unwired/port-targets.json`.
- The census resolves a handle-carrying type or alias to the op members it types before it reads the ruling tuple. `tests/tooling/unwired/port-census.int.test.ts` plants an unruled handle op, a ruled one and an alias of a ruled op.
- `orb/derived-port-member` is on in `eslint.config.ts`. `pnpm lint:eslint packages tooling tests` exits 0 with no suppression or baseline for the rule.
- `domain-no-cross-feature` in `.dependency-cruiser.ts` has no type-only exemption. `domain-workloads-door-types-only` allows the D117 door type-only. `tests/tooling/native-domain-cross-feature-boundary.test.ts` refuses a planted type-only cross-domain import, and whole-tree `pnpm depcruise` passes.
- The scratch `ports.mjs` assignability workaround is deleted.
- The unwired members scan (`pnpm unwired`) writes `reports/unwired/unwired.json`. It counts a member reached when production hands it into a used slot, by property, argument, return or spread, or derives a used member from it (`tests/tooling/unwired/scan.int.test.ts`); the run lists those under `reachedByFlow`.
- Judged in this item: `SuggestionStore.voidChat`, `ReconcileInFlight.isRunning`, `Lifecycle.listeningAddress`, `DrillSelectionStore.dismissSecondary` and `AssetsContext.imageProbe` are deleted, since nothing calls them and the handoff sweep supersedes the blanket void. `ServicesResult.settleBackground` is deliberate in `tooling/src/unwired/deliberate.ts`, citing `docs/law/Spine-Testing.md`.
- Every other reported member is listed with its location, what reaches it and its decision in a bundle: [1497](1497-delete-the-client-and-ui-members-no-production.md) client and ui, [1498](1498-judge-the-kit-contracts-and-inference-members-no.md) kit, contracts and inference, [1499](1499-link-the-plugin-host-ops-the-bridge-dispatches.md) plugin host ops, [1500](1500-judge-the-chat-members-no-production-code-calls.md) chat, [1501](1501-judge-the-other-server-domain-members-no-production.md) the other domains, [1502](1502-judge-the-server-entry-infra-and-transport-members.md) entry, infra and transport.
- The census and the rule do not read spread flows yet; a probe that did found restated cross-domain ops, boarded as [1503](1503-teach-the-port-census-and-the-derived-port.md).
