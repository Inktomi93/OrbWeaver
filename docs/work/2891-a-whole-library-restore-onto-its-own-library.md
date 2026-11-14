---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: server
---

# A whole-library restore onto its own library reuses the character and chat it came from

## What

The import identity decision in `docs/adr/0290-import-identity-keeps-its-keys-across-doors-and-uploads.md` states that an export re-imports as the character it came from and a re-saved transcript is one chat. A composed case that exports a whole library and restores it into the same library found a second character and a second chat. The case is the same-library restore test added with the spend ledger work under `tests/server/`; it asserts spend only, so the duplicate rows pass it. Find which part of the exported character or chat changes its content identity on the way out or back in, and fix it at the serde that owns the identity.

## Why

A reader who restores a backup onto the library it was taken from gets every character and chat twice, which the import decision promises cannot happen.

## Done when

A server case through the composed root exports a whole library with a character that has art, an embedded book and a chat, restores it into the same library, and finds the same row counts for characters, chats, world books, presets and personas, red before and green after. A restore into an empty library still reproduces every row.

## Evidence

Filled at landing: what ran and where its output is.
