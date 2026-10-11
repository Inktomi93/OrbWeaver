---
kind: bug
status: doing
updated: 2026-10-11
priority: P1
area: tests
lane: wt/agent-a581d82bb33f8905d
plan: test-mirror
---

# CT real-registry door mirrors the production door exactly, and a gate keeps it so

## What

tests/support/browser/ct-data-providers.tsx claims to mirror the real door but lacks the dice tool renderer (authed-app.tsx:210), three of seven home tiles (compose/home-tiles.ts:27-35) and the plugin commands and bug report topbar widgets (authed-app.tsx:344); config-section-partition.dom.test.ts realDoorSections omits five door sections; the context-tabs-panel aria snapshot pins tabs the product no longer ships (Settings, Injections). Derive each list from the production registries and extend ct-config-mirror-parity to tool renderers, home tiles and chrome widgets, including order (folds 0476).

## Why

Every shell and chat CT renders a different app from the one that ships, so shell, home and topbar CTs measure layouts users never see.

## Done when

Each CT registry list derives from or is gated against its production list including order; the gate turns red on a planted omission; the stale aria snapshot is rebuilt from the live tab registry; affected CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
