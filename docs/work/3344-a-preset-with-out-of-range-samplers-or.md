---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: import
plan: import-robustness
---

# A preset with out-of-range samplers or limits keeps them on import, brought into range

## What

Importing a SillyTavern preset whose samplers or limits fall outside this app's ranges drops every sampler and limit in the file. The preview says the file sets none, and the editor shows them all blank. The same file with in-range values imports them. With only one value out of range the preview says they came across and lists nothing as changed.

## Why

A SillyTavern user who raised a preset's temperature or context loses all of the preset's settings with no word about it.

## Done when

A case imports a preset with some values out of range through the composed root: each out-of-range value lands at the nearest allowed value, every in-range value lands unchanged, and the preview lists each changed value with what the file sent and what was imported. A CT shows that list in the preview.

## Evidence

Filled at landing: what ran and where its output is.
