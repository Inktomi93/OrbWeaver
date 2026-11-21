---
kind: bug
status: open
updated: 2026-11-21
priority: P3
area: chat
plan: chat-html-and-presets
---

# Find whether a regex tier row can show a previous host's script

## What

packages/client/src/features/chat/components/regex-tier-row\.tsx renders a previous-host state with no switch, but a host handoff copies scripts into the new host's library as owned rows, so no path was found that shows that state.

## Why

A state no path reaches is either dead code or an untested case.

## Done when

Either a path to the state is found and covered by a CT, or the state is closed with a type or deleted.

## Evidence

Filled at landing: what ran and where its output is.
