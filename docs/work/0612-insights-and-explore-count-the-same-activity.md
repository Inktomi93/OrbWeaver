---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: client
---

# Insights and Explore count the same activity

## What

Insights reads the character_stats rollup (server stats/persistence/rollups.ts) while Explore reads discovery economics, so imported chats show exchanges in Explore and nothing in Insights. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

Both read one source, or Insights says what imported chats lack, with a test.

## Evidence

Filled at landing: what ran and where its output is.
