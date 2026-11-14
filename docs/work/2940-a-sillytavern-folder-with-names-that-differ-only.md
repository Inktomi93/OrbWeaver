---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: import
plan: import-robustness
---

# A SillyTavern folder with names that differ only in case cannot be staged on Windows or macOS

## What

The tree route stages each uploaded file at its relative path on the host file system (`packages/server/src/entry/http/import-tree.ts`). On a case-insensitive volume, two card files whose names differ only in letter case collide, and the whole upload is refused as conflicting paths.

## Why

A Linux SillyTavern folder can hold both names, and the app ships native Windows and macOS installs. The preview and the run refuse alike, so the owner cannot import the folder at all.

## Done when

Staging addresses files so that case-only twins both stage, or the refusal names the colliding pair in plain words, with a test that stages both names.

## Evidence

Filled at landing: what ran and where its output is.
