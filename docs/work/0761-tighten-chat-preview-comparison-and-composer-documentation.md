---
kind: work
status: open
updated: 2026-10-06
priority: P3
area: client
---

# Tighten chat preview comparison and composer documentation

## What

Restrict the Whisper image comparison tolerance to the measured corner pixels. Update the composer header to describe its current layout.

## Why

The current images are correct, but the comparison permits changes outside the measured corners. The composer header describes an obsolete layout.

## Done when

The preview comparison rejects changed pixels outside the measured allowance. The composer header matches the rendered layout. Applicable scoped checks pass.

## Evidence

Filled at landing: what ran and where its output is.
