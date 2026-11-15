---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: regex
plan: import-robustness
---

# A room member sees the host's display scripts drawn unless the host switches sharing off

## What

The room setting that shares the host's display scripts with members is off by default, so a member sees a preset's raw markup where the host sees the drawn panel. The owner ruled that sharing is on by default. A member then also sees the roster of the host's scripts with their patterns, and the host can switch sharing off.

## Why

A shared room where only the host sees the styled reply defeats the point of playing the same scene together.

## Done when

A new room and an existing room both read as shared until the host switches it off. A member's transcript matches the host's for display scripts on every delivery path, proven with a member principal. With the switch off the scripts are withheld from members as before. The room's on-screen group states the default in plain words.

## Evidence

Filled at landing: what ran and where its output is.
