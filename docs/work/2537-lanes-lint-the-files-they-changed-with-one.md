---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tooling
---

# Lanes lint the files they changed with one command, and slow tests near their budget are reported

## What

Twice a lane reported ESLint clean on a count of files one short of what its branch changed, and the missed file failed on the merged tree. Lanes build the file list by hand. Separately, a test that spawns a real guest or a subprocess passed alone and timed out in a batch five times across the day, each found only when a suite went red; the slow tag fixes it once someone notices.

## Why

A floor a lane assembles by hand is a floor it can get wrong. A test running at most of its budget on a quiet box is a timeout waiting for load.

## Done when

A package script lints exactly the files a branch changes against main and prints the count, and the lane skill's floor names it. The Node runner config reports each test whose duration passes a set fraction of its budget, through the runner's own slow-test threshold, so a lane sees the warning in its own run.

## Evidence

Filled at landing: what ran and where its output is.
