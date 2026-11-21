---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: server
plan: unwired-code
---

# Round eight cleanup: superseded reads, a twin sink and small view fixes

## What

chat.getNextTurnConnection and nextTurnConnectionViewSchema have no client query since the composer next-turn line moved to connection.resolveChatCapability and the send availability; only two invalidations name them. SendRegexResult in packages/server/src/domain/chat/assembly/context.ts restates SendRegexSink in packages/server/src/domain/chat/verbs/turn.ts. AdminComposeDeps.logger and idSource are declared and unused in packages/server/src/entry/compose/admin.ts. EmptyState takes a className no caller passes. WovenWeb returns freeZoneRadius that no reader takes. WireDef.deltas is vocabulary nothing reads. The library export writes export-report.json into the zip and its copy never says so. The invite dialog row does not show when an invite was made.

## Why

Superseded and unread code reads as live, a twin type drifts, and two small facts the user needs are missing.

## Done when

The procedure, its view schema and both invalidations are gone after the lane confirms no reader with ast-grep; one sink type lives in chat's contract and both sites use it; the two admin deps, the EmptyState className, the returned freeZoneRadius and WireDef.deltas are gone; the Download my library copy names the report file as the SillyTavern export copy does; the invite row shows its creation time; affected suites and CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
