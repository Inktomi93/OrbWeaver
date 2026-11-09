---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: chat
plan: surface-walk
---

# Decorative message art covers the message edit controls at enlarged text on the phone

## What

In the echo reading style at 200% the art reservation (an absolute, aria-hidden button) covers Save edit; in the ripple style at 300% the avatar overlay covers Save edit.

## Why

A phone user at enlarged text cannot save an edited message in those styles.

## Done when

Save edit is clickable at 200% and 300% on chromium-phone-portrait in every reading style; the echo and ripple original canon reading cases pass their edit step there.

## Evidence

Filled at landing: what ran and where its output is.
