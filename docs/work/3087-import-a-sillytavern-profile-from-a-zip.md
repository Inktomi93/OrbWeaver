---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: import
plan: import-robustness
---

# Import a SillyTavern profile from a zip

## What

The SillyTavern import takes a folder only (`packages/server/src/entry/http/import-tree.ts`). Add a zip branch to the tree door that unpacks a SillyTavern profile zip into the same staged tree, so it shares the folder's parse, preview and script lift. The archive is read entry by entry without loading it whole. A profile may sit at any depth inside the zip: an entry belongs to a known SillyTavern folder when any path segment names one, and the settings file is taken once from outside those folders. Archive metadata entries that macOS adds are skipped. The size an entry's directory record states is written by whoever made the zip, so the reader counts bytes while it inflates and stops at a cap.

## Why

Owners move a SillyTavern profile between machines as a zip; today they must unpack it first.

## Done when

A SillyTavern profile zip imports through the Library import with the same preview and result as the same folder, preset scripts included, with the profile nested two folders deep. A test feeds an entry whose stated size is small and whose inflated size is over the cap, and the import refuses it by name with nothing staged. A file that is not a zip (empty, truncated, another archive format, a JSON or HTML file renamed) is refused with a message that says what it is and what to do.

## Evidence

Filled at landing: what ran and where its output is.
