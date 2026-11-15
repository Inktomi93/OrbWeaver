---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
---

# Nothing checks that the committed showcase release record matches the sources

## What

The testkit bundle lookup refuses a built bundle whose entries differ from packages/showcase-plugins/release-entries.json. But the record is rewritten only by a local build. A showcase source edit committed without a rebuild leaves a record that agrees with the stale build, so the lookup cannot see it. The showcase package's check:artifacts script compiles the sources and would catch it, but no hook or CI step runs it.

## Why

A stale build after source edits is the commoner stale case. The record compare holds only while every source commit carries its rebuilt record.

## Done when

A check that runs on every commit or push touching packages/showcase-plugins/bundles/ fails when release-entries.json is not the record of a fresh build, with a planted control.

## Evidence

Filled at landing: what ran and where its output is.
