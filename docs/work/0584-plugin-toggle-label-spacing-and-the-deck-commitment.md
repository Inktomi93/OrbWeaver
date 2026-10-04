---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: plugin
---

# Plugin toggle label spacing and The Deck commitment display

## What

Two final-pass P3s left by 0573: the Card Atlas SFW switch sits far from its label because the host's horizontal Field layout (plugin-leaf-nodes.tsx) stretches across the page; The Deck shows its commitment as a raw integer (showcase-plugins/bundles/oracle-deck/main.ts), and changing it needs a version bump, regenerated bundle, release-entries hashes and the seeder test pattern.

## Why

Both read as broken in shipped showcase plugins.

## Done when

A plugin toggle sits beside its label at page width, and the commitment reads as a check value rather than a raw integer.

## Evidence

Lane S6 (bc7ba151e5) put the plugin toggle label beside its switch (ToggleLeaf in plugin-leaf-nodes.tsx). Open: the Oracle Deck commitment display needs a bundle change with a version bump.
