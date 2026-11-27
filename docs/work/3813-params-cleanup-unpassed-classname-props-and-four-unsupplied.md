---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: ui
lane: wt/agent-aecb78d3e3ce1089b
plan: unwired-code
---

# Params cleanup: unpassed className props and four unsupplied parameters

## What

The params review (reports/unwired/params-judge.md) found parameters no production caller supplies: className on EmptyState, WebWeave, BackgroundVideo, CrossfadeImage, Scatter and Table, which UI-Primitives-and-Reuse.md says a component takes only when a caller passes it layout; DiscoveryService.cooccurringKeywords limit; definedClassTokens tokenize in packages/client/src/lib/motion-dead-class-flagger.ts; CredentialsService.markRevokedByUser params.reason, which only feeds the audit text. Also usePromptMacroSuggestions options in packages/client/src/data/use-prompt-macro-suggestions.ts: its plugins:false branch served a client imagery template editor nobody plans, so the option goes and the server-side imagery macros stay.

## Why

An option no caller passes is a default path nothing exercises.

## Done when

Each listed parameter and its default path is deleted, markRevokedByUser keeps its fixed audit text, and the affected suites and typecheck worlds pass.

## Evidence

Filled at landing: what ran and where its output is.
