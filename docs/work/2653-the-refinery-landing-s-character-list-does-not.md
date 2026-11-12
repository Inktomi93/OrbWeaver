---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: surface-walk
---

# The refinery landing's character list does not trap the wheel at the largest desktop text

## What

At the largest desktop text the refinery landing's character list is taller than its pane and keeps the wheel, so the page cannot be scrolled past it with a wheel or trackpad. Reproduced by a one-case walk on main. Evidence: the drafted items and verdicts under reports/cb-walk-text.

## Why

A region that swallows the wheel strands everything below it for a pointer user.

## Done when

The wheel reaches the page past the list at every text size, by the list being bounded by its pane or handing the wheel on at its ends, with a component test at the largest desktop text. The walk's refinery cases pass at that size.

## Evidence

Filled at landing: what ran and where its output is.
