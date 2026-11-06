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

Keep MacroSourceRef.id and wire it: the macro browser shows the preset, game or plugin name and links to where the macro is edited. Today it shows only a generic kind.

## Why

With several plugins installed, a generic label does not say where a macro lives. The source reference was built for this and never finished.

## Done when

Each source kind shows its real name and links to its editor, an unreachable source shows the name with no link, and a room member sees no private source name.

## Evidence

Filled at landing: what ran and where its output is.
