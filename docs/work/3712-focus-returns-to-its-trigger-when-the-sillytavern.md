---
kind: bug
status: open
updated: 2026-11-21
priority: P1
area: import
plan: import-robustness
---

# Focus returns to its trigger when the SillyTavern export preview opens, cancels or retries

## What

Opening the Export for SillyTavern preview, pressing Cancel, or pressing Try again drops keyboard focus to the page body.

## Why

A keyboard or screen-reader user loses their place in Backup and Restore.

## Done when

Focus moves into the dialog on open and back to the Export for SillyTavern button on close and after Try again, with a CT for each.

## Evidence

Filled at landing: what ran and where its output is.
