---
kind: law
status: active
updated: 2026-07-13
---

# Planning-and-Checklists

> **Live obligations only** — the landed rows and the council-review record are in git history. The rows below are the
> only ones still ALIVE: **B1** (blocked:later), **D4's open half**, **§C1/§C2** (standing testing law,
> cited by `Spine-Testing.md`), and **§E** (the permanent owned-risk acceptance record).

## B1. The migration DATA scripts (the neo→orb port, not the schema)

- **`proposedTags → character_tags.status`**: for each neo `character_versions.proposedTags` element
  upsert a `character_tags` row (`source='card'`, `status='pending'`, create the tag if needed) — orb has
  no `proposedTags` column (D28 + `domain/tag`). Add a post-port count-validation query; without it,
  pending-tag data is silently lost.
- **`character_books` land on `characters.id`** (D28; neo keyed books on the cv): pre-flight orphan
  check (neo `LEFT JOIN character_versions … characters WHERE characters.id IS NULL`); log + drop
  orphans as an observable event, never an FK crash or silent loss.
- **Card-content port** (D28): neo's `character_versions` card columns land on the FLAT `characters`
  row (no version table, no "de-pin" migration); per-character stats group on `characters.id`. Run
  content + stats-grouping in one pass so `assertReferentialIntegrity` sees a consistent graph.
- **WI persona-book join**: rewire from `chats.personaId` to `chat_participants.activePersonaId` before
  dropping the source column.
- **`image_embeddings.lens`**: existing rows are `image-captioned`; populating `image-raw` needs a
  re-embed workload.
- **Port-run safety**: `PRAGMA foreign_keys=OFF` on the migration connection only;
  `assertReferentialIntegrity` (`PRAGMA foreign_key_check`) after is the only FK gate →
  `backupBeforeMigrate` is non-optional (both live in `entry/boot/migrate.ts` / `@orb/db`).
- **Status:** blocked:later — rides the chats and personas import waves.

## C1. The differential oracle — RETIRED

BUILT, served its purpose, and **RIPPED OUT 2026-08-22** (owner ruling, #428: "we exceeded neo a while
ago" — the floor is obsolete). Gone from the tree: the `.parity` suite, its steady-clone driver, the
captured neo reference fixture, the `parity` vitest project and the `tests:parity` verify stage. Git
preserves all of it.

While it ran it byte-validated the PARITY surface only (assembled prompt + cache placement + token
tallies). Memory was never in scope — it is a rewrite that intentionally retrieves differently and got
its OWN tests (the 6-semantics map). Nothing is measured against neo any more: a behaviour is proven by
its own tests, never by a neo diff.

## C2. The ~150 "preserve exactly" esoterica → named tests

The standing rule: every load-bearing quirk becomes a named test or asserted invariant, and its comment
travels with the code — the AAD byte-string, ZWSP-between-the-braces (`neutralizeMacros`), the
always-real `scopedCharacterId` (the `''`-sentinel was SUPERSEDED by D55 — real synthetic-group ids), the PNG dual-chunk + CRC, the vLLM death-couple pipe-watchdog,
`storedVersion`-beats-probe, the last-owner / owner-immutability EXISTS-on-UPDATE guard (D17), the
`globalMacroRegistry` single-tenant note, the `deepMergeRequestBody` Layer-2 defense, the
`ASSUMES(single-replica)` annotations.

## D4. The BYO response-mapping schema — still open

The **response-mapping schema** (content/usage/finish/stream field map) needs finalizing before the
BYO form ships. No PD row yet — mint it at the next debt-registry pass. Deferred, see §E.

## E. Owned risks (no action — documented acceptance)

- **Qwen3-VL single-model dependency** at the knowledge-cluster core (matching MRL-1024 + L2-norm
  across vLLM/OpenRouter). The cosine≈1.0 probe guards it; if it fails, "free local↔hosted switch" → a
  re-index. Acceptable for the stated product; owned, not mitigated.
- **Single-replica** is the v1 stance (honest + cleanly seamed — every `ASSUMES(single-replica)` site
  has a named DB-backed replacement). Scaling out = replacing ~12 surfaces; not a v1 concern.
- **Deferred features** (acceptable): agent-principal mint mechanics superseded by the committed D60
  design (`proposed/agent-principal-design/`), BYO response-mapping form, bulk/zip library export, the
  4 AI-native v2 swings (seams reserved).
