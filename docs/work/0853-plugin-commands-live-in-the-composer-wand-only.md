---
kind: work
status: doing
updated: 2026-10-11
priority: P2
area: plugin
lane: wt/agent-a3311188a44fc31a2
---

# Our showcase plugins' commands live in the composer wand

## What

Keepsake Camera and Oracle Deck register commands with no placement (packages/showcase-plugins/bundles/keepsake-camera/main.ts, oracle-deck/main.ts), so they surface in the top-bar Plugin commands launcher (pluginCommandsChrome, packages/client/src/features/plugin/lib/plugin-commands-chrome.tsx:19). Draft Polish already places itself at composer-action.

## Why

Owner ruling: the top-bar launcher stays an open extension point third-party authors may register into; our own plugins belong in their home, the composer wand (image plugins at composer-media).

## Done when

Keepsake Camera's commands place at composer-media and Oracle Deck's at composer-action, a placed command shows at its placement and not also in the top-bar launcher, the launcher still lists unplaced commands from any plugin, and showcase versions are bumped with release entries regenerated.

## Evidence

Filled at landing: what ran and where its output is.
