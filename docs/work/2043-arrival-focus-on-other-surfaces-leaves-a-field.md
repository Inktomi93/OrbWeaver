---
kind: bug
status: doing
updated: 2026-11-07
priority: P2
area: client
lane: wt/agent-a301ae7da33728c6d
plan: cross-surface-consistency
---

# Arrival focus on other surfaces leaves a field being typed in alone

## What

useFocusRoomArrival fixed the race in the room only. Review showed a held character.get in character-editor-surface.tsx takes focus from the list search. Other useFocusOnMount callers were not probed, and the context rail menu and context panel fields were not run.

## Why

On a slow device a late arrival takes focus from a field the user is typing in, and a blur that cancels can drop their input.

## Done when

Each useFocusOnMount caller that mounts after a read is judged, one rule covers the class, and a CT holds the read and keeps focus in the field, red first.

## Evidence

Filled at landing: what ran and where its output is.
