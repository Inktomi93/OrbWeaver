---
kind: tooling
status: open
updated: 2026-10-11
priority: P1
area: ci
---

# Capture hosted E2E startup independently

## What

Add an explicit manual hosted E2E startup diagnostic without granting application qualification.

## Why

The full run reaches E2E startup only after the preceding application stages. Local cold startup does not reproduce the hosted missing marker, so the browser evidence needs a bounded hosted path.

## Done when

The diagnostic runs the real selected-mode setup and readiness controls, retains completed and failed startup evidence, and cannot run or authorize product qualification, nightly full checks, weekly proof or paid live-provider tests.

## Evidence

Orphaned claim: its codex branch is fully merged into main and no session holds it. Done when still needs a hosted run to confirm.

Hosted check: the Diagnostics workflow has no runs on record.

Filled at landing: what ran and where its output is.
