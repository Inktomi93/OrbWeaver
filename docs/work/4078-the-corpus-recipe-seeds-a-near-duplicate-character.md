---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: tests
plan: test-foundation
---

# The corpus recipe seeds a near-duplicate character pair and keyword counts above the floor

## What

The corpus fixture has no near-duplicate character pair and every keyword count is below the default floor, so Corpus result CTs serve those lists through responders instead of the committed corpus.

## Why

Tests that cannot read the real corpus for a list prove less than tests that can.

## Done when

The corpus recipe seeds a near-duplicate pair and repeated keywords, and the Corpus CTs read those lists from the committed corpus.

## Evidence

Filled at landing: what ran and where its output is.
