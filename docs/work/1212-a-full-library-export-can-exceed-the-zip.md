---
kind: bug
status: blocked
updated: 2026-10-20
priority: P2
blocked: owner
plan: test-mirror
---

# A full library export can exceed the ZIP import cap

## What

A full owner Backup export ZIP is larger than the ZIP import accepts; restore works only by unzipping and using folder import, and the refusal message does not say so.

## Why

A user restoring their own backup hits a refusal with no path forward.

## Done when

Owner ruling on the remedy (split exports, raise the ZIP cap, or a refusal that names the folder restore), then built with an e2e case on a large corpus.

## Evidence

Filled at landing: what ran and where its output is.
