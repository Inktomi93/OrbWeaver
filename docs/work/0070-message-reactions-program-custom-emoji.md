---
kind: work
status: blocked
updated: 2026-10-02
priority: P3
area: client
blocked: owner
plan: message-reactions
---

# Message reactions program: custom emoji

## What

Build the custom-emoji half of reactions described in `docs/plans/message-reactions/design.md`: users and characters react with custom emoji images through the same reaction plane as Unicode, with the image stored in CAS. The Unicode plane is built.

## Why

The owner ruled that custom emoji ships too, and the GitHub issue that tracked it ("Finish custom emoji reactions before launch") was never imported into docs/work. The home roadmap lists reactions as partly built.

## Done when

A user and a character can each react with a custom emoji image, the reaction persists as chat canon, and the next turn can see it. The plan is deleted when this lands.

## Evidence

The owner deferred custom emoji and retained the asset-access rule in D21. Resume only on an explicit owner request. Unicode reactions remain unchanged.
