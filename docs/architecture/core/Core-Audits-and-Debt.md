---
kind: reference
status: active
updated: 2026-09-20
---

# Audits-and-Debt (live: Promotion / Relocation Debt Registry)

> **⚠ BUILD-STATE RIDER (truth audit 2026-08-03):** rows below predate the 2026-07-22/25 retro purge. Any row's build-state claims about PURGED surfaces — the agent-principal machinery (PD-17's AP0–AP3-2 "BUILT" record: `provisionAgentPrincipal`/`canAgent`/`agent_principals`/`chat.seatAgent` are all GONE from the tree; only dormant DDL survives, see the D60 rider), `domain/buddy`, `domain/hub`, expressions seams (PD-56), `anth-direct` — are HISTORICAL, not current. PD-57 (databank) is BUILT since 2026-07-26 (D107), superseding its deferred status. Audit lists are snapshots: re-sweep against the tree before acting on any row.
>
> **How to read this file.** This is now the LIVE debt registry only: the active `PD-XX` flags to burn down (plus the block recovered from a broken "Cleared" table on 2026-07-01). The resolved archaeology that used to wrap it was split out 2026-07-02 into siblings — [`Core-Doc-Review-Punchlist-2026-06-28.md`](../history/Core-Doc-Review-Punchlist-2026-06-28.md) (the boundary/build-order scan + the 06-28 doc-review punch-list), [`Core-Doc-Inconsistency-Audit-2026-06-26.md`](../history/Core-Doc-Inconsistency-Audit-2026-06-26.md), and [`Core-Debt-Cleared-Ledger.md`](../history/Core-Debt-Cleared-Ledger.md) (the `## Cleared` ledger of done flags).

## Promotion / Relocation Debt Registry

**The ONE place that lists every type/symbol/file deliberately homed in a TEMPORARY location with a
commitment to move (promote/relocate/replace) it later.** Born 2026-06-27 because these deferrals were
scattered across code `FLAG` comments + per-`D`-entry ledger notes + agent reports — collectively
invisible, individually forgettable. This file makes the set greppable in one place.

## The Flagging System

The codebase uses two distinct types of `FLAG` comments. It is critical to distinguish between them:

### 1. Promotion Debt (`FLAG[PD-XX]`)

Denotes **temporary debt**, missing features, stubs, and items deliberately homed in a temporary location with a commitment to move/build them later.

- Every temporary deferral lives here as a `PD-<n>` row: **item · current home · target home · TRIGGER · status**.
- Every in-code debt flag MUST cite its id: `// FLAG[PD-7]: …`. A grep of `PD-` reconciles code ↔ this registry. A flag with no row, or a row with no flag, is a drift.
- When a trigger slice is built, its agent **clears every `PD-` row whose trigger is that slice** (or flips it `done` with the resolving commit).

### 2. Architectural Markers (`FLAG[name]`)

Denotes **permanent architectural boundaries**, design invariants, and structural decisions.

- These flags (e.g., `FLAG[scope]`, `FLAG[bus-not-on-ctx]`, `FLAG[neo-quirk]`) do **NOT** have a `PD-XX` ID.
- They exist to explicitly document *why* a design is the way it is, preventing future developers or agents from mistakenly "fixing" or refactoring them.
- **DO NOT** remove or "resolve" these markers. They are load-bearing documentation.

Status: `ready` = trigger has landed, do it now · `blocked:<slice>` = waiting on that slice · `done`.

## Registry

| id | item | current home | → target home | trigger | status | |
| - | - | - | - | - | - | - |
| PD-2 | `AdminUserView` | `packages/server/src/domain/admin/contract/views.ts` (admin owns its read-model) | `@orb/contracts/identity` | relocate only if a client imports the view type directly | **DONE 2026-07-16**: the client uses tRPC output inference (`packages/client/src/features/user-admin/components/admin-user-row.tsx` and `admin-approvals-section.tsx`); `AdminUserView` remains server-local under `domain/admin`, so the relocation trigger is false. | |
| PD-16 | provider-diagnostic cancellation for OpenRouter credits and generation-cost reads | `packages/inference/src/backends/openai-compat/diagnostics.ts` (`authenticatedRead`) | — | — | **DONE**: `openRouterCredits` and `openRouterGenerationCost` pass `req.signal` through `authenticatedRead` to the shared `fetchJson` request. | |
| PD-17 | chat `agent` participant kind / agent-as-first-class-principal (`provisionAgentPrincipal`, `users.kind`) | **PURGED 2026-07-22/25 (retro burn-down) — was BUILT through AP3-2, then torn out.** The AP0–AP3-2 chain (schema leaf, identity spine, roster/stats attribution, seat wave, per-speaker card rendering, buddy soul-prompt resolution) landed 2026-07-02 through 2026-07-16 and was later purged wholesale by the burn-down: `provisionAgentPrincipal`/`canAgent`/`agent_principals`/`chat.seatAgent` and the rest of the agent-principal machinery are GONE from the tree (purge SHAs `f4049019a`, `d173496cd`, `a4192372d`); only dormant DDL survives. `users.kind`/`chat_participants.kind` are back down to their pre-AP0 single-member tuples (`USER_KINDS = ["human"]`, `PARTICIPANT_KINDS = ["human", "character"]`). Current tree truth lives at `Spine-Identity-and-Auth.md` §4; the rebuild design is the agent-principal design set (parked in `../proposed/`, D60) — this row is history, not a build log to extend. | per the agent-principal design set (parked in `../proposed/`, D60) | agent-principal rebuild (unscheduled) | blocked:agent-principal-rebuild | |
| PD-18 | `reconcile-world-state` WorkloadKind (D38) — FIXED RATIONALE 2026-07-14 (blocker-audit): the row previously blamed "presence/buddy seams" as the gate, but those SHIPPED (`transport/trpc/presence-registry.ts`; the full 40-file `domain/buddy` subsystem). The real gate is that the reconciler's job is UNSPECIFIED v2 memory-domain scope. RE-PHRASED 2026-08-01 (\[\[D117]], the workloads junk-drawer exit): the old "the `WorkloadRunnerEnv` hub carries no presence/buddy env" framing is dead with the hub — a contribution takes its deps from its OWNING domain's factory, so the gate is purely that no domain owns this kind yet. | `domain/workloads/substrate/reserved-contributions.ts` — reserved kind, inert no-op (`DeferredResult`); it lives in workloads ONLY because it has no owner and carries zero domain knowledge | mint it as `domain/<owner>/workload-contributions.ts` once the spec names the owner | PD-133 (the v2 world-state reconciler spec/feature — mints the scope this row is missing) | blocked:PD-133 | |
| PD-35 | search memory-retrieval verbs and `MemoryQueryOptions` consumers | `packages/server/src/domain/search/` | `packages/server/src/domain/search/` | chat/memory (P5) | **DONE**: `discover`, `similarCharacters`, and `similarArt` are live service verbs (`domain/search/service.ts`); `discover` is exposed through the unified `search.search` target and `similarArt` directly in `transport/trpc/routers/search.ts`. `resolveSegmentDisplay` remains in `domain/search/persistence/display.ts`, and chat memory builds `MemoryQueryOptions` in `domain/chat/memory/recall/query.ts`. The retired `recencyBias` key is stripped by the settings v7→v8 lift; the surviving `FLAG[PD-35]` in `domain/search/verbs/corpus.ts` tracks the separate segment-without-digest limitation. | done |
| PD-56 | expressions/sprites (D49) — emotion-classify → sprite swap | not built (deferred); `../proposed/expressions-design/`. schema/contracts/GC-registry/bus-member born on 0000_baseline; classify shaper, turn hook, CRUD leaf, real runner, client stage unbuilt. | a `classify` provider role (v1 = `chat`-role shaper; v2 = `local-light classify`, D39) + a `character_sprites` model (`(characterId FK, label, assetId FK)`, owner DERIVED D23) + an `EXPRESSION_LABELS` tuple + a per-turn chat hook + a client render slot | chat lands (P5) for the per-turn hook | deferred:P7 | |
| PD-57 | databank (Data Bank / document-RAG, D49) — DECIDED build-as-additive-graft | not built (deferred Phase 6/7); `../proposed/databank-design/`. DB2-tables rider landed (documents + 3 junctions, document_chunks, reserved {{databank}} macro slot, stub runners); remainder fully absent. | a `documents` single-owned producer + `global/character/chat_documents` junctions + a derived `document_chunks` vector table + `@orb/kit/chunk` + a db-free `infra/extraction` loader + `embeddings.store` 5th arm + a `search.documents` lens + a chat `{{databank}}` slot | post-chat (P6/7) additive graft; nothing born-compliant-now | deferred:P6/7 | |

## Bucket B — chat-landed re-verification (2026-07-01)

> **2026-07-03:** the promote-candidates PD-8/21/23/24/30/42 and PD-41 below are ALL since CLEARED
> (verified rows in [`Core-Debt-Cleared-Ledger.md`](../history/Core-Debt-Cleared-Ledger.md)) — this
> section is provenance for the re-verification pass, not live promote-work.

**Context:** a large share of the Registry was `blocked:chat(P5)`. `domain/chat` is now BUILT (roster,
arbitration engine, assembly, memory, bus, invites, auth seam). So every `blocked:chat(P5)` row was
re-checked against the actual code to see whether its trigger has landed. Verdicts below are
code-verified; **flip these statuses in the Registry as each is picked up.**

**→ PROMOTE to `ready` (trigger verified present; small-to-medium wiring, not a feature):**

- **PD-8** — `PARTICIPANT_KINDS` + `PARTICIPANT_ROLES` unions exist in `@orb/contracts/{chat,identity}`; `inspect-chat.ts` just imports them instead of `string`. Trivial.
- **PD-21** — `domain/stats` rebuild-from-canon is fully built; only the group-chat multi-owner **attribution edge** is open — confirm against chat's D18 membership (now exists). Small.
- **PD-23** — `notifications.record` (durable half) is built; chat (the producer) now exists → wire the after-commit per-user bus fan-out from the chat producer.
- **PD-24** — Same producer seam: run `record`'s INSERT inside the chat producer's membership-transition tx (chat is the tx owner, now built).
- **PD-30** — world-info chat-scope: `chatBooks`/`WiBusEvent` declared, and the two hard deps now exist — the `can({kind:'chat',roster})` arm (PD-1 DONE) + `domain/chat/bus.ts`. Wire attach/detach/list + emit.
- **PD-42** — Chat canon (`messages`/`message_variants`) exists; `domain/export` still only does character cards → build `exportChat` + JSONL/TXT.

**→ SEAM READY but FEATURE-SIZED (trigger landed; real build, not a quick burn):**

- **PD-41** — ~~confirmed inert stubs~~ **DONE (re-verified 2026-07-06): the runner bodies are BUILT** — `memory-backfill.ts` calls `ctx.env.memory.backfill`, `group-character-backfill.ts` calls `ctx.env.character.backfillGroupCharacters` (commit `0f1c201`). The "inert stub" note was stale.
- **PD-54** — ~~Tool-calling recurse loop ~absent~~ **RESOLVED (D48/PD-54 closed 2026-07-04): `domain/tool-use` registry + `runRecurseLoop` (`domain/chat/engine/engine.ts`+`pipeline.ts`) are BUILT.**
- **PD-34 / PD-35** — Embeddings memory lenses + search memory-retrieval verbs — `domain/chat/memory` is built, but the embeddings/search **consumer arms** need a focused audit of what's stub vs done before promoting.

**→ STAYS BLOCKED (verified genuinely not built — do NOT promote):**

- ~~**PD-45 / PD-64** — buddy `observer/` reaction engine not built~~ — **BUILT 2026-07-10** (the chat/workload event sources now exist; it was buddy's call, and the observer subsystem + bus + belt landed — see the PD-45 row above).
- **PD-17** — agent-as-first-class-principal — bigger identity-spine work (P5+), not a wiring flip.
- **PD-72** — memory-log sink — an observability seam, still stubbed in `entry/compose/chat.ts`. (Its former pair PD-71, the search-corpus owner-id, was BUILT 2026-07-13 — cleared ledger.)

## Registry — ACTIVE flags recovered from the broken "Cleared" table

> ⚠ The `PD-XX` rows BELOW carry LIVE `ready`/`blocked:*` statuses but were misfiled under `## Cleared`
> above (a 6-column Registry block pasted beneath the 3-column Cleared header, so active burn-down work was
> hidden as "done"). They are **ACTIVE debt**. `ready` = burnable now (trigger landed); `blocked:<slice>` =
> waiting on that slice. Fold these into the main Registry in a later pass. (Recovered 2026-07-01.)

| id | item | current home | → target home | trigger | status | |
| - | - | - | - | - | - | - |
| PD-77 | import loader subsystem | `packages/server/src/entry/import/run-profile-dir-import.ts` | extracted importer | `collectBundlesFromDir` / `importChats` / `importPersonas` lands | **DONE**: `runProfileDirImport` composes `collectBundlesFromDir`, imports personas before chats, then imports characters and chats. `packages/server/src/entry/compose/portability-runner.ts` supplies the filesystem and cross-domain ports; `packages/server/src/domain/import/workload-contributions.ts` exposes the `import-st` workload. `ST_PROFILE_DIR` still defaults to `.st-data`. | |
| PD-78 | import stats and memory-index follow-up | `packages/server/src/entry/import/run-profile-dir-import.ts` | `domain/stats/` and workloads | imported canon changes | **DONE**: each imported chat batch bumps the owner stats-canon version in `domain/chat/persistence/import-write.ts`; `runProfileDirImport` enqueues one owner backfill after a changed, non-aborted run, with the workload op supplied by `entry/compose/portability-runner.ts`. | |
| PD-94 | assets `store` `maxBytes` bound for non-HTTP import callers | `packages/server/src/domain/assets/verbs/store.ts` | bounded bulk loader calls | profile importer | **DONE**: `store` rejects `bytes.byteLength > maxBytes` before the CAS write. `run-profile-dir-import.ts` passes the canonical `ASSET_UPLOAD_MAX_BYTES` to every avatar/card store; `store.int.test.ts` and `run-profile-dir-import.test.ts` pin both sides. | |
| PD-93 | imagery generation, prompt modes, and image editing | `packages/server/src/domain/imagery/` | — | — | **DONE**: `generatePicture` serves free and extracted prompt modes, `extractPrompt` provides the preview-before-spend path, and `editImage` enforces `input.imageEdit` before img2img dispatch. The client exposes the imagine and image-edit surfaces (`packages/client/src/features/imagery/`); server and CT suites cover both. | done |
| PD-104 | uniform model-keyed vector spaces and stale-space reclaim | `packages/db/src/schema/embeddings.ts` · `packages/server/src/domain/embeddings/persistence/space-state.ts` | — | embed-model changes | **DONE-core**: all five primary vector tables key idempotent writes on `model` AND carry a NOT NULL `generation_id`; `VECTOR_TABLES` names `character_embeddings`, `image_embeddings`, `chat_digests`, `chat_segments`, and `document_chunks`. The reclaim moved off the model-scoped `purgeStaleVectors` (deleted 2026-09-20, #2496 — it had no production caller after the generation cutover) onto `retiredVectorStatements`, which retires every non-active generation across all five tables inside the ONE promotion transaction, driven end-to-end by `tests/server/domain/embeddings/embed-space-round-trip.suite.int.test.ts`. | done-core |
| PD-117 | founding `ChatBusEvent` producer-coverage census | `packages/contracts/src/chat/bus.ts` and server emit/synthesis sites | every declared member has a producer | chat event surfaces | **DONE — 5 of 5**: `personaSwitched` emits in `domain/chat/verbs/participants.ts`; `reasoningStreamDone` and `worldInfoActivated` emit in `domain/chat/engine/engine.ts`; `chatOpened` and `historyTruncated` are per-subscription syntheses in `transport/trpc/stream/sources/chat.ts`. The remaining owner-deferred bus member is the unrelated `UserBusEvent.connectionsChanged` row owned by `user-bus-deferred-member` / PD-149. | done |
| PD-132 | chat assembly SHAPE-trace debug surface (buildShapeTrace, chat/assembly/trace.ts) — built, content-free projection for a host/admin assembly-inspector panel | chat/assembly/trace.ts (knip-ignored citing this row) | wired into an admin/devtools inspector surface | the assembly-inspector/devtools panel lands | blocked:client(P6) | |
| PD-131 | own-upload app background | `packages/client/src/features/app-shell/lib/resolve-theme-background.ts` · `packages/client/src/features/app-shell/components/background-upload-field.tsx` | — | — | **DONE**: `UserSettings.appearance` stores the selected background id/hash; `resolveThemeBackgroundUrl` maps the hash to `blobUrl`; the app-shell upload field uses `FileDropzone` and the background asset kind. `domain/assets/persistence/asset-refs.ts` unions settings JSON references into `selectAllReferencedAssetIds`, with the anti-reap behavior pinned in `collect-garbage.int.test.ts`. | done |
| PD-134 | chat stream-attach `chatOpened` synthesis | `packages/server/src/transport/trpc/stream/sources/chat.ts` | subscription-side synthesis | stream attach | **DONE**: `attachSynthesesAndReplay` yields `chatOpened` after the membership probe and never publishes or persists it. A resumed attach carries its current cursor; a cursor-less attach carries `bounds.maxSeq ?? 0`, so reconnect has a replayable high-water without advancing past an undelivered row. `domain/chat/verbs/start-chat.ts` retains the marker that forbids a domain emit. | done |
| PD-136 | ingest-façade consolidation — the zip/folder/single-file acquisition dispatch is route-local (`entry/http/import-tree.ts` + `entry/import/sniff-tree-layout.ts`); the staging PRIMITIVES are centralized in `infra/storage` (`extractZip`/`stageDirectory`/`StagedArchive`) but there's no reusable ingest façade taking `{zip bytes \| multipart-with-paths \| single files}` → `StagedArchive` + detected layout. Minted 2026-07-14 (blocker-audit). | `entry/http/import-tree.ts` + `entry/import/sniff-tree-layout.ts` (route-local dispatch) | a reusable ingest façade over the existing `infra/storage` staging primitives | a 2nd consumer (databank doc upload / hub card import) scheduled | blocked:2nd-consumer | |
| PD-135 | retained-window `historyTruncated` synthesis | `packages/server/src/transport/trpc/stream/sources/chat.ts` | subscription-side synthesis | stream resume | **DONE**: `attachSynthesesAndReplay` yields `historyTruncated` before replay only when `bounds.minSeq !== null && resumeSeq < bounds.minSeq - 1`; an empty or caught-up replay does not synthesize it. The member-gated `chatEventBounds` probe supplies the retained-window bounds. | done |
| PD-133 | the v2 world-state reconciler SPEC/feature — `reconcile-world-state`'s job (ledger §5, domains/memory.md §9) has never been scoped: which memory-domain state it reconciles, and how presence/buddy (both shipped, but not exposed to `WorkloadRunnerEnv`) feed it. Minted 2026-07-14 (blocker-audit) per the owner rule: a PD blocked on a missing surface must not be a dead end — this is that surface's own PD. | not built — no spec exists | a v2 spec doc (scope + presence/buddy env exposure) then the real reconciler in `domain/workloads/runners/reconcile-world-state.ts` | v2 planning | blocked:v2 | |
| PD-137 | per-message generation-cost display | `packages/server/src/transport/trpc/routers/connection.ts` · `packages/client/src/features/chat/components/message-cost-readout.tsx` | — | — | **DONE**: the upstream generation id is captured by the OpenAI-compatible runner, persisted in `message_variants.generation_id`, and exposed as `MessageView.generationId`. The click-to-reveal client calls `connection.generationCost` only after reveal through `useGatedQuery` and caches the immutable result indefinitely. | done |
| PD-138 | world-info entry drag-reorder — `worldInfo.applyEntryOrder` (`verbs/entries/reorder.ts`, rewrites the `priority` column) has ZERO client consumers; entries today only get manual priority-number edits (`lib/entry-editor-model.ts`), no drag-to-reorder. Minted 2026-07-14 (coverage burn-down, GAP-SURFACE). | server verb wired; no reorder UI | a sortable/DnD entry list on the world-info entry editor calling `applyEntryOrder` | coverage burn-down | ready | |
| PD-139 | embedding-space change reindex and stale-space reclaim | `packages/server/src/domain/connection/verbs/{connections,bindings}.ts` · `packages/server/src/entry/compose/{services,search-discovery}.ts` · `packages/server/src/domain/chat/memory/build/{segments,digests}.ts` | connection-triggered reindex includes every vector producer and cannot hash-skip the newly selected model space | connection embed-space changes | **PARTIAL — prior settings-trigger/chat-memory-purge completion recorded 2026-07-16; current receipt:** connection update/remove/binding changes call the injected `onEmbedSpaceChanged`, which `services.ts` wires to `enqueueEmbedReindex`. That enqueue starts bulk `index` and `databank-reindex`; `document_chunks` is the fifth `VECTOR_TABLES` member, and the bulk databank and memory-backfill runners have stale-space purge arms. **REMAINING #2475:** `enqueueEmbedReindex` does not start `memory-backfill`, while segment/digest build prechecks use `loadSegmentHashes`/`loadDigestHashes` without a model discriminator and can skip unchanged content, so a connection embed-space change does not guarantee chat-memory rebuild/purge. | partial:#2475 |
| PD-140 | `compact_summary` silently dropped on the STATELESS (OpenRouter / chat-completions) runner when the active preset lacks a `compact_summary` section — a compacted chat on the DEFAULT preset loses its summary. Contradicts D25 (`chats.compactSummary` "is used by stateless runners too"). Surfaced 2026-07-16 (neo-parity domain audit; verified in-file: `DEFAULT_PROMPT_CONFIG` has no such section, the OR runner does not re-inject). | `domain/chat/assembly/assemble.ts` renders the marker ONLY when a preset section references it · `contracts/preset` `DEFAULT_PROMPT_CONFIG` omits the section | DECIDE: implicit-prepend at the assembler (neo's C1 cache-anchor invariant — synthesize the marker when the chat has a summary but the preset omits it) OR add a `compact_summary` section to `DEFAULT_PROMPT_CONFIG` | decision (owner) — feature live now | **DONE 2026-07-16** (ruling: assembler implicit-prepend — the C1 cache-anchor arm): `withImplicitCompactSummary` (`assemble.ts`, commit `09d825fc`) synthesizes+prepends the marker section ONLY when the chat carries a non-empty summary AND no enabled `compact_summary` section exists; the synthetic section carries no `template` so `templateFor` falls back to `DEFAULT_MARKER_TEMPLATES`; `DEFAULT_PROMPT_CONFIG` untouched. Both arms regression-tested (`tests/server/domain/chat/assembly/`). | done |
| PD-141 | `character.duplicate` does not clone the source's attached `character_books` (neo carried them on duplicate). Defensible under D28 (book junctions key on the live character id → a fresh id = empty set) but a behavior change with no recorded decision. Surfaced 2026-07-16 (neo-parity domain audit). | `domain/character/verbs/duplicate.ts` (verbatim card copy, no book-carry op injected) | DECIDE: carry attached books on duplicate (match neo — inject a book-clone op) OR ratify the clean-copy behavior as intended (D28) | decision (owner) | **DONE 2026-07-16** (ruling: carry the REFERENCES — "duplicate carries world-info references; books aren't stored on the character"): fresh `character_books` junction rows point the SAME book ids at the new character (roles preserved, fresh `createdAt`), books never cloned, source junctions untouched (commit `c83bded2`; verifier CONFIRMED — bite re-proven, cross-tenant leak ruled out via the owned-source gate, PK `(characterId, worldBookId)` excludes collisions). The op is world-info-owned (`createCopyCharacterBooks`, persistence-factory variant of the injected-op precedent) wired at the compose root. | done |
| PD-142 | durable credential-mutation audit trail | `packages/server/src/domain/credentials/contract/service.ts` · `packages/server/src/domain/credentials/verbs/` · `packages/server/src/foundation/observability/audit.ts` | every successful credential mutation and security-sensitive refusal records a durable audit row | credential mutation paths | **PARTIAL — [#2476](https://github.com/Inktomi93/orbweaver/issues/2476):** add, remove, mark-revoked, mark-revoked-by-user, and clear-revoked await the injected `ctx.audit`, and production binds it to `logAudit`. The provider-auth owner-mismatch refusal is also audited. A successful owner-scoped `auth_failed` revoke in `maybe-revoke-on-auth-failed.ts` writes the revoked state and emits `securityEvent` but does not call `ctx.audit`; its live callers in `packages/server/src/domain/chat/engine/engine.ts` and `packages/server/src/domain/inference/role-clients.ts` add no audit. The focused test pins the state transition and mismatch audit but not a successful-revoke audit. | |
| PD-143 | derive-modernization W5 tail: two dedup candidates left un-consolidated (deliberately, per re-sweep). (a) discovery `ScoreBadge` (`features/discovery/components/corpus-search-results.tsx`) has a SINGLE consumer file — the audit's "promote ScoreBadge" was skipped as speculative (no 2nd consumer to dedup; promoting a 1-user component is YAGNI). (b) `MacroPreviewField` — the W1-deferred `character-facet-editor.tsx` `ExampleMessagesField` vs `character-greeting-preview.tsx` `GreetingBody` twins have genuinely DIVERGED (parsed-transcript vs themed-Markdown-bubble-with-alternates preview · bound `MacroField` vs raw array-element `MacroTextarea` edit · inline-toggle vs `GreetingActions` placement) — a shared abstraction would be leaky. Surfaced 2026-07-16 (W5 wave). | `discovery/components/corpus-search-results.tsx` (ScoreBadge in-file) · `character/components/{character-facet-editor,character-greeting-preview}.tsx` | PROMOTE ScoreBadge to `discovery/components/` IF a 2nd score-badge consumer lands · RE-EVALUATE a `MacroPreviewField` extraction IF the two preview fields re-converge | monitor (no trigger yet) | deferred | |
| PD-144 | character portability does not carry attached-book references: export/import never touches `character_books` (verified by grep during the PD-141 verify — the character domain's ONLY junction access is the injected duplicate-carry op), so an exported+imported character arrives with zero attached books while an in-app duplicate now keeps them (PD-141 asymmetry). Surfaced 2026-07-16 (PD-141 verifier flag). | `domain/export`/`domain/import` character arms (no junction bundling); `domain/world-info` owns the junction | DECIDE: bundle attached-book REFERENCES in the character export shape + re-link on import (the portability twin of PD-141's carry — needs a book-identity story across installs) OR ratify that portability ships cards bare (books travel via the world-info export lane) | decision (owner) — next portability touch | **DONE 2026-07-16** (ruling: carry the references — the PD-141 twin): optional `data.orbweaver_attached_books` (`{worldBookId, role}`) on the V3 card, round-trips both codecs (PNG round-trip test-pinned); export selects the junction directly (export's documented direct-read seam); import re-links via the world-info-owned `createLinkCarriedBooks` op behind the owned-source gate (foreign/missing ids skip into `attachedBooksSkipped` — leak test proven non-vacuous); embedded-lorebook clone runs ONLY when no reference resolves (same-install = exact junctions, foreign install = ST-interop clone). Verifier CONFIRMED. Known cosmetic edge: a hand-crafted card with duplicate refs inflates `attachedBooksLinked` (single junction row still — PK dedupes); primary-demotion on re-import matches the PD-141 posture (no demote-others). | done |
| PD-145 | autosave entity-switch isolation for character theme, room overrides, and group config | `packages/client/src/features/character/components/character-appearance-tab.tsx` · `packages/client/src/features/chat/components/{room-overrides-form,group-config-form}.tsx` | D78 autosave session boundary | D78 wave | **DONE**: all three consumers mount through `createAutosaveEntityForm` boundaries whose entity ids carry the selected character/chat identity. The `no-manual-autosave-flush` gate remains active as the structural seal. | done |
| PD-146 | chat behavior settings and runtime consumers | `packages/client/src/features/chat/components/chat-behavior-{message-handling,streaming}-section.tsx` · `packages/contracts/src/settings/index.ts` · `packages/server/src/domain/chat/` | — | — | **DONE**: the two contributed sections autosave the `chat` settings group. The composer honors `enterSends` and `continueOnSend`; streaming honors `streamScrollMode`, `smoothStream`, and `smoothStreamCps` (current defaults: follow, on, 80 cps). Server foreign inputs apply custom stops, bounded auto-continue, and bounded auto-swipe; the contracts tuple and section models carry the current additional controls. | done |
| PD-149 | per-user connection store — `connectionsChanged` (declared in `UserBusEvent`, `contracts/user-bus/index.ts:16`) has no per-user connection entity CRUD today: the model catalog is global/admin (`refreshCatalog`), and a user's provider/role routing lives in USER SETTINGS (`settingsChanged` covers it instead). Owner-deferred: the `user-bus-deferred-member` policy carries it as typed warning debt (#1822) pending the per-user connection store landing; `bus-producer-coverage` skips exactly that `(union, member)` row and reports every other declared member. | `domain/connection` (no per-user entity store) | a per-user connection store wired to emit `connectionsChanged` on CRUD, then delete the gate's DEFERRED entry | the per-user connection store lands | owner-deferred | |

\| PD-147 | `streamScrollMode` (`follow \| pin-prompt`) — the stream-display scroll pref PD-146 planned. Deferred OUT of the PD-146 client lane 2026-07-16 because the spec's assumption was inverted: smooth-stream pacing was already built (wired trivially), but **pin-prompt is feature-sized** — ChatGPT-style "scroll the just-sent prompt to the top and hold while the reply grows" requires redesigning the sealed a11y-sensitive `@orb/ui/primitives/message-list` (a new `scrollMode` prop + a domain-supplied pin-target/`pinToIndex` handle + a bottom spacer so a short reply can still pin). Deliberately NOT shipped as an inert pane knob — rendering an unwired option is the exact PD-146 anti-pattern. | not built — `follow` is the sealed `MessageList` behavior; no `streamScrollMode` field exists | the `MessageList` primitive arm (scrollMode + pinToIndex + spacer), then add `STREAM_SCROLL_MODES`/`streamScrollMode` to `UserSettings.chat` + a Select in the chat-behavior pane's Streaming group; side-eye the scroll behavior (hard to pin in CT) | a focused MessageList lane | ready | |

\| PD-148 | preset sampling params are NEVER applied to the wire request — the turn path reads only `promptConfig.params.advanced.roleHandling`; `params.stop`/`temperature`/etc. are carried on the preset but nothing folds them into `req.intent` (the client sends only a `Partial<UserIntent>` override). Surfaced 2026-07-16 by the PD-146 server lane (which scoped strictly to `customStoppingStrings` via `intent.stop` to avoid an unratified behavior change). | `domain/chat/engine/pipeline.ts` (the request seam) · `contracts/preset` `params` (carried, unconsumed) | RULED (owner, 2026-07-16): this is a real gap — fix it PROPERLY and in FULL with the turn path (no partial band-aid): audit the whole `promptConfig.params` surface (sampling + stop + customParameters), establish the intended fold semantics from the ledger/Spine-Config (preset params = the base generation config; per-turn `UserIntent` = the override; PD-146 `customStoppingStrings` joins the merged stop set), then fold at the ONE sampling seam, regression-pinned | owner-ruled — in progress 2026-07-16 | **DONE 2026-07-16** (verifier CONFIRMED): `foldGenerationParams` at the pipeline seam — preset `params` = base, per-turn `UserIntent` overrides field-wise (spread-based, explicit falsy overrides win), `advanced` merges one level, `stop` = 3-source union (preset + per-turn + PD-146 host stops, first-occurrence dedup); the effective intent feeds SHAPE/FIT/REQUEST (fitBudget now honors preset `maxOutputTokens`/`maxContextTokens`); empty-base fast path returns the per-turn intent BY REFERENCE (DEFAULT-preset byte-identity pinned; `DEFAULT_PROMPT_CONFIG.params` = `{}`, ratified defaults-as-base). `customParameters` (the top-level PromptConfig blob — editor wrote it, runners consumed it, the domain→wire hop never existed) now rides `TurnRequest.customParameters` → compose → `ChatRequest`; pollution belts (schema superRefine + runner deepMerge FORBIDDEN_KEYS) intact. The dead twin `advanced.openrouterCustomParameters` (declared-only, zero writers/readers) DELETED from contracts. Residual note: the `as "chat-completions"\|"responses"` cast at `entry/compose/chat.ts:344` is unsound for `anthropic-messages` (harmless today — no anthropic path reads `customParameters`/`tools`); tighten if an anthropic runner ever spreads `req`. | done |

> **Symbol-census findings (2026-07-05, `f133379`+).** A repo-wide export/collision census (`scratch/symbol-census.ts` — 3,458 exports / 1,047 files → 40 collisions; jscpd clone rate **1.11%** vs the 5% gate; verb-family analysis found essentially nothing) surfaced six genuine code-symbol debts, **PD-121–126**, all now cleared — see [`Core-Debt-Cleared-Ledger.md`](../history/Core-Debt-Cleared-Ledger.md). The bulk of apparent duplication is cake-forced mirrors (packages that can't import each other restate shapes + pair them with tests) + the per-domain verb-factory convention (`createList`/`createGet`/… ×10) + the documented `assembly`↔`substrate` DI seam — confirmed CLEAN, deliberately NOT filed. Re-run as a periodic drift check: `pnpm exec tsx scratch/symbol-census.ts` (alongside `pnpm cpd`).

## Post-gut documentation follow-ups (2026-07-03)

Durable home for the non-PD debt the domain-vs-code gut rollout surfaced (previously scattered across agent reports + session notes). These are doc/law relocation + freshness work, not code-symbol PD rows. Do as one consolidated pass.

### ~~Promotes~~ — LANDED 2026-07-03

embeddings/search "ONE engine" → `Knowledge-Cluster.md`; AAD belt → `Spine-Identity-and-Auth.md`; the other 6 → `Core-0-Architecture-and-Structure.md` §8 (cross-cutting invariants). Originals kept below for provenance.

- **AAD `${userId}|${provider}` byte-identical belt** (credentials) → ledger/Core-0 (carried in `persistence/aad.ts` + `infra/crypto/secrets.ts` + schema header + aad.int pin).
- **`ResolvedCredential` brand — one construction home** (`substrate/mint.ts`) → ledger.
- **embeddings ONE-write-path** (only `embeddings/persistence` writes vector tables; `writeHubScoreRows` sole `hub_score` setter) → Core-0/ledger.
- **notifications durable-first ordering** (INSERT-then-publish; cross-cutting — inbox + chat bus both) → Core-0.
- **secret type-level-unrepresentability in wire event unions** (closed discriminated union of strict objects, ids+literals only) → Core-0.
- **agent-principal recipient refusal — `notifications.record` is the ONE write chokepoint** every producer inherits → ledger.
- **search = the ONE retrieval engine** (memory+discovery call it, never reimplement cosine; memory holds zero cosine/vector-write) → Core-0.
- **settings `defineVersionedConfig` one-primitive rule** + **settings-table tenancy rule** (settings owns the KV mechanism; tenants own blob meaning) → Core-0/Spine-Config.
- **admin users-read chokepoint** (only admin+sessions+entry read `users`; every admin read gates first) + **audit-ordering** (check→write→audit; a refused write leaves no phantom row) → Core-0.

### Doc-freshness — shared docs carry superseded facts (fix or delete)

- `Core-Laws-and-Precedents.md` §Settings: "promote IMPORT_DEFAULT_SOURCE to AppSettings" — DROPPED (PD-15 cleared); VLLM\_\*\_CONCURRENCY landed born-in-DB (no env floor).
- `Spine-Identity-and-Auth.md`: present-tense pre-build ("resolved twice per request", old viaFallback/viaCookie names, "role gates NOTHING") — all built; flip to built-state + absorb the two de-numbered sessions invariants (token-hash-not-stored, per-request revoked/expired/enabled recheck).
- `preset` contracts (~L175): names a non-existent `GUIDED_ACTION_IMPLS` identifier.
- ~~stale PD-5 OIDC comments in `entry/http/auth-routes.ts` (claim OIDC unbuilt; it's built + tested).~~ FIXED
  2026-07-10 (task #62): the `auth-routes.ts` `OidcMintStore`/`OidcRoutesDeps` DEFER comments + the oidc-store
  "interim GC / no scheduled sweep" header now describe reality — the scheduled reap landed as
  `transport/jobs/oidc-gc-scheduler` (hourly `deleteExpired` sweep of expired/abandoned PKCE transactions).

### Enable-now — gates whose triggers have landed

- ~~**7 deferred gates whose triggers have now FIRED** — build each + promote to active gates~~ — DONE 2026-07-03 (PD-116, commit c3cd691): all 7 (`vector-scope-derived`/`turn-identity`/`membership-enforcer`/`solo-byte-identical`/`bus-producer-coverage`/`member-card-clamped`/`owner-role-split`) are ACTIVE in `Core-Enforcement-Active-Gates.md` (`solo-byte-identical` as the property suite).
- Minor code-adjacent drift from the core-standardization pass: ~~`tools/grit/README.md` plugin list vs `biome.json`~~ RECONCILED 2026-07-03 (all 32 biome-activated plugins documented — the 4 missing rows `no-layout-context-props`/`no-untrusted-html-in-main-dom`/`no-external-media-without-gate`/`theme-override-only-via-scope` added; the old "19 vs 23" counts were themselves stale); STILL OPEN: `tests/support/fixtures.ts` header is forward-looking-aging (db still not a fixture); the council-review record (now compressed in `Core-Planning-and-Checklists.md`) wants a `history/Council-Review-2026-06-25.md` home.

### Consolidate — concept docs — DONE 2026-07-03 (except the mechanical de-dangle below)

- ✓ `core/Knowledge-Cluster.md` created (the producer→store→consumer boundary + 6 cross-domain invariants, all `sg`-verified). `memory.md` git rm'd — recall/build semantics are code-carried (`chat/memory/` headers + `constants.ts`), decision record = ledger D55; it also carried a full internal self-duplicate (the drift disease).
- ✓ `participants-agents-identity.md` git rm'd. Persona three-axis residue → `Spine-Identity-and-Auth.md`; agent-principal future owned by `proposed/agent-principal-design/`; everything else already homed (Tier-3b, D28, schema).
- **REMAINING — mechanical de-dangle (track for the sub; facts already inline, some cites reference dead §numbers → drop those):**
  - ~40 code cites of `memory.md` / `knowledge-cluster` / `participants-agents-identity.md` → repoint to `core/Knowledge-Cluster.md` (cluster) or `Spine-Identity`/`Tier-3b` (identity). Full file list: the concept-consolidation agent report (2026-07-03).
  - AGENTS de-dangle/trim: SUBSUMED — AGENTS-1/2/3 merged into `AGENTS.md` (2026-07-03), so the memory/participants authoritative pointers + the §"Memory ↔ search"/untangle prose became `Knowledge-Cluster.md` pointers in `AGENTS.md` §6. Remaining external de-dangle: the Tier-3b code-comment pointers (movement table / `db.md` / §D2), per the Tier report.
  - **Refresh** `Spine-Identity-and-Auth.md` (`Status: planning` → built): Principal mint built (`entry/auth/seam.ts`, the ONE construction site); `chat_participants.role='host'` now GATES (roster authority, host-handoff, membership-derived "my chats" — no `chats.ownerId`); D60 4-kind shape CHECK live (`human|character|agent|observer`, `chat_participants_kind_shape`).

### Structural / mechanical

- FLAG\[PD-101..107] at-seam comments (registry rows exist; add the in-code `FLAG` when each seam is next touched; 97/98/99 cleared 2026-07-03; 100 cleared 2026-07-04).
- `Core-Shared-Dissolution.md` — migration doc: kit-purity law stays core, the symbol map → history/.
- ~~**AGENTS-1/2/3 trim + merge**~~ — DONE 2026-07-03: trimmed to doctrine+index, then MERGED into ONE `core/AGENTS.md` (§1-8, domains.md folded in). Pain Ledger → `history/Pain-Ledger.md`; AST-scan → `history/Grounded-Intelligence-AST-Scan.md`; string-union dispatch → `Spine-TypeScript-and-Patterns.md`. Documentation-Law moved into `core/`.
- Corpus-wide `pnpm format:docs` sweep → flip `check:docs` to blocking → add frontmatter to surviving docs.
- ~~`tsdoc/syntax` cleanup → flip warn→error~~ — DONE 2026-07-03: 255 violations across 45 files cleaned, `tsdoc/syntax` is now `error` on server/kit/db/contracts.

## OPEN SECURITY FINDINGS (verified against the tree; each names its exploit path and its blocker)

### AUTHFIX-2 — the `/api/_debug/*` admin arm was opened by the UN-CREDENTIALED owner fallback

**Status: CLOSED 2026-08-07 (DEBUGGATE lane), including the e2e coupled site that blocked the first attempt.
Was HIGH wherever the origin port was reachable. Kept in full because the finding's SHAPE recurs.**

**What landed.** `entry/auth/seam.ts`'s debug-gate verdict now requires TWO conditions, not one: the caller
presented a CREDENTIAL, and that credential's principal satisfies `can(p,'admin',global)`. The credential
test is a positive allow-list `Record<Principal["via"], boolean>`. Deliberately not a `via === "fallback"`
negative check: the mapped Record is exhaustive, so a fourth `via` member is a **tsc error** at the
allow-list rather than a silent default-to-admitted. (Verified by planting a 4th member: `TS2741` at
`seam.ts`, plus `TS7053` on the index. Fail-closed by construction beats fail-closed by vigilance.)

**AMENDED 2026-09-02 (#1193) — the ruling survives, its INPUT changed.** Two arms of that allow-list were
absolutes that had become false, and the fix cost the owner a live debug session:

- `fallback:false` was a door closed to its only user. On a DEV box the un-credentialed LOOPBACK owner
  fallback IS how the operator authenticates — the same request the gate refused was already being served as
  `role:"owner"` on every tRPC surface (measured live: an un-credentialed loopback `sessions.me` answered
  `globalRole:"owner"` while `/api/_debug/info` answered 401), so the dev bug-report button (#1095) 401'd for
  the owner's own session. The arm is now POSTURE-scoped, and the posture is not decided in the seam: it is
  `foundation/env::resolveOwnerFallbackCredential` (`NODE_ENV !== "production" && AUTH_FALLBACK === "owner"`),
  living beside the superRefine that rules the same hazard. **Production is excluded in EVERY mode,
  `single-user` and break-glass included** — behind a same-host proxy every external request is a loopback
  peer there, and this surface holds more than the app does (raw provider request bodies).
- `header:true` was safe only by a CALL-SITE OMISSION (the old verdict re-resolved from bare headers with no
  `peerIp`, so the unsigned raw-`Remote-User:` path fail-closed and only a signed JWT could reach it). The
  verdict now judges the request's ALREADY-RESOLVED principal (spine invariant #2 — the re-resolution was
  itself the reason the loopback arm could not mint at this door), so that accident is gone and the condition
  is stated: `header` is `selectSignedForwardJwt(headers, config) !== null`, the same predicate
  `resolveForwardHeader` branches on. An unsigned proxy-asserted admin still needs `DEBUG_TOKEN`.

Also landed: every refusal now carries an arm-naming `reason` in its body (`the admin-session arm refused
…, and no x-debug-token header was sent`), because "the debug gate admits an admin session or x-debug-token"
is not something an owner can act on — that unactionable line is what let this defect sit.

The gate itself was NOT changed — the admin-arm-then-token order stands, and fix shape (ii) (making the
bypass conditional on `expectedToken !== undefined`) was rejected: it leaves a bypass that exists whenever no
token is configured, i.e. a conditional control rather than no bypass.

**The e2e blocker, resolved:** `E2E_DEBUG_TOKEN` (`tests/e2e/support/modes.ts`) is threaded into all three
mode `webServerEnv`s and read by one `debugHeaders()` helper in `tests/e2e/support/trpc.ts`, which now
credentials all three witnesses (`fetchWireCaptures` / `inspectChatDb` / `fetchDebugErrors`).

**Enforcers (the finding's real lesson — the exemption behind this gate was prose-only, constitution §2):**

- `tests/server/entry/debug-gate.suite.test.ts` — the admission invariant across every AUTH_MODE × Host ×
  token-state, through the REAL seam and the REAL registrar, asserting refusals by **body** (a bare status
  cannot tell the gate's 404 from an unregistered route). 43 of its rows failed on the pre-fix source with
  "expected 200"; 67 pass after. Positive controls (admin cookie, owner cookie, signed-JWT SSO admin,
  operator token) prove the instrument can still observe a 200. **Since #1193 it also reproduces the
  resolve-once middleware** (the gate reads the principal off the context, so registrar-only wiring would
  test a shape that does not exist) and adds the PEER × POSTURE dimensions: every refusal row now runs with a
  LOOPBACK peer — the worst case, where the fallback arm really does mint an owner — and the arm-3 rows pin
  admit-on-dev, refuse-on-LAN-peer, refuse-when-demoted, refuse-in-production, plus the unsigned-header
  refusal. Planted controls: hard-coding `fallback:false` fails exactly the 4 admission rows (including the
  bug-report WRITE row that reproduces the owner's 401); `header:true` fails exactly the 2 header rows.
- `tests/e2e/smoke.spec.ts` — a `@smoke` (push-tier) pin on a REAL BOOTED STACK: un-credentialed
  `/api/_debug/info` → 401, with-token → 200. **This is the only assertion in the tree that proves the gate
  end-to-end**, and it doubles as the proof that `E2E_DEBUG_TOKEN` actually reaches the server. Needed
  because the debug-witness consumers are all `@live`-gated and never run on push.

**Two corrections to this entry's original write-up, both material:**

1. **The published interim mitigation "unset `DEBUG_TOKEN`" was FALSE and has been removed.** The admin arm
   short-circuits the `expectedToken === undefined` → 404 branch as well as the token comparison, so unsetting
   the token disabled nothing. Proof from the tree rather than theory: the e2e harness set `DEBUG_TOKEN` in
   none of its three modes and its debug reads worked. Only `IP_ALLOWLIST` ever mitigated. A published
   mitigation that does not mitigate is worse than none — it is what the operator reaches for first.
2. **The admitted set is owner OR admin, not owner-only** — `requireAdmin` → `can(p,'admin',global)` →
   `ROLES_FOR_GLOBAL_ACTION.admin = ["owner","admin"]` (D17).

**A fourth witness nobody read as one:** `tests/tooling/stack-mode.test.ts` carried a comment reading
"MEASURED against the live stack 2026-08-06: an unauthenticated GET /api/\_debug/info returned 200". The hole
was observed on the live box a day before it was filed, and recorded as a *probe-design* lesson (don't infer
posture from a boolean) rather than as a security defect. **A surprising measurement filed under the wrong
heading is a finding in hiding.**

**Scoping the principal-blind reads — assessed and deliberately NOT done.** The `@owner-scope-ok` marker in
`foundation/observability/debug/inspect/config.ts` said the exemption ends "if `/api/_debug` ever admits a
per-user principal". Post-fix the admitted set is a box-level `DEBUG_TOKEN` holder or an owner/admin session.
Per D17 an `admin` already holds `admin.resetPassword`/`setEnabled`/`setRole` and can assume any account at
will, so filtering these reads by the caller's own `ownerId` would raise the confidentiality bar by **zero**
while breaking the probe's actual job — an operator reading OTHER users' rows is the host plane (D20). It
would be a boundary that looks like a control without being one. The marker's real lack was an ENFORCER, not
a filter; it has been rewritten to name the suite above and the exact admitted set. **The exemption still ends
if the admitted set ever widens BELOW admin** — turn that suite red before widening anything.

**Known degradation (accepted):** the stack tool's `probeDebug` (`tooling/src/stack/ops/prod-state.ts:126`) used a 200 from an un-credentialed
`/api/_debug/info` as "the STRONGEST instance identity available" (the serving process's own `pid`). On an
armed stack that probe now gets 401, so identity falls back to the `ss` socket table via
`debug.pid ?? listenerPid(port)`. Degrades, does not break. The `DebugPosture` doc comments in
`tooling/src/stack/contract/types.ts` were truth-repaired in the same commit: `open` is now an alarm, not the
normal dev posture.

---

**The original finding, preserved.**

**The chain, all four links verified:**

1. `foundation/observability/debug/routes.ts` → `createDebugAuthMiddleware`: the `adminAuth.isAdmin(headers)`
   arm calls `next()` **before** the `expectedToken` check. Its own doc says the arm exists for "an admin
   session COOKIE".
2. `entry/app.ts` wires it in production: `auth: { expectedToken: env.DEBUG_TOKEN, adminAuth: { isAdmin:
   deps.seam.isAdmin } }`.
3. `entry/auth/seam.ts::isAdmin` calls `resolvePrincipal`, which honours ALL THREE paths — including the
   origin-gated owner fallback. So the "admin cookie" convenience silently became "the owner fallback opens
   the debug API".
4. `ownerFallbackAllowed` returns `true` UNCONDITIONALLY under `AUTH_MODE=single-user`. Under an SSO mode it
   is `isLocalOrigin`, which reads the **client-supplied `Host` header** (that file's own comment concedes it
   is relying on a proxy to rewrite Host).

**Exploit:** `curl -H 'Host: 127.0.0.1' http://<box>:<port>/api/_debug/db/chats` — no cookie, no
`x-debug-token` — from any network position that can reach the origin port. Under `single-user` not even the
Host header is needed. Reachable routes include `/db/chats`, `/db/chat/:id`, `/config/user`, `/errors` and —
when `WIRE_CAPTURE=on`, as the live `.env` has it — `/wire/captures`, i.e. provider request bodies.

**Why the blast radius is total rather than per-tenant:** these routes are principal-BLIND. They read the
whole DB scoped only by caller-supplied query params; `debug/inspect/config.ts` carries the explicit marker
`@owner-scope-ok: un-principal HOST read (D20) … if /api/_debug ever admits a per-user principal, this read
must take an ownerId and filter on it`. The gate IS the entire boundary.

**Not caused by, and not widened by, D135.** The fallback principal already carried `role:"owner"` (stamped);
after D135 it carries `role:"owner"` (read). The gate consumes a boolean that was already `true`. D135 is in
fact marginally tighter — an owner row below `owner` now closes the gate where it previously could not.

**The fix + its blocker.** The one-liner is `principal.via === "fallback" → false` in `entry/auth/seam.ts::isAdmin`
(restoring the arm's own documented "admin SESSION" intent; `DEBUG_TOKEN` remains the headless credential and
`scripts/probes/*` already send it). It is blocked because `tests/e2e/support/trpc.ts` reads these routes with
a bare `fetch` and no token — its comment states the dependency verbatim: *"the debug gate's admin tier passes
under single-user AUTH_MODE"* — and `tests/e2e/support/modes.ts` sets `DEBUG_TOKEN` in **none** of the three
mode envs, so with the arm closed the gate would 404 ("debug API disabled") and take the whole e2e
debug-witness surface (`fetchWireCaptures`/`inspectChatDb`/`fetchDebugErrors`) with it.

**Two fix shapes, in preference order:** — RESOLVED: (1) was taken, (2) rejected as a conditional control.

1. Thread `DEBUG_TOKEN` into the three e2e mode envs + one shared header helper in `tests/e2e/support/trpc.ts`,
   THEN flip the `via` check. Clean, unconditional, no new semantics.
2. Gate the flip on `expectedToken !== undefined` inside `createDebugAuthMiddleware` ("a token the operator
   CONFIGURED may not be bypassed by an un-credentialed principal"). Closes it on the live box, leaves the
   token-less e2e stacks working — but it is a conditional control, and it needs the `routes.test.ts`
   conformance rows swept in the same commit. (`routes.test.ts` needed no sweep under shape (1): it drives the
   middleware with a MOCKED `isAdmin`, so the seam's verdict change is invisible to it — all 13 rows stayed green.)

**Interim mitigation (superseded by the fix; kept for the correction it carries):** `IP_ALLOWLIST` was the
only one that worked — it 403s before any auth runs. This entry also advised "unset `DEBUG_TOKEN`", which was
**wrong**: the admin arm short-circuits the `expectedToken === undefined` → 404 branch too, so unsetting the
token left the surface open. Unsetting `WIRE_CAPTURE` narrowed the blast radius (no provider bodies) but did
not close the surface.

### SUMMARIZE-SUB — the stored `summarize` source list is WIDER than the firewall enforces (RESOLVED)

**Status: RESOLVED (owner ruling, 2026-08-07: "drop `max-pro-sub` from `SUMMARIZE_SOURCES`; the 2026-07-27
split stands — summarize does not run on the metered Claude subscription"). `contracts/settings/index.ts::SUMMARIZE_SOURCES`
now reads `["openrouter", "vllm"]` and agrees with the firewall's `summarize` row again. The per-field
`.catch(undefined)` self-heal meant no migration was needed for any already-stored value. Kept below as the
resolved-debt record.**

**Was OPEN, needing a PRODUCT call, deliberately not guessed (2026-08-07, found by the ROLECLIENTS lane).
NOT a vulnerability — the enforcement is the STRICTER of the two, so nothing is admitted that shouldn't be.**

`contracts/settings/index.ts::SUMMARIZE_SOURCES` accepts `openrouter | vllm | max-pro-sub`; the runtime
credential firewall's `summarize` row (`infra/providers/roles/firewall.ts::ROLE_SOURCE_POLICY`) permits only
`openrouter | vllm`. The comment above the contracts list claimed the two "mirror" each other — false, and
truth-repaired in the same commit as D135 clause G. **User-visible symptom:** a user who picks the offered
`max-pro-sub` summarizer stores a valid setting whose every summarize dispatch is refused with
`ProviderError(kind:"forbidden")` — **including the box owner's**, since the firewall row omits the source for
everyone, not just non-owners. So it is a dead option in the picker, not an owner-only one.

**The call is which side moves**, and it is a product decision about what the app offers, not a security one:

1. **Add the firewall row** (`summarize: [… , "max-pro-sub"]`) if summarization should be allowed to spend the
   metered owner subscription. Note the sub is owner-gated at the mint, so a non-owner picking it would then
   get a `requireOwner` refusal at resolve time instead — a different error, still a refusal.
2. **Drop `max-pro-sub` from `SUMMARIZE_SOURCES`** if it should not. This is the smaller change; the per-field
   `.catch(undefined)` self-heals any already-stored value back to the role default, so no migration.

Until it is ruled, neither list may be cited as proof of the other's contents.
