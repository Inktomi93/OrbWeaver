---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: plugin
---

# Card Atlas paging is disabled before a search

## What

Previous and Next are enabled before any search and answer 'Search first…' (fp2-ca-page.png). Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

Owner ruling: add a bound disabled field to the plugin button node (contract, SDK types, renderer) and use it for the Card Atlas pager.

## Why

Plugin final pass finding.

## Done when

Both are disabled until a search exists.

## Evidence

Lane S5: the plugin button node has no disabled prop (packages/contracts/src/plugin/ui.ts:597-603); needs a bound disabled field on the button in the contract, SDK types, leaf renderer and CTs.
