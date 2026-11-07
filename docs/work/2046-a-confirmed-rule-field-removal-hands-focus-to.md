---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: client
plan: cross-surface-consistency
---

# A confirmed rule field removal hands focus to a live control

## What

After a confirmed removal in the rule fields, focus falls to the page body. useRowDeleteFocus does not fit: there is no row list, and the confirm unmounts with the field branch. RuleRemoveField and its single-field sites need a focus target that outlives the confirm.

## Why

A keyboard or screen-reader user loses their place after a confirm.

## Done when

After a confirmed removal focus lands on a named control, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
