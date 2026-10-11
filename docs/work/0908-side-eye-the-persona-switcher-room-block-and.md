---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Side-eye the persona switcher, room block and Settings personas

## What

Item 885 (ADR 0314) rebuilt the persona surfaces with no rendered review. Review on a copy of the owner's container data (docker cp orbweaver:/app/data/db plus assets into the stage via snap --stage-db), never the live db. Surfaces: the switcher head (Playing as / New chats start as, description clamp with More and Less), rows ordered seat, pin, connected, crown, Edit, with the overflow menu only at a coarse pointer; the room block (packages/client/src/features/persona/components/persona-room-block.tsx) in live, held and no-pin states including the host Re-pin menu; Settings, Personas list rows that only expand the editor, the editor identity row and footer (Duplicate, Export, Delete), the delete-default notice; the Learn entries. Solo and group rooms, phone and desktop, light and dark.

## Why

The lane took no snap; component tests prove behaviour, not layout, contrast or touch targets.

## Done when

A side-eye report is filed with every finding fixed or boarded.

## Evidence

Filled at landing: what ran and where its output is.
