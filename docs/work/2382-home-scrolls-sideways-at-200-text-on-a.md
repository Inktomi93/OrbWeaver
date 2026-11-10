---
kind: bug
status: doing
updated: 2026-11-10
priority: P3
area: client
lane: wt/agent-a25c03bac14ebf059
plan: cross-surface-consistency
---

# Home scrolls sideways at 200% text on a phone

## What

At 200% browser text on a 390x844 phone, the Home main scroller overflows sideways. The old source reproduces it, so it predates the start-action change.

## Why

Enlarged-text readers must not scroll a page sideways to read it; the enlarged-text law covers Home.

## Done when

enlargedTextFindings over Home's whole main is empty at 200% text on the phone profile, and tests/client/features/app-shell/surfaces/platform-home-start.suite.ct.tsx scopes its check to the whole main.

## Evidence

Filled at landing: what ran and where its output is.
