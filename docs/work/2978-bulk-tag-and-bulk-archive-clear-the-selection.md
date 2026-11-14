---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: character
---

# Bulk tag and bulk archive clear the selection for cards whose write failed

## What

In packages/client/src/features/character/components/character-bulk-bar.tsx, applyTag and the archive handler call onRemoveSubmitted with every selected id once the mutation resolves. The tag verb resolves a per-item split whose failed entries now carry characterId, so the cards whose tag write was refused can stay selected the way the bulk delete keeps its refused cards. Bulk archive resolves nothing and has no per-item failure to read, so only the tag half applies.

## Why

A partial bulk tag shows its refusal toast, but the refused cards drop out of the selection, so the reader cannot retry them without selecting them again.

## Done when

A component test tags a set where one card's tag write is refused, and the selection bar keeps counting that card after the toast.

## Evidence

Filled at landing: what ran and where its output is.
