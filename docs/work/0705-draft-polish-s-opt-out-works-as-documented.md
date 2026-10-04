---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: plugin
---

# Draft Polish's opt-out works as documented

## What

The README's opt-out, {{setvar::polishOff::1}} typed in a message, is not evaluated: it renders raw, the chat variable stays unset, and the next line is still polished. Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

The README names a place that sets the variable and the opt-out works, or the plugin has a switch, with a test.

## Evidence

Filled at landing: what ran and where its output is.
