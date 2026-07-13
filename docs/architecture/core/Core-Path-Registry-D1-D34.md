---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — Path/Home Registry: D1–D34

> Split-sibling of `Core-Laws-and-Precedents.md` §7 — decisions D1–D34 (backend: entry shape, kit/contracts homes, schema/ownership model). D-numbers are stable global ids (cite as `§7 Dxx`). Slimmed to standing rulings 2026-07-13 (D66): the journey is git history; only what binds a future change lives here.

---

- **D1** — The auth seam is `entry/auth/seam.ts` — the ONE Principal construction site (never in `compose/`).

- **D2** — `entry/` bucket shape is LOCKED: root files (`index.ts`, `app.ts`, `lifecycle.ts`) · `auth/` (the seam) · `boot/` (migrate/seed/reclaim) · `compose/` (non-auth wiring) · `http/` (routes) · `import/` (bulk composition driver). New files land INSIDE the right bucket; the lock is the bucket roles, not a closed file list.

- **D3** — Bulk import: `entry/http/upload.ts` (multipart route) delegates to `entry/import/run-profile-import.ts` (composition driver). Two responsibilities, both real.

- **D4** — `WorkloadRunnerEnv` builder = `entry/compose/runner-env.ts`; the type stays in `domain/workloads/contract`.

- **D5** — `lifecycle` = `entry/lifecycle.ts`, not foundation.

- **D6** — Image variant transform = `infra/image` (`sharp` adapter behind an `imageTransform` op, injected into `domain/assets/verbs/resolve-variant.ts`). Width-snap is domain policy; `sharp` is infra I/O.

- **D7** — vLLM = `infra/providers/vllm/` (nested under providers: `engine/` + `surfaces/`).

- **D8** — Claude Agent SDK backend = `infra/providers/backends/agent-sdk/` (+ `session/`).

- **D9** — `content-hash` = `@orb/server/kit/content-hash` (node-only-pure; NOT `@orb/kit`).

- **D10** — `replay-buffer` + `stats-tally` = `@orb/kit/{replay-buffer,stats-tally}` (pure primitives, not feature-internal).

- **D11** — `@orb/kit/assets` (the `isAssetHash` guard) is required.

- **D12** — Identity/session contracts split: `@orb/contracts/identity` (`Principal`, `ResolvedIdentity`, `UserRole`) + `@orb/contracts/session` (singular). The domain stays `domain/sessions` (plural).

- **D13** — `tests/kit` exists — the mirror rule governs (`packages/kit/src` ⇒ `tests/kit`).

- **D14** — `substrate/`/`persistence/` are OPTIONAL template slots — a feature without one is deliberate, not an omission.

- **D15** — Uniform directory-modules: every importable module is a directory with `index.ts`; internals are flat + relative-imported. The five app packages (kit, contracts, db, server, client) use the identical `exports`/`imports` maps (`"./*": "./src/*/index.ts"`, `"#*"` likewise, `.` → `./src/index.ts`). `@orb/ui` is the sanctioned exception: its nested `primitives/`/`charts/`/`content/` layout uses an explicit per-subpath `exports` map — every target still a directory `index.ts` front door; never "normalize" it to the wildcard (a single template cannot address nested groups). Constraint: Node `exports` wildcards resolve ONE template with no flat→dir fallback, so a mixed flat/dir layout forces exception lists that rot — never mix.

- **D16** — Group/multi-human chat: group-ness is DATA, not a branch — no `if (isGroup)`; solo = roster-of-1, byte-identical. Homes: roster + `chat_invites` + `pending_turns` → `domain/chat`; the durable per-user notification inbox/stream → `domain/notifications` (chat emits via an injected op); presence → transport (SSE ref-count per userId), injected into chat. Member room/corpus search is host-only in v1, derived from membership (not a stamped digest owner, per D20); a membership-gated union widens it for free later.

- **D17** — Global roles: `owner | admin | user`. `owner` = the single box/wallet holder (only role that grants/revokes admin; never demotable; exactly one). `admin` = delegated (own creds, never the owner's box sub; cannot grant admin). `can(p,'admin',global)` passes for owner ∪ admin; `requireOwner` gates box-credential mint + admin grant/revoke. Owner ⊇ admin lives ONLY in the `can()` seam — no scattered `role === 'admin'`. The box = two resource classes: hosted credentials/wallet (`max-pro-sub`, OR key) = owner-only, non-owner use requires explicit consent, default OFF; local compute (vLLM + in-process light tier) = shared with authenticated principals, count-budgeted + concurrency-capped, default ON. Agents inherit creds from their principal's owner-delegation, never the box sub for non-owners. Per-chat `chat_participants.role: host|member` is an orthogonal axis. (Extended by D65: OIDC group-derived roles.)

- **D18** — Chats are MEMBERSHIP-scoped: no `chats.ownerId` column. Access = `requireParticipant`/`requireHost`; the host (`chat_participants(role='host')`) is the ONE home for room authority, `runAsUserId`/credential funding, and the digest owner-stamp source. "List my chats" is pure membership. Two ownership categories exist repo-wide: single-owned (`ownerId` + `fetchOwned`) and membership-scoped (`chat_participants`); `fetchOwned` never applies to chats.

- **D19** — Turn identity: `Principal.userId` = the authenticated caller of THIS request. `triggeredBy` = the human responsible for an AI turn (spend/abort/attribution; equals the caller on a direct send, the chain-starting human on AI→AI auto turns). `runAsUserId` = the host whose box/creds fund the turn. Three distinct concepts; no `callerUserId` term.

- **D20** — The vector substrate derives ownership, never stamps it: vector rows carry only their producer FK; search derives owner-scope from the producer's category (digests/segments → membership; character embeddings → `characters.ownerId`; image embeddings → the owned asset). `embeddings.store` takes producer FK refs, never an ownerId. Security gates: (1) no raw vector-table read outside the ONE search engine — producer-scope is a mandatory param; (2) scope BEFORE rank/collapse — cross-user same-content rows must never collapse into a caller's results; (3) the producer gate (`fetchOwned`/membership) is the real authz; the embedding scope is defense-in-depth.

- **D21** — Assets/PNGs/images are PER-USER single-owned; nothing is global. `assets.ownerId`, `unique(ownerId, hash)`, per-user-keyed CAS (`<owner>/<ab>/<cd>/<hash>` — no cross-user dedup or existence oracle). `/blob/:hash` is OWNER-GATED: the proxy may skip forward-auth for image GETs, but the APP is the gate (same-origin session cookie → `fetchOwned` → serve or 404); `Cache-Control: private, immutable`. A cross-origin future uses short-lived signed URLs. ONE membership exception: a roster participant may fetch a shared-chat character's avatar + expression-sprite set (the in-room public face) — never the card, never arbitrary blobs.

- **D22** — Member card visibility is a host-set per-room dial: `chatMetadata.group.memberCardVisibility` ∈ `name-avatar | sheet | sheet+lore | full`, seeded from `userSettings.groupDefaults.memberCardVisibility` (default `sheet`). Member view is read-only + while-present; owner/host always sees `full`; edit/clone/export stay owner-only. Reserved (not v1): a per-character `maxMemberVisibility` ceiling.

- **D23** — The ownership-stamp rule: *can you reach a row's owner by following ONE FK to an owned entity?* Yes → DERIVE (no `ownerId` column). No → KEEP `ownerId` (it's the partition key, not a mirror). KEEP: top-level owned entities (characters, personas, presets, world_books, tags, user_credentials, workloads) + parentless per-user aggregates (owner_stats, daily_stats, model_stats, theme_clusters, keyword_cooccurrence). DERIVE: everything with a single owning parent (embeddings/digests/segments per D20, character_summaries/keyword_profiles/stats, digest_theme_assignments, duplicate_*_pairs per D24) and association/curation rows anchored by a required FK to owned canon (gallery_items, roster_preset_members, proposals, character_sprites, imagery_generations). Only TRUE PRODUCERS (the user's authored artifact with no owned anchor) stamp `ownerId`. A new table's `ownerId` must pass the test or it's a doubling.

- **D24** — NO polymorphic association tables: cross-entity relations are per-type FK tables with CASCADE (`duplicate_character_pairs`, `duplicate_chat_pairs`, the tag junctions), never `(type, untyped_id)` soft refs. ONE sanctioned soft-ref exception: `audit_logs.entity_id` (append-only log that must outlive its referent).

- **D25** — `chats` carries no backend session state: agent-sdk session lineage/staleness lives entirely in the backend session store (`session_entries`), keyed by chatId. `chats.compactSummary` + `compactedAtSeq` STAY — a portable compaction checkpoint (chat canon, used by stateless runners too).

- **D26** — `messages` is a pure SLOT (id, chatId, seq, role, attribution, `selectedVariantId`, excludedFromPrompt, timestamps — no content/economics); `message_variants` is the full generation record. Every message has ≥1 variant (uniform, no if-is-user). `selectVariant` flips the pointer — zero copy. Attribution is slot-level (a swipe never changes the speaker).

- **D27** — Forks = copy + `chats.parentChatId` self-FK (SET NULL on parent delete). Lineage walk is membership-gated — a fork grants no parent-chat read. ONE branch axis (chat forks); no message-level branching, no shared-history DAG.

- **D28** — No `character_versions`: the card is the flat, live `characters` row, edited in place. History = `character_snapshots` (append-only JSON blobs, git-commit-style) that NOTHING FKs or gates on; restore = copy blob → live row (snapshotting current first). Digests key on chatId + `chat_digest_speakers` — no character-version anywhere.

- **D29** — `exportChat` gates `requireHost` in v1 (bulk profile export iterates hosted chats). Widening to `requireParticipant` is a deferred additive change. `exportCharacter` stays `fetchOwned`.

- **D30** — `chat_tags` is a PER-USER overlay: it keeps its OWN `ownerId` (the tagger; the D23 no-derivable-owner case since chats are ownerless), `unique(chatId, tagId, ownerId)`, gated `requireParticipant`, each user sees only their own tags. The other four tag junctions derive from their owned target.

- **D31** — The provider-source axis has ONE home: `CredentialSource` (+ tuple + schema) in `@orb/contracts/credentials`; `@orb/contracts/connection` re-exports it as `ChatSource`. `ChatApi` (the protocol axis — `CHAT_APIS` in connection, currently agent-sdk/chat-completions/responses/anthropic-messages) is a separate union; the tuple is the truth, not this parenthetical.

- **D32** — `kit/message-role` owns `MESSAGE_ROLES`/`MessageRole` (THE canonical role axis) + the ST numeric bimap; the wire schema (`messageRoleSchema`) lives in `@orb/contracts/chat` importing the tuple down. `kit/injection` owns `InjectionPlacement {depth, role}`, `MAX_INJECTION_DEPTH`, `injectionDirectiveSchema`, `resolveInjectionPlacement(raw, defaults)` — every injector (world-info, author's notes, persona, memory recall, guided) imports these; consumers share the SHAPE, never the default values.

- **D33** — Guided-action definitions live ONLY on the preset (`contracts/preset`: `GuidedActionsConfig`/`DEFAULT_GUIDED_ACTIONS`/`PromptConfig.guidedActions`, co-located with every other default model-facing template). There is NO `AppSettings.guidedActions` and no settings-side resolution; consumers do `activePreset.guidedActions ?? DEFAULT_GUIDED_ACTIONS`.

- **D34** — A db enum column derives from a CONTRACTS tuple: any enum axis a db column constrains lives in `@orb/contracts/*` (db derives + CHECK-enforces + test-mirrors it; e.g. `WORKLOAD_KINDS`/`WORKLOAD_STATUSES` → contracts/workloads, `IMAGE_LENSES` → contracts/embeddings). db never re-spells a union and never falls back to bare `text()` to dodge an import.
