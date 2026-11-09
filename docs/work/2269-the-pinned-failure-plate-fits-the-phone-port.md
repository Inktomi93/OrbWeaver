---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-a8da83abc2aef9b16
plan: cross-surface-consistency
---

# The pinned failure plate fits the phone port at 300% text

## What

At 300% text on a phone the pinned failure plate (564px) is taller than the 480px transcript port and cuts Dismiss off (transcript-window\.tsx).

## Why

A failure plate whose action is off screen cannot be dismissed.

## Done when

At 390 and 300% text the plate's actions are reachable, by a capped plate that scrolls or a shorter layout, with a CT cell. Source: acceptance part 4 report B B1.

## Evidence

Filled at landing: what ran and where its output is.
