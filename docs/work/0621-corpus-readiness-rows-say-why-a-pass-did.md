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

The staged member drive shows readiness rows with not run and no explanation or per-pass action. Evidence: `reports/runs/snap/main-3544817-2026-10-05T01-23-20-949Z/run.json`. The screenshot was inspected. This item remains open; the library batch has not claimed the pass-action work.
