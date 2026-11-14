---
kind: tooling
status: doing
updated: 2026-11-14
priority: P3
area: tests
lane: wt/agent-a253b95f39b2389ae
---

# A stale showcase bundle is refused by name

## What

Component tests that mount a showcase plugin read its built bundle from `packages/showcase-plugins/dist/bundles/`, which is not committed. The testkit's bundle lookup names the build command only when a bundle is missing. A bundle built before a manifest change is used as it is, so the test fails later with a symptom that points at the plugin's behaviour.

## Why

A whole run after a merge reported a plugin defect that was only an old build, and a reader has no way to tell the two apart.

## Done when

The bundle lookup compares the built bundle's manifest version with the source manifest and fails with the build command when they differ, with a case for the stale bundle.

## Evidence

Filled at landing: what ran and where its output is.
