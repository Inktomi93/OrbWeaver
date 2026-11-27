---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: db
lane: wt/agent-a17fbff7022b3eefb
plan: unwired-code
---

# Write-only internal columns are dropped

## What

Columns written and never read, with no surface where they help: chatHandoffResumptions.createdAt, automationOwnerBudgets.updatedAt, pluginKv.updatedAt, sessionEntries.createdAt, sessions.updatedAt, oidcPendingSignups.createdAt, embedGenerations.createdAt, characterEmbeddings.createdAt, imageEmbeddings.createdAt, imageAnalyses.createdAt, documentChunks.createdAt, duplicateChatPairs.cslsScore, duplicateChatPairs.model, sessionEntries.seededThroughSeq, sessionEntries.canonHash, chatGenerationObservations.connectionAttributionProvenance.

## Why

Each is internal state, a derived-row stamp, a copy of another column, a constant sentinel or a superseded record; reports/unwired/columns-judge.md gives the reader evidence per row.

## Done when

A numbered migration drops each column after its writers stop; chatGenerationObservations.connectionAttributionProvenance is dropped only after a check that no per-connection spend view is planned; the columns scan no longer lists them.

## Evidence

Filled at landing: what ran and where its output is.
