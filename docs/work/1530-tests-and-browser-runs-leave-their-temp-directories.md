---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# Tests and browser runs leave their temp directories behind

## What

The OS temp folder fills with test leftovers: orb-plugin-broker, orb-plugin-folder, orb-plugin-admitted, orb-file-actions, orb-sdk-regression, orb-assets-var, orb-assets-cas and others, plus Chromium profile folders that Playwright, CT and snap runs never remove. Find each creator, give its temp folder an owner that removes it on teardown and on failure (the testkit's disposable stack), and close every browser context and browser the runs open.

## Why

Leftovers reached tens of thousands of entries and helped fill the disk.

## Done when

A full pnpm test, pnpm test:ct and one snap run leave no new orb-\* or Chromium profile entries in the temp folder; a testkit case proves a failing test still removes its folder.

## Evidence

Filled at landing: what ran and where its output is.
