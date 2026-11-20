---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: preset
---

# Deleting a preset offers to delete the regex scripts only it uses

## What

Deleting a preset removes its attachment rows (preset_regex_scripts cascades on the preset) but leaves every script it brought in the regex library, attached to nothing and never run (packages/server/src/domain/preset/verbs/remove.ts does not touch scripts). A large imported preset leaves hundreds of dead scripts. The delete confirmation lists the scripts no other preset, character, chat or the global tier uses, checked by default so they go with the preset, and the user can uncheck any to keep it. Scripts another scope uses are never offered. The regex library also gets a way to find and delete scripts attached to nothing, for libraries that already hold them from earlier imports.

## Why

A user told to delete a preset and import it again keeps every old script, and any script whose content changed between versions comes back as a second copy beside the dead one; the only clean path today is deleting scripts one by one.

## Done when

Deleting a preset through the real verb with its scripts selected leaves no script attached to nothing, and leaves every script another scope uses untouched; unchecking keeps that script; the library shows unattached scripts and deletes them in one action; integration cases cover the shared-script and unchecked paths and a component test covers the confirmation list.

## Evidence

Filled at landing: what ran and where its output is.
