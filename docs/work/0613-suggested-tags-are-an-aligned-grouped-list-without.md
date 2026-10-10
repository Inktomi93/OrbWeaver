---
kind: bug
status: doing
updated: 2026-10-10
priority: P2
area: client
lane: wt/agent-a077f0d1825cbd015
---

# Suggested tags are an aligned, grouped list without internal tags

## What

Suggested labels is a ragged inline list, repeats a 'Suggested' kicker per row, grew to 102 rows with near-duplicates after distill, and suggests seed tags assistant, default and utility (seeder cards.ts; labels-suggestions.tsx) (fp11-corpus-labels.png). Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

Suggestions render as a table grouped by tag with apply-to-all, near-duplicates merged and internal seed tags excluded.

## Evidence

Filled at landing: what ran and where its output is.
