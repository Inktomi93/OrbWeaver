---
kind: tooling
status: open
updated: 2026-10-04
priority: P3
area: tooling
---

# The SillyTavern golden fixture builder uses Charlotte's new avatar

## What

scripts/probes/st-goldens/build-fixtures.ts still maps Charlotte to assistant.png after her handle and avatar became charlotte; with the file missing it silently writes a JSON card without her PNG.

## Why

Found by the S1 verifier.

## Done when

The probe maps Charlotte to charlotte.png and refuses a missing avatar.

## Evidence

Filled at landing: what ran and where its output is.
