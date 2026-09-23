---
kind: tooling
status: open
updated: 2026-09-23
priority: P3
area: tooling
---

# Remove the unused recordVideoDir second-context plumbing

## What

`recordVideoDir` survives in tooling/src/\_shared/browser.ts, browser-context.ts and browser-contract.ts (the `attachRecordedContext` path). No production caller sets it; only tests/tooling/\_shared/browser-attach.suite.int.test.ts and browser-construction.suite.int.test.ts do.

## Why

The record tool that used this path is deleted and the filmstrip ADR rejects video capture in favor of PNG contact sheets, so the second-context plumbing has no consumer.

## Done when

recordVideoDir and attachRecordedContext are removed along with their tests, or a real consumer is named and kept.

## Evidence

Filled at landing: what ran and where its output is.
