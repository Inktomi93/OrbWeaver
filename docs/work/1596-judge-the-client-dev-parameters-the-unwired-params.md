---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/dev parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/dev`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AgentSeedClient.character.list.query.input.starred` | `client/src/dev/agent-seed/client.ts:22` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.character.list.query.input.archived` | `client/src/dev/agent-seed/client.ts:22` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.character.list.query.input.includeTagIds` | `client/src/dev/agent-seed/client.ts:22` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.character.list.query.input.excludeTagIds` | `client/src/dev/agent-seed/client.ts:22` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.character.list.query.input.sort` | `client/src/dev/agent-seed/client.ts:22` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.character.list.query.input.cursor` | `client/src/dev/agent-seed/client.ts:22` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.chat.startChat.mutate.input.anchorPersonaId` | `client/src/dev/agent-seed/client.ts:35` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.chat.startChat.mutate.input.opening` | `client/src/dev/agent-seed/client.ts:35` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.chat.startChat.mutate.input.injections` | `client/src/dev/agent-seed/client.ts:35` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.chat.startChat.mutate.input.temporary` | `client/src/dev/agent-seed/client.ts:35` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.chat.startChat.mutate.input.startAsGame` | `client/src/dev/agent-seed/client.ts:35` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.rpg.updateConfig.mutate.input.gmPresetId` | `client/src/dev/agent-seed/client.ts:40` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.rpg.updateConfig.mutate.input.extractionMode` | `client/src/dev/agent-seed/client.ts:40` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.rpg.editSnapshot.mutate.input.releaseLocks` | `client/src/dev/agent-seed/client.ts:43` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.rpg.editSnapshot.mutate.input.lockPaths` | `client/src/dev/agent-seed/client.ts:43` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |
| `AgentSeedClient.rpg.patchActor.mutate.input.autoLock` | `client/src/dev/agent-seed/client.ts:46` | unsupplied-prop | wire (read) | the agent seed client restates a router input: derive the input type from the router (`inferInput`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
