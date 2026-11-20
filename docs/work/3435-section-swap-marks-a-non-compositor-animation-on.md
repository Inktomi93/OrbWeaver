---
kind: work
status: doing
updated: 2026-11-20
priority: P1
area: client
lane: wt/agent-a3656b92d4bfe2612
plan: cross-surface-consistency
---

# Section swap marks a non-compositor animation on the primary nav

## What

pnpm snap --motion-goto between Chats and Characters on a 430x932 phone reports a dirty-animation finding on nav\[aria-label=Primary] (threshold compositor-only, unattributed). The likely source is the tab background and colour change when the active tab moves. Seen on the working tree; not checked on main.

## Why

The motion variant counts it as a red finding on every phone section swap, which hides any new non-compositor animation behind it.

## Done when

The animation is attributed by name; it is either moved to a compositor-only property, or the motion variant records why a tab's colour change is allowed.

## Evidence

Filled at landing: what ran and where its output is.
