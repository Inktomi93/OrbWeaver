---
kind: adr
status: active
updated: 2026-10-02
supersedes: docs/adr/0049-sillytavern-gap-register-closed.md, docs/adr/0061-marinara-borrow-dispositions.md, docs/adr/0110-parity-plus-makes-the-7-marinara-reference-features.md
---

# Parked programs retain concepts and implemented product boundaries

## Context

The owner selects Orbweaver programs by product need rather than inherited feature inventories. Retiring planned work must preserve implemented behavior and its security constraints.

## Decision

Post-launch programs retain a goal and a core concept, not a committed feature list. Detailed design starts only when the owner resumes the program. RPG, agent principals, spatial maps, world-state clips and custom emoji remain parked. Plugin authoring, easy sharing and documentation migration remain active. Expressions, sprite generation and the VN compositor are not planned; remove their unused implementation without deleting live imagery or avatar behavior.

## Capability ownership

Imagery owns image generation through injected operations; `/imagine` is an automation action. Gallery uses assets read verbs and derived gallery rows. Appearance owns background image settings; the base surface color remains a theme token under D63. Databank owns documents and derived document chunks with per-type scope junctions and host-only retrieval under D16 and D20. External feature inventories do not authorize implementation or repeated parity audits; new work requires a work item. Text completion, extra tokenizers, a marketplace, TTS and STT remain excluded. Hosted generation remains the current imagery scope. Local image generation remains excluded unless a separate governing decision changes it; this cleanup does not authorize it.

Saved parties belong to the roster-preset domain. Presets stamp their owner and enforce owner/name uniqueness. Members are ordered FK junction rows with per-member settings, not JSON identifier arrays. An optional anchor persona and group configuration belong to the preset. Applying a preset uses injected chat roster verbs, adds idempotently, removes no members, and keeps chat independent of presets. Presets remain owner-only without sharing.

## Network and asset boundaries

Network access remains self-enforcing in `packages/server/src/infra/network/`. Each request resolves, validates and pins destinations against required allowed hosts, including every redirect. Strip credential headers on cross-origin redirects. Enforce byte, content-type and redirect bounds independently of a global dispatcher. Image acceptance uses the shared signature table in `packages/kit/src/image-sniff/` with dimension and pixel limits. Third-party CORS proxy fallbacks remain rejected.

Hub capabilities use a declared adapter contract and a data-driven sealed registry. Preview uses import's pure reader; import uses the existing card driver and retains source provenance and content identity. Avatar previews are server-proxied through the network guard into bounded ephemeral storage, not CAS, with private caching under D21. Retain the settings kill switch, per-user rate limits and explicit default-off adult-content treatment. Adapter availability and terms follow their own current rulings; this cleanup adds no provider or scrape-token workaround.

## Hidden content and rendering

Reading visibility and wire projection remain independent content-class registry axes. Hidden tags and directives share the canonical quote-, escape- and JSON-aware grammar with safe streaming truncation. Unknown directives cannot leak as rendered prose. Cards project a title stub, with the configured retention default remaining zero.

Hidden content remains model-readable and host-readable only through server-authorized reveal. Members never receive hidden bodies. The visibility verdict has one home and crosses domains as data. Apply it to reads, replay, live deltas, turn mutation returns, forks and plugins. Quiet extraction and compaction strip hidden content through the canonical fail-closed summary projection, including covered hidden spans, regardless of host reveal. Streaming holds incomplete sensitive prefixes conservatively and drops unfinished tails. Compile-time event coverage remains exhaustive. Discovery keeps its owner-only read boundary. In deception-active games, members cannot receive reasoning; games without deception retain their existing behavior.

Immersive cards retain their forming, collapsed, expanded and raw-view lifecycle and scene archive. Cards remain member-visible through their reading/wire projection. Embedded scripts stay disabled under the sandbox and deny-by-default CSP. Enabling scripts requires a separate security-reviewed decision. Guided choices send through the existing action path; plot steering uses trusted templates and the canonical steering vocabulary rather than an RPG-contract dependency. Feature configuration updates preserve unrelated fields.

## RPG state and macro invariants

Preserve all implemented RPG behavior. Selected-lineage state drives pure per-plane deltas, rendered before steering and omitted when unchanged; roster names enter as data. Relationship values retain the canonical vocabulary and custom hints, scene writes, journal projection, badges and deltas. Level remains hand-edited and excluded from model-writable extraction schemas. Custom cast fields use host-defined keys and exact projected key vocabularies. Structured extraction uses required nullable fields rather than omitted optional fields, deriving values server-side where the grammar requires it. A new writable state plane updates its schema, persistence, extraction, delta and render consumers together.

The scoped macro block grammar, reserved flags, content-as-last-argument and whitespace rules remain canonical in `packages/kit/src/macro/`. Immediate/delayed overrides affect arguments, not unselected bodies. Typed argument validation remains centralized, with strict or warning behavior and no exception rendered into prose. User macros live in preset/game configuration, follow variants and reject name collisions. Choice inputs retain selection modes and random-pool selection frozen at commit. Preserve variant-scoped variables, CEL, the shared server/client value representation, budgets, byte-identical eager/lazy output and operation logs, and nested determinism. Content neutralization and splice protection remain macro-engine responsibilities.

The RPG feed remains wired through gather and the canonical macro/CEL context. Preserve the selected scene, cast, quests and delta projections and idle-time input. Plot state follows snapshot lineage. CYOA remains default-off and plot progression default-on. Custom emoji does not change D21 asset access while parked. Keep current resource orbs, omit the stone-and-parchment theme, and leave encounter placement and full-game steering deferred.

## Consequences

Plan reduction does not weaken identity, scope, visibility, network, macro or persistence invariants. New implementation needs a resumed program and a current design.

## Alternatives rejected

Retaining detailed external feature lists as commitments is rejected. Removing active behavior or security constraints with a parked plan is rejected.
