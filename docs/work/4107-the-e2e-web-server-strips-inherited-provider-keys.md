---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: security
plan: test-foundation
---

# The e2e web server strips inherited provider keys as stages do

## What

The e2e webServer setup (tests/e2e/support/modes.ts) still passes OPENROUTER_API_KEY_FILE and other spellings of a provider key from the caller's shell to the server it boots, which then seeds it; stages and pnpm fixture up now strip every spelling through withoutProviderKeys in tooling/src/floor/process/operator-keys.ts.

## Why

A test server storing the operator's real key is the hole the stage fix closed; one helper should cover every booted server.

## Done when

The e2e web server env passes through withoutProviderKeys, live e2e still receives its key through the path it is meant to, and a test plants the alternate spellings and sees them stripped.

## Evidence

Filled at landing: what ran and where its output is.
