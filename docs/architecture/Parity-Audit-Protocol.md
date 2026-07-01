# Neo-Tavern → Orbweaver Parity Audit Protocol & Log

**Context:** The goal is to ensure 100% feature and behavioral parity with `neo-tavern` when migrating domains into `orbweaver`. However, Orbweaver's rigorous architecture (strict boundaries, exhaustiveness, one-way flow, zero shortcuts) MUST NOT BE COMPROMISED. We don't port bad patterns; we port *capabilities*. 

**🛑 CRITICAL DIRECTIVES FOR ALL AGENTS: DO NOT SKIM 🛑**
1. **Read Every Word:** Before touching a domain, read its architecture docs and the pain ledger (`docs/architecture/core/Core-Laws-and-Precedents.md`) IN FULL. Use `view_file` sequentially if >800 lines. Skimming leads to severe architectural violations.
   - **MANDATORY PRE-REQUISITE:** You MUST read `AGENTS-1-Architecture.md`, `AGENTS-2-Spine.md`, and `AGENTS-3-Domains.md` in `docs/architecture/core` in full before doing ANY domain work. The architecture rules are law.
2. **No `grep` for Code Structure:** When searching `neo-tavern` for interfaces or function definitions, use `ast-grep` or `ts-morph` (NEVER plain `grep`). You MUST capture the JSDoc comments to understand the original intent.
3. **Global Search Before Drop:** Before declaring a capability "dropped" or missing, you MUST perform a `grep_search` across the ENTIRE `docs/architecture` directory to verify it wasn't deliberately moved (e.g., `attachTagToTargets` moved from `tag` to `character` as `bulkAddCardTag`).
4. **No Sideways Imports:** Always respect the 1-way flow. Use `ctx` dependency injection for cross-feature needs.

If you have just woken up and lost context: **START HERE.** Pick the next unchecked domain from the log below and execute the workflow.

## 🔍 The Protocol Workflow

For any domain being audited, follow these exact phases in order:

### Phase 1: Context Loading
1. **Locate the Domain:**
   - `orbweaver`: `packages/server/src/domain/<domain>`
   - `neo-tavern`: `/home/inktomi/inktomi-stack/development/neo-tavern/src/server/domain/<domain>`
2. **Read the Docs (NO SKIMMING):**
   - Did you read `AGENTS-1/2/3` in full yet? If not, do that now.
   - Read `docs/architecture/domains/<domain>.md` in Orbweaver.
   - Read `README.md` in the Neo-Tavern domain directory.

### Phase 2: Structural Recon (USE AST TOOLS)
1. **Extract Original Intent:** Use `ast-grep outline` or the provided `scratch/find_interfaces.ts` harness to extract the public interfaces from `neo-tavern` *with their JSDoc comments*.
   - *Example:* `npx tsx scratch/find_interfaces.ts "/home/inktomi/inktomi-stack/development/neo-tavern/src/server/domain/<domain>/**/*.ts" <TypeName>`
2. **Side-by-Side Comparison:** Compare `contract/service.ts`, `contract/params.ts`, `contract/views.ts`, and Zod schemas. Look for dropped fields, flipped cardinalities, or missing bulk tallies (`{ updated, skipped, missing }`).
3. **The Global Search Check:** If a feature is missing in Orbweaver, do NOT assume regression yet. Run `grep_search` across `docs/architecture/` to see if it was deliberately moved or redesigned.
4. **Check the Debt & Build Plans:** Before calling something "missing", verify it isn't deliberately deferred. Check `docs/architecture/core/Core-BUILD-PLAN.md` and `docs/architecture/core/Core-Audits-and-Debt.md`. A "missing" feature is often already tracked as a phase 2 debt item.

### Phase 3: Behavioral Deep Dive
Compare `verbs/` and `persistence/`:
- **Error Handling:** Did Orbweaver replace a silent skip (e.g. `return null`) with an atomicity failure (e.g. `throw` inside `Promise.all`)?
- **Side-Effects:** Did we miss cascading deletions, metrics tallying, or event emissions?

### Phase 4: Audit and Surface Findings
**Rule:** We are strictly auditing and logging. DO NOT implement any code fixes or tweaks.
- Summarize the discovered parity gaps.
- Separate accidental regressions from deliberate architectural redesigns (as proven by your global searches).
- Present the findings to the user.

### Phase 5: Log It
Update the Running Log below. Check off the domain and write a concise bulleted summary of the findings (both regressions and deliberate changes).

---

## 📋 The Running Log

- [x] **tag**
  - **Finding:** Canonicalization bypass. Missing `normalizeTagName` in `updateTag` and empty-string guards in both `createTag` and `updateTag`.
  - **Reverted Mistake:** We initially thought `attachTagToTargets` (One-to-Many library bulk-edit) was dropped. A directory-wide search revealed it was intentionally MOVED to the `character` domain as `bulkAddCardTag`. We reverted the architectural violation of adding it back to `tag`.
- [x] **admin**
  - **Verified:** Perfect parity. No capabilities dropped, 2-layer role gates are intact, atomic `WHERE role <> 'owner'` is correctly applied on mutations, and TOCTOU handle conflicts translate cleanly. No ICKs found.
- [x] **assets**
  - **Deferred:** `maxBytes` constraint dropped from `storeBlob` input params (in neo-tavern it bounded non-HTTP callers like zip extract before magic bytes sniffing). Added as debt item PD-67.
  - **Deferred:** GC/Backfill/Fsck verbs (`backfillAvatars`, `collectGarbage`, `reapIfOrphan`, `fsck`, `rebuildFromTree`) deliberately omitted for the v2 maintenance wave (tracked in PD-26).
- [x] **buddy**
  - **Verified:** Parity with neo-tavern maintained. Verified adherence to Orbweaver's `agent` pattern/injection model.
  - **Verified:** State logic (`proposals.ts`) assumes single-replica execution, consistent with expectations.
- [x] **character**
  - **Redesign (Verified):** `description` and `creatorNotes` were deliberately dropped from `CharacterSummary` (`views.ts` docs confirm it is a "light" read-model). Catalog labels are now powered by the `discovery` domain's `character_summaries` distillation table.
  - **Finding:** `tags` is missing from `CharacterSummary` (dropped in transition from neo-tavern).
  - **Finding:** Bulk mutations (`bulkRemove`, `bulkArchive`, `bulkAddCardTag`) return `void` instead of the `{ updated, skipped, missing }` tallies used in neo-tavern. (Note: The `void` return types and throwing on partial failures appear to be an intentional Orbweaver design for junctions. We will not implement partial writes).
- [x] **chat**
  - **Deliberate Structural Change:** `setChatPersona` was intentionally dropped (moved to the `persona` domain). 
  - **Deliberate Structural Change:** 9 new verbs (`createInvite`, `kick`, `acceptHostHandoff`, etc.) were added, implementing the Part III Unified Roster / Multi-Human design.
  - **Deliberate Behavioral Change:** `deleteMessages` now throws `ChatNotFoundError` for a missing ID instead of silently returning the view, enforcing stricter atomic assertions (though this partially diverges from the bulk mutation rule of returning a discriminated union).
  - **Regression (Side-Effects):** `deleteMessages` no longer calls the injected `applyStatsDelta`. I verified against `domains/stats.md` which explicitly states that `delete-messages` must push live rollup upserts into its canon batch. This was missed during the port.
  - **Regression (Side-Effects):** `logAudit` is missing from the chat domain. `Tier-2-Foundation.md` confirms it moved to `foundation/observability/audit` and should be called by the domains; chat failing to import it means permanent deletions leave no audit trail.
  - **Deliberate Schema Change (NOT a regression):** `deleteMessages` dropping the `chats.messageCount` recompute is correct. I checked the db schema—Orbweaver removed the denormalized `messageCount` column entirely, replacing it with a dynamic aggregation in `persistence/queries.ts`.
- [x] **connection**
  - **New Domain (Verified):** The `connection` domain correctly absorbed `domain/models`, `routing.ts`, and capability derivation as specified in `connection.md`.
  - **Capability Consolidation:** The capability system correctly collapsed `ChatModel` and `FAMILY_CAPS` into a single `ModelCapability` descriptor across all paths, avoiding multiple mid-translation table reads.
  - **Esoterics & Guards:** Load-bearing quirks (the 3-stage model lookup, anchored family detection regex, and `pickOrModel` cold-cache skip) were preserved accurately in the `substrate` and `catalog` subsystems.
  - **No Regressions Found:** The architecture matches the specified boundaries and invariants perfectly.
- [x] **credentials**
  - **Verified (Un-inversion):** The `_shared/credentials.ts` inversion was successfully resolved. Turn-time resolver (`resolve.ts`), CRUD, and metadata parsing are now correctly homed in the domain and exposed via `CredentialsService` or injected ops.
  - **Deliberate Structural Change:** The return types for `remove`, `markRevokedByUser`, and `clearRevoked` were simplified to `void` (from `{ deleted: boolean }` and `{ ok: true }`), matching Orbweaver's standard junction return patterns.
  - **Deliberate Schema Change:** `revokedReason` was dropped from the DB schema and `CredentialView`, becoming purely a log-only field.
  - **Deferred:** The `custom_openai` metadata fields `includeBody`, `excludeBody`, and `responseMap` were deliberately omitted from `providerMetadataSchema` for v1 and are tracked as phase 2 debt (PD-12).
  - **Verified (Security):** The AES-256-GCM AAD invariant (`${userId}|${provider}`) remains byte-identical and is isolated in `persistence/aad.ts`. The `max-pro-sub` owner-gate is correctly enforced before minting the opaque `MaxProSubCredential` type.
- [x] **embeddings**
  - **New Domain Validation**: Confirmed successful consolidation of all 6 vector write sites (from `corpus` and `memory` in neo-tavern) into `embeddings.store()`. The exhaustive `SourceKind` and `SourceLens` dispatch axes are strictly enforced.
  - **Bug Fix Verified**: The neo-tavern bug where `hub_score` was erroneously nulled during vector updates (`chat/memory/db.ts`) is structurally fixed. `upsert*` queries deliberately omit `hub_score`, preserving advisory-stale CSLS scores on re-embed.
  - **Schema & Staleness**: `sourceText` was correctly replaced by `content_hash` across all 4 vector tables. The hash acts as an upstream short-circuit to bypass expensive embedding calls.
  - **Deliberate Structural Change**: The `scopedCharacterId = ''` sentinel (mentioned in `embeddings.md` esoteric #1) was deliberately replaced in implementation by a real `CharacterId` (the synthetic group-as-character). The type `DigestStoreParams` strictly rejects the `''` sentinel in favor of this cleaner design.
  - **Status**: Audit passed; the new vector substrate correctly centralizes writes and properly delegates hubness writes to the `discovery` seam.
- [x] **export**
  - **Shared Serde Core**: Confirmed that `export` is no longer a drifting mapper. It successfully composes the centralized `@orb/server/kit/serde/card` mapper (`buildCardV3`) and the `@orb/kit/png-card-chunk` pure string-based byte codec.
  - **Lossiness Fixes Verified**: The `raw` blob fallback has been correctly eliminated in favor of reading typed columns directly (`creator`, `cardVersion`, `regexScripts`, `extensions`). App-authored cards now round-trip identically.
  - **Tags Redesign Verified**: The export verb correctly reads `character_tags WHERE status='accepted'`, completely dropping the old `proposedTags` array, closing the round-trip gap where accepted tags were silently lost.
  - **Deferred Scope**: `exportChat` is officially deferred as Promotion Debt (PD-42) blocked by the chat domain (P5) rework, which explains its absence from the `ExportService` interface.
  - **Status**: Audit passed; architecture matches the `export.md` invariant (pure assembly logic, delegates parsing/encoding to the shared kit).
- [x] **import**
  - **Shared Serde Core**: Confirmed. `substrate/card.ts` correctly composes the central `@orb/server/kit/serde/card` normalizer (`cardFromJson`) and the `@orb/kit/png-card-chunk` pure byte codec (`readCardChunk`).
  - **Lossiness Fixes Verified**: `cardToCreateInput` correctly maps the semantic fields (`creator`, `cardVersion`, `regexScripts`, `extensions`, `depthPrompt`) into the `CreateCharacterInput`, completely dropping the `raw` blob payload.
  - **Proposed Tags Fix**: Verified. It extracts the raw tag strings using a tolerant local helper, and calls the injected `attachCardTag` operation for each tag. The root binds this to `tag.attachCardTagByName` with `status: 'pending'`, perfectly matching the redesign.
  - **D28 Flattening & Event Emission via PD-43**: Verified. `import.md` originally planned for import to use a direct db-writer (`character-writer.ts`) and emit `character.updated` itself. However, because Promotion Debt `PD-43` was implemented, `character.create` now supports provenance natively. As a result, import delegates entirely to the injected `ctx.createCharacter()` op. The event emission *is* happening (fired by the `character` domain), so the invariant is satisfied without import needing its own `emit` op.
  - **Deferred Scope (Bulk Loader & Chats)**: `importChats`, `importPersonas`, and the bulk `collectBundlesFromDir` loader are missing from the domain as they are officially deferred under Promotion Debt `PD-77`. `enqueueBackfill` is deferred under `PD-78`.
  - **Status**: Audit passed. The architecture correctly matches the composition invariants, with the acceptable pivot of delegating character creation to the `character.create` front door rather than writing directly to `@orb/db`.
- [ ] **persona (FAILED)** _(re-audited from scratch 2026-07-01)_
  - **Verified (10-verb parity):** all 9 neo verbs carry over byte-equivalent semantics (create/list/get/update/remove + createFromCharacter + the connection trio), plus the new `setActivePersona` (ex-PD-20, wired host-or-self via injected `requireChatAuthorOrHost` — replaces neo chat's `setChatPersona`). List ordering (`createdAt DESC`), the no-foreign-existence-leak NotFound collapse, and the idempotent junction semantics (`disconnected: boolean`) all match neo exactly.
  - **Verified (schema movement):** `chats.personaId` gone; `pinnedPersonaId` → `anchorPersonaId` (SET NULL on persona delete); `chat_participants.activePersonaId` live (stamped at `start-chat.ts`, written by `set-active.ts`). `character_personas` keys on `characters.id` with CASCADE; `messages.personaId` SET NULL (contract-doc'd cascade behavior intact).
  - **Verified (createFromCharacter, non-lossy):** reads the D28 flat `characters` row (no version join — deliberate, D28), stamps `metadata: { sourceCharacterId, swapMacros }` provenance (an improvement over neo's lossy plain-string mint), shares the avatar asset FK. `substrate/macro-swap.ts` preserves the two-pass `{{personaChar}}`/`{{personaUser}}` intermediate-token collision defense byte-identically vs neo's inline version.
  - **REGRESSION (re-confirmed live, 2026-07-01): the null-anchor `{{user}}` fallback is dropped.** Neo: `chat/assembly/context.ts:213` — `pinnedPersona = chat.pinnedPersonaId === null ? activePersona : …`, so with no pin, card-derived sections + character-sourced WI still resolve `{{user}}`/`{{persona}}` against the active persona. Orbweaver: `entry/compose/chat.ts:481` loads the anchor independently (null stays null), `domain/chat/assembly/context.ts:373` passes it through with no fallback, and `assembly/macros.ts:84` degrades to the literal `"User"` (+ empty `{{persona}}`). The anchor CAN be null (startChat param optional; persona delete → SET NULL). Nuance: the turn-pipeline NAME-stamp path (`engine/pipeline.ts:126`) DOES fall back (`activePersona?.name ?? pinnedPersona?.name`) — the loss is specifically macro resolution in card-derived sections + `source === "character"` WI entries (`assembly/context.ts:218`). No doc/D-entry sanctions the drop (grep of docs/architecture came up empty) → accidental regression, needs an architecture decision (fallback to active persona? to the host's active persona in multi-party?).
  - **Status**: **FAILED** — the one regression above needs a Nate/architecture decision on null-anchor semantics in the multi-party model. Everything else passes. (Snapshot note: chat/entry are actively being wired (P5 tail); re-check `entry/compose/chat.ts` after the guided/tool-loop chunks land.)
- [x] **preset** _(was MISSING from this log; audited from scratch 2026-07-01)_
  - **Verified (core parity):** the 6-verb surface is identical (create/list/get/update/remove/resetToDefault). The COW-on-system-default fork (`verbs/update.ts` `cowFork`), the NIL-TypeID sentinel (`preset_00000000000000000000000000`, all four pivot sites), the two-armed read scope (`ownerId = userId OR ownerId IS NULL`), the owned-only write scope, the lenient `parsePromptConfig` at the read seam, and the `schemaVersion`-gated boot reseed (`seed.ts`) are all preserved exactly.
  - **Deliberate behavioral change:** `resetToDefault(SYSTEM_DEFAULT_PRESET_ID)` — neo threw `PresetOperationError("preset_system_default")` (its reset delegated to `update`, so the guard prevented a ghost COW fork); orbweaver's reset no longer delegates (direct `updatePresetRow`), so the ghost-fork hazard is structurally gone and it returns the row unchanged as a benign no-op (documented in `contract/service.ts` JSDoc). Error → success is client-visible but coherent.
  - **Deliberate read-model change:** `PresetSummary` drops `ownerId` (replaced by the derived `isSystemDefault` flag — the client no longer needs the domain sentinel) and drops `schemaVersion` (now `PresetDetail`-only).
  - **Deliberate:** `remove` returns `void` (was `{deleted: true}`) — the standard orbweaver return pattern (credentials precedent). The `preset_forbidden` reason code was dropped — verified dead vocab (declared in neo `contract/errors.ts:10`, thrown nowhere).
  - **Deliberate (inline-documented only):** `list` ordering flipped `updatedAt DESC` → `createdAt ASC` ("the seeded default sorts first" — `persistence/queries.ts:listReadable`). Client-visible ordering change; no doc mandates either.
  - **Finding (audit fidelity):** the audit `metadata` payloads were dropped — neo stamped `{name, kind}` on create, `{edits, configUpdated}` on update, and a distinct `FORK_PRESET` entry with `{forkedFrom}` on the COW fork. Orbweaver's `AuditEntry.metadata` field EXISTS (persona uses it) but preset passes none, and the COW fork audits as a plain `preset.create` — fork provenance is indistinguishable in the audit trail.
  - **Finding (cosmetic):** the COW fork's default name dropped the `(edited)` suffix (neo: `${base.name} (edited)`; orb: `base.name`) — an unnamed fork shows up as a second "Default" in the picker. Also the seed `kind` value changed `"general"` → `"system"` (free-text label, undocumented).
- [ ] **search**
- [x] **notifications**
  - **Durable-First Implementation**: Verified. The `record` verb perfectly satisfies the invariant by executing `insertNotification` before returning, with the monotonic `seq` computed safely via `MAX(seq)+1` entirely within the database.
  - **Closed & Secret-Free Events**: Verified. `notificationEventSchema` uses a strict `z.discriminatedUnion` of `z.object` shapes that actively strip unknown keys, mathematically preventing any smuggled secrets or API keys from ever touching the database or the wire. `recipientUserId` is flawlessly enforced on all variants.
  - **Recipient-Scoped Inbox Limits**: Verified. Every query (`selectInbox`, `markReadScoped`, `dismissScoped`) inherently filters by `notifications.recipientUserId = principal.userId` at the DB-level, meaning it is physically impossible for a user to query or probe another user's inbox.
  - **Deferred Scope**: The cross-feature wirings to the `chat` domain are correctly deferred: the after-commit bus fan-out is tracked under `PD-23`, and the transaction-executor boundary wrap is tracked under `PD-24` (both blocked until `chat` lands).
  - **Status**: Audit passed. A flawless implementation of the spec, with all deferred chat-wiring safely logged.*
- [ ] **sessions**
- [ ] **settings**
- [ ] **stats**
- [ ] **workloads**
- [ ] **world-info**
- [x] **discovery** (formerly `corpus`)
  - **Structural Recon**: Confirmed that the domain correctly implements the mandates from `discovery.md`. The `embedAndStore` writes were entirely expunged; it now only reads vectors via `@orb/db` and runs in-RAM clustering (`@orb/kit/vector-math`).
  - **Seams**: The critical `writeHubScores` seam is properly injected into `DiscoveryContext` via `EmbeddingsService["writeHubScores"]`. The `summarize` role is passed as a pure function thunk, eliminating credential leaking into discovery.
  - **Deferred Scope**: Verified that deferred systems like `chat_duplicates` and `image_analytics` (FLAG[PD-40]) are correctly omitted from the current `DiscoveryService` interface.
  - **Status**: Audit passed; architecture matches the `discovery.md` invariant (reads vectors, writes only its own rollups + hubness via injection).
