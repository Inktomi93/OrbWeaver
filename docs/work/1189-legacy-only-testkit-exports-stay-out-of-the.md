---
kind: work
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
---

# Legacy-only testkit exports stay out of the rebuilt population

## What

Testkit exports in tests/support are imported only by tests/legacy, for example node/factories/discovery-view\.ts, node/factories/chat-view\.ts, browser/ct-data-providers.tsx and browser/accessible-names.ts ariaTreeFindings and nameQualityFindings. List in reports/review/legacy-kept-alive-audit.md.

## Why

Testkit holds machinery for the new population only; legacy-only doors must retire with the legacy folder and never become rebuild dependencies.

## Done when

Each legacy-only testkit export is either used by a rebuilt suite through a production-derived door or deleted with its legacy consumers.

## Evidence

Filled at landing: what ran and where its output is.
