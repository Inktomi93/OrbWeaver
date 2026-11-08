---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: server
lane: wt/agent-ac4fec0a6f2153940
plan: cross-surface-consistency
---

# Show ownership for every import kind in the folder preview

## What

The SillyTavern folder import preview shows who owns an item only for characters, because findInLibrary in profile-directory.ts resolves ownership for characters only.

## Why

A user deciding what to import cannot see which presets, books or chats are already theirs.

## Done when

The loader resolves ownership for every import kind and the preview shows it, with a server test and a CT.

## Evidence

Filled at landing: what ran and where its output is.
