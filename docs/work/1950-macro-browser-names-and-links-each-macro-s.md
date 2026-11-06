---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: client
plan: unwired-code
---

# Macro browser names and links each macro's real source

## What

Keep MacroSourceRef.id and show each macro's real source wherever macros are offered. Add plugin.listMacros beside listCommands, read from the installer-keyed macro registry, so plugin macros reach the client with their plugin id and display name. Make the plugin source id the plugin's own, not the chat id turn assembly passes today. Compose one client catalog from builtin, preset, game and plugin macros with real sources, retiring COMPOSITION_ONLY_SOURCE. Carry the source into suggestions and show it in the completion row. Feed the macro browser from that catalog, link each source to its editor, and mount the browser on the game macros tab. Correct the macro.list promise in kit metadata and the one-display-home comment in prompt-macros.

## Why

With several plugins installed, a generic label does not say where a macro lives. The source reference was built for this and never finished.

## Done when

The browser and the completion popover name each macro's preset, game or plugin source and the browser links to its editor, plugin macros complete wherever they resolve, an unreachable source shows the name with no link, and a room member sees no private source name.

## Evidence

Filled at landing: what ran and where its output is.
