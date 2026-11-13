---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: server
plan: import-robustness
---

# The import preview says what the run does with a taken character handle

## What

`packages/server/src/domain/import/loader/profile-ownership.ts` marks a card as in the library when its handle is taken. D290 identifies a character by its content hash, so a card with a taken handle and different content is written beside the owned one.

## Why

The preview tells the user a character is already there when the import adds a new one.

## Done when

A card whose handle is taken but whose content matches no owned card is previewed as a write, and an integration test through the folder upload door proves preview equals run.

## Evidence

Filled at landing: what ran and where its output is.
