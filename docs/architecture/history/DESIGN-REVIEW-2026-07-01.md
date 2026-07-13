---
kind: history
status: active
updated: 2026-07-03
---

# Adversarial Design Review — `docs/architecture/proposed/` (2026-07-01)

> **RESOLUTION RECORD (2026-07-02, commit `0d0a7fe` — Nate-authorized apply pass):** every finding
> below (3 MAJOR, 11 MINOR, all NITs) has been APPLIED to the design docs + the ledger. The
> per-finding text is preserved as the review record; §1's table and §3's cross-set table carry the
> post-fix state. One finding was resolved by a NEW Nate ruling rather than the review's suggested
> fix: **RPG-1** — *"presets should be their own presets and we don't bind shit to chats — that was
> neo-tavern's sin"* — so there is NO per-chat preset binding anywhere; the GM voice is
> `rpg_games.gmPresetId`, consumed per turn via `RpgGatherResult.presetOverride`
> (rpg-design/02 §1.1 #1; D58 amended). The ledger batch patch (D58 · D59 · D21 · D23 · D48)
> landed in the same commit. **§7 below is the consolidated chat-side obligations handoff** for
> whoever builds the Phase-5 chat tail.

> **Scope:** every doc of every set under `proposed/` (79 files, ~15k lines), read in full and
> audited against the ACTUAL codebase (`packages/**`, read-only snapshot — a burn agent is live)
> and the house law (AGENTS-1/2/3, `Core-Laws-and-Precedents.md` D1–D61, the user doctrine).
> **Method:** every load-bearing "exists" claim was symbol-verified against the tree (grep/read;
> file:line where cited); CLEAN is a verdict, not a courtesy. Findings carry severity
> (BLOCKER / MAJOR / MINOR / NIT), the doc§, the evidence, and a one-line fix.
> **Honesty note:** no BLOCKERs were found. The library is unusually well-grounded — most sets
> verify symbol-for-symbol, self-report their own deltas, and carry defaults+criteria on every
> lean. The findings below are real, but the dominant result is CLEAN.

---

## 1. Verdict table

All findings applied 2026-07-02 (`0d0a7fe`); the middle column preserves the as-reviewed state.

| Set | As reviewed (2026-07-01) | Post-fix verdict → safe to implement? |
|---|---|---|
| `tool-use-design/` | CLEAN (2 NITs) | **CLEAN — YES** |
| `rpg-design/` | 2 MAJOR · 5 MINOR · 4 NIT | **RESOLVED (RPG-1 via the 2026-07-02 Nate preset ruling; RPG-2..11 applied) — YES** |
| `chat-crew-design/` | 3 MINOR · 3 NIT | **RESOLVED — YES** |
| `agent-principal-design/` | CLEAN (1 NIT) | **CLEAN — YES** |
| `hub-browse-design/` | CLEAN | **CLEAN — YES** |
| `imagery-design/` | 1 MAJOR · 1 NIT | **RESOLVED (IMG-1 D51 wording corrected; IMG-2 stale flag closed) — YES** |
| `databank-design/` | CLEAN (2 NITs) | **CLEAN — YES** |
| `expressions-design/` | 2 MINOR · 1 NIT | **RESOLVED — YES** |
| `automation-design/` | CLEAN | **CLEAN — YES** |
| `plugin-design/` | 1 MINOR | **RESOLVED (PLG-1 `plugin_<slug'>_<name>` namespacing) — YES** |
| `gallery-design.md` | CLEAN | **CLEAN — YES** |
| `themes-design.md` | CLEAN | **CLEAN — YES** |
| `saved-rosters-design.md` | CLEAN | **CLEAN — YES** |
| `../history/Marinara-Residue-Non-RPG.md` | CLEAN (closed record) | n/a |

---

## 2. Per-set findings

> All findings in this section were APPLIED in `0d0a7fe` (2026-07-02). The three MAJORs carry
> individual resolution notes; the MINOR/NIT fixes are as suggested unless noted.

### 2.1 tool-use-design — CLEAN

The model set, and it earns it. The README's landed-vs-remaining truth table was independently
re-verified against the tree and is **accurate row-for-row**: `ModelCapability.tools/output.structured`
landed (`packages/contracts/src/connection/index.ts:159–170`); `HISTORY_ROLES` NOT landed
(`infra/providers/contract/chat.ts:24` role is still `"user" | "assistant"`); `ChatContentPart`
re-homed to `packages/contracts/src/chat/index.ts:367` exactly as cited; `message_variants.toolCalls`
exists untyped (`db/schema/chat.ts:259`); `NORMALIZED_FINISH_REASONS` carries `"tool"` +
`FINISH_REASON_MAP` maps `tool_calls/tool_use/function_call` (`infra .../chat.ts:87–105`); the
identity contract carries `Can`/`ChatAction("read"|"host")`/`GlobalAction("admin"|"owner")`/`ChatRoster`
exactly as 01 §1 imports them; `createAgentToolServer` exists at the D47 seam; zod is `^4.4.3` in the
workspace catalog; even the `openai-compat/stream.ts` "no tool-call reporting" line-comment cite is real.
Review-flag 6 (circulating summaries claiming the seams landed) is itself correct — a genuinely useful flag.

- **NIT** (01 §0 / 02 §3): `AgentToolServer` is described as "the opaque `unknown`-brand"; the
  landed type is plain `export type AgentToolServer = unknown` (`infra/providers/contract/agent.ts:18`)
  — opaque, not branded. Fix: drop the word "brand".
- **NIT** (README standing decisions): "the 23 rpg tools" — the rpg set registers 23 overworld
  defs **plus 3 encounter-set defs** (26 registered names; attachment varies per mode), and D58
  says "22". One number should win everywhere (see cross-set table §3).

### 2.2 rpg-design — 2 MAJOR · 5 MINOR · 4 NIT

The largest and most prescriptive set; mechanics/state/tools/seats are excellent and verify well
(forkChat, `setGroupConfig`, `addCharacterToChat`, `setParticipantDisabled`, `forceCharacterTurn`,
`chats.metadata`, roomOverrides, `selectedVariantId`, the workloads single-active partial index,
`reconcile-world-state` stub kind, `replay-buffer`, synthetic-group-character mint — all confirmed
in-tree). The findings cluster on the **chat-side seam inventory**, which is understated.

- **MAJOR — RPG-1 (02 §1/§3, 06 §1): `chat.setActivePreset(chatId, presetId)` has no substrate and
  no design.** There is NO per-chat active-preset concept anywhere: the active preset resolves from
  the HOST's `UserSettings.seeds.defaultPresetId` at compose (`entry/compose/chat.ts:487–494`;
  `contracts/settings` `seedsSchema.defaultPresetId`), `chats`/`chatMetadata` carry no preset
  binding, and `chat.md` plans none. `createGame`'s "clones the GM preset and sets it as the chat's
  active preset" (06 §1) therefore requires NEW chat/preset machinery (a per-chat preset binding +
  a set verb) that is nowhere specced — while 02 §1's satellite table simultaneously claims
  `domain/chat` gains "NOTHING (three optional injected ops)". Load-bearing: the whole GM-voice
  mechanism rides it. **Fix:** either (a) add a `chatMetadata.activePresetId` sub-blob + a
  host-gated `chat.setActivePreset` verb to chat's satellite list (one small spec section), or
  (b) re-scope the GM preset onto an existing mechanism — and delete the "chat gains NOTHING" line
  either way.
  **→ RESOLVED (`0d0a7fe`, 2026-07-02) — by a NEW Nate ruling, NOT the suggested fix (a):**
  *"presets should be their own presets and we don't bind shit to chats — that was neo-tavern's
  sin."* NO chats-side preset binding exists, ever. The GM voice is **`rpg_games.gmPresetId`**
  (rpg canon — rpg-design/03 §1) consumed per turn via **`RpgGatherResult.presetOverride`**
  (rpg-design/05 §1 — a generic optional field on the injected gather result; byte-identical when
  absent). rpg-design/02 §1.1 #1 is the spec; D58 carries the ledger amendment; the "chat gains
  NOTHING" claim is reconciled to "nothing rpg-specific + the declared generic surface".
- **MAJOR — RPG-2 (02 §3, 06 §3, 07 §2, 12 §3): the `RpgContext.chat` op bundle names verbs chat
  does not have and the set does not mark as new.** `postNarratorMessage` (consumed by recaps,
  scene-merge summaries, illustration posts) does not exist — chat's service surface has no
  narrator-post verb (verified against `chat/contract/service.ts`'s full verb list) and `chat.md`
  plans none; `kickParticipant` is actually named `kick`; and the 07 §3.1 `can()` matrix needs a
  membership/roster loader (`can(p, action, {kind:'chat', roster})` requires a loaded `ChatRoster`;
  `requireParticipant`/`requireHost` live in `domain/chat/guard.ts` and are sideways-unreachable —
  `RpgContext` declares only `can`, no membership op). Also 12 §3's `resolvePendingCheck` "posts as
  that player's canonical `[check:…]` message" needs a post-as-member write path that no op provides.
  **Fix:** one honest "NEW chat verbs/ops this set requires" subsection (narrator-post, membership
  loader op, optionally post-as-member), replacing the "chat gains NOTHING" claim with "chat gains
  N small verbs + three injected ops".
  **→ RESOLVED (`0d0a7fe`):** rpg-design/02 §1.1 is that subsection — `postNarratorMessage`
  (specced NEW: synthetic-group-character-authored, string body with embedded refs per D51),
  `chat.getMembership` (the `can()` roster feed), `kick` naming corrected, and the pending-check
  result re-specced as a NARRATOR post naming the player (never a forged user-authored row —
  rpg-design/12 §3 amended). No post-as-member verb exists or is needed.
- **MINOR — RPG-3 (07 §3): the literal `GroupConfig{output:'narrator', cardScope:'merged'}` is
  unrepresentable.** The landed schema (`contracts/chat/index.ts:576`) makes the narrator arm
  `.strict()` and OMITS `cardScope` (the `narrator ⇒ merged` constraint is enforced by shape) — the
  cited literal would be REJECTED at parse. Fix: `{output:'narrator'}`. (12 §5's
  `{output:'per-speaker', cardScope:'scoped'}` is fine.)
- **MINOR — RPG-4 (05 §5 vs 11 §16 / 12 §3): the `rpg.checkRequested` bus event is consumed but not
  declared.** Doc 12's handshake emits `checkRequested` and doc 11 §16 renders its chip, but the
  authoritative `RpgBusEvent` union (05 §5) has no such member and doc 12 does not note the
  amendment (its header promises pointer notes in amended docs). Fix: add the member to 05 §5.
- **MINOR — RPG-5 (11 §3 vs 02 §5 / 08 §5): `rpg.listNpcs` is consumed by the client (Cast tab,
  invalidation map) but absent from the service surface** in both the verb listing (02 §5) and the
  read-contract table (08 §5). Fix: add it to both.
- **MINOR — RPG-6 (06 §4): `rpgWorldGenNpcSchema` and `rpgWorldGenWidgetSchema` are referenced in
  the world-gen payload but defined nowhere in the set** (a cold implementer must invent the NPC
  and widget-proposal shapes; the prose hints fields but gives no schema). Fix: inline the two
  schemas — the set inlines everything else.
- **MINOR — RPG-7 (02 §1): "8 new WorkloadKinds" undercounts.** The set names 10 distinct
  `rpg-*` kinds (world-gen, session-distill, recap, director, lorebook-upkeep, illustration,
  npc-portrait, scene-plan, scene-distill, recruit-card). The D34 tuple/CHECK bookkeeping note is
  right; the count is not. Fix: say 10 (or enumerate).
- **NIT — RPG-8:** tool-count drift: D58 says "22-tool registry", the set says 23, the registry
  actually holds 26 defs (23 overworld + 3 encounter). One-line ledger patch + one-line 05 §3 note.
- **NIT — RPG-9 (11 §1):** "the D55 clamp-overlay" / "D55's four regions" — D55 is the MEMORY
  ratification; the shell law is D42/D43 (`UI-Architecture-and-Layout.md`). Wrong D-number, twice.
- **NIT — RPG-10 (02 §2 vs 05 §0):** `onUserCommit`/`onTurnCompleted` homed in `verbs/snapshot.ts`
  in 02's layout but `verbs/on-user-commit.ts`/`on-turn-completed.ts` in 05's table. Pick one.
- **NIT — RPG-11 (11 §12.2):** "`ChatEvent{kind:"expression"}` already fires per turn" — wrong on
  both counts: the discriminant is `type` (expressions-design README flag 2) and nothing fires yet
  (the expressions set is unbuilt design). Fix: "will fire (expressions-design 02 §4)".

### 2.3 chat-crew-design — 3 MINOR · 3 NIT

Grounding is strong (workloads `start({kind, params, ownerId})` verified incl. the
`ownerId: UserId | null` audit-threading; the single-active partial index; `setChatInjection`/
`listChatInjections`/`deleteChatInjection` verbs; `editMessage`; character/`getCard`; notifications
domain; the D58 stub-runner precedent). The director-state argument (02 §1) is the best-argued
placement decision in the library.

- **MINOR — CREW-1 (06 §1/§2, 08 §10): the guide-content addressing convention
  `chat_injections.id = "guide:<guideKey>"` is unimplementable as written.** The landed
  `chat_injections.id` is a **TypeID-branded PK** (`ChatInjectionId`, `db/schema/chat.ts:499`) and
  `SetChatInjectionParams.id?: ChatInjectionId` — a literal `"guide:thinking"` id violates the
  brand discipline (`no-raw-id`/`no-mint-via-cast`/`schema-branding`). The design even pins the
  convention in a test (08 §10). **Fix:** store the minted `ChatInjectionId` on the `crew_guides`
  row (a `injectionId` column) or add a nullable `key` column to `chat_injections`; drop the
  magic-id format.
- **MINOR — CREW-2 (01 §4): the buddy observer is described as "designed, has a domain, has a bus,
  and is already wired to chat/workload event sources" — it is NOT wired.** The observer is
  deferred (FLAG PD-45/64; `domain/buddy/index.ts:14` — "DEFERRED … NOT exported yet";
  `BuddySignalKind` exists in `contract/signals.ts` only). The subsumption verdict is still right;
  the "already wired" claim overstates the substrate and could mislead a builder into assuming the
  echo-chamber capability exists on day one. Fix: "designed (buddy.md), deferred behind PD-45/64".
- **MINOR — CREW-3 (06 §2/§4): the guide injection under-specifies chat's injection row shape.**
  `chat_injections` requires `position` (`before_prompt|in_static|in_prompt|in_chat`); the guide
  spec gives depth+role+labeled but never names the position (presumably `in_chat`). One word.
- **NIT — CREW-4:** D59 ledger drift (ledger-side, not this set): D59 says "build per CW1–CW6
  (`chat-crew-design/07`)" — the build plan is doc **08** and has **CW1–CW7**; D59's table list
  also omits `crew_guides` (the set has 4 crew tables + 1 character table). One-line ledger patch.
- **NIT — CREW-5 (02 §2):** "the D58-committed `worldInfo.upsertEntries` bulk op is reused as-is"
  — committed by D58's design, not landed (no `upsertEntries` in the tree). Doc 08's dependency
  table states this correctly ("either builder lands the same op"); the 02 phrasing reads as
  already-built.
- **NIT — CREW-6 (04 §2):** `previewAssembly`/`peekPrompt` redaction — both verbs verified real on
  chat's surface; fine — but the variant `promptSnapshot` read-path redaction is asserted without
  naming which verb serves snapshots to members (worth one line for the CW4 builder).

### 2.4 agent-principal-design — CLEAN

The best-grounded set in the library. Every in-tree claim verified: `users` schema (handle unique,
`externalId` unique-when-set, `role` CHECK from `USER_ROLES`, `enabled`, `passwordHash`);
`PARTICIPANT_KINDS = ["human","character","observer"]` with the 2-way actor XOR exactly as doc 02
describes; `messages.authorUserId` SET-NULL FK with human posts stamping it and assistant rows
`characterId`-only (the "half-dissolved" correction in 02 §2 is accurate and honest);
`parseParticipant` in `chat/persistence/participant.ts`; `chat/engine/turn-identity.ts`;
`no-direct-users-read` gate (`scripts/check/gates/no-direct-users-read.ts`); sessions.md's
`provisionAgentPrincipal` claim (sessions.md:284,452); `rpg_party.userId` XOR fit; the
`no-caller-user-id` gate. The two-wall ceiling (Principal-unconstructability + closed `canAgent`
union) is the strongest security design in the library, and the containment suite is a real
deliverable, not a gesture.

- **NIT — AP-1 (01 inv 3):** "lint: dep-cruiser — the `no-direct-users-read/write` chokepoint" —
  the enforcer is a **ts-morph structural gate** (`scripts/check/gates/`), not dep-cruiser. Wrong
  layer name only; the enforcer exists.
- Cross-ref asymmetry (recorded, not a finding against this set): rpg-design/12 carries no pointer
  note toward the agent-held-GM third seat state that doc 05 §2 re-keys (D60 gates it; a one-line
  banner on rpg-12 §2/§6 would keep the "amended docs carry pointer notes" promise symmetric).

### 2.5 hub-browse-design — CLEAN

Fully grounded: `infra/network/egress.ts` exists exactly as described (opt-in
`installEgressFirewall` via `env.EGRESS_FIREWALL`; staged `safeFetch` at :150 with zero callers —
the S6 self-audit is correct and is the sharpest finding in the whole library, made against the
set's own codebase); `ip-ranges.ts` exists; `parseCardPng`/`parseCardJson` are exported from
import's front door (`domain/import/index.ts:26`); `findByImportHash` exists in character;
`characters.importedFrom`/`importHash` columns exist (`db/schema/character.ts:52,54`). The
`findByImportedFrom` read verb and the `hub:` provenance format are correctly marked NEW. The
adapter/registry model is the providers sealed-executor pattern applied faithfully; the jannyai
rejection and datacat deferral are honest product calls with the evidence shown. Rate limits,
kill switch, `Cache-Control: private`, and the never-CAS avatar cache all conform to D21/D18.
No findings.

### 2.6 imagery-design — 1 MAJOR · 1 NIT

Grounding verified: `ImageGenerateRequest` is `{prompt, systemPrompt?, n?}` at
`infra/providers/contract/roles.ts:85` exactly as cited; `ModelCapability.input.vision` optional;
`ASSET_KINDS = ["card","avatar","export"]` (the additions are correctly marked new);
`messageContentBlockSchema`'s media block verified. The `imagery_generations` delta (README flag 1)
is well-argued — the GC-registry discovery (content-block refs are invisible to the assets
mark-sweep) is load-bearing and correct. The review-flag section is exemplary.

- **MAJOR — IMG-1 (04 §2.1, 01 §3.3): the chat persist path contradicts D51.** Doc 04 §2.1:
  `chat.generateImage` "persist[s] ONE message whose variant body = `picture.images[*].block`
  (n media blocks, one message)". D51 (committed law, 2026-06-29): "a message body is stored as a
  `string` (D26 one content home — UNCHANGED; D44 render-blocks are *parsed from the string at
  render*, not stored)"; an owned image is an **embedded markdown ref** `![alt](asset:<assetId>)`.
  Blocks-as-body is exactly the shape D51 rejected. The `GeneratedPictureImage.block` RESULT field
  is fine (a render-ready convenience for direct consumers); the PERSIST wording is not.
  **Fix (one paragraph):** chat.generateImage persists a body **string** containing n embedded
  `![…](asset:<id>)` refs (D51); blocks derive at render. Same correction applies to 04 §2.3's
  "the loop's persist path lands them on the variant" for the D48 tool path (tool results persist
  as `ToolCallRecord[]`; any posted image is an embedded-ref body).
  **→ RESOLVED (`0d0a7fe`):** imagery-design/04 §2.1 + §2.3 corrected exactly as above;
  `GeneratedPictureImage.block` re-documented as a render-ready convenience for DIRECT consumers,
  never a persistence payload (README flag 10 records the delta).
- **NIT — IMG-2 (README flag 9): the flagged vocabulary divergence with automation-design is
  STALE.** automation-design/03 §1.7 as written today IMPORTS `generateImageActionArgsSchema` from
  `@orb/contracts/imagery` verbatim (and rejects an inline schema by name) — the "narrower
  `{type, mode, promptTemplate, quiet}` arm" the flag describes no longer exists. Fix: drop or
  mark-resolved flag 9.

### 2.7 databank-design — CLEAN

The most complete of the D49 sets. Grounding verified: `SOURCE_KINDS`/`SOURCE_LENSES`/
`VECTOR_TABLES` tuples exist in `embeddings/contract/params.ts` with the `satisfies`/`assertNever`
belts; `writeHubScores` exists (the prune-seam precedent claim is real); the world-info
scope-junction pattern, `fetchOwned`, and the workloads five-edit recipe all check out. The
mutual-injection seam (databank owns the scope union; search owns the rank pipeline) is the
cleanest cross-domain composition in the library, and every ST-derived constant carries its cite.

- **NIT — DB-1 (01 §1):** "a 5th `store` arm: `kind:'document'`" — it is the 5th **table** but the
  **4th** kind (`SOURCE_KINDS` is 3-membered today: `card|avatar|chat-block` — doc 05 §1's own
  tuple listing shows 3→4). Cosmetic count drift inherited from D49's table-counting.
- **NIT — DB-2 (README flag 3, 06 §5):** the SSRF guard's design home is cited as
  `gallery-design.md §6`; per D61 the authoritative spec is now `hub-browse-design/01` (gallery §6
  carries the delta banner). The flag itself anticipated exactly this ("the cite is the only
  touch-point") — a one-line update.

### 2.8 expressions-design — 2 MINOR · 1 NIT

Grounding verified: `infra/providers/backends/local-light/` exists with `rerank.ts` +
`model-cache.ts` (`LocalLightModelCache`) exactly as the matte design claims — the premise
correction ("the ONNX runtime is already in the stack") is TRUE. The ChatBusEvent widening
(`type:"expression"`) is argued honestly against D50 (ephemeral member, baseline CHECK regen — the
same ritual D50 itself used), and the `kind`→`type` normalization (README flag 2) is correct.
The D21 amendment flag (avatar exception → avatar+sprites) is properly raised, not silently applied.

- **MINOR — EXP-1 (03 §3.1/§3.3): the `ImageryOp` consumed here does not match imagery-design's
  contract.** Expressions' op takes `{mode:"free", prompt, negative?, n:1, size, quiet: true,
  userId: UserId}` and reads `pic.assetId` off a singular result — but imagery-design/01 §3.2/§3.3
  (which wins on its own contract) has `caller: Principal` (not `userId`), **no `quiet` param**
  (imagery "has no posting concept"; `quiet` is consumed by CALLERS — imagery-design/04 §1), and a
  **plural** `GeneratedPicture.images[]` (README flag 2 superseded the committed singular
  `{assetId, block}` shape this doc still cites as "imagery.md §6.2"). **Fix:** mechanical — drop
  `quiet`, rename to `caller`, read `pic.images[0].assetId`.
- **MINOR — EXP-2 (03 §3.3 step 3): `size: rows === 1 ? "landscape" : "landscape"` — both branches
  are `"landscape"`.** The op comment (§3.1) says `"landscape" | "square"` "picks per grid aspect";
  a cold implementer copying the pseudocode ships a dead ternary. Fix: decide the 1-row aspect
  (likely `rows === 1 ? "landscape" : "square"` or wide-vs-4×2) and write it.
- **NIT — EXP-3 (02 §2.2):** the classify shaper resolves the `chat` role while imagery's
  extraction resolved to `summarize` for exactly the "cheap model independently of the conversation
  model" reason (imagery-design/04 §6 Q2). Expressions acknowledges the seam (§5 "cheap-model
  routing is free later") — recorded as a deliberate divergence, but the two sets solve the same
  problem opposite ways; worth one sentence saying why classify differs (label fidelity needs the
  conversation model? cost?).

### 2.9 automation-design — CLEAN

Grounded and internally rigorous. The trigger taxonomy's "26 discriminators incl. the 5 embedded
WiBusEvent members" matches the tree (21 top-level `type:` literals + 5 WI members); every v1
trigger names a real ChatBusEvent member; the TriggerFact re-read rule is the D38 discipline
applied correctly; the cascade guard (origin on the TURN RECORD, never the bus — D19/D50 conform)
is the right shape; the `PromptTransform` seam is a faithful execution of D50's ruling, homed in
`@orb/contracts/chat` with chat owning the fixed points. `generate_image` imports imagery's schema
(one home). Review flags 1 and 4 (`getTurnOrigin` + `initiator/automationDepth` turn-record fields;
`variantSelected` fires after the re-fold) correctly identify the NEW chat-contract surface and
hand it to the Phase-5 builder rather than assuming it. No findings — this and hub-browse are the
cleanest execution of "every invariant ships its enforcer" in the library.

### 2.10 plugin-design — 1 MINOR

The membrane is a genuinely closed design: capability↔function completeness pinned by a mapped-type
Record, the `boundHostFn` wrapper making unbounded host calls unwritable-by-omission, the escape
suite as a permanent deliverable, and honest LEAN numbers with criteria. The dual-mode split
(resident registrations require the manifest ceremony; snippets get a fixed profile) is the right
security shape.

- **MINOR — PLG-1 (01 §2, 03 §5): the plugin tool namespace `plugin:<slug>:<name>` violates
  tool-use's registry name contract.** tool-use-design/01 §1: `ToolDefinition.name` "Must match
  `/^[a-z][a-z0-9_]{0,63}$/` (OpenAI's function-name charset ∩ MCP tool-name charset — one name
  survives both projections)". Colons are not in that charset — a plugin tool can never register,
  and if the regex were widened the name would break the OpenAI wire projection. **Fix (one line,
  either side):** change the namespace separator to `_` (`plugin__slug__name`) or give the
  registry a separate display/provenance field; reconcile in BOTH sets.

### 2.11 gallery-design.md — CLEAN

Verified: `ASSET_KINDS` base tuple matches; the §0 consolidated roster
(`card|avatar|export` + `generated`/`gallery`/`document`/`sprite`/`plugin`) reconciles all five
claiming sets exactly (see §3). The D61 deltas (gif home → `domain/hub`; §6 guard → hub-browse/01)
are cleanly patched in place with banners. §10 flag 1's Nate ruling ("only true producers stamp")
is the D23 generalization the other sets now cite — one rule, one home. The keyset-paging contract,
animated-sniff placement (pure bytes, not sharp), and the token-counter's "do not add more" test
note are model right-sizing. No findings.

### 2.12 themes-design.md — CLEAN

Verified: `USER_SETTINGS_SECTIONS` exists (`contracts/settings/index.ts:426`); the presets
nullable-owner system-row precedent is real (`db/schema/preset.ts:32` — `ownerId` without
`.notNull()`; `SYSTEM_DEFAULT_PRESET_ID` + `preset/seed.ts` exist); the boot-seed family exists.
The ownerless-seed decision (§2.1) is the strongest kind of design — non-deletability as physics
via the `fetchOwned` miss, with the `isSeed`-flag alternative correctly indicted as prose-tier.
The settings-adjacent home (§1) is a textbook right-size call (six CRUD verbs with zero
cross-feature surface do not earn an 8-slot leaf), and it honestly flags its one aggressive
reading of §12.1 (inline-override clause superseded by the entity commitment). No findings.

### 2.13 saved-rosters-design.md — CLEAN

Verified: `StartChatParams` carries `characterIds` + `anchorPersonaId` exactly as claimed
(`chat/contract/params.ts:76–77`); `GroupConfigInput = z.input<typeof groupConfigSchema>` exists
(`contracts/chat/index.ts:602`); `TALKATIVENESS_DEFAULT` exists (:646); the participant-control
verbs exist. The derive-vs-stamp argument (§1) applies gallery's D23 generalization correctly
(true producer, no owned anchor → stamp). The two-call new-chat flow is honestly distinguished
from gallery's one-call rule (no torn invariant). No findings.

### 2.14 ../history/Marinara-Residue-Non-RPG.md — CLEAN

A closed record whose every pointer resolves to a real design set/section; the B-row dispositions
match D58/D59/D61 exactly. The §2–§4 cautionary records earn their permanence.

---

## 3. Cross-set consistency table

| Shared surface | Claimants | Verdict |
|---|---|---|
| `ASSET_KINDS` roster | gallery §0 (consolidated) vs imagery(`generated`) · gallery(`gallery`) · databank(`document`) · expressions(`sprite`) · plugin(`plugin`) | **MATCH** — gallery §0 is the declared one home; every sibling shows only its own append and says so |
| `generate_image` action args | imagery 01 §6 (schema home) · automation 03 §1.7 (imports it) · plugin 01 §2 (`GenerateImageActionArgs`) · tool-use (same-name tool, minus `quiet`) | **MATCH** — one schema, one home. imagery README flag 9 is STALE (IMG-2) |
| Tool NAME charset | tool-use 01 §1 regex vs plugin 03 §5 | **RESOLVED (`0d0a7fe`)** — plugin names are `plugin_<slug'>_<name>` (`-`→`_` injective, combined ≤64, activation-fatal overflow); the colon form is recorded as the rejected shape |
| `imagery.generatePicture` param/result shape | imagery 01 §3 (caller/plural/no-quiet) vs expressions 03 §3.1 vs rpg 08 §2 (vocabulary-level only — OK) | **RESOLVED (`0d0a7fe`)** — expressions synced to the current contract (`caller: Principal`, no `quiet`, plural `images[]`); the dead size ternary fixed alongside (EXP-2) |
| `runStructuredAgentTurn` (`@orb/server/kit/agent-payload.ts`, one bounded retry) | tool-use 04 §4 · crew 02 §2/03 §0 · rpg (via crew 05 §e convergence note) | **MATCH** |
| The injected-GATHER-op / null=byte-identical pattern | databank 07 (the declared precedent) · rpg 05 §0 · crew 04 §1 · expressions 02 §0 (post-turn variant) | **MATCH** — one vocabulary, each cites the precedent chain correctly |
| `ChatInjection.audience: "all"\|"host"` | crew 04 §2 (defines) · guides `"all"` · rpg (silent — pre-dates it; crew notes rpg may adopt) | **MATCH** (additive, one definer) |
| `message-footer` client slot region | crew 07 §1 (defines, explains why rpg's chips didn't need it) · rpg 11 §1 (six regions, no footer) | **MATCH** (additive, one definer) |
| `WORKLOAD_KINDS` widenings + stub-runner ritual | rpg (10 kinds — internally miscounted as 8, RPG-7) · crew (4) · databank (2) · expressions (1) — all cite D34 tuple+CHECK regen + the D58 stub precedent | **MATCH** in mechanism; rpg count NIT |
| `worldInfo.upsertEntries` bulk op | rpg 02 §1 (introduces) · crew 03 §1 (reuses; hand-edit guard) · automation 03 §1.3 (same op + same guard semantics) | **MATCH** — one op, three consumers, crew 08 handles the who-builds-first race explicitly |
| ChatBusEvent posture | rpg (own bus — frozen CHECK) · crew (own bus) · automation (own bus) · expressions (widens by 1, argued + baseline regen) | **COHERENT** — each justifies; expressions' widening is the one union edit and is argued against D50's own precedent. rpg 11 §12.2's `kind:"expression"` spelling is stale (RPG-11) |
| `rpg.checkRequested` | rpg 12 §3 + 11 §16 (consume) vs rpg 05 §5 union | **RESOLVED (`0d0a7fe`)** — the member is in the 05 §5 union |
| SSRF guard home | hub-browse 01 (authoritative per D61) · gallery §6 (delta-bannered ✓) · databank · imagery 04 §7 ✓ · plugin `net.fetch` ✓ | **RESOLVED (`0d0a7fe`)** — databank's README flag 3 + 06 §5 now cite hub-browse/01 |
| rpg tool count | D58 · rpg README/tool-use · actual roster | **RESOLVED (`0d0a7fe`)** — ONE number everywhere: 26 registered defs (23 overworld + 3 encounter); D58 patched |
| Agent seats | agent-principal 05 §2 (three GM-seat re-keys) vs rpg 12 · crew bright line (identical wording) | **RESOLVED (`0d0a7fe`)** — rpg-12 §"frame" carries the D60 third-seat pointer note |
| GM-voice preset binding (NEW row, post-ruling) | rpg 02 §1.1 #1 / 03 §1 / 05 §1 / 06 §1 / 09 §a / 10 · D58 amendment | **MATCH** — `rpg_games.gmPresetId` → `RpgGatherResult.presetOverride`, one vocabulary across the set + ledger; NO chats-side binding anywhere |
| Guide content linkage | crew 02 §4 / 06 §1-§2 / 08 §10 · D59 amendment | **MATCH (post-fix)** — the stored `crew_guides.injectionId` FK replaces the magic-id format in every mention |
| Build-order DAG | tool-use T1→T4(=PD-54, chat P5) → rpg R4 · crew CW2→(D48 structured + `runStructuredAgentTurn`, T6 "lands with first consumer") · automation A1–A3 kit-early, A5–A7→chat P5 · plugin P4→automation A5–A7 + tool-use · hub H1(≡G6)→G7/DB7 · expressions E4→imagery I1 · AP3/AP4a→rpg R1/R3/R4 | **ACYCLIC + COHERENT** — no circular ships-with claims; the two shared-op races (upsertEntries, T6) are explicitly arbitrated |

## 4. Cold-read survivability spot-check (3 random sections per large set)

- rpg 04 §9 (weather tables), 06 §1.1 (GM law verbatim), 03 §2.3 (locks): **survivable** — full
  data inline, no pointers. Exception: 06 §4's two undefined schemas (RPG-6).
- crew 03 §1 (keeper apply rules), 06 §1.1 (guide templates verbatim), 02 §9 (staleness): **survivable**.
- databank 03 §2 (chunker algorithm), 05 §3.3 (rank pipeline), 06 §2 (upload pipeline): **survivable**
  — the strongest cold-read set.
- automation 01 §1 (`LIVE_TRIGGERS` body is elided to a comment — liveness must be inferred from
  the tuples' v1/reserved annotations; acceptable but one explicit listing would remove the inference),
  03 §1 (arms), 04 §1 (DDL): **survivable**.
- plugin 01 §2 (the full membrane), 03 §3 (budget numbers as named constants): **survivable**.
- themes §3.1 defers the `ThemeOverride` member list to `UI-Theming-and-Content.md` §12.1 — a
  pointer, but to committed law with an explicit "owned by" statement: **acceptable**.

## 5. Top-5 systemic observations

1. **The chat seam is the library's one systematically soft spot.** Three sets under-declare NEW
   chat-side surface: rpg's `setActivePreset`/`postNarratorMessage`/membership-loader (RPG-1/2,
   the two MAJORs), crew's injection-id convention (CREW-1), automation's `getTurnOrigin`+turn-record
   fields (properly flagged there — the model to copy). Chat is the integration apex and the burn
   agent is building it RIGHT NOW: a single consolidated "chat-side obligations from the proposed
   library" list (verbs, ops, contract fields, redaction points, `variantSelected` ordering) handed
   to the P5 builder would convert every one of these from mid-build surprise to known work.
   **→ DONE (2026-07-02): §7 is that list.**
2. **Design-set concurrency is the main drift vector — and the sets that version-stamped their
   reads didn't drift.** Every real cross-set mismatch (EXP-1's stale singular result, IMG-2's
   stale flag 9, DB-2's stale guard cite) is one concurrent set citing another's COMMITTED
   ancestor rather than its current design; the sets that named their read date/commit (tool-use's
   truth table "verified 2026-07-01", hub's liveness probes) are clean. A tiny convention — cite
   sibling design sets with a date or section hash — would close the class.
3. **The grounding discipline is real and it works.** Symbol-level cites in these docs verify at a
   rate I have not seen in design docs: file:line cites are accurate (`contracts/chat:367`,
   `roles.ts:85`, `egress.ts` staged-seam), the tool-use truth table is exact, and the two prior-art
   self-audits (hub-browse S6 finding orbweaver's own safeFetch hole; agent-principal correcting
   the neo-era "never stamped" claim against the live tree) caught things a reviewer would be proud
   of. The un-grounded claims that slipped through are precisely the ones about UNBUILT siblings
   (observation 2) — in-tree claims are essentially all true.
4. **Ledger drift is accumulating in the D-entries, not the designs.** D58 "22 tools", D59
   "CW1–CW6 (…/07)" + the missing `crew_guides`, D48's warning-code home (already flagged by
   tool-use), D21's "ONE narrow exception" (expressions needs the sprite amendment), D23's
   producer-rule generalization (currently recorded only in gallery §10). The designs are ahead of
   the ledger. Worth one batch ledger-patch pass — the D-entries win on conflict, so stale
   D-entries are actively dangerous to cold agents.
   **→ DONE (2026-07-02, `0d0a7fe`): D58 (26 tools + the preset ruling) · D59 (CW1–CW7, doc 08,
   `crew_guides`, the `injectionId` linkage) · D21 (avatar+sprite exception) · D23 (the
   producer-vs-derive generalization promoted) · D48 (`CHAT_WARNING_CODES` home per D51).**
5. **Right-sizing is healthy — the "suspended KISS" regime has not produced shoehorning.** The
   library repeatedly chooses the smaller thing with the criterion recorded: themes inside
   settings, gallery "none of these is a new domain", tool-use's no-speculative-seams (§8 Q2,
   streamed events), imagery's no-WorkloadKind (with the single-active serializer argument),
   automation's no-`rand()` in predicates, crew's no-UserSettings-defaults. Every new bus, table,
   and domain I checked carries a justification that survives adversarial reading; I found zero
   parallel systems (one registry, one import path, one turn path, one theming mechanism all hold)
   and zero phantom-edge-case machinery. The main residual risk is volume, not shape.

## 6. Disposition

No BLOCKERs. Two MAJORs (RPG-1/2) were pre-build spec work on the chat seam, one MAJOR (IMG-1) a
one-paragraph D51 correction; everything else MINOR/NIT-grade doc hygiene.
**ALL FINDINGS APPLIED 2026-07-02 in `0d0a7fe`** (RPG-1 via the Nate preset ruling — see the
header resolution record), including the ledger batch patch (D58 tool count + preset ruling ·
D59 chunk range/doc pointer/table list/guide linkage · D21 sprite-exception amendment · D23
producer-vs-derive generalization · D48 `CHAT_WARNING_CODES` home). **The library is safe to
implement in its stated order as it now stands.** §7 is the chat-tail handoff sheet.

## 7. Consolidated chat-side obligations from the proposed library (the handoff sheet)

Every NEW chat-side verb, contract field, injected-op seam, or behavior the design library
requires — the list observation §5.1 called for, deduplicated across all 14 sets. "Chat-side"
means: `domain/chat` code, `@orb/contracts/chat` shapes, `chats`-family schema, or chat's client
registries. Verified against the tree 2026-07-02 (nothing below is landed unless marked). **Staleness note (triage 2026-07-09):** rows #1–#2 LANDED with tool-use T1–T4 (2026-07-04, PD-54 cleared); rows #7 ({type:"expression"} bus member), #9 (the {{databank}} macro slot), and #19 (the AP0 participant kind-CHECK) LANDED 2026-07-09 as baseline riders — `README.md` §1 is the verified rider record. Row #15 (`ChatInjection.audience`) re-verified NOT landed 2026-07-09.
Sorted by phase; each row names its consuming set(s) and the spec home.

### 7.1 Phase 5 (the live chat build / its immediate tail) — build WITH chat

| # | Obligation | Kind | Spec home | Consumers |
|---|---|---|---|---|
| 1 | `ChatToolOps` injection seam (`resolveTools`/`toWireTools`/`executeToolCalls` on `ChatContext.tools`) + the recurse loop (PD-54) + `toolRecurseLimit` per-chat setting (seed 5, host-editable) + `appendToolExchange` + flush-per-depth persistence | ops + engine + setting | tool-use-design/03 | tool-use (T4), rpg (R4), buddy |
| 2 | `CHAT_WARNING_CODES` += `tools_unsupported`, `structured_output_unsupported` — WITH their domain-gate emit sites (D48 as amended 2026-07-02) | contract tuple + emit sites | tool-use-design/02 §5 | tool-use, crew, rpg |
| 3 | Turn-record `initiator` (`TurnInitiator` incl. `"automation"`/`"plugin"`) + `automationDepth` fields + the `chat.requestTurn` non-human-initiator seam + the `chat.getTurnOrigin` narrow read (D46 prereq #3, made readable) | engine fields + verb + op | automation-design/03 §4, 05 flag 1 | automation (A5/A6), plugin (P4) |
| 4 | `variantSelected` bus event fires AFTER the variable re-fold (ordering pin on the swipe path) | ordering invariant | automation-design/05 flag 4 | automation predicates over `vars` |
| 5 | `PromptTransform` pipeline points (`user_input` after macro pass / `assembled_dynamic` end-of-BUILD; 250 ms skip-and-warn; interface in `@orb/contracts/chat`) — D50's seam, built WITH chat | contract + 2 pipeline hooks | automation-design/04 §6 | automation (A7), plugin (P4) |
| 6 | `chat.applyVariableOps(chatId, ops, origin)` — the variable seam accepting an origin tag (delta-to-in-flight-variant else standalone) | verb/op surface | automation-design/03 §1.1 | automation, plugin, crew (via chat) |
| 7 | `ChatBusEvent` += `{type:"expression"}` (ephemeral, never logged) + replay-guard/`chat_events_type_check` regen — **BASELINE-WINDOW-COUPLED** (the squash must still be open, expressions E1) | bus union + CHECK regen | expressions-design/02 §4 | expressions |
| 8 | `expressions.onTurnCompleted(chatId, messageId, variantId)` optional injected op + the `readTurn` narrow read op chat provides (id-only, re-read canon) + the `emitChatEvent` injected emit | ops | expressions-design/02 §0/§3.1 | expressions (E3) |
| 9 | `{{databank}}` reserved dynamic/cache-safe macro slot (resolves empty until the graft) — the ONE cheap pre-P5-freeze reservation databank names | macro slot | databank-design/01 §5, 07 §3 | databank (DB6), rpg preset |

### 7.2 Phase 7+ (the feature waves) — small chat PRs landed with/before their consuming chunk

| # | Obligation | Kind | Spec home | Consumers |
|---|---|---|---|---|
| 10 | `RpgGatherResult.presetOverride?: PresetId` consumption: when the injected gather op returns one, assembly resolves THAT preset for the turn (owned-or-system under the host, else degrade); byte-identical when absent. **NO chats-side preset binding — ruled** | gather-result consumption point | rpg-design/02 §1.1 #1, 05 §1; D58 amendment | rpg (R3/R4) |
| 11 | `chat.postNarratorMessage(chatId, content, media?)` — NEW verb: synthetic-group-character-authored assistant message, STRING body (embedded `![…](asset:<id>)` refs per D51), normal canon-write + bus | verb | rpg-design/02 §1.1 #2 | rpg (recaps/scene-merge/illustrations, R6/R9/R10), pending-check posts (rpg-12 §3) |
| 12 | `chat.getMembership(chatId, userId) → {role} \| null` — NEW narrow read op (the `can()` roster feed for sibling domains) | op | rpg-design/02 §1.1 #3 | rpg (R3); any future chatId-scoped leaf |
| 13 | `ChatContext.rpg?: { gatherTurnContext, onUserCommit, onTurnCompleted }` optional injected ops + the no-game byte-identity pin | ops | rpg-design/05 §0 | rpg (R4) |
| 14 | `chat.generateImage` — NEW thin verb (`requireParticipant` → injected `imagery.generatePicture` → unless quiet, persist ONE message: string body, n embedded refs (D51) → warnings onto the `warning` event) + the `extractQuiet` summarize-role shaper (chat owns history windowing + macro resolution) | verb + shaper | imagery-design/04 §2, 02 §2 | imagery (I4), automation `generate_image` arm, /imagine |
| 15 | `ChatInjection.audience?: "all" \| "host"` (additive, default `"all"`; NOT landed — verified 2026-07-02) + redaction in `previewAssembly`/`peekPrompt`/every `promptSnapshot`-serving projection (one helper) | contract field + projection redaction | chat-crew-design/04 §2 | crew (CW4); rpg/future host-ring injections |
| 16 | `ChatContext.crew?: { gatherTurnContext }` optional injected op + the crew-off byte-identity pin | op | chat-crew-design/04 §1 | crew (CW4) |
| 17 | Guide-content linkage: chat's existing injection CRUD serves it, but `setChatInjection` must RETURN the minted `ChatInjectionId` (crew stores it on `crew_guides.injectionId`) — verify the return shape when CW6 wires | verb return shape | chat-crew-design/06 §1 (as fixed, CREW-1) | crew (CW6) |
| 18 | `chat.seatAgent` — NEW verb (the ONE agent-seat chokepoint: `requireHost` → owner-present check → injected `sessions.provisionAgentPrincipal` → kind-verify → roster INSERT `kind:'agent'`) + `ChatContext.resolveAgentSpeaker` (the `AGENT_SPEAKER_SOURCES` dispatch) + the speaker→attribution map arm (`authorUserId`=agent, `characterId` NULL) + `canAgent('speak')` engine gate | verb + ops + engine arms | agent-principal-design/01 §4, 02 §2, 04 §3/§5 | agent-principal (AP2/AP3) |
| 19 | `chat_participants` kind-shape CHECK replacing the actor XOR + `PARTICIPANT_KINDS` += `'agent'` + the derived kind-sets — **BASELINE-WINDOW-COUPLED** (AP0: "the retrofit-hostile item") | schema CHECK swap + tuples | agent-principal-design/02 §1, 07 §1 | agent-principal (AP0) |
| 20 | `databank.gatherRetrieval` optional injected GATHER op (query text = pending + last-2, chat-built; pre-pass `tokenBudget`; null = byte-identical) | op + budget line | databank-design/07 | databank (DB6) |
| 21 | `hasActiveGame(chatId)` predicate wiring (rpg provides; no-op `false` without rpg) — consumed via `CrewContext.chat`, plus rpg-side `createGame` crew-disabled guard | compose wiring | chat-crew-design/02 §7, 05 §h | crew ↔ rpg mutual exclusion |
| 22 | `worldInfo.upsertEntries` bulk op (world-info-side, chat-adjacent; committed by D58, NOT in the tree — first builder of crew CW2 / rpg R7 lands it; hand-edit guard semantics shared with automation's arm) | sibling-domain op | rpg-design/02 §1, chat-crew-design/03 §1, automation-design/03 §1.3 | rpg, crew, automation |

### 7.3 Phase 6 (client — chat's registries)

| # | Obligation | Kind | Spec home | Consumers |
|---|---|---|---|---|
| 23 | `CHAT_SURFACE_SLOTS` (regions: thread-flanks ×2, above-composer, composer-leading, header-actions, thread-actions-menu) + `CHAT_CONTEXT_SLOTS` + `TOOL_RENDERERS` — the three chat-owned client registries wired at `main.tsx` | client registries | rpg-design/11 §1 | rpg (C1+), crew, tool-use (T7) |
| 24 | `CHAT_SURFACE_SLOTS` += the **`message-footer`** region (receives `{chatId, messageId, variantId}`) — crew's ONE client-side chat touch | registry region | chat-crew-design/07 §1 | crew (U5) |
| 25 | The generic `<details>` tool-invocation block (the `TOOL_RENDERERS` fallback) + the ToolCallRecord client contract (03 §4's MAY/MAY-NOT list) | component + contract | tool-use-design/03 §4, 05 T7 | tool-use, rpg chips |

**Not chat-side (listed to kill false positives):** `HISTORY_ROLES`/`WireTool`/`ToolChoice`/
`ResponseFormat` live in `infra/providers/contract/chat.ts` (T1); `runStructuredAgentTurn` is
`@orb/server/kit`; the rpg/crew/automation buses are their own domains' SSE surfaces; the hub/
gallery/themes/saved-rosters sets touch chat not at all (saved-rosters drives EXISTING roster
verbs by injection).
