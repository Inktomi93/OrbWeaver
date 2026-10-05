---
kind: bug
status: doing
updated: 2026-10-05
priority: P2
area: plugin
lane: codex/launch-plugins
---

# Turning a plugin off stops its display transforms at once

## What

After Draft Polish is switched off the transcript keeps its typeset glyphs until a full reload; plugin.listDisplayTransforms is not invalidated on enable or grant changes. Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

Switching a plugin off or on refreshes display transforms immediately, with a test.

## Evidence

Filled at landing: what ran and where its output is.
