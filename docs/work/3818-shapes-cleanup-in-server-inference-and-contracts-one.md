---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: chat
plan: unwired-code
---

# Shapes cleanup in server, inference and contracts: one home per repeated shape

## What

The shapes review (reports/unwired/shapes-judge.md, true findings) found repeated shapes: ReasoningParseOptions restating ReasoningTagPair; a private SeqSpan in discovery/themes/backfill.ts beside @orb/kit/recall's; CacheMarkerRow and PlanRow in packages/inference/src/contract; a private SendRegexSink in chat/verbs/turn.ts beside the contract type; FindCompileProbe in primitives/regex and domain/regex/contract; HistoryTurn, NamedRow and SquashRow in chat/assembly; ImageryChatWarningCode renaming PlainChatWarningCode; StProfileZipFile restating ZipEntry; the synonym aliases StoredActor, MultimodalMode, ExtractionMode, RegexAttachScopeRef and ExportedCard; and serde doors re-exporting each SCHEMA_KIND from @orb/contracts/portability. The ports review (reports/unwired/ports-judge.md) adds ActiveWorkloadRow in domain/workloads/contract/contribution.ts, which holds no AbortSignal and so belongs in @orb/contracts/workloads under D117, and ReactToolHandlerContext in domain/chat/contract/react-tool.ts, which should pick principal and chatId from ChatToolExecutionData in packages/contracts/src/tool-use. The params fix lane adds RerankCallOptions, which restates the RoleClients.rerank opts type in packages/contracts/src/role-clients.

## Why

Two spellings of one concept drift apart.

## Done when

Each concept has one home that every user imports, importers of a SCHEMA_KIND take it from @orb/contracts, StZipLimits derives from ZIP_WRITE_LIMITS, and the affected suites and typecheck worlds pass.

## Evidence

Filled at landing: what ran and where its output is.
