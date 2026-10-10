---
kind: tooling
status: open
updated: 2026-10-10
priority: P2
area: tooling
---

# Snap drives the phone the way a thumb does

## What

Owner report: snap's mobile tap support is missing something. --mobile (iPhone 14 Pro Max descriptor), --tap and --swipe exist (tooling/src/snap/ops/flags-handlers.ts, drive-actions.ts). Find the gap a real phone drive hits (candidates: long-press, tap by coordinate, on-screen keyboard and visualViewport resize when the composer focuses, WebKit engine since iOS Chrome is WebKit) and close it.

## Why

Mobile review findings are only as good as the drive that produced them.

## Done when

A demonstrated mobile interaction that snap could not perform now runs, with a test on the new path and help text updated.

## Evidence

Filled at landing: what ran and where its output is.
