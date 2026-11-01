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

33 rows: 4 deleted, 7 derived, 15 kept, 0 handed off, 7 under owner question Q1.

| Row | Result |
| - | - |
| `Registry.name`, `ContributorRegistry.name` | deleted with the two `name,` writes; the closure `name` still feeds the error text. No reader in `packages`, `tests`, `tooling` or `scripts` (`\.name` on a registry value: 0 hits) |
| `CommittedChatContext.phase`, `.title` | deleted with the writes in `use-chat-context-state.ts`; the typecheck of client and tests-dom found no reader through any twin type |
| `SelectEntranceEvidence.id`, `.startedAt`, `.confirmedAt`, `.endedAt`, `.firstForTrigger`, `MutableEntrance.firstForTrigger` | derived: `MutableEntrance` restated the five fields as a mutable twin and the observer reads and writes them by name; it now extends `Mutable<SelectEntranceEvidence>`. The same object is the LoAF ring's `selectEntrance`, which `tooling/src/motion-audit/lib/verdicts.ts:102-175` reads (`id`, `confirmedAt`, `firstForTrigger`) |
| `VtDocument.visibilityState` | derived: extends `ViewTransitionVisibility`, the type `isDocumentHidden` reads |
| `LoafScript.sourceURL`, `.duration`, `.forcedStyleAndLayoutDuration`, `.sourceFunctionName` | kept: `window.__orb.motion()` ships them to motion-audit, whose restated `LoafRecord` (`tooling/src/motion-audit/contract/types.ts:74-81`) is read at `verdicts.ts:138` (`sourceURL`), `:216` (`duration`), `:213` (`forcedStyleAndLayoutDuration`), `:210` (`sourceFunctionName`) |
| `LoafRecord.scripts`, `.selectEntrance` | kept: `verdicts.ts:138-216` and `:102` |
| `MotionSnapshot.virtualizedCls`, `.observedVirtualizedCls`, `.observedNonVirtualizedCls` | kept: `verdicts.ts:49`, `:60`, `:64` through the tooling twin, validated at `tooling/src/motion-audit/ops/page-validate.ts:39` |
| `DerivedSuggestion.name`, `.category`, `.description`, `.args`, `.insertTemplate` | kept: the type is the deliberately dom-less subset of `MacroSuggestion` (header of `prompt-macros.ts`); the reader is `packages/ui/src/primitives/macro-textarea/macro-textarea.tsx:103` (`category`), `:222` (`name`, `insertTemplate`), `:225` and `:265` (`args`), `:332` (`description`) |
| `ContextRegionDef.id` | kept: `ContributorRegistry<Def extends { readonly id: string }>` and `createContributorRegistry` read `def.id` (`registry.ts:48-51`) |
| `LoafScript.invoker`, `.sourceCharPosition`, `.executionStart`, `RenderStat.lastMs`, `SafeErrorRecord.section`, `ThemeFallbackRing.dropped`, `ThemeFallbackRing.cap` | owner question Q1; nothing changed |

Q1 (default: keep, nothing deleted). These are fields of a `window.__orb.*()` accessor payload that agents read through an eval. The scan counts a reader only in code, and no code reads them. Deleting removes diagnostics (the ring `dropped` and `cap` say whether a ring is a complete history; `invoker` names a LoAF script). Keep them as agent-facing payload, or delete as unread data?

Survey: `codegraph_explore` on `OrbRingMetadata … Registry ContributorRegistry CommittedChatContext SelectEntranceEvidence VtDocument`; ast-grep (`-l ts` 5904, `-l tsx` 1522 files) on `createRegistry($$$)` and `createContributorRegistry($$$)`; `rg` over `tooling`, `scripts`, `tests/support` and `packages/client/src` for each leaf name. Typecheck: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` exit 0. Tests: `pnpm test` on `config-section-registry.dom`, `registry-definitions.dom` and `authed-composition.dom`, 29 passed. CT: `platform-chat-arrival` plus `app-shell-motion`, 17 passed and 3 failed. The same three `app-shell-motion` tests (lines 592, 626, 854; trail geometry under load average 40) fail the same way on the unmodified tree, checked by reversing this diff and rerunning. Lint: `pnpm lint:eslint` on the five touched files exit 0.
