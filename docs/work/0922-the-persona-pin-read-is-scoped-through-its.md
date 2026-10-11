---
kind: bug
status: open
updated: 2026-10-11
priority: P1
area: server
---

# The persona pin read is scoped through its chat instead of waived

## What

loadPersonaView (packages/server/src/domain/persona/persistence/queries.ts:67) reads a persona by id with no owner predicate and carries an owner-scoped-reads waiver justified by ADR 0314 (the room pin pointer is consent). It arrived through 885 after item 899 set the waiver budget, so the owner-scoped-reads budget (31) now alarms at 32 on main. Replace it with a read that inherits scope through the chat: load the pinned persona by chat id through chats.anchorPersonaId, so the FK chain carries the scope and the caller cannot pass an arbitrary persona id.

## Why

A tenancy exception admitted past the waiver ratchet is the one class the budget exists to stop; scope inherited through the FK chain closes it without a waiver (owner ruling: fix, do not raise the budget).

## Done when

The waiver is gone, owner-scoped-reads waives 31 against a budget of 31, the pin read takes a chat id, ADR 0314's pin-holds behaviour still passes its tests, and a test proves a persona id that is not the chat's pin is not returned.

## Evidence

Filled at landing: what ran and where its output is.
