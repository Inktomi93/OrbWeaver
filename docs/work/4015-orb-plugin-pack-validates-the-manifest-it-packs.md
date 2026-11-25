---
kind: tooling
status: open
updated: 2026-11-25
priority: P2
area: plugin
---

# orb-plugin pack validates the manifest it packs

## What

packages/plugin-toolchain/src/index.ts pack copies manifest.json without validating it: no id, capability-name, netHosts or uiEntry-to-surface check, no check that ui.js exists when uiEntry is declared, no cross-check of declared capabilities against the calls the code makes, and the surface-links checker skips destructured and bracket calls.

## Why

A pack that admits a manifest the host refuses ships a plugin that fails silently, which is how the scripted-ui template's invalid surface id shipped.

## Done when

pack validates the manifest through the contracts' own manifest and surface schemas and refuses a uiEntry with no ui.js, the capability cross-check and surface-links checker read destructured and bracket calls, each with a planted refusal and a valid twin.

## Evidence

Filled at landing: what ran and where its output is.
