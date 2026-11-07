---
kind: bug
status: open
updated: 2026-11-07
priority: P2
area: server
plan: cross-surface-consistency
---

# An import dry run runs on the interactive lane

## What

import-st is a sweep-lane kind, and the sweep lane is one worker wide, so a folder import preview waits behind a boot-time index sweep for over a minute while a person watches the progress bar, though the dry run itself takes a fraction of a second.

## Why

D209 puts work on lanes so a long sweep cannot delay interactive work, and a preview a person is waiting for is interactive work.

## Done when

A contribution's lane may depend on its params, import-st returns interactive for a dry run, start and retry stamp the resolved lane, D209 is amended in the same commit, and a node test holds a sweep row in flight and proves the dry run completes, red first.

## Evidence

Filled at landing: what ran and where its output is.
