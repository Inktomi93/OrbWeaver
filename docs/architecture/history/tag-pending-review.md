---
kind: spec
status: shipped
updated: 2026-07-03
---

# Proposed: tag pending-review read surface (the Accept/Reject flow's server half)

> Carved out of `domains/tag.md` at its 2026-07 gutting (the built domain's doc deleted; code is the
> source of truth). This file holds ONLY the genuinely-unbuilt remainder. It does NOT duplicate:
> **PD-40** (the corpus distill pass that will stage `source:'auto'` pending suggestions) or the blanket
> **Phase-6 client** deferral (the Accept/Reject UI itself).

## What is already built (do not re-design)

The whole WRITE side of the unified tag-provenance model (`tags.source` × `character_tags.status`) is live:

- Import + the default-card seeder stage `source:'card'`, `status:'pending'` junction rows via the ONE
  by-name chokepoint `tag.attachCardTagByName` (race-safe resolve-or-create, no-downgrade on re-import).
- The Accept mechanism exists: `attachTag`/`bulkAttachTag` with `status:'accepted'` UPSERT-flips a pending
  row (`persistence/junctions.ts` INSERTERS, character arm). Reject is `detachTag`.
- Export reads `character_tags WHERE status='accepted'` (`domain/export/verbs/export-character.ts`) — the
  neo round-trip gap is closed.
- The ACCEPTED read exists for character views: `character/persistence/queries.ts` `canonicalTagsFor()`
  (the sanctioned db-layer junction-consumer read) feeds `CharacterDetail.tags` / `CharacterSummary.tags`.

## The gap: no PENDING read anywhere

Character views deliberately exclude pending rows, and their contract comment says suggestions "read
through tag's own surface" — but the tag domain exposes NO per-entity/pending read (its reads are
namespace-level: `listTags`, `listTagsWithUsage`). The Phase-6 pending-review UI ("Accept" chips on the
editor / a review inbox) has no server verb to enumerate suggestions. `TagAttachmentView` in
`@orb/contracts/tag` is the pre-built wire shape for exactly this read and currently has ZERO consumers.

## Proposed shape (small — one read verb)

- `tag.listPendingSuggestions({ principal, characterId? })` → `TagAttachmentView[]` joined with the tag
  name/colors (or a `TagSuggestionView = TagView + { characterId }`): owner-scoped via the character's
  `ownerId`; `characterId` optional so the review surface can be per-editor (one character) or a global
  inbox (all pending across the library). Home: `tag/verbs/` + `tag/persistence/queries.ts` (a junction
  read on the junction-owner's side — character's `canonicalTagsFor` stays the accepted-only consumer).
- No new write verbs: Accept = `attachTag(status:'accepted')` (the existing flip), Reject = `detachTag`.
- When PD-40's distill lands, its `source:'auto'` rows join the SAME surface — `source` is display-only
  provenance, one review queue, no parallel flow (the locked "no whole nother aspect" constraint).

## Trigger

Build WITH the Phase-6 tag/character client surfaces (the first consumer), not before.
