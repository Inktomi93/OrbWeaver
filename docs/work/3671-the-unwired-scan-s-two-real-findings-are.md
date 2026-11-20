---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: chat
plan: unwired-code
---

# The unwired scan's two real findings are wired or deleted

## What

A fresh unwired scan on main reports two real findings: HiddenSpanStreamScrubber.flush has no production caller, and ChatService.listParticipants is called only by tests.

## Why

Unwired code is a question about intent: wire it, or delete it with a reason.

## Done when

Each is wired into its production path with a test, or deleted with its tests and the reason recorded, after checking reader history and any cited ruling.

## Evidence

Filled at landing: what ran and where its output is.
