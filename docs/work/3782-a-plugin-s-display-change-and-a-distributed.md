---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: plugin
plan: unwired-code
---

# A plugin's display change and a distributed plugin's date are shown

## What

plugin.listDisplayTransforms serves pluginId and name, and the client reads only the list length as a gate; DistributedPluginView\.distributedAt is served and the distribute list never shows it (packages/contracts/src/plugin/view\.ts).

## Why

Displayed text can differ from stored text with no sign of which plugin changed it, and an admin cannot see when a plugin was pushed to every account.

## Done when

A message whose shown text a transform changed names the plugin in its info; a published plugin row shows its distributed date; a CT covers both.

## Evidence

Filled at landing: what ran and where its output is.
