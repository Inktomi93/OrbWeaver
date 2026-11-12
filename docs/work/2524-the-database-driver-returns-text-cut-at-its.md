---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: db
lane: wt/agent-a84eabc3e8d8f0a49
---

# The database driver returns text cut at its first NUL

## What

A probe on the libSQL client shows a TEXT value holding a NUL is stored whole and read back cut at the NUL: the byte length in the database is the full length, a select of the column returns only the prefix, and a select of the column cast to a blob returns every byte. This is below every domain, so it holds for any TEXT column the app reads: chat messages, card fields, lore, variables, document text, plugin storage. Nothing on the write paths refuses or strips a NUL. The plugin storage door now refuses one, as the first store to be closed. Source: the security lane report under reports/lanes, which holds the probe.

## Why

A NUL in pasted or imported text, or in a model reply, silently shortens what the app shows and re-saves, and an edit of the shortened text overwrites the rest. Two values that differ only after a NUL read back as equal.

## Done when

Owner ruling: text is stripped of NUL where it is written. Ruling on the home, after the survey: one text column type in packages/db strips NUL on its way to the driver, and every TEXT column uses it, because user text has no common schema base and import and model text never pass through a contracts schema, so a contracts home cannot reach them. A lint refuses drizzle's own text column in the schema files so a new column cannot miss it. No migration: the stored type is unchanged. The plugin storage door keeps refusing a NUL before the write. A test writes a NUL-bearing string through a real write path for user, import and model text and reads back the stripped text whole. The scan of the owner's database copy found no row holding a NUL.

## Evidence

Filled at landing: what ran and where its output is.
