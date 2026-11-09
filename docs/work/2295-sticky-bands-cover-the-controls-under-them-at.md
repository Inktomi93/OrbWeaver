---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: client
plan: surface-walk
---

# Sticky bands cover the controls under them at enlarged text on the phone

## What

At 300% text on the phone the character editor's sticky save bar wraps its title so tall that it covers Add tag in the editor and the greeting's Studio toggle. At 200% the Presets tab strip covers a setting's hint trigger.

## Why

A phone user at enlarged text cannot press the covered controls.

## Done when

Add tag, the greeting Studio toggle and the Presets hint triggers are clickable at 200% and 300% on chromium-phone-portrait; Characters independent editor, Characters independent greeting and Rail independent presets pass their journeys there.

## Evidence

Filled at landing: what ran and where its output is.
