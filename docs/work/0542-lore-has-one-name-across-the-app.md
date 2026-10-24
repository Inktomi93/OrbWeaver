---
kind: work
status: open
updated: 2026-10-04
priority: P3
area: client
---

# Lore has one name across the app

## What

`docs/law/vocabulary-map.md:58` rules the noun "World book" and the library group "World Info". Stray user-facing spellings remain: "lorebook" in `packages/client/src/features/automation/lib/rule-editor-failure.ts:46`, and "Lore" and "Lore application" in `packages/client/src/features/automation/components/rule-analysis-fields.tsx:84,106`.

## Why

Several names for one thing make users think they are different features.

## Done when

Replace each stray with the ruled term in every label, description and help string. A sweep shows no stray spelling.

## Evidence

Sweep: `rg -i 'lorebook|lore book|\blore\b'` over `packages/client/src` (771 `.ts`, 816 `.tsx` files), 88 non-comment hits, each read.

Changed to "world book": `rule-editor-failure.ts` refusal copy, `rule-analysis-fields.tsx` route switch and "World book application" select, `personas-nav.ts` keyword, summary, label and keywords, `persona-learn.tsx`, `persona-world-books-section.tsx` field and select labels, `plugin-option-controls.tsx` error label, `member-persona-lore-control.tsx` description.

Kept, not user-facing: `restore-card-lorebook` route, `restoreCardLorebook` and `CardLorebookRestoreResult` names, `reserveKey`/`sectionId` strings, `PersonaLoreBookField`, `routes.lore` form paths, `LorebooksHeading`, and the `use-persona-lorebooks` hook import.

Kept, "lore" as the content noun (an entry's text), not the book: rule trigger and action phrases in `rule-copy.ts` ("a lore entry"), `entry-editor.tsx`, `world-info-member-surface.tsx`, plugin copy, `persona-learn.tsx` and `personas-nav.ts` prose about lore entries, and the card-visibility tier "Sheet + lore" with the member card "Lore" section. These name card content, not a book.

Out of scope, outside `packages/client/src`: showcase plugin `research-familiar` still says "lore book" in its own UI strings.
