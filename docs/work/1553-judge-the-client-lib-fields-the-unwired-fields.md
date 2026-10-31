---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/lib fields the unwired fields scan reports: motion-stats to view-transition

## What

`pnpm unwired fields` reports each of the fields below in `client/lib`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `LoafScript.sourceURL` | `client/src/lib/motion-stats.ts:87` | unreferenced | delete | delete the field |
| `LoafScript.duration` | `client/src/lib/motion-stats.ts:88` | unreferenced | delete | delete the field |
| `LoafScript.forcedStyleAndLayoutDuration` | `client/src/lib/motion-stats.ts:89` | unreferenced | delete | delete the field |
| `LoafScript.invoker` | `client/src/lib/motion-stats.ts:90` | unreferenced | delete | delete the field |
| `LoafScript.sourceFunctionName` | `client/src/lib/motion-stats.ts:91` | unreferenced | delete | delete the field |
| `LoafScript.sourceCharPosition` | `client/src/lib/motion-stats.ts:92` | unreferenced | delete | delete the field |
| `LoafScript.executionStart` | `client/src/lib/motion-stats.ts:93` | unreferenced | delete | delete the field |
| `LoafRecord.scripts` | `client/src/lib/motion-stats.ts:96` | never-read | delete | delete the field and its writes (`client/src/lib/motion-stats.ts:305`) |
| `LoafRecord.selectEntrance` | `client/src/lib/motion-stats.ts:97` | never-read | delete | delete the field and its writes (`client/src/lib/motion-stats.ts:314`) |
| `MotionSnapshot.virtualizedCls` | `client/src/lib/motion-stats.ts:176` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MotionSnapshot.observedVirtualizedCls` | `client/src/lib/motion-stats.ts:180` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MotionSnapshot.observedNonVirtualizedCls` | `client/src/lib/motion-stats.ts:183` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `DerivedSuggestion.name` | `client/src/lib/prompt-macros.ts:115` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `DerivedSuggestion.category` | `client/src/lib/prompt-macros.ts:116` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `DerivedSuggestion.description` | `client/src/lib/prompt-macros.ts:117` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `DerivedSuggestion.args` | `client/src/lib/prompt-macros.ts:120` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `DerivedSuggestion.insertTemplate` | `client/src/lib/prompt-macros.ts:123` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `Registry.name` | `client/src/lib/registry.ts:8` | never-read | delete | delete the field and its writes (`client/src/lib/registry.ts:30`) |
| `ContributorRegistry.name` | `client/src/lib/registry.ts:16` | never-read | delete | delete the field and its writes (`client/src/lib/registry.ts:61`) |
| `ContextRegionDef.id` | `client/src/lib/registry-contracts.ts:127` | never-read | delete | delete the field and its writes (`client/src/features/rpg/lib/rpg-hud-region.tsx:25`) |
| `CommittedChatContext.phase` | `client/src/lib/registry-contracts.ts:295` | never-read | delete | delete the field and its writes (`client/src/features/chat/hooks/use-chat-context-state.ts:35`) |
| `CommittedChatContext.title` | `client/src/lib/registry-contracts.ts:299` | never-read | delete | delete the field and its writes (`client/src/features/chat/hooks/use-chat-context-state.ts:39`) |
| `RenderStat.lastMs` | `client/src/lib/render-stats.ts:15` | never-read | delete | delete the field and its writes (`client/src/lib/render-stats.ts:27`) |
| `SafeErrorRecord.section` | `client/src/lib/safe-error-ring.ts:18` | never-read | delete | delete the field and its writes (`client/src/lib/safe-error-ring.ts:117`) |
| `SelectEntranceEvidence.id` | `client/src/lib/select-entrance-evidence.ts:20` | unreferenced | delete | delete the field |
| `SelectEntranceEvidence.startedAt` | `client/src/lib/select-entrance-evidence.ts:21` | unreferenced | delete | delete the field |
| `SelectEntranceEvidence.confirmedAt` | `client/src/lib/select-entrance-evidence.ts:22` | unreferenced | delete | delete the field |
| `SelectEntranceEvidence.endedAt` | `client/src/lib/select-entrance-evidence.ts:23` | unreferenced | delete | delete the field |
| `SelectEntranceEvidence.firstForTrigger` | `client/src/lib/select-entrance-evidence.ts:24` | unreferenced | delete | delete the field |
| `MutableEntrance.firstForTrigger` | `client/src/lib/select-entrance-evidence.ts:32` | never-read | delete | delete the field and its writes (`client/src/lib/select-entrance-evidence.ts:71`) |
| `ThemeFallbackRing.dropped` | `client/src/lib/theme-fallback-ring.ts:13` | never-read | delete | delete the field and its writes (`client/src/lib/theme-fallback-ring.ts:39`) |
| `ThemeFallbackRing.cap` | `client/src/lib/theme-fallback-ring.ts:14` | never-read | delete | delete the field and its writes (`client/src/lib/theme-fallback-ring.ts:39`) |
| `VtDocument.visibilityState` | `client/src/lib/view-transition.ts:34` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
