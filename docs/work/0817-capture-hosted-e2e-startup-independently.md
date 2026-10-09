---
kind: tooling
status: doing
updated: 2026-10-09
priority: P1
area: ci
lane: codex/nightly-e2e-diagnostic
---

# Capture hosted E2E startup independently

## What

Add an explicit manual hosted E2E startup diagnostic without granting application qualification.

## Why

The full run reaches E2E startup only after the preceding application stages. Local cold startup does not reproduce the hosted missing marker, so the browser evidence needs a bounded hosted path.

## Done when

The diagnostic runs the real selected-mode setup and readiness controls, retains completed and failed startup evidence, and cannot run or authorize product qualification, nightly full checks, weekly proof or paid live-provider tests.

## Evidence

Filled at landing: what ran and where its output is.
