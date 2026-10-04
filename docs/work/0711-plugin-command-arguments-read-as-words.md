---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: plugin
---

# Plugin command arguments read as words

## What

The args dialog labels fields with raw ids (style, note), leaves the style picker blank instead of its default, and slash suggestions show the enum id 'inkSketch' (fp2-kc-args.png). Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

Arguments show labels, defaults are preselected, and suggestions show display names.

## Evidence

Lane S4 humanized argument labels and option text. Not done: preselected defaults need a default or label field on PluginCommandArgSpec, a contracts and SDK change.
