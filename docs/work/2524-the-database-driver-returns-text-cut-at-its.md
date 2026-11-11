---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: db
---

# The database driver returns text cut at its first NUL

## What

A probe on the libSQL client shows a TEXT value holding a NUL is stored whole and read back cut at the NUL: the byte length in the database is the full length, a select of the column returns only the prefix, and a select of the column cast to a blob returns every byte. This is below every domain, so it holds for any TEXT column the app reads: chat messages, card fields, lore, variables, document text, plugin storage. Nothing on the write paths refuses or strips a NUL. The plugin storage door now refuses one, as the first store to be closed. Source: the security lane report under reports/lanes, which holds the probe.

## Why

A NUL in pasted or imported text, or in a model reply, silently shortens what the app shows and re-saves, and an edit of the shortened text overwrites the rest. Two values that differ only after a NUL read back as equal.

## Done when

A recorded decision chooses one rule for the whole app: text is refused or stripped of NUL at the write boundaries where it enters (the contracts schemas for user, import and model text), or text columns are read as bytes by one column type or driver setting in packages/db. The rule is built in that one home, a test writes a NUL-bearing string through a real write path and reads it back by the chosen rule, and a scan of the owner's database copy reports any existing row that holds a NUL.

## Evidence

Filled at landing: what ran and where its output is.
