---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: import
---

# A restored chat needs its character's handle to be the slug of its name

## What

Restoring a library export into a box, a chat whose character's handle is not the slug of the character's name fails with "no character on this account matches this chat", because the card restores under the slug of its name while the chat bundle carries the original handle. Found while building the asset-sweep overlap test for item 1073; not confirmed against a hand-made handle on a fresh box.

## Why

A user who renamed a character's handle loses that character's chats on restore.

## Done when

A restore matches a chat to its character by the identity the export carried (the card's exported handle or id), not by the slug of the name; a round trip of a character whose handle differs from its name slug restores every chat; the match rule has one home shared by the chat and card restores.

## Evidence

Filled at landing: what ran and where its output is.
