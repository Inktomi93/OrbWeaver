---
kind: bug
status: open
updated: 2026-10-12
priority: P1
---

# Tenancy gate: value-pinned owner terms and multi-parent satellites

## What

Security review of item 928 found shapes owner-scoped-reads still passes, none live today. Rulings (adopted): a column- or subselect-valued owner term counts as scope only when the value's table carries its own value-pinned conjunct in the same statement (closes owner terms valued by an unscoped column, a self-alias, or an unscoped inArray subselect; restore the three co-participant seat waivers, whose scope is transitive). A derived bound table gives no scope to the joined table unless the statement also pins one of its other scope parents to the caller (closes two-parent junctions such as character_embeddings, image_embeddings, gallery_items, character_tags, character_books, character_personas; the every-owner reads in discovery embed-store-reads and galleryItemViewById need a waiver or a scope). Anchor the relational API (db.query findFirst and findMany, with). Treat a non-const identifier or a parameter WHERE as unproven. Correct the room-reach waiver reason (safety rests on the delete succeeding before the fan-out) and the debug-stats waiver wording (box owner only). Write both rulings into Spine-Identity section 2b.

## Why

Each passing shape is one new caller away from a cross-tenant read, and the satellite rule as built misses the satellite the law names.

## Done when

Every listed shape flags with a planted control; live sites are scoped or carry an accurate waiver; Spine-Identity section 2b states both rulings; a security review confirms.

## Evidence

Filled at landing: what ran and where its output is.
