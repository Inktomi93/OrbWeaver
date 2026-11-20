---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: chat
plan: chat-html-and-presets
---

# The regex stop notice's Show this script action focuses a prompt-only script's tier row

## What

For a prompt-only regex script that stopped, the notice's Show this script action opens the Regex section and the row shows its stop mark, but keyboard focus does not land on the tier row.

## Why

A keyboard or screen-reader user lands somewhere else and has to hunt for the script the notice named.

## Done when

The action moves focus to the stopped script's tier row for a prompt-only script, with a CT that asserts focus.

## Evidence

Filled at landing: what ran and where its output is.
