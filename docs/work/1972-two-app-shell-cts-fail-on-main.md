---
kind: bug
status: open
updated: 2026-11-06
priority: P1
area: client
plan: cross-surface-consistency
---

# Two app-shell CTs fail on main

## What

app-shell-motion.ct.tsx at line 787 and app-shell-notices.ct.tsx at line 189 fail on every local run on main, yet neither failed in the last CI run on origin, so the cause is a later commit or this box. Run both on origin's commit to find which. Also clear the reds that last CI run did show, or prove them gone: chat-attach-pickers.ct.tsx line 72, composer-two-rows.ct.tsx line 326, platform-text-scale.suite.ct.tsx line 954, corpus-determinism.int.test.ts and the Biome step.

## Why

A red test on main hides new failures at the barrier, and neither test mounts macro code, so a recent merge broke them.

## Done when

Each named test passes three runs in a row on main, Biome is clean, and the report names the cause of each.

## Evidence

Filled at landing: what ran and where its output is.
