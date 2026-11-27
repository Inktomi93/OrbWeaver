---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: client
---

# Config search surfaces the filter tokens it cannot read

## What

Config search drops a typo'd filter token such as @shefl:app silently, though the parser's header said such tokens are surfaced.

## Why

A search that silently ignores part of the query answers a different question than the person asked.

## Done when

An unreadable token is shown to the person beside the results, checked in a CT.

## Evidence

Filled at landing: what ran and where its output is.
