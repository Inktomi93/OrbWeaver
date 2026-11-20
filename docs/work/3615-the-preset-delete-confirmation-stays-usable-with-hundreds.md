---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: preset
---

# The preset delete confirmation stays usable with hundreds of preset-only scripts

## What

The preset delete confirmation lists every regex script only that preset uses as its own checkbox row. A large imported preset carries a couple of hundred scripts, so the dialog becomes one long column of checkboxes with no select-all, no count summary and no collapsed view, and the regex library's attached-nowhere view has no component test.

## Why

The users who most need the cleanup are the ones with the biggest presets, and a dialog with hundreds of rows is unusable for them.

## Done when

The confirmation summarises the count with one control that selects or clears all, shows the per-script list collapsed behind it, and stays inside the viewport at phone and desktop widths; the attached-nowhere library view and the large-list confirmation each have a component test.

## Evidence

Filled at landing: what ran and where its output is.
