---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: tests
plan: test-foundation
---

# The SDK stand-in child imports the preset contract barrel for one environment name

## What

tests/support/node/corpus-sdk-child.ts imports CLAUDE_CONFIG_DIR_ENV from @orb/contracts/preset. A cold import of that barrel measures about 0.28 s on two pinned cores against about 0.11 s for @orb/kit/ids, and every SDK stand-in child pays it at start. The constant has no lighter production home, and adding a door for a test is refused, so this is a finding only.

## Why

Every child-spawning SDK case multiplies the cost by its child count; the canon lineage case spends close to three seconds of its runtime on it.

## Done when

The owner rules whether the environment names move to a smaller production module that the runtime already imports, or the cost stays; a ruling to move it lands with the move and a measured child start.

## Evidence

Filled at landing: what ran and where its output is.
