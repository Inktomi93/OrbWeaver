---
kind: bug
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-a2f6cc226f4a38146
---

# Two corpus phone specs fail in a full local cell

## What

A full local corpus-phone-bubble cell run during 1138 failed tests/e2e/scripted-chat.spec.ts line 109 (first send streams incrementally, second send works, canon survives reload) at toBeFocused, and tests/e2e/sillytavern-folder-import.spec.ts line 115. Not timeouts. Not yet checked against CI phone cells, which were killed before reaching them.

## Why

These are the first real verdicts on the phone suite past the old ten-minute kill; a smoke red there is either a product regression on phone or a spec defect.

## Done when

Each cause is found from a local run and the trace: a product fix with the spec unchanged, or a spec correction with its reason; both pass in every phone corpus cell, with planted-red proof kept.

## Evidence

Filled at landing: what ran and where its output is.
