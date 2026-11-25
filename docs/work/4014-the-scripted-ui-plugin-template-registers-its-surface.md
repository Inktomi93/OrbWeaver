---
kind: bug
status: open
updated: 2026-11-25
priority: P2
area: plugin
---

# The scripted-ui plugin template registers its surface and both templates pin the current SDK

## What

The orb-plugin-template-scripted-ui repository declares the surface id starter-browser, which PLUGIN_SURFACE_ID_RE in packages/contracts/src/plugin/ui.ts refuses, so the membrane skips the surface and the starter draws nothing. Both template repositories pin the plugin SDK and toolchain from the plugin-authoring-v0.1.0 release while packages/plugin-sdk is newer; orb-plugin-template's SUPPORT.md predates findCardData, and both template CI workflows fail without a lockfile.

## Why

The templates are where a plugin author starts; a starter that silently draws nothing and pins a stale SDK fails every new author.

## Done when

The scripted-ui starter's surface id matches the contract and draws in a running app, both templates pin the current SDK and toolchain release with a committed lockfile and green CI, and SUPPORT.md matches the current contracts.

## Evidence

Filled at landing: what ran and where its output is.
