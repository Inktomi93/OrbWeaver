---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/persona fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/persona`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PersonaPrefsPatchVars.section` | `client/src/features/persona/components/persona-notifications-section.tsx:14` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `PersonaPrefsPatchVars.patch` | `client/src/features/persona/components/persona-notifications-section.tsx:15` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `PersonaPrefsPatchVars.patch.showNotifications` | `client/src/features/persona/components/persona-notifications-section.tsx:15` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `SetChatActivePersonaVars.personaId` | `client/src/features/persona/hooks/use-chat-persona.ts:11` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `SetChatAnchorPersonaVars.personaId` | `client/src/features/persona/hooks/use-chat-persona.ts:23` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `PersonaSeedPatchVars.section` | `client/src/features/persona/hooks/use-persona-identity.ts:11` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `PersonaSeedPatchVars.patch` | `client/src/features/persona/hooks/use-persona-identity.ts:12` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `PersonaSeedPatchVars.patch.currentPersonaId` | `client/src/features/persona/hooks/use-persona-identity.ts:13` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `PersonaSeedPatchVars.patch.defaultPersonaId` | `client/src/features/persona/hooks/use-persona-identity.ts:14` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `PersonaBookVars.personaId` | `client/src/features/persona/hooks/use-persona-lorebooks.ts:9` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `PersonaBookVars.bookId` | `client/src/features/persona/hooks/use-persona-lorebooks.ts:10` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
