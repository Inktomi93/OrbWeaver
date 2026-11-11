---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: server
lane: wt/agent-a30ee1d42d1997dfe
---

# Persona pin-read sites credit the superseded persona-pointer ruling for machinery its successor changed

## What

The persona persistence read and the injected room-assembly op both describe the room pin reading live through the chat — the read starts at the chat and walks the pin foreign key, so a caller names a room and can never hand a persona id past the consent gate — and credit that machinery to the earlier persona-pointer ruling, which is marked superseded by the later one in the ledger. The later ruling is what changed the pin read from taking a held persona id to reading through the chat; the code implements the later mechanism while both comments cite the earlier ruling as its home. Two sites tree-wide, both in this domain. The consent exception itself survived the supersession, but its live home is the successor ruling, which restates it.

## Why

Citing a superseded ruling as the live authority for machinery the successor changed sends a cold author to the superseded text, which describes the OLD mechanism — a held-id parameter read that no longer exists. The reader either trusts the comment and misreads the ledger entry, or trusts the ledger entry and stops trusting the comment. Naming sites credit the effective ruling; that is the same one-ruling-per-site posture the ledger already ruled for exemption markers.

## Done when

Both sites credit the effective successor ruling for the pin read and its consent exception, the ledger entry for the superseded ruling needs no change, and no live-behavior credit anywhere in the tree names a ruling whose status is superseded.

## Evidence

Filled at landing: what ran and where its output is.
