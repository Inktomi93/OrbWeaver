---
kind: plan
status: parked
updated: 2026-10-02
blocked: owner
---

# Message reactions: custom emoji

## Goal

Extend existing reactions with user-chosen images when the owner resumes the program.

## Shape

The core concept is an image reaction within the existing reaction plane. Unicode reactions remain unchanged. D21 asset access remains unchanged while custom emoji is parked.

## Open questions

Asset ownership and room-member access need an explicit design and owner ruling before implementation.

## Rejected

A raw external image URL or relaxed asset access is not authorized.

## Coupled sites

`packages/server/src/domain/chat/`, `packages/server/src/domain/assets/` and `packages/client/src/features/chat/`.

## Test plan

A resumed design must prove reaction persistence, toggling, asset authorization and rendered behavior.
