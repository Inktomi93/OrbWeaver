---
kind: tooling
status: open
updated: 2026-10-31
priority: P3
area: tooling
plan: unwired-code
---

# The derived-port rule misreads overridden and nested spreads

## What

spreadFlow in tooling/src/unwired/restated-port.ts ignores properties written after a spread, so { ...sessions, revoke: other } reports a restatement of SessionsService.revoke although other fills the slot; the same false flow feeds reach counting in language-service.ts. A nested spread ({ inner: { ...sessions } }) and two spreads of one owner each report twice, because propertyFlow does not skip an object literal value.

## Why

A false finding teaches authors to suppress the rule; a double report is noise.

## Done when

A later property overrides the spread's flow for that member, a nested spread reports once, and the rule and census tests carry a found case and a control for each.

## Evidence

Filled at landing: what ran and where its output is.
