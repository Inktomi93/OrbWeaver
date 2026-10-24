---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: character
---

# Handle reads and copies outside findByHandle skip the alphabet and the synthetic filter

## What

After item 1278, three paths still bypass its controls. The handoff copy writes a stored legacy handle verbatim into the receiving account (`freeHandle` in packages/server/src/domain/character/persistence/handoff-copy-write.ts:45-48, written by insertCharacterClaimingProvenance, skipping the create verb's parse). The gallery, databank and imagery exporters write the raw stored handle (assets/verbs/export-gallery.ts:33 via character/persistence/gallery-character.ts:11, databank/persistence/portability-write.ts:48-53, imagery/persistence/portability-read.ts:47), so a legacy row's links drop on restore. The databank and imagery restores look up raw handles that include synthetic group rows (databank/persistence/portability-write.ts:103-120, imagery/persistence/portability-write.ts:118 and :154), so a crafted file can attach to a room's hidden group row inside the owner's account.

## Why

The handle alphabet and the synthetic-row exclusion hold only where findByHandle and the create verb run; every other read and copy is a guarantee by habit.

## Done when

The handoff copy derives the handle through portableCharacterHandle; the three exporters write portableCharacterHandle; the databank and imagery restore lookups exclude synthetic rows (or filter handles through carriedHandle); red-first tests for a legacy-handle handoff, a legacy-handle gallery/databank/imagery round trip, and a crafted **group** handle in a databank and an imagery restore.

## Evidence

Filled at landing: what ran and where its output is.
