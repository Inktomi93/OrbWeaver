---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: client
plan: cross-surface-consistency
---

# New chat keeps Blank chat in view at 300% text

## What

At 300% text, Blank chat and the roster door sit below the fold with no cue that they exist. Seat Blank chat in the pinned row.

## Why

A user at large text cannot find the way to start a chat without a character.

## Done when

At 300% text on a phone and desktop Blank chat is visible without scrolling, with a CT. Source: acceptance part 1 report.

## Evidence

Blank chat sits in the pinned action row beside Start in every dialog that can hold two pinned buttons and a whole list row; a stacked dialog under 16rem tall or 6rem wide (new dialog-stacked-cramped variant, container.cq-6 token) keeps it below the footer, because with it pinned there the platform-text-scale reach grid lost a whole row in seven cells (320 phone at 300%, 667px-tall phones at 250%). tests/client/features/app-shell/surfaces/new-chat-picker-blank.ct.tsx asserts Blank chat is in the pinned row and fully in the viewport without scrolling on the 390x844 phone and the 1440x900 desktop at 100% and 300% (red first: not in the pinned row at 300%). platform-text-scale expects the pinned Blank chat except on the 360x800 phone at 300%, which is 15.9rem of dialog and sits below the step. Residue: that 360x800 phone and a 320 phone at 300% still find Blank chat below the fold.
