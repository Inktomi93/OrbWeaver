---
kind: work
status: open
updated: 2026-11-25
priority: P3
area: plugin
---

# Plugin law, showcase docs and SDK prose match the plugin contracts

## What

docs/law/plugin-system.md still lists a development directory as an install source, which D280 removed. packages/showcase-plugins/bundles/README.md drifts from the contracts on the netHosts and slug limits, the ui.js relay function list and the node list. pocket-arcade/main.ts says a frame cannot reach host data and lists fewer frame anchors than ui.ts admits, and packages/plugin-sdk/shared.d.ts repeats that short list, restates rate and deadline numbers owned outside contracts as prose, says worldInfo.upsertEntry ignores a position host-v1.ts still requires, and declares PluginUiV1 with no contracts counterpart. No showcase or template exercises the frame bridge.

## Why

Plugin authors read these docs and the SDK mirror as the contract; each drift points them at behavior the host does not have.

## Done when

Each named statement matches its contract or cites its owning constant, the SDK mirror's numbers come from their homes or are removed, PluginUiV1 has a contracts home or is dropped, and one showcase exercises the frame bridge.

## Evidence

Filled at landing: what ran and where its output is.
