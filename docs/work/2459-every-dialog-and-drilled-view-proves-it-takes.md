---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# Every dialog and drilled view proves it takes focus on open

## What

The section arrival test covers sections. A survey found no focus assertion for these views that open inside a section: the reauth, imagine, image detail, image edit, plugin and You modals; a `FormDialog` that uses `arriveOnTitle`, such as the character import dialog; and the drilled member surfaces for rosters, regex, world info, databank detail, analytics, the corpus dossier and artifact frame, the extensions page and the tag editor. The survey searched for focus assertions by two spellings only, so a test that proves arrival another way may exist.

## Why

`ACCESSIBILITY.md` says these views move focus into themselves, and nothing fails if one stops.

## Done when

Each listed view has a component test that opens it by keyboard and asserts where focus lands, or the item names the existing test that already does. A view that leaves focus on the page body is fixed with the shared hook.

## Evidence

Filled at landing: what ran and where its output is.
