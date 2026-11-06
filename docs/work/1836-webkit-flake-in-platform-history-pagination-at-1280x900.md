---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: testing
---

# WebKit flake in platform-history-pagination at 1280x900 flat

## What

Find why platform-history-pagination times out in WebKit at 1280x900 flat, and remove the cause without raising the timeout.

## Why

The flake is also seen in Chromium: line 114 of the suite timed out once at 390x844 under load, then passed on repeats. The Evidence holds the sighting.

## Done when

The suite passes repeated consecutive WebKit and Chromium runs under whole-suite load at both sizes.

## Evidence

Filled at landing: what ran and where its output is.

- The same flake in a second browser and size: `platform-history-pagination.suite.ct.tsx:114` at 390x844 timed out once in Chromium under load 41, then passed 6 of 6 repeats.
