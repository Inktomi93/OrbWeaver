---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: security
plan: authorization-and-visibility
---

# A member's card read withholds a disabled host's card, as it does a departed host's

## What

`getMemberCard` still serves a disabled host's character card text, tags, lore and avatar hash. The art gate already stops the portrait, and a room with no host withholds the card. `buildSummaries` keeping the pinned persona is right under D315.

## Why

A disabled host has withdrawn consent for members to read their content, and the room with no host already sets the behavior to follow.

## Done when

The read goes through `hostConsentOf` with a test, and the member's client shows the same state as for a room with no host.

## Evidence

Filled at landing: what ran and where its output is.
