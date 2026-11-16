---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# The install-default notice does not name the interactive switch when that switch holds a row

## What

When an admin turned the install's interactive switch off, a row held by it shows the install-default notice, which names the rich HTML default and not the switch that was changed.

## Why

The admin is sent to a setting that is not the one holding the row.

## Done when

The notice names the binding install setting for each cause, and its control opens that setting.

## Evidence

Filled at landing: what ran and where its output is.
