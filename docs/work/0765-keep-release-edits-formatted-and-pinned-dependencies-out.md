---
kind: bug
status: doing
updated: 2026-10-06
priority: P2
area: release
lane: main
---

# Keep release edits formatted and pinned dependencies out of automatic updates

## What

Format release-generated package edits without changing versions. Keep Playwright exactly pinned and update version-keyed patches by hand.

## Why

Generated package arrays fail the formatter. Automatic dependency updates can separate browser revisions or detach required patches.

## Done when

Release edits remain formatter-clean after a version change. Dependency update exclusions match exact pins and required patches. Focused configuration tests pass.

## Evidence

Filled at landing: what ran and where its output is.
