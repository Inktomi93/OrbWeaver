---
kind: history
status: superseded
updated: 2026-07-13
---

> **History note:** the full pre-scaffold checklist + council-review record, frozen 2026-07-13; the
> still-live obligations (B1, D4's open half, §C1, §C2, §E) stay in
> `core/Core-Planning-and-Checklists.md`.

# Planning-and-Checklists

## Orbweaver — pre-scaffold checklist (implementation-time conditions)

> **Status: the council's implementation-time conditions, with their landing state.** Doc-level
> decisions are committed in the retired ledger index's §5 (its archaeology: `core-laws-archaeology-record.md` §5); this file is the operational "do these or
> the architecture's guarantees don't hold," ordered by when they bite. Most have now LANDED (marked;
> the code + gates are the proof) — the still-open rows are the live obligations.
>
> **Triage 2026-07-09 — what is still ALIVE in this file (everything else is a landed record):**
> **B1** (the ST-import data-port scripts — rides `history/export-import-portability.md` §5,
> blocked:later) · **D1** (the `logAudit('WORKLOAD_FAILED')` terminal-failure emit — LANDED, PD-113) ·
> **D4** (the BYO response-mapping schema — still open, ships with the BYO form) · **§E** (owned risks —
> permanent acceptance record, never "resolves"). D4's open half has no PD row yet — mint it at the next
> debt-registry pass rather than re-discovering it here. The §"council review" half is a dated historical
> record kept for its verdicts. Re-kinded law→reference (the live law it carried was promoted long ago;
> what remains is a checklist record + four live rows).

## A. Before the first domain compiles — ALL LANDED

- **A1. Gate suite day-one and BLOCKING** ⭐ — LANDED. The full live catalog (Biome · GritQL · ts-morph
  gates · dep-cruiser · jscpd · Stryker, plus the lefthook/CI wiring) is
  `Core-Enforcement-Active-Gates.md`; the deferred/rejected set is `Core-Enforcement-Deferred-Dropped.md`.
- **A2. Reserve the AI-native seams** — LANDED in `@orb/contracts`: `ClipKind`/`ClipSourceKind`/
  `clip.scope` (memory), the `'world-state'` `WorkloadKind` reservation, the `'observer'` member of
  `PARTICIPANT_KINDS`. Search's cross-chat character scope + the stats↔discovery JOIN path stay open by
  design.
- **A3. Local-light embed/rerank tier as a v1 build target** — LANDED:
  `infra/providers/backends/local-light` (transformers.js/ONNX in-process). Without it a GPU-less,
  cloud-key-less user has no memory search and the "strict superset" claim fails — that's why it was a
  v1 condition, not a "later."
- **A4. `tests/support/` with the gate suite** — LANDED. The composed `test.extend` fixture, factories,
  `freshDb`, frozen clock, seeded ids, the Vitest node projects + Playwright browser runners. Full
  policy: `Spine-Testing.md`.

## B. The DB + migrations conditions

Orbweaver is born whole on ONE `0000_baseline` (riders squash into it while it's open —
`schema-baseline-parity` gate), so these bite on the **neo→orb data port** (the profile-import path,
`entry/import/run-profile-import.ts`), not on greenfield boot.

### B1. The migration DATA scripts (the port, not the schema)

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

### B2. `.credentials-key` data-loss prevention — LANDED

The boot decrypt-probe + the `credentials_key_mismatch` `healthz` field + the keyfile handling
(`infra/crypto/key.ts`, mode 0600, gitignored) are built. The GCM AAD `${userId}|${provider}` belt
makes the key the ONLY recovery path; losing it is permanent — back it up alongside the DB.

## C. The chat + memory build conditions — LANDED (kept as the record of what the tests pin)

- **C1. The differential oracle** ⭐ — BUILT: `tests/server/domain/chat/pipeline-breakpoint.parity.test.ts`
  with the steady-clone driver `tests/support/parity-runner.ts` (vs `/tmp/neo-tavern-steady`; the
  `scripted-override.ts` RUNNER\_OVERRIDE seam makes RECEIVE deterministic). **The honest caveat:** the
  oracle byte-validates the PARITY surface only (assembled prompt + cache placement + token tallies).
  Memory is a rewrite — it intentionally retrieves differently and got its OWN tests (the 6-semantics
  map), never the oracle.
- **C2. The \~150 "preserve exactly" esoterica → named tests.** The standing rule: every load-bearing
  quirk becomes a named test or asserted invariant, and its comment travels with the code — the AAD
  byte-string, ZWSP-between-the-braces (`neutralizeMacros`), the `scopedCharacterId=''` sentinel, the
  PNG dual-chunk + CRC, the vLLM death-couple pipe-watchdog, `storedVersion`-beats-probe, the
  last-owner / owner-immutability EXISTS-on-UPDATE guard (D17), the `globalMacroRegistry` single-tenant
  note, the `deepMergeRequestBody` Layer-2 defense, the `ASSUMES(single-replica)` annotations.
- **C3. The unified roster/group/multi-human system built WHOLE (D16)** — BUILT: no solo-then-multihuman
  split; schema born whole; neo's §9 security must-dos and §10.4 cross-cutting invariants (no-if(isGroup)
  solo-byte-identical, the turn-identity triple, max-pro-sub-by-proxy refused, server-derived presence,
  bus payload allowlist…) are pinned by the chat `.int`/`.contract` suites; the D17 owner-role split is
  live. The oracle covers PARITY only — the rewrites ship on their own suites (C1).

## D. Failure-surface + ops hardening

- **D1. Fire-and-forget memory build failure surface** — LANDED. The `content_hash`-diff **catch-up
  sweep** (the event-bus reliability backstop) is built (`domain/embeddings` embed-corpus/embed-assets).
  The `logAudit('WORKLOAD_FAILED', …)` ERROR emit on terminal-failed workloads is built
  (`domain/workloads/engine/runner.ts` emits on terminal runtime failure; tracked PD-113).
- **D2. SSE subscription error-wrapper** — LANDED: `withSubscriptionErrors` (transport/trpc) wraps
  subscription generators with typed `{type:'error'}` frames + ERROR logging.
- **D3. `VLLM_DISABLED=true` startup escape hatch** — LANDED (foundation env + compose).
- **D4. The BYO response-mapping schema** — STILL OPEN: the **response-mapping schema**
  (content/usage/finish/stream field map) needs finalizing before the BYO form ships (deferred, §E).
- **D5. Settings-reload observability** — LANDED as the `settings.updateAppSettings` audit row
  (metadata carries the full merged config, incl. `logLevel`) before `reloadEffectiveConfig`.

## E. Owned risks (no action — documented acceptance)

- **Qwen3-VL single-model dependency** at the knowledge-cluster core (matching MRL-1024 + L2-norm
  across vLLM/OpenRouter). The cosine≈1.0 probe guards it; if it fails, "free local↔hosted switch" → a
  re-index. Acceptable for the stated product; owned, not mitigated.
- **Single-replica** is the v1 stance (honest + cleanly seamed — every `ASSUMES(single-replica)` site
  has a named DB-backed replacement). Scaling out = replacing \~12 surfaces; not a v1 concern.
- **Deferred features** (acceptable): agent-principal mint mechanics superseded by the committed D60
  design (`proposed/agent-principal-design/`), BYO response-mapping form, bulk/zip library export, the
  4 AI-native v2 swings (seams reserved).

## Orbweaver — greenfield council review (2026-06-25, historical record)

> A 5-seat panel each read the ENTIRE doc set in full (no grep) and ruled on whether to sign off before
> scaffolding. **Outcome: unanimous conditional sign-off. No blocks.** All converged conditions were
> actioned (they are the §A–D rows above); the committed decisions live in
> `core-laws-archaeology-record.md` §5. Kept as the durable record of the verdicts and the big ideas.

### Verdicts

| Seat | Model | Verdict | Headline |
| - | - | - | - |
| Architecture Skeptic | Opus | SIGN-OFF w/ conditions | "Most disciplined greenfield plan I've reviewed" — intra-server boundaries are *lint, not physics* until the gates exist |
| AI-Native Visionary | Sonnet | sound, missing the big swing | "Builds a superb substrate and only **retrieves** from it; the 2026 move is to **synthesize**" |
| Executability / DX | Sonnet | can-scaffold-with-fixes | 8/11 gates real; 5 pre-scaffold blockers (mostly stale "Open"s the ledger already decided) *(dated verdict — the gate ladder was since finalized at the canonical **13**, `Core-0-Architecture-and-Structure.md` §7)* |
| Production / Ops | Sonnet | SIGN-OFF w/ conditions | single-replica is honest + cleanly seamed; gaps are missing *migration scripts* + *failure surfaces* |
| Product / RP-fidelity | Sonnet | PRODUCT-COMPLETE | genuine strict-superset (12 wins over ST); one real v1 risk (local-light embed tier) |

### The big AI-native swings (grounded in existing seams; v2)

1. **World-state as a third substrate kind** — `{{world_state}}` macro + a reconciling workload
   (relationship/inventory/plot, *what is currently true*). Seam: knowledge-cluster trackers/clips +
   `embeddings.store(kind,…)`.
2. **The Narrative Director** — generalize buddy's observe→propose→confirm to a per-chat observer agent
   that detects drift and proposes WI/steering (never acts). Seam: buddy pattern + guided steering +
   `smart-arbitrate` + WI verbs.
3. **Cross-chat character coherence** ("persistent self") — synthesize character-level traits from
   cross-chat digests. Seam: de-pin (identity-keyed) + search's cross-chat character scope.
4. **Engagement-aware preset recommendation** — discovery facets + stats engagement → connection. Pure v2.

The thesis: the architecture builds a superb knowledge substrate and retrieves from it; the swing is to
*synthesize* from it. Budget to keep the swings free = \~5 type declarations + 2 union reservations (done).

### Notable wins the council validated (vs SillyTavern)

Tiered memory + cross-chat vector search (5 modes, 2 lenses, CSLS + rerank + BM25) · the rolling-PAIR
cache breakpoint (ST pattern + neo's safe-boundary aborts) · per-agent connection · the dynamic
capability-descriptor params panel · `runOnEdit` wired · 4-scope world-info · the buddy agent w/
propose-confirm gate · character de-pin + snapshot/restore · proposed-tags round-trip fixed ·
fully-user-declared BYO backend · import auto-indexes · the single canonical typed card. **The "strict
superset" claim holds — conditional on the local-light tier shipping in v1** (shipped; §A3).
