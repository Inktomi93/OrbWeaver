---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: unwired-code
---

# The unwired tool reports error codes nothing throws or nothing handles

## What

The unions scan proves a member is produced somewhere, not that a refusal or error code is ever thrown, nor that the client keys on a code the server throws.

## Why

A code nothing throws is dead vocabulary, and a thrown code nothing handles reaches the user as a generic failure.

## Done when

pnpm unwired gains a codes verb that lists each error and refusal code with its throw sites and its client handlers, flagging codes with none of either, with a planted-fixture test, and the orchestrator judges its first report.

## Evidence

Filled at landing: what ran and where its output is.
