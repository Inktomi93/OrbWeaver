---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: client
---

# Corpus Explore lists characters before a distill pass

## What

Explore's list inner-joins characterSummaries (server discovery/verbs/browse.ts), filled only by distill, so it is empty while characters exist. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

Explore lists every character and fills facets when the pass runs, with a test.

## Evidence

Filled at landing: what ran and where its output is.
