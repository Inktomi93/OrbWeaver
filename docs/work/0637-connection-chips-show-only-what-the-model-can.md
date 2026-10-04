---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: connection
---

# Connection chips show only what the model can do

## What

Cards list every task the wire serves, matched on kind only (server connections.ts connectionTasks), skipping each task's requires check, so Sonnet 5 shows Image generation (contracts/src/inference/tasks.ts generateImage requires image output) and the chips read as assigned roles (fp6-conn-switch2.png). Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

Chips apply each task's requirements and read as capabilities, separate from assigned roles, with a test.

## Evidence

Filled at landing: what ran and where its output is.
