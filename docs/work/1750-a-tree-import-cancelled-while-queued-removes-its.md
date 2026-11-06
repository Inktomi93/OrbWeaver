---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: server
plan: unwired-code
---

# A tree import cancelled while queued removes its staged tree

## What

Free the staged tree of a tree import that is cancelled while it is queued.

## Why

A row cancelled while queued never reaches the run's cleanup, so its staged upload stays on disk until the next boot sweep.

## Done when

A test cancels a queued tree import and finds its staged directory removed before any boot sweep runs.

## Evidence

Filled at landing: what ran and where its output is.
