---
kind: bug
status: open
updated: 2026-11-21
priority: P2
area: import
plan: import-robustness
---

# The SillyTavern export preview groups its lines and caps the name list

## What

The preview is one flat run of lines at one weight with no heading for what stays here, and Show names expands to an unbounded list of file names.

## Why

The reader cannot see at a glance what goes and what stays.

## Done when

The preview separates what goes from what stays under headings, and the name list is bounded with a scroll region, with a CT at phone width.

## Evidence

Filled at landing: what ran and where its output is.
