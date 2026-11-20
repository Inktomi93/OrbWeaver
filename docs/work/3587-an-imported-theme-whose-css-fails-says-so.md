---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: client
---

# An imported theme whose CSS fails says so

## What

An imported theme's failing CSS degrades to `null` with no message (`import-theme.ts:47-50`), and `THEME_CSS_MAX` caps the CSS size. No surface states either. Show a notice when the CSS is dropped and name the size limit.

## Why

A theme author sees the theme apply without its styles and gets no cause.

## Done when

A failing or oversized theme import shows a notice that names the cause, with a test for each.

## Evidence

Filled at landing: what ran and where its output is.
