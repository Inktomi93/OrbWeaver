---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: unwired-code
---

# The distinct registry holds the ports review targets ports-judge ruled distinct

## What

The ports review targets ruled distinct in ports-judge section C (ReactToolHandlerContext against the chat-scoped params, GlobalVariableView against GlobalVarWrite, PublishChatChangedOp against publishChatChanged, ListActiveForChatParams against CheckSendAvailabilityParams, StZipLimits against EntryLimits, AdoptDefaultPersona against verifyPersonaOwned, ReadSeededKeys against OwnedBackgroundHashes, StatFigureProps against its option shapes) still report as review because tooling/src/unwired/distinct-lookalikes.ts lacks them.

## Why

A ruled pair that keeps reporting hides the true findings among the review rows.

## Done when

Ports reports no review target that ports-judge ruled distinct, and each remaining target is a true finding.

## Evidence

Filled at landing: what ran and where its output is.
