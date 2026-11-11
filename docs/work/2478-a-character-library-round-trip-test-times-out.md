---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: testing
---

# A character library round-trip test times out on every batch run of its suite

## What

tests/server/domain/character/persistence/handle-copies-and-restores.int.test.ts has a case that spins two composed boxes with an image provider, a document upload and an export-import round trip. It exceeds the default five-second budget whenever the suite runs as a batch — timed out at just over five seconds on both full-directory runs of the slice — and passes in isolation. The sanctioned door for a proven-slow case is the slow tag with its scaled budget (tooling/floor/testing/test-tags.ts); the file carries no tags anywhere. Source: reports/codebase-review/units/dom-character.md. Item 2477 is the same shape in a tooling compile test; triage may group them, the doors differ.

## Why

The slice suite is red on a cold run, and a deterministic under-load timeout reads as a product defect to the next lane; the tag exists precisely to give proven runtime a real budget instead of a coin flip on machine load.

## Done when

The round-trip case (and sibling cases in the file that build a composed box with a provider fetch) carry the slow tag, and two consecutive full-directory runs of tests/server/domain/character pass.

## Evidence

Filled at landing: what ran and where its output is.
