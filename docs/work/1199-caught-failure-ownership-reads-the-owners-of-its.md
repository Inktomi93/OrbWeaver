---
kind: bug
status: open
updated: 2026-10-20
priority: P1
plan: test-foundation
---

# caught-failure-ownership reads the owners of its remaining findings

## What

After 1049's leg, caught-failure-ownership reports findings at sites whose failures have owners the reader cannot see: an injected recordFailure and InferenceLog (inference agent-sdk execution.ts:191, executor.ts:100), a held-then-rethrown local (server entry lifecycle.ts:677 to :734), the acme terminations set (execution.ts:18), an error-first DNS callback (egress.ts:220) and egress.ts:514, response-body.ts:133, :137 and :183 controller.error, and tooling owners in router-declaration-publication.ts:124, semantic-inventory-runtime.ts:235 and platform-probes.ts:38, :98 and :161. Table: reports/review/1049-r-findings.md.

## Why

These are verified false positives; fix-not-excuse forbids markers, and the gate stays red on main until the reader recognises them.

## Done when

The reader recognises each owner pattern with a red-first case and a fooled-owner control, the listed findings clear on the real tree, no marker or waiver is added, and the excused count does not rise.

## Evidence

Filled at landing: what ran and where its output is.
