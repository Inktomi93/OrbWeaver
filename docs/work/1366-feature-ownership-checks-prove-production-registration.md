---
kind: tooling
status: open
updated: 2026-10-25
priority: P2
area: client
---

# Feature ownership checks prove production registration

## What

The ownership check in `tests/client/feature-layout.suite.test.ts` accepts a definition-shaped filename without inspecting its exports or production registration. `tests/client/state/registry-definitions.dom.test.ts` checks recognized declarations separately. Reconcile these checks against the actual composition door and supported definition forms.

## Why

A correctly named helper can satisfy the ownership claim without providing a reachable feature. Filename presence is not registration evidence.

## Done when

Extend the existing native tests, without another policy framework. A definition-shaped helper and an unwired definition fail planted controls. Real registered constants and factories pass. Document recognition limits and correct claims that exceed them. Preserve the current naming and bucket checks. Add no baseline or exemption for a real violation.

## Evidence

Filled at landing: what ran and where its output is.
