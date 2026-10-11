---
kind: adr
status: active
updated: 2026-10-11
---

# A profile import asks per same-name persona collision

## Context

D290 made a persona that shares a folded name with an owned persona but differs in content land as a second persona under the next free name, with no question asked. A SillyTavern Nate became Nate 2 beside the owner's Nate, and the profile's chats linked to the copy. The owner ruled that the import asks instead.

## Decision

This ADR amends D290's persona rule (different content under a taken name lands beside it under the next free name); every other D290 rule carries forward. The SillyTavern profile import reviews the personas in the picked folder before it sends anything. The server compares each incoming persona with the owner's under the one content identity (folded name with its free-name count stripped, description, title, placement, avatar hash): equal content is reused as before, and a persona that shares the exact folded name but differs in content is a collision. Every collision is listed with two choices, merge into the existing persona (the default) or keep both. Merge links the run's chats and user turns to the existing persona, keeps its content and mints no row. Keep both lands the next-free-name copy and links to it. The choices ride the commit request, keyed by folded name, to every upload of a split folder, so the whole run honors them. A run with no recorded choice merges. The single-file persona restore and the orb bundle restore keep the next-free-name rule, because neither has a review step before it writes. The review is the read-only route POST /api/import/tree/review; the choices are the repeated multipart field personaCollision and the import-st param personaCollisions. The write is createBulkImportPersonas in domain/persona/persistence/import-write.ts.

## Consequences

A folder import never splits a same-named persona without the owner choosing, and merging keeps their persona content untouched. Merge is the default, so an unattended import (the configured profile directory) merges. A backup restored from a zip or a bundle folder still lands a different same-named persona beside the original under a numbered name, and its chats resolve by name to the newest persona of that name; asking there needs a two-phase upload and is not built.

## Alternatives rejected

Keep the additive rule and rename afterwards: the owner's chats stay linked to the copy. Always merge without asking: it overwrites the choice of a user who kept two Nates on purpose. Apply the choice to every door now: a zip carries its personas where the browser cannot read them, so a review there needs the server to stage the archive first.
