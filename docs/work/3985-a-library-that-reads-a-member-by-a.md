---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-abf90df0f06f44a65
plan: unwired-code
---

# A library that reads a member by a field-name string reads it

## What

MiniSearch reads each document's id through its idField option string, so the id copies in packages/client/src/features/chat/components/macro-textarea.tsx report write-only though the index reads them.

## Why

A member read by a configured field name looks dead.

## Done when

A field-name option whose value names a member of the documents' type reads that member, a planted case is red without it, and the macro textarea id rows leave write-only, or a ruling names the shape as unread with its reason.

## Evidence

Filled at landing: what ran and where its output is.
