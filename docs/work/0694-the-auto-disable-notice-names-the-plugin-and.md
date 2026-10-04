---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: plugin
---

# The auto-disable notice names the plugin and the reason

## What

The bell says only 'A plugin was disabled', unnamed, and two auto-disables produced one notice. Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

Each notice names the plugin and the reason and links to its card.

## Evidence

Lane S4 (54cb1d440b) names the plugin and the reason in the inbox notice and adds an Open in Plugins button. Not done: a link to the plugin's own card (config nav has no per-card anchor), and the missing second notice: crash-policy notifies only while consecutive_crashes is under three and set-enabled never resets it, so a re-enabled plugin re-disables silently; proposed fix is resetCrashes on enable in set-enabled.ts with an int test.
