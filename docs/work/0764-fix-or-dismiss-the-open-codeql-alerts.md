---
kind: bug
status: open
updated: 2026-10-07
priority: P2
area: security
---

# Fix or dismiss the open CodeQL alerts

## What

Classify the open CodeQL findings for generated Unicode content and the local debug-token request. Preserve source evidence for each disposition.

## Why

A successful scan can publish findings. Review the actual source and destination before changing code or dismissing an alert.

## Done when

Each alert is fixed in code, or dismissed in GitHub code scanning with a reason that cites the code showing it is unreachable or harmless; the Security tab shows no open CodeQL alerts.

## Evidence

`tooling/src/verify/ops/gen/unicode-handle-key.ts` validates fetched content against pinned hashes before writing to a fixed path.

`tooling/src/stack/ops/prod-state.ts` sends the debug token to loopback after matching the listener process with the recorded process.

These flows have source evidence for false-positive dispositions. The alerts remain open; no dismissal occurred.
