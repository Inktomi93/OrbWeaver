---
kind: work
status: open
updated: 2026-10-29
priority: P2
area: ui
plan: surface-walk
---

# Define text scaling for isolated card and plugin documents

## What

Define which host typography tokens and font-scale settings cross the isolated card and plugin document boundary. The sandbox theme supplies colors, radius and font families but no root font size.

## Why

An isolated document cannot inherit the host root font scale. Host typography checks therefore do not prove consistent scaling inside cards and plugin pages.

## Done when

Record the intended scaling contract. Implement the chosen validated boundary without weakening isolation. Exercise real iframe content at default and enlarged text scales and narrow widths, including authored fixed-size content.

## Evidence

Filled at landing: what ran and where its output is.
