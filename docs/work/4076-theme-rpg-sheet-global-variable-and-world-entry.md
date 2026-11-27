---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: client
plan: unwired-code
---

# Theme, RPG sheet, global variable and world entry creation stamps get a design-system slot

## What

themes.updatedAt, rpgSheets.updatedAt, globalVariables.updatedAt and worldEntries.createdAt are written and never shown; the stamps lane found no design-system slot for them on their surfaces. The theme and global-variable view fields were dropped by the old fields scan, so the columns are now written and never read back; the unwired graph lists their insert stamps until this lands.

## Why

Owner ruling: data the app collects and never shows is a product item.

## Done when

Each surface shows or sorts by its stamp through a slot the design system names, or the stamp leaves the schema with the reason; each with a rendered check.

## Evidence

Filled at landing: what ran and where its output is.
