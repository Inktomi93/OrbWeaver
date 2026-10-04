---
kind: bug
status: doing
updated: 2026-10-04
priority: P3
area: plugin
lane: wt/agent-a8d7e39d090971afa
---

# Plugin command arguments read as words

## What

The args dialog labels fields with raw ids (style, note), leaves the style picker blank instead of its default, and slash suggestions show the enum id 'inkSketch' (fp2-kc-args.png). Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

Arguments show labels, defaults are preselected, and suggestions show display names.

## Evidence

Filled at landing: what ran and where its output is.
