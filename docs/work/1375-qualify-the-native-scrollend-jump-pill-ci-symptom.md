---
kind: work
status: open
updated: 2026-10-26
priority: P2
area: client
---

# Qualify the native-scrollend jump-pill CI symptom through production flows

## What

Qualify the jump-pill failure recorded by CI run 40242985011 against real persisted messages and published socket events. The production-flow component cases pass normally and under CPU throttling, but those results do not explain the original wire-repetition failure. Preserve the source traces and the distinction between fixture repair and a production diagnosis.

## Why

A stronger fixture and a passing sensitivity control do not establish the cause of an earlier failure. Do not classify the symptom as a flake or claim an unproven runtime fix.

## Done when

Reproduce the symptom through production write/event flows and identify the event, geometry or lifecycle cause, then fix it if it is a product defect. Alternatively, establish the original fixture-only cause with trace evidence and a discriminating control. Preserve native and absent-scrollend coverage, the away-reader counter, strict physical-tail checks and post-jump pill removal. Add no retry, baseline, timing relaxation or replacement application implementation. Retained evidence: `reports/surface-consistency-private/governed-doc-recovery/originals/docs/reviews/ci-motion-scroll-closeout.md`.

## Evidence

Filled at landing: what ran and where its output is.
