---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: ui
plan: cross-surface-consistency
---

# Picker search inputs use the field type size on touch

## What

The command input uses text-body, 15px, at a coarse pointer (packages/ui/src/primitives/command/variants.ts), so iOS zooms the page on every New chat open, every picker and the command palette. Use the field type token.

## Why

A zoom on every picker open moves the dialog off screen on a phone.

## Done when

Every command and picker search input renders at the field size or larger at a coarse pointer, with a CT that reads the computed font size. Source: acceptance part 1 report.

## Evidence

The command input slot used text-body (15px at every pointer); it is now text-field leading-field (16px at a coarse pointer), and every command palette, character picker and model picker search renders through that slot. tests/ui/primitives/command/command-seal.ct.tsx reads the input's computed font size at a coarse pointer and expects it to equal the text.field token and to be at least 16px (red first: 15px received, 16 expected).
