# Orbweaver architecture-docs inconsistency audit (2026-06-26)

> **STATUS: REMEDIATED (2026-06-26).** All blockers, majors, and minors below were fixed in a two-phase
> pass (authority docs locked first, then domain/core docs aligned by 6 agents). Questions Q1 and Q3–Q9
> were resolved into the docs; **Q2 (ChatSource vs CredentialSource consolidation) is the only item left
> open** — it changes the contracts dependency graph and awaits a direction decision. This file is kept as
> the audit record; the findings text below is historical (it quotes the pre-fix state).

Method: 5 auditor agents read **every** `.md` in `docs/architecture/` **in full** (no grep-skimming).
The 21 `domains/` docs were sliced one-per-auditor; all 26 non-domain "core" docs (roots + `spine/` +
`tiers/` + `reports/`) were read in full by **all five**. Authorities: `reports/DECISIONS-LEDGER.md` §7
(D0–D30) and `tiers/db.md`. Coverage: 47/47 docs (domains ×1, core ×5 = 134 full reads).

Severity: **blocker** = a load-bearing contradiction that would mis-build; **major** = a real
contradiction of a decision/schema; **minor** = drift/stale-ref/mechanical; **question** = needs a call.

Rollup (de-duplicated): **3 blocker · 13 major · ~26 minor · ~9 question.**

---

## BLOCKERS

### B1 — The agent-sdk SESSION home points both ways (D8)
The authority side (ledger **D8**, `chat.md:64-66,185-186`, `providers.md:207`,
`participants-agents-identity.md:149`, `db.md:147`, `BUILD-PLAN 4b`) homes the SDK session substrate in
`infra/providers/backends/agent-sdk/session/` and makes the chat domain **stateless-first**. Three docs
still say it lives in the **chat domain**:
- `domains.md:11, 229-231` — "session-seeding logic … lives in the chat domain and must NOT move into providers" (the strongest contradiction).
- `domains/sessions.md:50-53, 86, 220` — ownership table + movement row keep it "in `chat`".
- `spine/identity-auth-permission.md:83` — `session_entries` "owned by `domain/chat`".
Fix: reconcile all three to D8 (substrate → agent-sdk backend; only `session_entries` table → `@orb/db/schema/sdk-session.ts`).

### B2 — `max-pro-sub` gated on "admin" instead of "owner" (D17) — 3 docs
D17 makes the box credential **owner-only** (`requireOwner`); `providers.md` + `identity-auth-permission.md`
were reconciled, but the credential/connection/buddy docs were not:
- `credentials.md:82-84, 95-96, 326` — "unconstructable except after `role === 'admin'`"; also references `principal.isOwner`, which is **not a field** on the canonical `Principal` (`identity` spine: `role: UserRole` + `via` only).
- `connection.md:291` — "credentials.resolve gated behind `principal.role === 'admin'`" (also violates identity-spine inv #6: the only `role==='admin'` site is inside `can()`).
- `buddy.md:75, 369, 488` — "max-pro-sub is admin-only"; buddy is the **owner's** agent inheriting the owner's sub (ledger §3).
Fix: `requireOwner` / owner-delegated inheritance throughout.

### B3 — `buddy.md` resolves a dropped column (D18)
`buddy.md:343, 381` — `createBuddyObserverReads` does "narrow chats `ownerId` reads" and exposes
`resolveChatOwner`, but **D18 dropped `chats.ownerId`** (chats are membership-scoped; owner = the
`chat_participants(role='host')`). Fix: resolve the chat host via the roster, not a dropped column.

---

## MAJORS

### M1 — `db.md:138` lists `duplicate_pairs` in the KEEP-`ownerId` set (D23/D24) — *canonical-doc self-contradiction* (found by 2 auditors)
Contradicts ledger **D23** ("DERIVE once modernized to per-type FK") + **D24** + `db.md:161`'s own row
("`ownerId` dropped per D23 — DERIVE"). Fix the KEEP list in db.md §D23 audit.

### M2 — `structure.md:234` "versions = restorable history" — pre-D28 (found by 3 auditors)
§6 partitioning row still describes the de-pin model. **D28** deleted the version table (flat `characters`
+ `character_snapshots`, gating nothing). `structure.md` is a top authority doc; `domains.md:12` and
`_FANOUT-BRIEF.md:114` were updated, this was not.

### M3 — `persona.md:220-221` "`character_books` keys on cv by design" (D28)
"Do not normalize these to the same key" actively mis-states the schema — D28 re-keys `character_books`→
`characters.id` (db.md:164; participants-agents-identity:124-127). Both junctions key on `characters.id`.

### M4 — `search.md:97-98, 107-108` "owner-scoped digest scan" (D18/D20) — *leak-relevant*
`digests`/`segments` verbs + `scope.ts` framed as "owner-scoped". Under D18 (`chats.ownerId` dropped) +
D20 (chat digest/segment scope DERIVES from membership, host-only v1), an "owner-scoped digest scan" is
no longer expressible. Re-frame as membership-derived (the `vector-scope-derived` gate). The D20
"scope BEFORE cosine rank AND before `content_hash` collapse" rule is also not stated as a search invariant.

### M5 — `settings.md` omits the D17 owner-box AppSettings toggles
`settings.md` (§(b):85-94, "owns":21-47) lacks `allowNonOwnerLocalCompute` (default ON), the per-member
local-compute COUNT budget, and `allowNonOwnerMaxProSub` (default OFF) — which `settings-and-config.md:104-112`
+ D17 mandate. New settings fields with no home in the owning domain doc.

### M6 — `admin.md:20` sweeps `setRole` into `requireAdmin`
"Every one is admin-gated (`requireAdmin`)" captures `setRole`, but `admin.md:35-39` + D17 + identity-spine §3
say admin grant/revoke is **owner-only** (`requireOwner`). Carve `setRole` out of the blanket.

### M7 — `assets.md` `characters.importHash` not in db.md's D28 column list
`assets.md:50, 273-276, 417` treats `characters.importHash` (sha-256 of whole file) as a live column +
integrity guard, but db.md's flat-`characters` enumeration names `contentHash` (and serialization-core:98
says `cardContentHash` is over semantic fields, not PNG bytes). Two distinct hashes; one isn't in db.md.
Add `importHash` to db.md's `characters` columns or reconcile the guard.

### M8 — `preset.md:44` puts the UserIntent snapshot on `messages.params` (D26)
D26 makes `messages` a pure SLOT with **no** `params`; the snapshot lives on `message_variants.params`.

### M9 — `connection.md` internal + cross-doc home drift (cluster)
- `:141` re-exports `ResolvedConnection` from `./contract/params` while `:156` says it lives in `@orb/contracts/connection` and is "NOT re-exported from this front door" — a symbol can't be both. (`ResolvedConnection` is claimed in **three** homes: `:83 results.ts`, `:141 params`, `:205/322 routing.ts`.)
- `:240` homes `RoleClients` at `@orb/contracts/connection/roles.ts`, but `buddy.md:354`, `providers.md:210`, `shared-dissolution.md:121`, and the boot DAG all use `@orb/contracts/role-clients`.

### M10 — provider-result contract home drift
`embeddings.md:221, 319` home `EmbedRequest`/`EmbedResult` in `@orb/contracts/embeddings`, but
`providers.md:188` + `shared-dissolution.md:121,180` + BUILD-PLAN + ledger contracts-DAG home the four
provider-result contracts in `@orb/contracts/providers` (the group `role-clients` depends on first).
`EmbedResult` double-homed.

### M11 — custom-BYO `modelProfile` two homes
`connection.md:239,518,680` + `providers.md:197,591` put it on `UserSettings.customEndpoint.modelProfile`;
ledger §2 + `credentials.md:466` home it on `providerMetadataSchema.modelProfile`. Ledger wins.

### M12 — §7.5 union name drift (`no-inline-union-redecl` needs one name)
- `preset.md:116,172` `GuidedAction` vs `string-union-dispatch.md:46,122,183` `GuidedActionKind`.
- `search.md:304` and `embeddings.md:330-332` each claim to be the single home of the lens union (`image-raw|image-captioned|segment|digest|card-text`) — producer (embeddings) should own it.

### M13 — `stats.md:225` `personaUsage` keys on dropped/renamed columns
"a chat's active OR pinned persona" — `chats.personaId` is **dropped** (D18; active persona is per-participant
`chat_participants.activePersonaId`) and "pinned" was renamed `anchorPersonaId`.

---

## MINORS (drift / stale-ref / mechanical)

- **Stray markup committed:** `tiers/foundation.md:457-458` ends with literal `</content>` / `</invoke>` lines (found by 4 auditors). Delete them.
- **Gate-count drift (found by 4 auditors):** canonical is **13** gates (`structure.md §7`, `_STATUS:88`, `BUILD-PLAN:20`), but stale counts persist: `string-union-dispatch.md:275-277` ("six … eight"), `reports/COUNCIL-REVIEW.md:13` ("8/11"), ledger §7 R10 ("6→11"), and cross-refs in `db.md:13`, `infra.md:12`, `transport.md:16` ("the six gates").
- **D28 residue:** `_STATUS.md:57` ("versions = restorable history"); `tiers/foundation.md:140` ("version-collapsed character"); `assets.md:41-42,139` ("current versions"); ledger §2:63-64 + D23:152 ("current-version card" / "character_summaries via cv").
- **D17 "last-admin" residue:** `spine/testing.md:163`, `PRE-SCAFFOLD-CHECKLIST.md:102` (renamed last-owner / owner-immutability guard; PRE-SCAFFOLD is internally inconsistent with its own §C3:120-121).
- **vector-math path:** `embeddings.md:239,240,429` uses `@orb/kit/math/vector`; everyone else uses `@orb/kit/vector-math` (ledger D10). Also `embeddings.md:429` inv #8 names a kit module as owner of the lens→table map (that's `embeddings/store.ts`, §7.5).
- **CAS sharding:** `assets.md:85,187` shows `ab/cd/<hash>` (no owner prefix); D21 + `infra.md:86` require `<owner>/ab/cd/<hash>` (assets.md:27,256 correct).
- **neo domain count:** `domains.md:7` + `_STATUS:108` say "18"; `_FANOUT-BRIEF:215` lists 20.
- **notifications verb naming:** producer op is `notifications.emit` (chat.md:227, domains.md:31) but the defined verb is `record` — the `emit`↔`record` relationship is unstated (`notifications.md`).
- **admin.md numbering:** `:20,135` say "11 verbs" but enumerate 10 (7 files); `:106` re-exports `ActorRole` though `:175` collapses it into `UserRole`.
- **Stale-open vs ledger §5:** `admin.md:169,363-368` + `identity-auth-permission.md §6:328-331` list the `can()` seam shape as OPEN though ledger §5:99 decided it (DomainForbiddenError, ResourceRef union, lives in `admin/guard.ts`).
- **Broken §-refs:** `import.md:436` → character.md "§Version history mutations" (no such section); `chat.md:153-156,379-380` flags `knowledge-cluster §3/§8` as stale though it's already amended (kc:101-102).
- **Schema homes unnamed in db.md:** `chat_locks` (chat.md:390-394) and `oidc_transactions` (sessions.md) are load-bearing but not enumerated in any schema-file listing.
- **Misc naming:** `refreshCatalog`(connection.md:180) vs `refreshCatalogSnapshot`(transport/providers); `resolveRole` vs `resolveRoleConnection`; catalog-entry type spelled 4 ways (connection.md); `WorkloadModelsEnv` keeps "Models" though models→connection merged (workloads.md:278).
- **WI contract home:** `world-info.md:123-124` targets `WiBusEvent`/`WorldInfoScope` to `@orb/contracts/chat-bus`; canonical is `@orb/contracts/world-info` (shared-dissolution:112). `world-info.md:58 vs 114` internal contradiction on `WorldBookRole` home.
- **preset.md:44** cites neo "migration 0002" as live (orbweaver starts from a fresh `0000_baseline`).
- **discovery.md:341,601-602** shows the segmenter re-home as OPEN though ledger §2:64 committed `→ memory/substrate`.
- **caption home:** `embeddings.md:95` "caption from memory's summarizer or discovery" vs ledger §2 + embeddings open-decision:444-448 ("caption inline in `embeddings/indexer`").
- **summarizer:** `knowledge-cluster.md:247` "summarizer (local-first GGUF → hosted fallback)" vs `providers.md §2b:639` ("summarize is NOT a model — a `chat` turn shaped").
- **embeddings indexer events:** `embeddings.md:140` declares `onDigestCreated`/`onSegmentCreated` handlers but `:273-280` + `domains.md:183-189` disagree on whether digests/segments fire events or are written by direct `store` calls.

---

## QUESTIONS (need a decision/confirmation)

- **Q1 — can()/`requireParticipant`/`requireHost` home.** Ledger §5 + identity §4 say the `can()` wrappers live in `domain/admin/guard.ts`; but identity §2/§2a + admin.md:81-82 + the ENFORCEMENT membership-enforcer frame `requireParticipant`/`requireHost` as **chat's** build (reads `chat_participants`). How does chat reach the one seam without a cross-feature import? Pin one home + document the seam.
- **Q2 — `ChatSource` vs `CredentialSource`** (connection vs credentials) have byte-identical members but are two separately-homed unions (both registered as distinct axes). Intentional, or a drift/dedup risk?
- **Q3 — `chats.memoryEnabled`** (settings.md:312 / settings-and-config esoteric #5) referenced as live; not in db.md `chat.ts`. Confirm or add.
- **Q4 — `oidc_transactions`** needs a db.md schema home (likely `schema/sessions.ts`).
- **Q5 — `reconcile-world-state`** workload kind is in `WORKLOAD_KINDS` (workloads.md:104) but no stub runner is listed; RUNNERS must be exhaustive — confirm the stub.
- **Q6 — `search.corpus`** injected op (chat.md:88,195,224) uses the retired `corpus` name — confirm it's the intended search method, not the dissolved corpus domain.
- **Q7 — `export.md:277-279`** insists a 2-member `ExportChatFormat` union be gated by `no-inline-union-redecl`, but ledger §5 + ENFORCEMENT only fire that gate on ≥3-member unions — overclaim?
- **Q8 — `tag.md:14,17`** "five polymorphic junction tables" wording reads against D24 ("NO polymorphic association tables") — they're per-type FK; only the *dispatch* is polymorphic. Reword?
- **Q9 — `string-union-dispatch.md:64-67`** shows `users.role` as 2-member `admin|user` (legit neo-source "shape of the rot") — confirm a reader won't mistake it for the live `owner|admin|user` axis.

---

## What is clean
The two authorities (ledger §7 D1–D30, db.md) are mutually consistent on every D-decision cross-checked,
**except M1** (db.md's own `duplicate_pairs` KEEP/DERIVE self-contradiction). The D26/D27/D28/D29/D30
re-architecture landed consistently in the owned domain slices (`character`/`tag`/`import`/`export` verified);
the surviving D28 defects are in *summary/authority* docs (`structure.md`, `persona.md`, `_STATUS.md`,
`foundation.md`, `assets.md`) not updated in the last sweep. `chat.md`, `providers.md`,
`identity-auth-permission.md` are the correctly-reconciled models for the B1/B2 clusters — the lagging docs
should be aligned **to them**, not vice-versa.
