---
kind: adr
status: active
updated: 2026-09-23
---

# Marinara borrow dispositions

## Context

Not recorded in the ledger row.

## Decision

Marinara-borrow dispositions (marinara is evidence only; build state is noted below): sprite-sheet generation → expressions set; pick-before-generate + avatar img2img → imagery set; gif search/import → the proposed hub feature (assets via injected ops). **(B5a) The hardened egress guard is `infra/network` plumbing regardless of any UI.** LANDED today: `safeFetch` enforces cross-origin credential-header stripping per redirect hop + byte/content-type/redirect bounds; `isAllowedImageBuffer` = magic-byte + dimension/pixel caps over pure `@orb/kit/image-sniff` (ONE signature table shared by infra + assets); host/SSRF gating today = the opt-in `EGRESS_FIREWALL` global dispatcher. LANDED (truth-repaired — built ahead of the hub wave): `safeFetch` is SELF-ENFORCING — per-request resolve→validate→pin with a REQUIRED `allowedHosts` re-validated per redirect hop, independent of the global dispatcher (`infra/network/egress.ts`; gate `no-raw-egress` armed; live consumers: databank scrapers, the plugin membrane's `net.fetch`, and the entry-composed background/update/inline-image fetches). Third-party proxy fallbacks (corsproxy.io) are a NAMED REJECTED PATTERN. **(B5b) Proposed hub feature:** one capability-flagged `HubAdapter` contract + a data-driven `HUB_ADAPTERS` registry sealed in `infra/network/hubs/` (the sealed-executor pattern); preview goes through import's PURE reader (never a second parser); import hands bytes to the EXISTING single-card import driver (`importedFrom: "hub:<key>:<ref>"` + `importHash`); avatars server-proxied via the guard into an ephemeral LRU (never CAS; `private` cache per D21); AppSettings kill switch + per-user rate limits; NSFW surfaced (badge, default-off), never laundered. v1 roster: chub · wyvern · chartavern · pygmalion; datacat deferred (ToS call); jannyai rejected (scrape-token + proxy pattern). **(B6) `domain/roster-preset`:** `roster_presets` (TRUE PRODUCER — stamps `ownerId`; `unique(ownerId,name)`; optional anchor persona + `GroupConfigInput` blob) + `roster_preset_members` (real FK junction, position + per-member knobs — never a JSON id-array); `applyToChat` drives the EXISTING chat roster verbs via injected ops (additive + idempotent, never kicks); chat stays preset-blind. Owner-only, no sharing in v1.

The former hub implementation was purged; B5b above records the proposed rebuild, not a current implementation.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
