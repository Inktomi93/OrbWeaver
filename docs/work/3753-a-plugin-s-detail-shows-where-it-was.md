---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: plugins
---

# A plugin's detail shows where it was installed from and when

## What

pluginViewSchema (packages/contracts/src/plugin/view\.ts) carries origin, sourceUrl, sourceCommit, installedAt and updatedAt, and no screen reads them.

## Why

Where a plugin came from and at which commit is what a person checks before trusting it.

## Done when

The plugin's detail shows its origin, source link and commit, and install and update dates, with copy in the plugin copy module and a CT for a showcase and a URL install.

## Evidence

Filled at landing: what ran and where its output is.
