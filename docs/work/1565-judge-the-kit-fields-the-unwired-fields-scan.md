---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the kit fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `kit`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `BugReportBuildIdentity.statusHead` | `kit/src/bug-report/index.ts:34` | never-read | delete | delete the field and its writes (`server/src/foundation/observability/debug/bug-report.ts:99`) |
| `BugReportRecord.server.evidence` | `kit/src/bug-report/index.ts:61` | never-read | delete | delete the field and its writes (`server/src/foundation/observability/debug/bug-report.ts:203`) |
| `BugReportRecord.server.wireCaptureEnabled` | `kit/src/bug-report/index.ts:63` | never-read | delete | delete the field and its writes (`server/src/foundation/observability/debug/bug-report.ts:204`) |
| `CelParseError.code` | `kit/src/cel/index.ts:37` | never-read | delete | delete the field and its writes (`kit/src/cel/index.ts:108`) |
| `CelProgram.source` | `kit/src/cel/index.ts:45` | never-read | delete | delete the field and its writes (`kit/src/cel/index.ts:123`) |
| `EvidenceSourceMeta.windowFilterable` | `kit/src/evidence-window/index.ts:46` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EvidenceSourceMeta.reason` | `kit/src/evidence-window/index.ts:48` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EvidenceSourceMeta.cap` | `kit/src/evidence-window/index.ts:50` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EvidenceSourceMeta.held` | `kit/src/evidence-window/index.ts:52` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EvidenceSourceMeta.kept` | `kit/src/evidence-window/index.ts:54` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EvidenceSourceMeta.dropped` | `kit/src/evidence-window/index.ts:59` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SniffedImage.ext` | `kit/src/image-sniff/index.ts:155` | never-read | delete | delete the field and its writes (`kit/src/image-sniff/index.ts:488`) |
| `LongAnimationFrameTiming.styleAndLayoutStart` | `kit/src/long-animation-frame/index.ts:9` | never-read | delete | delete the field and its writes (`client/src/lib/motion-stats.ts:128`) and the 33 test references |
| `MacroSpan.offset` | `kit/src/macro/types.ts:18` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MacroSpan.line` | `kit/src/macro/types.ts:19` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MacroSpan.col` | `kit/src/macro/types.ts:20` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MacroSpan.length` | `kit/src/macro/types.ts:21` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MacroDiagnostic.code` | `kit/src/macro/types.ts:30` | never-read | delete | delete the field and its writes (`kit/src/macro/registry.ts:368`) |
| `MacroDiagnostic.span` | `kit/src/macro/types.ts:32` | never-read | delete | delete the field and its writes (`kit/src/macro/registry.ts:368`) |
| `MacroSourceRef.id` | `kit/src/macro/types.ts:90` | never-read | delete | delete the field and its writes (`client/src/lib/prompt-macros.ts:172`) |
| `MacroArgDef.default` | `kit/src/macro/types.ts:104` | never-written | delete | delete the field and the branch that reads its default at `kit/src/macro/metadata.ts:118` |
| `MacroArgDef.description` | `kit/src/macro/types.ts:105` | unreferenced | delete | delete the field |
| `MacroListSpec.max` | `kit/src/macro/types.ts:113` | never-written | delete | delete the field and the branch that reads its default at `kit/src/macro/metadata.ts:62` |
| `MacroArgViolationBase.macro` | `kit/src/macro/types.ts:128` | never-read | delete | delete the field and its writes (`kit/src/macro/metadata.ts:56`) |
| `MacroMetadata.returnType` | `kit/src/macro/types.ts:145` | never-read | delete | delete the field and its writes (`kit/src/macro/builtin-metadata.ts:29`) and the 1 test reference |
| `GlobalVarWrite.key` | `kit/src/macro/types.ts:242` | never-read | delete | delete the field and its writes (`kit/src/macro/registry.ts:523`) |
| `GlobalVarWrite.value` | `kit/src/macro/types.ts:243` | never-read | delete | delete the field and its writes (`kit/src/macro/registry.ts:523`) |
| `MacroAnalysisOptions.mutatesState` | `kit/src/macro/types.ts:433` | never-written | delete | delete the field and the branch that reads its default at `kit/src/macro/cache-safety.ts:230` |
| `UserMacroRegistration.registered` | `kit/src/macro/user-macros.ts:289` | never-read | delete | delete the field and its writes (`kit/src/macro/user-macros.ts:508`) |
| `RecallKnobs.queryWindow` | `kit/src/recall/index.ts:177` | unreferenced | delete | delete the field |
| `RecallQuery.scope` | `kit/src/recall/index.ts:192` | never-read | unknown (read) | the query is handed whole to digest search: derive that search's parameter from `RecallQuery` so its reads link here, or delete what it never reads |
| `RecallQuery.scope.chat` | `kit/src/recall/index.ts:192` | never-read | unknown (read) | the query is handed whole to digest search: derive that search's parameter from `RecallQuery` so its reads link here, or delete what it never reads |
| `RecallQuery.queryText` | `kit/src/recall/index.ts:193` | never-read | unknown (read) | the query is handed whole to digest search: derive that search's parameter from `RecallQuery` so its reads link here, or delete what it never reads |
| `RecallQuery.scopedCharacterId` | `kit/src/recall/index.ts:194` | never-read | unknown (read) | the query is handed whole to digest search: derive that search's parameter from `RecallQuery` so its reads link here, or delete what it never reads |
| `RecallQuery.mode` | `kit/src/recall/index.ts:195` | never-read | unknown (read) | the query is handed whole to digest search: derive that search's parameter from `RecallQuery` so its reads link here, or delete what it never reads |
| `RecallQuery.keywordMatch` | `kit/src/recall/index.ts:196` | never-read | unknown (read) | the query is handed whole to digest search: derive that search's parameter from `RecallQuery` so its reads link here, or delete what it never reads |
| `RecallQuery.minScore` | `kit/src/recall/index.ts:197` | never-read | unknown (read) | the query is handed whole to digest search: derive that search's parameter from `RecallQuery` so its reads link here, or delete what it never reads |
| `RecallQuery.retrieveK` | `kit/src/recall/index.ts:198` | never-read | unknown (read) | the query is handed whole to digest search: derive that search's parameter from `RecallQuery` so its reads link here, or delete what it never reads |
| `RecallQuery.rerankTo` | `kit/src/recall/index.ts:199` | never-read | unknown (read) | the query is handed whole to digest search: derive that search's parameter from `RecallQuery` so its reads link here, or delete what it never reads |
| `versionIdentitySchema.builtAt` | `kit/src/version-identity/index.ts:78` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `client/src/features/user-admin/components/about-section.tsx:53` |
| `updateCheckSchema.local` | `kit/src/version-identity/index.ts:249` | never-read | delete | delete the key and its writes (`kit/src/version-identity/index.ts:270`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
