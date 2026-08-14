---
kind: design
status: active
updated: 2026-08-14
---

# v3 demo-transcripts heal — decision brief

> Scout-reconstructed 2026-08-09 (lane #51, receipts verified in-lane). The standing board item
> "v3-transcripts-reach-new-installs-only heal" posed as a decidable fork. No recorded lean in any
> board era; every occurrence says "his call."

## What it is

The bundled demo-chat pack's v3 (`server/src/domain/chat/seeder/demo-chats.ts:51-59`,
`DEMO_CHAT_PACK_VERSION = 3`) fully REGENERATED the six seeded transcripts to fix a baked-in bug:
pre-persona exports rendered the user as `"You"`, which the model echoed as a vocative in prose.
Regenerate-never-edit law applied.

## Why old installs never get it (mechanism, receipted)

- `seed()` (`seeder/seed.ts:259-276`) runs once per user on empty, writes current bytes, stamps the
  pack version.
- Already-seeded users get `migratePack()` (`seed.ts:244-257`) → `healOne` (`:195-206`), which fills
  **dressing only** (seat persona `:209-215`, background `:218-225`, still-born game `:229-239`) —
  it never rewrites chat message rows.
- Transcript re-landing is impossible by construction: bulk-write dedup keys on
  `importHashFor(demo)` = `` `demo-chat:${demo.slug}` `` (`seed.ts:28-30`) — **slug, never bytes**,
  deliberately (comment `:26-27`: re-generating must not resurrect a user-deleted example). A
  re-seed of an existing slug no-ops.
- Consequence: any install seeded pre-v3 holds the `"You"`-tainted transcripts forever; new installs
  get v3 free.

## The fork

For a user whose pack stamp is <3, should a transcript-content heal exist, and in what shape?

## Arms

- **A — leave it (status quo).** Zero cost. The only beneficiaries would be pre-v3 installs; the
  owner's own stack is post-v3-fresh (db re-minted this era; re-import incoming), and the product
  has no other installed base. The latch design DELIBERATELY conflates "user deleted it" with
  "doesn't exist" — un-conflating requires a new signal (see B).
- **B — one-shot destructive re-seed on version bump.** Delete + reseed the six demo chats for
  stale-stamp users. Needs a new signal to distinguish user-deleted from stale (the current latch
  reads both as "absent, don't touch" — `seed.ts:6-7`), and destroys any play/edits in those rooms.
- **C — bytes/version-keyed import hash, coexisting rows.** Old + new copies both present unless
  paired with the same deletion problem as B, plus visible clutter.

**Precedent pointer (scout's not-covered):** the character-pack heal
(`domain/character/seeder/seed.ts`, `migrateExistingCard`) DOES re-dress card content — worth a
compare if a content-heal is ever built here.
