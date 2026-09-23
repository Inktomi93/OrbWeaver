---
kind: spec
status: draft
updated: 2026-07-10
---

# 04 — migration & ledger: the wave plan, the D-entries (D66/D67/D68), resolved decisions

The build sequence for parts 01–03, the three ledger entries, and the closed decisions.

## 1. The wave plan — THREE dependency-ordered phases (cache front-loaded, tests-first)

Each wave lands alone and green; `TURNS_FLOOR` + the SHAPE floor-clamp keep every earlier wave
byte-identical. The waves group into three phases by dependency, CACHE-CRITICAL foundation FIRST — the
cache facts (the R1 pair, the per-model floor, the anthropic-family gate) land as tested-RED flags before
any wire touches them, so cache-rightness can never silently rot behind a green build (part 05; the
ADD-1 cache gate below). Every wave number/content is preserved verbatim as a sub-item under its phase —
nothing dropped, no owner ruling disturbed (R1 = pair, clamp = SHAPE, cache = anth-family, api-threading,
instruct\_type = OUT all stand).

The phases are a DEPENDENCY OVERLAY on the numeric waves, not a renumbering (the wave ids are cited from
the tracker + the task list — frozen). Each wave carries a `[Pn]` phase tag; a wave's phase is its
DOMINANT dependency, not its number. Cache-foundation waves (the flags in W1, the pair/floor/gate they
seed) come FIRST by dependency even though a low-risk independent wave (W2 sampling-slots) also carries a
low number. The phase gates:

| phase | theme | waves | gate |
| - | - | - | - |
| **Phase 1** | Foundation (cache-critical), tests-first | W1 · W5 · W6 | unit flags green (incl. the ADD-1 cache UNIT tier); the `provider.capability` emit point is DEFINED (it fires with the first Phase-2 consumer — the Phase-2 gate asserts it on the wire) |
| **Phase 2** | The wires (realize stable\|volatile per wire) | W3 · W4 · W7 · W8 · W9 | the LIVE cache probe RECEIPTS (the ADD-1 acceptance tier) + `provider.cache`/`.channel` on the wire |
| **Phase 3** | Sampling + belt + client | W2 · W10 · W11 | funnel arms green + `provider.sampling` + the security belt tests |

Phase-1 content per the brief: the capability model + the api-threading fix + ALL cache facts as
tested-RED flags (the pair, the per-model floor, the anthropic-family gate) + the VOLATILE-CONTENT
declaration (SHAPE tags content volatile; the per-wire split is realized in Phase 2) + the role-merge
squash fix (W6's SHAPE side) + the prefill-at-SHAPE gate (W5). The observability layer is designed in part 05; its `provider.*`
sink-hoist to `kit/` lands with W3 in Phase 2 (no Phase-1 wave needs the shared sink), and each wave's
own `provider.*` emit point rides that wave. W1 seeds every cache flag to today's behavior so the phase
is behavior-neutral; the RED
tests assert the SEEDED values, flipping red on any regression. W5/W6 are Phase 1 because they are engine
(SHAPE) changes the wires depend on; W6's user-KNOB surfacing rides into Phase 3's client wave (W10) but
its floor-clamp + squash FIX land here. Phase-2 content: the anth-direct backend (realizes stable|volatile
as a trailing uncached block + the R1 pair) + the OR chat-completions cache swap (single→pair,
`isAnthropicModel`→the flag) + the agent-sdk hook-channel default flip (volatile content → the
`UserPromptSubmit` hook, cache-safe, not the cache-hostile system block); this is where cache-rightness
becomes EMPIRICALLY provable (the ADD-1 acceptance probe). Phase-3 content: minP end-to-end + verbosity
live + the extended security belt (W8's belt is built in Phase 2 with the backend, exercised by the
belt tests) + the user role-handling knob surfaced (W10) + the optional first-party source (W11).

- [ ] **W0 — ratify D66 + D67 + D68 together** (§2; one sitting — the wire tests backing all three are
  the same 2026-07-10 campaign).
- [ ] **W1 `[P1]` — contracts + resolver, incl. THE API-THREADING FIX (zero behavior change).**
  D66: the `turns` axis (with `cacheMinTokens`), the exported `CACHE_MIN_FLOOR` default, `ROLE_HANDLING`,
  and `TURNS_FLOOR` in `@orb/contracts/connection`. **The Finding-1 fix (part 01 §3):** the domain
  `WIRE_SHAPES` union + `deriveWireShape(api, source)` in `domain/connection/catalog/`; add the `api`
  parameter to `resolveModelCapability` (`resolve-model-capability.ts:184`) + `resolveCapability`
  (`substrate/capability.ts:20`) + its two callers (`verbs/resolve-role.ts:192`,
  `verbs/get-model-capability.ts:19` — `selection.api` already in scope at the first); curated entries
  gain per-wire-shape `turns` cells via `refineCuratedTurns(entry, wireShape)`. Seed
  `explicitPromptCache:true` (ANTHROPIC family only) + the per-model `cacheMinTokens` +
  `roleHandlingFloor:"strict"` on every Claude arm so no later reader changes today's behavior.
  D68 contract slots: `UserIntent.minP` + `UserIntent.verbosity` + `ResolvedSampling.minP` +
  `ResolvedChatKnobs.verbosity` + `WARNING_CODES "verbosity_dropped"`. No consumer reads any of it yet.
  Tests: capability contract + the `deriveWireShape`/`refineCuratedTurns` unit matrix (every (api,
  source) → shape → per-shape `turns` cell) + resolver arms + preset-schema arms.
  Done-criteria: **satisfies the cache gate (UNIT tier)** — the §Cache-correctness acceptance gate unit
  tests (per-(model × wire) `explicitPromptCache` · `cacheMinTokens` · `roleHandlingFloor` · the pair
  intent) go RED-then-green here; the `provider.capability` event is observable once a consumer runs
  (Phase 2).
- [ ] **W2 `[P3]` — sampling completeness live (D68).** The part 03 §1/§2 funnel passes + every runner map (OR
  `minP`; kit `min_p` + the vLLM-surface/custom-byo call sites; responses `text.verbosity` + the `topK`
  rider; the chat-completions runner-side verbosity warning) + the ST importer `min_p` map + the
  preset-form spread. Behavior: minP reaches OR/vLLM/BYO where the capability lists it; verbosity reaches
  responses-served openai models. Tests: funnel arms (drop + clamp + pass), per-runner body goldens,
  ST-import mapping. Done-criteria: **emits the `provider.sampling` event** (part 05 §3d — requested vs
  applied vs dropped-with-reason) so a silently-dropped knob is greppable, not invisible.
- [ ] **W3 `[P2]` — cache placement reads the flags + the R1 PAIR (regression fix).** The OR cache-placement
  gate (`chat-completions.ts:96-105`) reads `turns.explicitPromptCache` + `turns.cacheMinTokens` instead
  of `isAnthropicModel(req.model)` + the hardcoded 1024 (behavior-neutral — the flag is anthropic-family,
  ruling 3, so it emits exactly where the model-id sniff did). **Emit the R1 PAIR** (`depth` AND
  `depth+2`) — the current single-breakpoint code is the regression (part 01 §1d / part 02 §5d) — and
  **fix the drifted `shape.ts:131-133` header** to match the emitted pair (the comment law: drift is a
  defect). Hoist `placeHistoryCacheBreakpoint` → `backends/kit/` (the OR runner imports it back — the
  part 02 §5d prep). Behavior change: Haiku 4.5 stops undercaching (floor 4096); long convos keep the
  cache hit the single breakpoint dropped. Verify: existing OR cache tests + a per-model floor arm + a
  long-convo pair-hit arm. Done-criteria: **satisfies the cache gate (unit + live receipt)** — the unit
  floor/pair tests plus the ADD-1 acceptance-tier hand-run probe showing real `cache_read_input_tokens`
  where the pair lands; **emits the `provider.cache` event** (part 05 §3a — the count/offsets/hit-ratio
  receipt that is THE rot signal). This wave also lands the part 05 §2 kit-hoist of the `provider.*` sink
  (rides the placer hoist).
- [ ] **W4 `[P2]` — dynamic-context channel + knob rename.** `contract/resolve.ts`: `DYNAMIC_CONTEXT_CHANNELS`
  union + `ResolvedChatKnobs.dynamicContextChannel` + `dynamic_context_demoted` code; `resolve-chat.ts`
  resolves it; `runner.ts` `routeDynamicContext` consumes the resolved value (ONE path, all three
  agent-sdk modes). Rename `advanced.agentSdkDynamicContext` → `advanced.dynamicContext` (backend-neutral
  — it governs the resolved channel across shapes). **CLEAN RENAME, NO migration lift (pre-launch):**
  rename the field in `userIntentSchema` (`:184`) and let the db-baseline squash carry the schema — there
  is no stored v3 preset blob to preserve (pre-launch resets wipe presets), so a `CONFIG_LIFTS` field-move
  would be migrating data that does not exist. Old name is GONE, not dual-read. (YAGNI: add a versioned
  `CONFIG_LIFTS[3]` field-move + `PROMPT_CONFIG_SCHEMA_VERSION` bump ONLY if real stored presets ever need
  to survive the rename — not before.) Behavior change: Opus
  4.8 defaults to the hook channel (cache win) on the anthropic-messages shape; openai-compat stays
  system-block. Verify: `sdk-hook-wire-probe` (mode-1) + `sdk-dynamic-content-probe --mode or` +
  `sdk-cache-probe`. Done-criteria: **emits the `provider.channel` event** (part 05 §3b — the chosen
  channel + the gating-flag `midConvCapable` + `demoted`), so the channel decision is on record without a
  model-id branch; the cache-safety of the flip shows on the same turn's `provider.cache`.
- [ ] **W5 `[P1]` — prefill at SHAPE + guard relaxation (ruling A).** Thread the resolved `assistantPrefill`
  into `ShapeInput`; gate `CONTINUATION_NUDGE` + the splice assistant\@0 floor on it. Remove the four
  write-guard prefill rejects; keep shape validation. Tests: shape suite gains prefill-true arms; the
  trailing-user-invariant tests assert BOTH arms; the four contract tests drop the assistant\@0-reject
  case and add a normalized-at-delivery case.
- [ ] **W6 `[P1]` — role-handling knob + role-merge fix + THE SHAPE-CLAMP CARRIAGE (ruling B + part 01 §6).**
  `roleHandling` on `RouteChatAssignment`, `squashSystemMessages` on `UserIntent.advanced`. **Carry
  `roleHandling` to SHAPE (a contract change — part 01 §6a):** extend the pipeline args (or
  `ResolvedConnection`) with the resolved `roleHandling` (today `ResolvedConnection` carries NO such
  field), threaded from `resolve-role` → `shapeTurn({...})` (`pipeline.ts:434`) → `ShapeInput`
  (`shape.ts:62`), like `namesBehavior`. **The clamp lives at SHAPE** (`max(roleHandlingFloor,
  roleHandling)`) — the funnel is NOT touched (stays reads-never-authors, Tier-3b invariant 9). SHAPE
  runs the clamped, boundary-aware strategy. Tests: SHAPE floor-clamp unit (every (floor, knob) pair),
  the prefix-stable squash goldens, the oracle re-baseline (blast radius below).
- [ ] **W7 `[P2]` — anth-direct contracts + routing (no behavior change), OR-source only.** `CHAT_APIS` +
  `BACKEND_KEYS` + the request arm + `deriveRunner`/`backendForSource` arms + the
  `("anthropic-messages","openrouter")` `assertCoherent` pairing + `deriveWireShape("anthropic-messages",
  *) → anthropic-direct` + the §3d sub-exclusion dispatch invalid. NO `CRED_SOURCES`/`AnthropicCredential`
  change. Every `assertNever` chases the missed arms.
- [ ] **W8 `[P2]` — the anth-direct backend.** The `@anthropic-ai/sdk` client port with THE EXTENDED SECURITY
  BELT (part 02 §4 — pin `apiKey`/`authToken`/`baseURL` + `credentials`/`config`/`profile`) + request
  builder (reusing the kit-hoisted PAIR placer, part 02 §5d) + `RawMessageStreamEvent` reducer + error
  mapping; unit + contract tests over a fake `AnthClient`; the sub-exclusion invalid-pairing tests (part
  02 §3d) + THE NAMED NO-AMBIENT-RESOLUTION TEST on the owner's box (part 02 §4). **Extend the pino
  `redact.paths` with `authToken` + `*.authToken`** — the one credential field name the existing belt
  misses (part 05 §5), defense-in-depth behind the metadata-only emit doctrine. Done-criteria: the
  backend emits `provider.turn` (with `transport:"direct"` + `credentialSource`, part 05 §3e) +
  `provider.cache` on every turn — reusing the kit-hoisted sink (part 05 §2), NEVER the secret (§5).
- [ ] **W9 `[P2]` — caps apply + wiring + probes.** The `anthropic-direct` refinement live in the resolver
  (part 01 §3/§4b — per-model prefill + the part 03 §3 sampling facts, seeded by the probe); entry
  compose registry slot; the live probe (part 02 §6) hand-run on the OR base — its sampling matrix opens
  the part 03 §3 entries. Done-criteria: **the ADD-1 acceptance-tier receipts** — the
  `anth-direct-cache-probe` + the sdk-injection cache probe show real `cache_read_input_tokens` where the
  design says (stable prefix cached; volatile tail not invalidating; the pair holding past the 20-block
  window). Phase 2 is NOT done until this probe shows the receipts.
- [ ] **W10 `[P3]` — client surface (all THREE panels are NET-NEW; owner placement ruling 2026-07-10).**
  Recon-confirmed nothing is built: Connections is a `built:false` settings stub (`settings-nav.ts:305-311`),
  `features/preset/` + `features/prompt-manager/` are empty `.gitkeep` dirs. So this is a real build, NOT
  "add fields." Placement matches committed §4.1/§4.2 — **NO ledger amendment:**
  - **Connections → the EXISTING `connections` APP Settings category** (`settings-nav.ts:305-311`): the NEO
    role-slot + key-library PORT (owner-ruled 2026-07-10 — the neo model, NOT named-savable-connections).
    Build `connections-settings-surface.tsx` + wire the switch (`settings-shell-surface.tsx:373-388`) to the
    ALREADY-BUILT server routers (`trpc.credentials.*` / `trpc.connection.*` — client never called them). Two
    sections: (a) the 7 typed ROLE slots (chat · agent · embed · rerank · imageEmbed · summarize ·
    generateImage), each a (source, model) picker — this is where the `anthropic-messages`×`openrouter`
    pairing (rides the existing OR credential, no new form) + the connection-level `roleHandling` live (on the
    chat slot); (b) the saved-KEY library — one ACTIVE credential per provider, credential resolved
    IMPLICITLY by source (NO per-slot `credentialId`). **OUT of W10, deferred to the agent-principal build:**
    the per-AGENT connection override + any `credentialId`/named-connection entity. W10 must NOT preclude the
    per-agent overlay — `resolveRole` already layers a chat override, so the agent build adds the `agent`-role
    overlay on the agent satellite table without W10 changing.
    - **LAYOUT (owner-ruled 2026-07-10 — build with this in mind):** the panel holds the 7 fixed role slots
      TODAY and a GROWING per-agent list LATER (the agent build lets people ADD/REMOVE multiple agents, each
      selecting its connection). So build a COMPACT, dense, add/remove-friendly pattern — a scannable list of
      rows (slot/agent · source · model), NOT a sprawling card-per-slot form — that scales to many entries
      without eating vertical space. The future per-agent section reuses this SAME row pattern, so agents
      landing needs no layout redesign. Space-efficiency is a hard requirement, not polish (7 slots + N agents
      would blow out a card layout).
    - **EMBED slots (owner-ruled 2026-07-10 — TWO slots, image OPTIONAL):** keep `embed` (text) and
      `imageEmbed` as two INDEPENDENT slots, NOT one merged slot. One-merged designs for a local multimodal
      rig (Qwen3-VL etc.); the GENERAL user runs a REMOTE text-only text embedder (OpenAI/Cohere/Voyage) +
      a separate-or-absent image embedder — two genuinely different choices, matching neo's asymmetric schema
      (text remote-capable, image local-only). `imageEmbed` is clearly OPTIONAL and commonly EMPTY → image
      search degrades to the captioned-text lens (`image_embeddings` image-captioned, in the text space); set
      it only for a multimodal/CLIP model or a real image-embed backend. GUARDRAIL: WARN on an embedding-
      DIMENSION mismatch between the two slots — both feed ONE fixed-dim shared vector space (`F32_BLOB(1024)`,
      cosine-compared for cross-modal search), so mismatched dims silently break raw cross-modal search;
      coherence via a warning, NOT by merging the slots.
  - **Presets → a NET-NEW rail `authoring` section** (`rail-slots.ts:29` already reserves it): the preset
    LIBRARY list + tabbed CONTENT editor + CONTEXT usage panel (`features/preset/`), per §4.1.
  - **Gen + sampling → live WITH Presets** (owner ruling — §4.2:218 "generation config is the Presets
    section, NOT settings"): the descriptor-driven params panel (`connection-capability-panel.md`) as a tab
    of the preset editor, **RENDER-FROM-`ModelCapabilityView`** (iterate `capability.sampling`; a knob shows
    only where the capability lists it; slider ranges bound to the knob's `Range`; reasoning off-toggle +
    effort from the model's `effortLevels`; `verbosity` only when present — NO hardcoded knob stack).
    Carries `squashSystemMessages` + `minP` + `verbosity`.
    - **Preset + params internals (STOLEN from the deferred `connection-capability-panel.md` +
      `preset-form-mapper-elimination.md`, integrated 2026-07-10 — additive detail our plan lacked):**
      (a) the **`quality` dial** (fast/balanced/deep — `UserIntent.quality`/`QUALITY_LEVELS` is ALREADY a
      wire field with ZERO consumers) is the PRIMARY ergonomic control (~95% of presets); a W-wave wires the
      RESOLVER to map it onto the descriptor axes (`reasoning.mode`/effort + a per-model sampling preset) as
      DISTINCT fields, NEVER a merged cascade — the raw descriptor knobs live under an "advanced" reveal
      (per-model quality numbers deferred to live tuning, like the `DEFER(promotion)` catalog notes).
      (b) reasoning control detail: `enabled` is its own axis (`effort:'none'` is NOT an off-switch), a budget
      slider from `budgetRange` when `mode==='budget'`, an "adaptive" note when `mode==='adaptive'`.
      (c) **GATE:** the panel accepts ONLY `ModelCapabilityView`; any import of a static knob list from
      outside `@orb/contracts` is RED (kills model-name string-matching + bound-drift).
      (d) the preset EDITOR binds the nested `PromptConfig` DIRECTLY (TanStack Form nested-path) and DELETES
      `PresetFormValues` + `toPresetFormValues`/`toPromptConfig` (the maintenance-tax flat mapper) — keep a
      minimal flat shadow ONLY for a field TanStack cannot bind; bounds stay sourced from
      `generationKnobSchemas` (the one bounds object); server-only fields (`advanced`/`logitBias`/`stop`/
      `regexScripts`/`variables`/`customParameters`) preserved via merge-on-submit; absent-field-round-trips-
      to-unset (`assignIfDefined`) holds.
      (e) DISTINCT from ROSTER presets (D61 `domain/roster-preset` — saved parties/casts with their own
      new-chat/roster-panel picker, RP1 schema landed): the W10 "Presets" rail section is GENERATION presets
      ONLY. Do NOT conflate the two preset kinds.
  UI surface/placement settled with the owner (standing rule) — this ruling IS the settle.
- [ ] **W11 `[P3]` (OPTIONAL, future) — first-party `anthropic` source.** The part 02 §3c promotion + the SDK
  default-base path + a first-party-key credential form. Gated on a real need; never blocks W1–W10.

**What stays byte-compatible:** every model resolving to `TURNS_FLOOR` with default knobs; the whole
agent-sdk shaped history for a strict-floor Claude; all persisted canon (nothing here touches storage —
SHAPE is per-turn derivation; the write-guard relaxation only ADMITS more, it rewrites nothing); client
display; every existing turn on a user who never sets `minP`/`verbosity` (absent knobs emit nothing).
W1's api-threading is behavior-neutral because every curated `turns` cell is seeded to today's behavior
(the `cli` transport keeps `assistantPrefill:false`, `midConversationSystem` matches the hook fact,
`explicitPromptCache` matches the anthropic-family emit).

**Blast radius:** `shape.ts` stage snapshots (`stages.squashed`/`named`) feed the host trace AND the
differential oracle — W6's boundary rule changes those bytes for the injection-adjacent case, so the
oracle/parity fixtures need a deliberate re-baseline WITH the fix called out (never a silent fixture
update). `promptSnapshot` (the persisted `TurnRequest`) changes for the same case — display-only, diff
it once. W3's PAIR adds a second `cache_control` block to Anthropic request bodies — a wire-body change
verified against the cache probe, not a snapshot regression. W5's guard relaxation is additive at the
write boundary — verify no downstream reader assumed the rejected shape was impossible (the serde read
path already tolerated it). W2 changes request BODIES only for users who set the new knobs on capable
models — byte-stable otherwise.

## 1a. The cache-correctness acceptance gate (named, receipted, enforceable)

Cache-rightness rots SILENTLY: a broken breakpoint just quietly re-bills \~12.7k tokens/turn — nothing
throws, nothing fails, the build stays green. This gate makes it STRUCTURALLY IMPOSSIBLE to "finish" a
cache-touching wave with cache broken. Two tiers, both grounded in the recon's existing conventions (the
unit flag-assertion tier + the hand-run probe tier — never CI, spends quota).

**UNIT tier (rides `pnpm check` via the normal unit lane — `tests/server/domain/connection/`).** Tests
asserting the RESOLVED cache flags equal the expected value per (model × wire-shape), so a regression
flips a RED test on a fast, quota-free run:

| assertion | expected |
| - | - |
| `explicitPromptCache` | `true` for the anthropic family on both cache-bearing shapes; `false` for every non-anthropic family (ruling 3 — OR auto-caches those with no field) |
| `cacheMinTokens` | the part 02 §5d per-model floor: Haiku 4.5 = 4096, Opus 4.8 = 1024, Opus 4.7 = 2048, Opus 4.6/4.5 = 4096, Sonnet 5/4.6/4.5 = 1024, Fable 5/Mythos 5 = 512 |
| the rolling PAIR placement | two breakpoints at `depth` AND `depth+2` from the one SHAPE-computed offset (the placer's returned offset decision — a unit assertion on the placer, part 02 §5d) |
| the volatile-content channel default | `message-tail` when `midConversationSystem` (Opus 4.8 on the anthropic-messages shape), else `system-block` (part 01 §5) |

**ACCEPTANCE tier (hand-run live probe — the recon's probe convention; NEVER CI, spends quota).** The
`anth-direct-cache-probe` (part 02 §6) + the sdk-injection cache probe must show real
`cache_read_input_tokens` hits where the design says they land: the stable prefix is cached; the volatile
tail does NOT invalidate it; the R1 pair keeps a hit PAST the 20-block lookback window that a single
breakpoint drops. The probe prints the `RESULT`-line receipts (the recon's probe contract) and the same
turn's `provider.cache` event (part 05 §3a) carries the identical numbers. **The build's cache-touching
waves (W3, W4, W8, W9) are NOT done until the probe shows the receipts** — this is the Phase-2 gate.

Threaded into every cache-touching wave's done-criteria as "satisfies the cache gate (unit + live
receipt)": W1 (unit tier — the seeded flags go red-then-green), W3 (unit + the acceptance probe on the OR
base), W8/W9 (the anth-direct acceptance probe). A cache wave that cannot show the `provider.cache`
receipt cannot prove it satisfies this gate — the observability event (part 05) and this gate are the
same signal read two ways (a red unit test on drift; a live receipt on demand).

## 1b. The observability gate (the instrumentation ships WITH the feature)

Every cache/channel/capability/sampling-touching wave's done-criteria REQUIRES its `provider.*` event on
the wire (part 05 §3), not as a follow-up. The per-wave threading is inline above; the rule: an
un-instrumented cache/channel/sampling wave is NOT done. The mapping — W2 → `provider.sampling`; W3 →
`provider.cache` (+ the part 05 §2 kit-hoist of the shared sink); W4 → `provider.channel`; W1's resolver
work → `provider.capability` (observable once a Phase-2 consumer runs); W8 → the anth-direct
`provider.turn`/`.cache` with `transport`/`credentialSource`. Redaction is load-bearing and non-optional
(part 05 §5): NEVER the OAuth token / api key, NEVER full prompt/character content above `debug`; the
live toggle is the EXISTING `appSettings.logLevel` (owner rule: AppSettings-over-ENV).

## 2. D-ledger

**Why THREE entries (D66 · D67 · D68), not one mega-D:** independently ratifiable decisions with
distinct enforcement surfaces and build gates — D66 = a capability axis + shaping policy
(contracts/domain/engine), D67 = a new sealed backend + routing + a security invariant (infra), D68 =
generation-param completeness (preset contracts + funnel + runners). D66-W1 is a prerequisite of both
others; D68 is independent of D67 and can ship while anth-direct waits. The ledger's precedent is one
axis-decision per entry (D45 vision, D48 tools); a mega-D forces all-or-nothing ratification and blurs
which wire test backs which clause. All three ratify together in one sitting (W0); this doc set is the
shared design record.

Touches (all preserved, none amended):

| entry | relation |
| - | - |
| §1 R1 (rolling-PAIR breakpoint COMPUTED in SHAPE, placed by the runner) | preserved AND corrected: R1 is the PAIR (`depth`/`depth+2`); the current single-breakpoint code is the REGRESSION W3 fixes (part 01 §1d). part 01 §6 keeps the math in `shape.ts`; part 02 §5d reuses the same placer (kit-hoisted, pure positional). Route B killed largely for violating R1's SHAPE-computes rule. |
| §1 R9 / Tier-3b invariant 9 (infra reads the capability off the request, never imports `resolveModelCapability`; the funnel never authors) | preserved — the funnel + the cache-placement gate + anth-direct gain consumers of NEW axes, still injected. The role-handling clamp lives at SHAPE, NOT the funnel (ruling 2), so the funnel stays reads-only. |
| D8 / D25 (agent-sdk session is backend-internal) | preserved — only the dynamic-context DEFAULT changes; session vocab never surfaces; anth-direct is stateless. |
| D17 (the sub is the owner's box) | extended — the sub-exclusion (part 02 §3d) + the extended security belt (part 02 §4) protect a new surface. |
| D31 (connection→credentials source axis) | preserved — v1 reuses the existing `openrouter` source; the `anthropic` promotion is optional/W11. |
| D45 / D48 / D51 (vision · tools · unsupported-warning) | the precedent this design generalizes: engine reads a declarative capability flag; the warning taxonomy gains `verbosity_dropped`. |
| D63 (the `appearance` user-settings namespace) | cited — the repo-grounded precedent that user prefs (`roleHandling`/`squashSystemMessages`/`minP`/`verbosity`) are settings, not model-id branches (README bar). |
| Tier-3b invariant 3 / Esoteric §7 (`isAnthropicModel` sealed wire-dialect sniff) | preserved — W3 replaces only the DOMAIN-computed cache-placement gate; the sealed wire-dialect sniff stays in `backends/kit`. `deriveWireShape` derives the shape from `(api, source)` inside the DOMAIN catalog — no infra `runner`/`BackendKey` vocab leaks up. |
| Tier-3b invariants 1–9 | anth-direct lands per the §7.5 recipe (source arm + runner arm together — v1's source is the existing `openrouter`, so only the api/runner arms are net-new). |
| the `provider.*` log taxonomy (`backends/agent-sdk/log.ts`) + the pino `redact` belt (`logger.ts:132-149`) + `appSettings.logLevel` | EXTENDED, not replaced (part 05): the `provider.*` sink is promoted to `backends/kit/` (the sink header ALREADY anticipates the second-backend hoist) and gains `provider.cache`/`.channel`/`.capability`/`.sampling`; the existing redact belt + the existing `logLevel` AppSettings toggle carry it — zero new logging framework. |

**D66 (proposed) — capability-gated turn shaping:**

- **(A) `ModelCapability.turns`** — `assistantPrefill` · `midConversationSystem` · `roleHandlingFloor`
  (a `ROLE_HANDLING` union floor) · `explicitPromptCache` · `cacheMinTokens` (per-model min-cache floor,
  fixes the hardcoded-1024 live bug), + `TURNS_FLOOR` + `CACHE_MIN_FLOOR`, derived ONLY in
  `domain/connection/catalog/`, keyed on (WIRE-SHAPE × MODEL) — where the wire-shape is DERIVED inside
  the catalog from `(api, source)` via `deriveWireShape` (the load-bearing threading fix, part 01 §3;
  curated entries carry per-shape cells). `explicitPromptCache` is an ANTHROPIC-FAMILY fact, NOT
  cache-pricing (ruling 3: OR auto-caches non-Anthropic with no field). Honor facts seeded by the
  2026-07-10 live matrix (part 01 §2).
- **(B) Prefill persistence-doctrine amendment (ruling A).** The universal "assistant\@0 unsupported"
  WRITE-reject (persona/chat/world-info/character `superRefine`) is SUPERSEDED by "capability-gated at
  SHAPE delivery with a mandatory normalize on a `assistantPrefill:false` model." Authored prefill is
  persistable; safety moves from the write guard to the delivery gate (a false-model that receives a
  trailing assistant HARD-400s).
- **(C) Role-handling is a USER KNOB above the capability FLOOR, clamped AT SHAPE (ruling B).**
  `roleHandling` (connection-panel, `RouteChatAssignment`) + `squashSystemMessages` (prompt-panel,
  `UserIntent.advanced`); effective = the stricter of knob and floor, computed at SHAPE (ruling 2 — the
  clamp lives where the merge happens; ONE home, the funnel untouched). The knob is CARRIED to SHAPE via
  the pipeline args (a contract change — `ResolvedConnection` has no such field today, part 01 §6a).
  Every selected strategy runs the prefix-stable pass (part 01 §6b).
- **(D) The `developer` role is RESERVED VOCABULARY.** A member of the role/dynamic-context union so the
  type + resolver anticipate it, but explicitly NOT WIRED — `system` is the only implemented authority
  role (operator authority is anthropic-wire-only, part 01 §2). Marked `@future`; no runtime path
  constructs a `developer` row until a wire is proven to honor it.
- **(E) The OR cache placement.** OUR domain-computed cache placement reads `explicitPromptCache` +
  `cacheMinTokens` (fail-closed to `CACHE_MIN_FLOOR`), not an in-runner model-id sniff + constant, and
  emits the R1 PAIR (part 02 §5d). The open-weight `roleHandlingFloor` uses the EXISTING
  `model-family.ts` family detection → fail-closed `strict` — NO per-model instruct signal (instruct
  mode is out, owner-ruled).
- **(F) The per-turn observability layer + the cache-correctness acceptance gate (owner-demanded, part
  05 + §1a).** The `provider.*` structured-log taxonomy is promoted to a shared kit sink and gains
  `provider.cache` (the cache-rot receipt: read/write tokens · breakpoint count/offsets · hit-ratio) ·
  `provider.channel` · `provider.capability` · `provider.sampling`, one DECOUPLED emitter each (the event
  carries resolved facts as fields — NO model-id/wire branching at the emit site). One turn is
  reconstructable end-to-end via the existing request-scoped `requestId` + a per-turn `turnId`. Levels +
  the toggle live in the EXISTING `appSettings.logLevel` (AppSettings-over-ENV); redaction is mandatory
  (never the token/key; no prompt/RP content above `debug`). The cache-correctness gate (§1a) makes
  cache-rot a red unit test (resolved-flag assertions) AND a hand-run live-probe receipt — a
  cache-touching wave is not done without both. Instrumentation is a per-wave done-criterion (§1b), not a
  follow-up.

**D67 (proposed) — the anth-direct backend:**

- **(A) `anth-direct`** — a sealed PAID-ONLY direct Anthropic-Messages chat backend
  (`backends/anth-direct/`): new `BackendKey "anth-direct"`, new `ChatApi "anthropic-messages"`, new
  `ChatRequest` arm; the official `@anthropic-ai/sdk` (already resolved; promoted to a direct
  `packages/server` dep) behind a narrow structural port, riding the global egress-firewalled
  dispatcher; tool-less, stateless, chat-role-only. ADDITIVE — no agent-sdk mode deprecated; the agent
  role structurally cannot route here (the api-pin + `deriveRunner`, part 02 §3b).
- **(B) The TRANSPORT axis under the anthropic-messages wire:** `cli` (agent-sdk) vs `direct`
  (anth-direct). Delivery-dependent facts (`assistantPrefill`; the sampling set; the
  `explicitPromptCache` apply-site) resolve per (wire × transport × model); honor facts stay per (wire ×
  model). Derivation stays solely in `domain/connection/catalog/` (README bar).
- **(C) v1 PRIMARY source = the existing `openrouter`** (SDK `baseURL`+`authToken` Bearer, part 02 §4) —
  ZERO new credential. The first-party `anthropic` STORAGE→DISPATCH promotion is OPTIONAL, additive,
  deferred to W11.
- **(D) THE SUB-EXCLUSION + THE EXTENDED SECURITY BELT:** `max-pro-sub` × `anthropic-messages` is a
  typed fail-closed invalid at dispatch, unconstructable at the type level, and structurally empty of key
  material — AND the runner pins every `@anthropic-ai/sdk` ambient credential surface
  (`apiKey`/`authToken`/`baseURL` + `credentials`/`config`/`profile`, part 02 §4), so the SDK cannot
  lazily mint the host `claude login` OAuth token on the owner's box. A named no-ambient-resolution test
  proves it (W8).

**D68 (proposed) — sampling completeness:**

- **(A) `minP` end-to-end.** A real `UserIntent` knob resolved by the funnel into `ResolvedSampling.minP`
  and emitted on every wire with a slot (OR chat `minP`; vLLM/BYO `min_p`); the ST importer maps `min_p`
  instead of dropping it. The capability side already existed; this closes the dead middle. RP-critical.
- **(B) `verbosity` live.** A `UserIntent.verbosity` knob (derived from the capability vocab),
  funnel-gated (`verbosity_dropped` warning), applied on its REAL OR wire home — the Responses API
  `text.verbosity` (the OR `ChatRequest` has NO verbosity field in SDK 0.13.19 — type-verified; the
  chat-completions runner drops LOUDLY, verify-then-add). Includes the responses `topK` rider.
- **(C) Direct-transport Claude sampling is PER-MODEL, fail-closed.** The Messages wire carries
  `temperature`/`top_p`/`top_k`/`stop_sequences`, but the SDK documents post-Opus-4.6 models as REJECTING
  non-default values (part 03 §3) — so the `direct` sampling capability is a resolver fact per model,
  seeded `{}` until the W9 probe verifies each entry (Anthropic's 0–1 temperature range, a distinct
  `ANTHROPIC_TEMP_RANGE`). The `cli` transport stays sampling-less.

## 3. Resolved decisions + non-goals

Every prior open question is a decision — recorded so the reasoning survives a cold read.

| # | decision |
| - | - |
| wire-shape key producibility | THREADED — `deriveWireShape(api, source)` in the catalog + the `api` param on the resolver + per-shape curated cells (part 01 §3). The prior "the resolver already receives the api" was FALSE; this fix makes the per-shape cells real. |
| prefill matrix | resolver family+version facts, fail-closed `false`, per-model (+ per-transport on anthropic-messages); anthropic seeded by the live matrix (opus-4.5/haiku-4.5 `true`, opus-4.8/sonnet-4.6 `false`). Non-anthropic families `false` until a live matrix extends them. |
| relax the write guards | YES — ruling A / D66-B. Removed; safety at the delivery gate. |
| role-handling clamp home | SHAPE, not the funnel (ruling 2) — the clamp lives where the merge physically happens; the funnel stays reads-never-authors. The knob is a `RouteChatAssignment` field carried to `ShapeInput` (a contract change, part 01 §6a). |
| alternation per family | NO separate "flip a family" — the USER picks via `roleHandling` above the model floor (ruling B). |
| open-weight `roleHandlingFloor` | family detection (`model-family.ts` regex → family) → fail-closed `strict`. **NO instruct\_type** — instruct mode is out (owner-ruled); no catalog-entry `instruct_type`, no `fetchOrCatalog` change for it. |
| rolling breakpoint | the R1 PAIR (`depth`/`depth+2`) — COMMITTED, not optional; the current single is the regression W3 fixes; the drifted `shape.ts:131-133` header is fixed with it (ruling 1). |
| `explicitPromptCache` derivation | ANTHROPIC FAMILY, not cache-pricing (ruling 3) — OR auto-caches non-Anthropic with no field (`kit/cache-control.ts:6-8`); `cacheMinTokens` fail-closes to `CACHE_MIN_FLOOR` when absent. |
| daemon turn-caps | prefer the live daemon fact when `supportedModels()` exposes it; the `resolveAgentSdkAlias` override seam is designed now (part 01 §4b), inert until the field exists. |
| knob rename | `advanced.agentSdkDynamicContext` → `advanced.dynamicContext` (backend-neutral) — CLEAN rename, NO lift (pre-launch: baseline squash wipes stored presets, nothing to migrate); old name gone, not dual-read. Add a `CONFIG_LIFTS` field-move only if real preset data ever needs preserving (YAGNI); W4. |
| pre-launch data posture (governs EVERY wave) | NO data-preservation migrations. Renames are CLEAN BREAKS (old name gone, never dual-read); schema changes are db-baseline SQUASHES, not incremental (`db-baseline` convention); the db is nuked freely. NO lift / read-heal / version-walk machinery — add it ONLY post-launch when real data must survive (owner-ruled 2026-07-10). A wave that specs a migration to preserve pre-launch data is over-built. |
| W10 UI placement | owner-ruled 2026-07-10, NO ledger amendment (matches §4.1/§4.2): Connections → the existing `connections` Settings category (server routers already built, client-side net-new); Presets → a net-new rail `authoring` section; gen + sampling → WITH Presets (the descriptor-driven params panel, render-from-`ModelCapabilityView`), NOT settings (§4.2:218). RESOLVES the presets-moving-to-settings PENDING marker (§4.2:176) toward the existing law — presets stay rail. All three panels are net-new client builds. |
| W10 connection-slot model | owner-ruled 2026-07-10: the NEO model — 7 typed role slots (source+model each) + a saved-key library (one active credential per provider, credential IMPLICIT by source). NOT named-savable-connections, NO per-slot `credentialId`, one-active-per-source preserved. Per-AGENT connection overrides (agent principals only — crew rides host `agent`, no own slot) are DEFERRED to the agent-principal build (satellite table + `resolveRole('agent')` overlay); W10 must not preclude them but does not build them. |
| OR anthropic-proxy mid-conv-system | YES, wire-tested — Opus 4.8 on the OR key HONORS it (200, operator authority). `midConversationSystem:true` on the anthropic-messages shape for Opus 4.8, both transports. |
| openai-compat message-tail role | openai-compat keeps `system-block`; NO message-tail system (wire-tested: accepted but no authority). `developer` stays reserved-not-wired (D66-D). |
| anth-direct HTTP client | the official `@anthropic-ai/sdk` behind a narrow port (part 02 §4) — already in the lockfile, drift-absorbing, egress-firewalled automatically; raw fetch buys no extra safety. |
| anth-direct ambient-credential belt | pin ALL of `apiKey`/`authToken`/`baseURL`/`credentials`/`config`/`profile` (part 02 §4) — the SDK can lazily mint from host config/OAuth otherwise; a named test guards the owner's box (finding #3). |
| verbosity wire home | the OR Responses `text.verbosity` (type-verified); chat-completions has no field in 0.13.19 — loud runner-side drop, verify-then-add (D68-B). |
| direct-transport sampling seeding | fail-closed `{}` per curated entry until the W9 probe verifies it — the SDK's post-4.6 deprecation makes a blanket unlock a 400 factory (D68-C). |
| D-ledger granularity | three entries (D66/D67/D68), ratified together — §2's rationale. |
| observability layer home | EXTEND the existing `provider.*` taxonomy (`backends/agent-sdk/log.ts`, promoted to `backends/kit/`) — NOT a new framework; decoupled emitters, resolved facts as fields, no emit-site model/wire branch (part 05). Toggle = the existing `appSettings.logLevel`; redaction = the existing pino `redact` belt (part 05 §5). |
| cache-correctness gate | a NAMED two-tier acceptance gate (§1a): unit resolved-flag assertions (ride `pnpm check`) + a hand-run live-probe receipt (never CI). Threaded into every cache-touching wave's done-criteria; a wave without both tiers is not done. |
| phase structure | the W0–W11 waves group into THREE dependency-ordered phases (cache-foundation FIRST) as a `[Pn]` OVERLAY — wave ids stay frozen (tracker/task-list-cited), never renumbered; §1's phase-gate table + per-wave `[Pn]` tags. |
| wave→phase assignment | P1 = W1·W5·W6 (foundation + engine SHAPE changes the wires depend on); P2 = W3·W4·W7·W8·W9 (the wires + the live cache-probe gate); P3 = W2·W10·W11 (sampling · client · optional first-party). W2 (sampling) is P3 content with a low number — an independent, low-risk contract-slot fill, not a foundation dependency. |

**Non-goals:** tools / agent loop / MCP on anth-direct (agent-sdk's charter — permanently) · deprecating
ANY agent-sdk mode · `responses`-style structured output on the anth-direct arm (with first consumer;
Anthropic structured output is tool-forcing) · `openai`/`google_vertex` dispatch promotion (separate
proposals) · a session cache for anth-direct (stateless by design) · Anthropic Batches/Files APIs ·
`summarize`/agent arms on anth-direct (cheap later additions) · OR provider-preferences on `/v1/messages`
(verify-then-add) · the first-party `anthropic` source in v1 (optional W11) · a thinking-block
cache-invalidation capability fact (part 02 §5d — promote only if it starts driving placement) ·
exposing `seed`/`logitBias`/penalties on the Messages wire (no such fields) · **instruct mode / an
`instruct_type` catalog fact (owner-ruled OUT).**
