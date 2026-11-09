---
kind: tooling
status: open
updated: 2026-11-09
priority: P2
area: testing
plan: test-foundation
---

# Test background work that a turn detaches is settled before the next write

## What

The corpus determinism lane added a guard for workload lanes, but a chat turn's detached background work, such as its memory build, is not covered: a fixture that writes after a turn without settling it races that work, as tests/support/node/corpus-actors.ts did after the first turn. The guard should refuse a write while turn background work from the same root is still running.

## Why

Every unsettled detached job is a timing race that splits fixtures at random on a slower runner.

## Done when

The testkit refuses or reports a write that starts while a turn's detached work is running, a planted unsettled turn fails it, and the corpus publish path passes with it on.

## Evidence

Filled at landing: what ran and where its output is.
