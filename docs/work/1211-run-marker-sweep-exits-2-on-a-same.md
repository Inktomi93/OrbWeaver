---
kind: bug
status: open
updated: 2026-10-20
priority: P2
plan: test-foundation
---

# Run-marker sweep exits 2 on a same-UID process with unreadable environ

## What

tooling/src/floor/host/platform-probes.ts:154 throws when a same-UID process started during a run has an environ it cannot read, so an e2e matrix whose tests all pass exits 2 on a shared host. The fail-closed behaviour is deliberate in the file header.

## Why

A green matrix reported as a tool failure hides real verdicts and needs reruns.

## Done when

The sweep tells an unrelated unreadable process from a marked one (for example by start time, parent chain or marker ownership) without dropping its fail-closed guarantee for marked processes, with a test for each case.

## Evidence

Hosted run `39469280964`, project `corpus-phone-whisper`, records passing executed cases and no unexpected cases, then exits with a process-completion tool error. The sweep cannot read a same-UID candidate's environment. Evidence: `reports/review/ci-39469280964-phone-whisper.log` and `reports/review/ci-39469280964-phone-whisper-artifact/`. This is incomplete process qualification, not a product assertion failure.
