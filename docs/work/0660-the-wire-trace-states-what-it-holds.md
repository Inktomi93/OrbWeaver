---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: chat
---

# The wire trace states what it holds

## What

It says 'exact bytes' but stores no history rows (contracts chat sentPromptSchema), section blurbs mismatch, and 'Recorded generation settings' stores only per-send overrides (engine.ts params) instead of the effective intent. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

The trace names what it shows and records effective settings, with a test.

## Evidence

Lane S6 fixed the gloss copy only. Open: recording the effective settings needs the inference funnel's resolved params at engine.ts:309 (today prep.intent), which is request shaping; the section blurb mismatch is untouched.
