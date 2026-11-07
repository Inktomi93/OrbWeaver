---
kind: bug
status: doing
updated: 2026-11-07
priority: P3
area: client
lane: wt/agent-a5e487c45520cd7c1
plan: cross-surface-consistency
---

# Image modal and inbox review P3 leftovers (1737 P3-3, P3-4, P3-7 and 1735 B1-9 to B1-14)

## What

Fix the image modal and inbox review leftovers. Inbox: move Show dismissed to the top of the popup; fix the Nothing dismissed copy after the standing plugin ask is dismissed; stop rows scrolling through the strip above the sticky header on the You sheet. Image modal: show a count near the negative prompt cap; reserve the charge line so Image size does not shift; share one label map for rule image size; use one phrase for the mode default; move focus to Choose image size after Use the image mode's default size; add a spend note to Image count.

## Why

The side-eye reviews of the inbox and the image modal rendered each of these. The negative prompt is cut silently at the cap, and the charge line moves the next control under the finger.

## Done when

Each finding is fixed with a component test or answered with a cited reason, and a rendered pass of the inbox and the image modal shows none of them.

## Evidence

Filled at landing: what ran and where its output is.
