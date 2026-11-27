---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: server
plan: unwired-code
---

# Drop the result fields and restated types the delete trial confirmed unread

## What

The delete trial at b0a07545b4 confirmed unread: ReorderResult.reordered, ReapResult.reaped, CredentialHealth.checkedAt, GlobalVariableWrite.updatedAt, ThemeInsert.updatedAt, and DetachResult.detached with the client's restated copy of its type.

## Why

A field nothing reads is surface that drifts; a restated client type is a second home.

## Done when

Each field is removed or given a reader per the owner ruling on collected data, the client imports the result type from contracts, and the unwired reports list none of them.

## Evidence

Filled at landing: what ran and where its output is.
