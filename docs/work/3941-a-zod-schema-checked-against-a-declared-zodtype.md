---
kind: bug
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# A zod schema checked against a declared ZodType reads that type's members

## What

The delete trial refuted analysisPayloadEnvelopeSchema.suggestions.text (packages/server/src/domain/automation/contract/analysis.ts): deleting it breaks the schema's satisfies ZodType<AnalysisPayload> at analysis.ts:211 and a ZodPipe assignment to ZodType\<AnalysisPayload | AnalysisPayloadForRoutes<TRoutes>> at :284. The graph reports it member-untouched, so it does not pair a zod schema with the declared type it is checked or assigned against.

## Why

The graph calls a live member dead; only the trial caught it.

## Done when

A planted schema checked by satisfies and by assignment against a ZodType of a declared type reads the type's members, and the case fails without the fix; a trial on the planted tree confirms no refuted row.

## Evidence

Filled at landing: what ran and where its output is.
