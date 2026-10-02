---
kind: adr
status: active
updated: 2026-10-02
---

# Import identity and additive doors

## Context

Every single-file import door and the whole-profile import read one parser per entity, and each entity has one content identity. An import that merged a same-named row in place rewrote what the user had edited; a dedup keyed on file bytes imported a re-saved file twice; a dedup keyed on a name merged two different things; and a book whose entries shared a title was refused after the character row existed.

## Decision

One parser per entity lives in the serde spine under `packages/server/src/kit/serde/`, beside the native envelope: the world-info, regex and theme serdes detect the raw SillyTavern grammar and map it to the canonical shape, and the whole-profile collector and the single-file doors call the same function. Each entity has one content identity, homed beside its serde. A character is `cardImportHash` over the normalized parsed card, its embedded book and its art (the PNG minus its card chunks); a script's `id`, the wire `spec` and the tag set are not identity. The one exception is a JSON card followed by its PNG with equal text: the art-less row takes the art through `attachImportedArt`, and a row that already has art makes the PNG a separate character. A world book is its entry set under `loreEntryIdentity` (the typed columns, the engine's metadata keys and the inert SillyTavern activation fields, normalized so a missing field equals its default), whatever its name. A theme is its clamped override and css, a preset its config, a persona its folded name with its free-name count stripped plus description, title, placement and avatar hash. A chat is `chatContentHash` over its parsed header names, create date and ordered messages, with the whole-file hash kept as a second lookup for rows imported before. A regex script is its name plus behavior. Every lookup for a character goes through `findImportedCharacter`. No import updates or deletes an owned row: equal content reuses the row and runs its planes again idempotently; different content under a taken name lands beside it under the next free name, ` 2` from `nextFreeName` for themes, presets and personas and ` (2)` from `nextFreeLabel` for world books; a character keeps its name and only its handle takes a suffix. A theme backup lands additively too; the backup's palette never replaces a same-named theme. Entry titles are optional and not unique; entries are keyed by id.

## Consequences

An export re-imports as the character, book, theme, preset or persona it came from, and a re-saved transcript is one chat. A first import that stopped after the character row was written finishes on the next import. A book edited only in SillyTavern's kept activation fields is a different book, so the edit is never lost. A preset whose stored blob the build cannot read is not healed by re-importing its backup; the file lands beside it and the editor marks the unreadable row. Two different personas under one name show as the name and its numbered twin. The `upsertEntries` stream, keyed by title, lands on the newest row when a title repeats.

## Alternatives rejected

A parallel SillyTavern parser layer beside the serde spine: a second home for each shape. Keep the merge-in-place for backups and go additive only for profile imports: the preflight promise covers both doors, and two rules under one button are a lie. Dedup by file bytes: a re-saved file imports twice and an export never matches its import. Dedup by name: two different things merge. Disambiguate repeated entry titles at import: titles are SillyTavern's optional comment and the engine keys entries by id, so the uniqueness check protected nothing a user could see.
