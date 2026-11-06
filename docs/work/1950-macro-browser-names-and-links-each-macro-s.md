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

Keep MacroSourceRef.id and show each macro's real source. The browser mounts only in the preset editor and builds its registry from that preset, so game and plugin macros never reach any client. Add a read verb returning the room's macro catalog by source group, with a resolved display name and link target, and a room surface that mounts the browser on it.

## Why

With several plugins installed, a generic label does not say where a macro lives. The source reference was built for this and never finished.

## Done when

A room surface lists preset, game and plugin macros; each source kind shows its real name and links to its editor, an unreachable source shows the name with no link, and a room member sees the kind with no private source name.

## Evidence

Filled at landing: what ran and where its output is.
