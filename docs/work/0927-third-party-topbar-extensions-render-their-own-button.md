---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: plugin
---

# Third-party topbar extensions render their own button instead of a host Plugins wand

## What

pluginCommandsChrome (packages/client/src/features/plugin/lib/plugin-commands-chrome.tsx:19) is a first-party topbar.trail widget that renders a host Plugins wand menu collecting every command with no placement. Owner intent: the top bar is a slot people can build an extension into, not a host wand; nothing renders there unless a plugin places something there, and what renders is that plugin's own button with its own icon and label, attributed and ordered by the host. Our showcase plugins never use it (item 853 moved them to the composer). Replace the aggregate wand with a topbar placement target in the closed placement vocabulary (PLUGIN_COMMAND_PLACEMENT_TARGETS, packages/contracts/src/plugin/ui.ts), rendered per placed command; decide with ADR 0267 what an unplaced command does (no surface, or an explicit placement required).

## Why

A host wand in the top bar shows our chrome for someone else's extension and spends top-bar width on a menu nobody asked for; the slot exists only because the host controls every surface.

## Done when

With no plugin placing into the top bar, nothing plugin-related renders there; a plugin that places a command at the topbar target renders one icon button with its own icon, label and attribution; the phone curation holds; ADR 0267 or plugin-system law records the placement; CTs cover both cases.

## Evidence

Filled at landing: what ran and where its output is.
