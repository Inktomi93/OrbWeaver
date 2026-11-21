---
kind: bug
status: open
updated: 2026-11-21
priority: P3
area: import
plan: test-foundation
---

# The SillyTavern export download click is stable on WebKit

## What

The st-export-preview CT case that downloads the zip fails on WebKit at the Download click with element never stable, and five import-preview cases fail on WebKit too; none of these files are in the webkit-iphone testMatch in playwright-ct.config.ts.

## Why

Backup and Restore ships on Safari and has no WebKit coverage.

## Done when

The unstable element is found and fixed, and the Backup and Restore CTs join the webkit-iphone project and pass there.

## Evidence

Filled at landing: what ran and where its output is.
