---
kind: bug
status: open
updated: 2026-10-05
priority: P3
area: client
---

# Corpus readiness rows say why a pass did not run

## What

After the pass, rows read 'not run' for story themes, keywords and near-duplicates with one 'Run the passes again' button and no reason. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

Lane S2 evidence: keywords and near-duplicates are their own passes outside the understanding chain (use-understanding-pass.ts PASS_KINDS), so the one rerun button cannot run them and no per-pass door exists on the client; only story themes has a known prerequisite (chat memory). Needs the corpus pass owner to add per-pass actions.

## Why

Launch visual pass finding.

## Done when

Each row names what it needs and offers the action, for example 'Needs chat memory — Turn on'.

## Evidence

Filled at landing: what ran and where its output is.
