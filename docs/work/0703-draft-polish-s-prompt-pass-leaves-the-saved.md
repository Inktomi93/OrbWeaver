---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: plugin
---

# Draft Polish's prompt pass leaves the saved message as typed

## What

The prompt seam writes its rewrite into canon: the stored message has the ellipses, collapsed spaces and comma fix (checked through the debug db read), while the plugin README promises the room's canon stays exactly what was typed. Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

The typed message is stored verbatim and only the model's prompt carries the polish, or the README and description state that it rewrites the saved text, by owner choice.

## Evidence

Filled at landing: what ran and where its output is.
