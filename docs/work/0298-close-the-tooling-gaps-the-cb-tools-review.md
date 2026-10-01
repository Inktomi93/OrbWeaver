---
kind: tooling
status: open
updated: 2026-10-01
priority: P3
area: tooling
---

# Close the tooling gaps the cb-tools review found

## What

Add a control proving that a real component-test failure with the browser present exits with a violation. Prove the Playwright revision hook in a real cloud session.

## Why

The component-test failure contract and cloud browser setup need direct behavioral evidence.

## Done when

A test plants a real CT failure and asserts exit 1. A real cloud session shows the hook set PLAYWRIGHT_BROWSERS_PATH and a CT run launched.

## Evidence

The ignored-output path correction is implemented in `tooling/src/_shared/prose-references.ts` and covered by `tests/tooling/_shared/prose-references.test.ts`. Missing descendants beneath an existing ignored directory are rejected.
