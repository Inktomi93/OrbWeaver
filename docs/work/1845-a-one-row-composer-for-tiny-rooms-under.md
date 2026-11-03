---
kind: bug
status: open
updated: 2026-11-02
priority: P2
area: client
plan: cross-surface-consistency
---

# A one-row composer for tiny rooms: under the 20rem step with the keyboard up, the field and Send fit

## What

Keep the complete message field and Send control inside the short room while writing above a keyboard.

## Why

The topbar consumes space the input needs at enlarged text. Floating header controls can also cover the composer after the header yields.

## Done when

Production-mounted cases show the complete field and Send at 844×390 and 568×320 with 200% text, and 320×568 with 200% and 300% text. Header controls return after blur and keyboard dismissal.

## Evidence

`tests/client/features/chat/components/platform-composer-max-rows.suite.ct.tsx` mounts the production shell and room through testkit. Cases check the room's clipping bounds, input and Send hit tests, draft retention, and header restoration.

The field keeps the shared Textarea floor and ceiling. A short-keyboard grid seats the existing field and Send beside each other. The room scrolls utilities above that row and reveals the focused action. Shell CSS owns the height condition; sibling edge controls follow the rendered header visibility.

Physical iOS keyboard behavior and independent comparative acceptance remain unqualified.
