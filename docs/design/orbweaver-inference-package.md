---
kind: design
status: active
updated: 2026-09-20
---

# Orbweaver `@orb/inference` — design and implementation plan (v4)

Status: proposal v4, 2026-09-19. Six review passes are folded, in order: `.review.md` (stickler, `335cf5004`),
`.verify.md` (verifier, `047320b97`), `.verify3.md` (`53f5a63de`), `.verify4.md` (`9ba94d9f1`), `.ground5.md`
(design-grounding, `35b675422`), `.verify6.md` (`5b24c9c32`). Nothing from any of them is deferred; §15c lists
what they paid for. Paths below were last re-read on `5b24c9c32`. Every path is real unless marked NEW. A cold
reader should be able to implement this without the conversation that produced it. Seventh pass
(`.verify7.md`, `abc3a71c7`) folded 2026-09-19: H1–H9, M1–M9, L1–L6. Then `.verify8.md` + `.sideeye8.md`,
`.verify9.md`, and three whole-file scouts on `954c12004` (`.scout-compose.md`: compose services/role-clients/chat
— nothing refuted; `.scout-rpg-conn.md`: rpg.ts + domain/connection — nothing refuted; `.scout-surfaces.md`: the
four vLLM non-chat surfaces, three engine modules, custom-byo runner, agent-sdk session — four findings folded
into §8.1/§8.1b/§5.3b/§14 F24/§15/§15c-18); then `.scout-providers.md` (`vllm/surfaces/chat.ts`, the agent-sdk
backend, the concrete session writer, storage, sdk-session schema — nothing refuted; writer named in §5.3b) and
`.scout-compose2.md` (automation-plugin, rpg/imagery fences, models verb, ST serde, the two contract comments,
turn/read/compaction — three cite corrections in §13 row 2, §4, §15).

What this program does, in one breath: THERE IS NO OWNER-SHARED ANYTHING (owner word 2026-09-19) — no owner
engine, no owner subscription, no owner credential; every provider a user reaches is a CONNECTION row they own,
funded by the principal who triggered the turn (`funderUserId`, D19 amended), and the agent SDK runtime gets a
persistent PER-USER directory. The in-server vLLM fleet machinery is YEETED to `tooling/src/stack` (the owner's
own dev fleet); vLLM, LM Studio, Ollama, llama.cpp, TGI and any custom endpoint are provider ROWS on one
`openai-compatible` transport whose quirks are an `EndpointFeatures` data block, never server-named code; the
server knows an endpoint as a URL + a features block + a reachability probe + a ~150-line wake-on-next-turn
slice; every `VLLM_*` env key, the keyless mint, the D142 born default, the D17 shared-compute budget and the
vLLM-specific turns floor/thinking door go with the owner-engine premise; endpoint body quirks ride the
connection's `extras` under modelled-wins (D143(b)/D156 unchanged); there is NO default model — unpicked is
`no-connection`; the shipped container is app-only (`Dockerfile:8-12`, `c4e2b9024`) and does not change; the
`CredentialSource` routing axis is RETIRED for a registry (F7) and the vocabulary map gets its ruled edits
(`anthropic` + `anthropic-messages` return for per-user API keys, the OR-skin row goes); `domain/connection`
survives as the thin domain front door; the consent belt is DELETED because nothing is shared; the hand-kept
firewall becomes derived policy (D39 amended); the axes are REBUILT forward — wires (code) × providers (data
rows) × connections (a user table) × modalities × tasks (§3.2); step 4 WIPES `user_credentials` rather than
carrying rows across the provider-id respelling (F2); the two hosted wires ride the Vercel AI SDK (F9); every
collision with a recorded ruling is an explicit owner fork in §14 with a stated default.

POSTURE (owner word 2026-09-19): **pre-launch, nobody is using this, and the app does not need to stay usable
while the program lands.** So: NO settings lifts, NO data migrations that carry old rows forward, NO dual-read
or compatibility re-exports, NO "thin adapter until step N". Old shapes are deleted in the same commit that
lands the new ones; the owner re-creates his handful of connections by hand. The only thing that survives from
the migration discipline is D163's MECHANICS (the baseline is frozen and drift is boot-fatal, so every schema
change is still a numbered forward migration file) — but that file may DROP and CREATE freely; it does not
preserve data. Lanes are green at `pnpm verify`, not "the app works between lanes".

---

## 0. TL;DR

- **Five primitives, built forward (§3.2, §5):** `wire` (closed: `openai-compat | anthropic-messages |
  agent-sdk | local-light`, one backend each — the only code axis), `provider` (registry ROWS: OpenRouter,
  Anthropic, OpenAI, Groq, vLLM, LM Studio, Ollama, custom… — most are openai-compat + a `features` block, zero
  code), `connection` (a per-user TABLE: credential + provider + model + declared overrides + extras + transport
  - spend flags — THE unit every binding references by id), `modality` (`text | image | video | audio | file |
    vector`), `task` (closed + `TASK_DEFS`). `CredentialSource`/`CRED_PROVIDERS` as routing/storage enums,
    `roleDefaults.{source, model, api}` in the settings blob and the one-active-row-per-provider index are
    RETIRED by this program; per-task picks are `connection_bindings` rows (§5.3).
- Keep vLLM as a provider, and only as a provider: a provider row (`wire: openai-compat`, the
  `openai-compatible` transport, `auth: endpoint` — base URL + optional `--api-key` bearer — and a `features`
  JSON block for its quirks) that a user connects to; a cached `GET /v1/models`
  reachability probe for the #54 pre-send gate; and `wake/` (is-sleeping + `/wake_up` + await-ready before a
  request when the row's folded `features.sleep` is set). Everything else in `vllm/engine/**` — supervisor loop,
  breaker, markers, spawn, reap, pidfiles, GPU detect, wake budgets, auto-sleep, the argv builder, launch
  config, postures — leaves the server for `tooling/src/stack` or is deleted. No `VLLM_*` env survives in the
  server; there is no `ENGINES_POSTURE`.
- Extract `packages/server/src/infra/providers/**` (executor, one backend per wire, funnel) into one
  node-only workspace package, `@orb/inference`, between `db` and `server`. `domain/connection` STAYS in
  server as the selection domain and the transport's front door; its verbs delegate to the runtime.
- Split capability into **kinds** (generation, embedding, rerank) with per-kind schemas whose modality axes
  are `Modality[]`, and ONE evidence ladder (`EVIDENCE_TIERS`, §6.2). D143(c)'s permissive
  posture for undeclared local endpoints survives with its input changed; D112's fold guard survives as a floor.
- Make the Claude subscription a **per-user connection** (provider `claude-sub`, wire `agent-sdk`, a pasted
  `claude setup-token` sealed in a credential row, a persistent per-user runtime dir), delete the host-file
  adoption, the OAuth refresh, the whole by-proxy consent belt AND the OpenRouter agent-sdk skin (mode-2:
  `agent-sdk` is for the subscription only). Add a first-party **`anthropic`** provider (API key, wire
  `anthropic-messages`, no subprocess) after the vocabulary-map edit.
- One `openai-compat` backend over the Vercel AI SDK with exactly TWO transports (`openai-compatible` via
  `createOpenAICompatible` per connection; `openrouter` via the official `@openrouter/ai-sdk-provider`) and
  NO server-named code: a server's quirks (prefill spelling, strict JSON, sleep/wake paths, template-kwargs key,
  rerank path, pricing, concurrency) are an `EndpointFeatures` block shipped as data on the provider row and
  overridable per connection (§8.1b); user body fields are `extras`; a custom endpoint's request/response
  transforms are `transport`. Built-in provider rows and curated capability tables are JSON in one schema, not
  TypeScript literals. The raw `@openrouter/sdk` is DROPPED (models list, credits, generation lookup become three
  plain `fetch` calls; images ride the provider's `imageModel()`). `anthropic-messages` rides `@ai-sdk/anthropic`.
  Private-endpoint admission is a deployment allowlist, not an owner-row derivation (F12). §8.0–§8.2.
- Streaming: the package owns **provider → `ChatDeltaEvent`/`ChatEvent`**; it does NOT own server → client
  streaming. §9.

---

## 1. Why

1. A launch user has no three-engine vLLM fleet. The runtime must be useful on a laptop with an OpenRouter
   key or a single local OpenAI-compatible server, and the picker must never offer a source that is not wired.
2. Adding a task, a backend, a source, or a capability bit today touches 6–10 hand-kept sites whose comments
   say "keep in sync" (`packages/contracts/src/settings/index.ts:472-479`). Growth must be a `tsc` error.
3. Every consumer (chat SHAPE, refinery, rpg, imagery, automation, plugins) must ask one runtime one question
   and get a capability back with the connection. The capability is chat-shaped only; embeddings have none.
4. The subscription is host-bound and owner-only at the mint. Users must bring their own token.

---

## 2. Current state (receipts)

### 2.1 The cake

`kit ← contracts ← db ← server ← client`, plus sealed `ui` (`kit ← ui ← client`). A below-server
node-only package has precedent (D160). `packages/client` declares no `@base-ui` dep and has 0 direct imports.

### 2.2 The PURGED providers tier `packages/server/src/infra/providers/` (executor — "it executes; it never selects", `Tier-3b-Providers.md:11`)

| Path | Role |
| - | - |
| `contract/backend.ts` | `BACKEND_KEYS` (agent-sdk, openrouter, vllm, local-light, custom-openai), `PROVIDER_ROLES` (chat, agent, embed, rerank, imageEmbed, summarize, structured, generateImage), `ProviderBackend`, `BackendRegistry`, `ProviderExecutor`, `WireCaptureSink`, `FirewallRequest` (`ownerConsented` at `:143-150`) |
| `contract/chat.ts` | `ChatRequest` discriminated on `api`; `onDelta`/`onEvent` callbacks (`:131-133`) |
| `contract/roles.ts` · `resolve.ts` · `events.ts` | non-chat requests; `ResolvedChatKnobs` + `WARNING_CODES`; `ChatEvent` (SDK-decoupled) |
| `roles/dispatch.ts` | `deriveRunner(api, source) → BackendKey` (the only `{api,source}`→backend map); `requireBackend`; `runRole` (one span + abort flatten) |
| `roles/firewall.ts:11-26` | `ROLE_SOURCE_POLICY: Record<ProviderRole, CredentialSource[]>` hand-kept; `max-pro-sub` requires `ownerConsented` (`:46-48`) |
| `resolve-chat.ts` | the `(UserIntent × ModelCapability) → ResolvedChatKnobs` funnel; second consumer `preset.resolveEffective` |
| `backends/kit/` | retry, sanitize, history projection, openai-compat body+stream, error-classify, cache-control (`isAnthropicModel`, a DELIBERATE regex duplicate per Tier-3b esoteric #7), reasoning-budget, image-normalize, abort-flatten, wire-schemas, provider-log |
| `backends/openrouter/` · `custom-byo/` · `local-light/` | as named |
| `backends/agent-sdk/` | ~4.0k lines: env firewall with mode-1 (host file OR `CLAUDE_CODE_OAUTH_TOKEN`, `env.ts:343-380`), mode-2 (OR skin), mode-4 dormant; `host-token.ts` refresh (file-arm only, `:88-99`); D8 session store (in-memory, keyed by sessionId); runner; agent-runner; terminal-tools; summarize/structured shapers; verify-auth; catalog |
| `vllm/engine/` | 3.4k lines TS + templates: `supervisor.ts` 666 (poll/adopt tick + the MANAGER spawn arm), `process-identity.ts` 551, `fleet-control.ts` 443 (hold/stopped markers, `postSleep`/`postWakeAndAwait`/`getIsSleeping`, metrics, capacity, auto-sleep), `build-argv.ts` 441 (THE argv builder), `wake-budget.ts` 215, `wake-gate.ts` 186 (`ensureAwake`; imports reaper + gpu for the spawn-wake path), `client.ts` 180, `spawn-engine.ts` 155, `reaper.ts` 54, `gpu.ts` 35, `engine-url.ts`, `engine-control.ts`, `engine-status.ts`, `gen-window.ts`, the three per-surface clients. Owner ruling 2026-09-19 (#2421/#2423): unset posture = adopt-only ("never waking or spawning", `posture.ts:52`); the MANAGER posture owns spawn + auto-sleep (`compose/services.ts:218`). THE CONTAINER STORY (`Dockerfile:8-12,80-82`, `docker/compose.engines.yaml`, `tooling/src/stack/lib/engines-compose.ts`, commit `c4e2b9024`, owner ruling 2026-09-18 "one engine story"): the image carries NO supervisor and defaults `ENGINES_POSTURE=off`; engines run as peer containers whose `command:` is generated from `buildEngineArgv`, the app runs `adopt-only` against `VLLM_ENGINE_HOST`. The retired GPU all-in-one image was the only thing that spawned inside a container. Consumers the split re-points: `entry/{app,lifecycle}.ts`, `entry/compose/{services,admin}.ts`, `domain/admin/{service,verbs/vllm,contract/service,contract/views}.ts`, `transport/trpc/routers/admin.ts`, `domain/settings/effective-config/layer.ts` + `contracts/settings::engineLaunchSchema :253-286`, client `user-admin/components/{admin-engines-section,compute-section,engine-launch-config}.tsx`, tooling `stack/ops/{engines,engines-ctl}.ts`, `stack/lib/{engines-compose,dev-process-identity}.ts`, `stack/contract/types.ts`, `stack/{engines,stack,dev,multi-user-fixture}.sh`, `seed/lib/fake-vllm.ts`, `snap/ops/stage.ts`, `verify/gates/no-raw-egress.ts`, `verify/lib/reviewed-grants-{depcruise-to-egress,no-to-factory}.ts`, `scripts/probes/rpg-extraction/local-8b-vehicles.ts`, and the now-purged `foundation/env/posture.ts`. |
| `vllm/surfaces/` | chat (`strictByDefault :321-330`; thinking door `:154-211` bound to the vendored template; prefill pair `:213-281` gated on measured `VLLM_TURNS.assistantPrefill`; D156 belt denylist `:380-433`), embed, image-embed, rerank, summarize(+structured) |
| `index.ts` | `createBackendRegistry(deps)`, `createProviderExecutor` |

### 2.3 `packages/server/src/domain/connection/` (selection — stays)

`contract/service.ts` (`ConnectionContext`, every dep injected; NOTE `:19` type-imports `ClaudeBackendPosture`/
`EnginesPosture` from foundation INSIDE the contract; SEVEN members exist only for the owner box and are
DELETED with it — `vllmAvailable :100`, `enginesPosture :104`, `hostClaudeAvailable :108`,
`claudeBackendPosture :112`, `localGenEngineReachability :115`, `isOwner :119` (the owner-only `max-pro-sub`
picker arm in `get-models-for-source.ts`, D142's last survivor), `localLightDefaults :122` (→ the curated row);
their 14 `ctx.*` reads in `verbs/` go with them: `applyVllmFallback` (`resolve-role.ts:129-135`, the
DERIVE-role reroute from `vllm` to `local-light` when `!vllmAvailable`) is DELETED, not re-keyed — §7.2 has no
fallback, an unset vector task is `no-connection` (verify4 M8); `warmAgentSdkCatalog`'s `hostClaudeAvailable` gate becomes "the caller has a `claude` row",
`checkChatAvailability`'s engine/host arms become `reachability.ts` + `runtime-missing`), `verbs/resolve-role.ts` (`ROLE_SELECTORS :61-63`, born
chat default = `vllm × chat-completions` per D142, `assertCoherent :165-180`, `WARM_WINDOW_TRUTH`),
`verbs/resolve-chat.ts`, `verbs/check-chat-availability.ts` (#54 gate reading the supervisor's live
reachability `:12-18,37-48`), `verbs/get-models-for-source.ts`, `catalog/resolve-model-capability.ts` (the
vllm arm `:417-431`: `staticProfile(window, fullSampling=true, structuredOutput=true)`, `input: {vision:true,
video:true}` by D143(c) permissive ruling and #317, `tools: {parallel:true, silencesProse:true}` measured
36/36 per D112), `catalog/turns.ts` (Anthropic version regexes = the ONE derivation, D69; measured
`VLLM_TURNS :161-197`), `catalog/model-family.ts`, `workload-contributions.ts` (type-imports
`#domain/workloads`; D117(1) homes `WorkloadContribution` in the workloads domain).

### 2.4 Contracts (stay)

- `credentials/index.ts:18` `CRED_SOURCES = max-pro-sub|openrouter|vllm|local-light|custom_openai` (D31: the ONE
  home); `:25` `CRED_PROVIDERS = openrouter|anthropic|openai|custom_openai` (the STORAGE axis; `anthropic`/
  `openai` are forward-compat slots with no resolver arm).
- `connection/index.ts` `CHAT_APIS` (three members, "no anthropic-messages" per D31), `ModelCapability`, the three
  read helpers, `ROUTING_ROLE_KEYS` (no `agent`, no `structured`), `RouteChatAssignment`, `CHAT_UNAVAILABLE_CAUSES`
  (includes `host-claude`).
- `settings/index.ts:485-521` `chatRoleConfigSchema` (api + providerRouting) vs the flat role schemas;
  `INFERENCE_SOURCES`/`SUMMARIZE_SOURCES`/`GENERATE_IMAGE_SOURCES` mirror the firewall by design (D39);
  `USER_SETTINGS_SCHEMA_VERSION = 8`, additive lifts stamp it (`:416-434`); `allowNonOwnerMaxProSub :393`.
- `docs/design/vocabulary-map.md:160-183` — the connection register: the six spoken modes; "the purged
  `anthropic-messages` api and the first-party `anthropic` source are not members of either axis — do not
  resurrect either word."

### 2.5 The db

`packages/db/src/schema/credentials.ts:9-12` — ciphertext AAD is `${userId}|${provider}`; a slot move is a GCM
decrypt failure. `:79` one active row per `(owner_id, provider)`. `:80` SQL CHECK from `CRED_PROVIDERS`.
`embeddings.ts:22-28,76-86` the `(model, dim)` space tag law; the local-light tag now carries a dtype
(`jinaai/jina-clip-v2@q8`, #2417, `entry/compose/role-clients.ts:187-204` — that binder module is purged; it folded into `entry/compose/services.ts`).

**The message rows (re-read 2026-09-19, `db/schema/chat.ts`):**

- `messages` (`:301-396`) — SLOT-level attribution only (`authorUserId`, `characterId`, `personaId`,
  `selectedVariantId`, `kind`, `initiator`/`automationDepth`); NO provider/model/connection column, by design
  ("a swipe never re-voices"). The `narrator` kind's wire projection to a `system` row is a SHAPE-time
  decision, never stored (`:373`), so canon stays provider-independent.
- `message_variants` (`:397-512`) — the GENERATION record: `content` (ONE text column, D51), `model :431`,
  `provider :432` (free text, no CHECK), `reasoningEffort :433`, the economics (`tokensIn/Out`,
  `cache{Read,Write}Tokens`, `costUsd`, `contextWindow`, `maxOutputTokens`, `ttftMs`, `finishReason`,
  `stopReason`, `terminalReason`, `apiErrorStatus`), `toolCalls`, `params` (the `UserIntent`), `promptSnapshot`
  (the `AssembledPrompt`), `generationId :482` (the upstream OpenRouter `gen-…` handle, null elsewhere), `metadata`
  (open JSON). **`provider` is stamped from `req.connection.credential.source` at `entry/compose/chat.ts:783`** —
  it stores the SOURCE word today (`openrouter`, `vllm`, `max-pro-sub`), not a provider name. NO `connection_id`:
  which of the user's rows generated a swipe is not recorded.
- `message_assets` (`:515-546`) — the STRUCTURAL message ↔ asset FK the GC registry can see (`assetId` is
  RETAINING in `asset-refs.ts`); a body's `asset:<id>` text spans are invisible to GC. One row per attached
  asset, keyed on the message SLOT. No origin column on the LINK; `assets.kind` (`attachment` vs `generated`,
  `contracts/assets/index.ts:17`) says user-vs-model but cannot separate an `/imagine` illustration from an
  inline reply — §5.3b is the reason the column exists, read that before minting it.
- `pending_turns` (`:777-806`) — `triggeredBy` ("spend budget + abort-rights + attribution — D19") and
  `runAsUserId` ("the authorized host whose box FUNDS the deferred turn"); both FK users CASCADE, both indexed.
- `chat_participants` (`:547-600`) — `role` comment: "The host is the ONE authority + funding source (D18)"; the
  one-present-host partial unique index (`#390`) is justified by the same "single authority + funding source".
- `session_entries` (`sdk-session.ts`) — the agent-sdk prompt-cache LINEAGE (D8), a TABLE keyed by `chatId`
  (`sdkSessionId`, `seq`, `seededThroughSeq`, `canonHash`, `isPrimary`); no user, no credential, no dir — the
  session file it names lives wherever `CLAUDE_CONFIG_DIR` pointed at spawn time.
- `model_stats` (`stats.ts:226-241`) — `(ownerId, model, provider)` UNIQUE with `provider NOT NULL DEFAULT
  '(unknown)'` (invariant #5, coalesced in `@orb/kit/stats-tally.modelKey`); it is fed the SAME source word as
  the variant column. `imagery_generations.model` (`imagery.ts:63`) records the image model only.

### 2.6 Client consumers

`features/credentials/lib/connections-model.ts`: `ROLE_SLOTS` (`:56`, `chat.sources = SOURCE_ORDER :61`
includes `local-light`), `CHAT_APIS_BY_SOURCE :335-341` (a client MIRROR of `assertCoherent`, drifted: offers
`responses` for vllm/local-light/custom_openai), `RoutingForm :172-179` (no `agent` row; `:273` "informational
read-only"). `features/preset/lib/{capability-panel-model,effective-knobs}.ts`. `features/user-admin/**`
(engines/compute sections; stay).

### 2.7 Capability reads outside the helpers (M4 receipt)

13 direct `capability.*` re-spellings: `domain/chat/engine/pipeline.ts:608,616,634,635`, `domain/chat/verbs/
read.ts:1093-1101,1150-1151`, `entry/compose/role-clients.ts:371`, `domain/connection/catalog/chat-models.ts:120`,
`backends/openrouter/runners/chat/chat-completions.ts:133,140,163`, `backends/agent-sdk/runner.ts:301`,
`resolve-chat.ts:283`, `client/.../preset/components/message-handling-section.tsx:78`, `domain/imagery/verbs/
edit-image.ts:48`, `generate-picture.ts:58`, `backends/openrouter/runners/image/runner.ts:170`.

### 2.7b Where the OpenRouter agent-sdk skin lives today (deleted, F18)

Every site below was PURGED by this program; they are recorded as the PRE-state, never as live paths.

- `buildClaudeOpenRouterEnv` + `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` in the agent-sdk `env.ts` — purged.
- `domain/connection/verbs/get-or-skin-tier-models.ts` + `substrate/curated-shortlist.ts` — purged.
- `OrSkinTierModels` on `ChatRequest` (`infra/providers/contract/chat.ts`) and on `ConnectionService` — purged.
- the `agent-sdk × openrouter` arms of `deriveRunner` (`dispatch.ts:31-36`), `assertCoherent` (`resolve-role.ts:171`) and `healAgentSdkModel` (`:190-192`) — purged with those modules.
- the "claude code via openrouter key" row of `vocabulary-map.md` — purged; the register was rewritten on (provider × api).

### 2.8 Defects confirmed by the review (fix inside this program)

1. `responses` offered where it cannot run + `local-light` listed as a chat source; `assertCoherent` passes
   both; `deriveRunner` throws; `checkChatAvailability` catches only resolve-time errors → AVAILABLE, then
   a late failure. Was pinned by the providers-tier dispatch test (purged with that tier) and
   `tests/client/features/credentials/lib/connections-model.test.ts:318-322`.
2. **No caller can name `structured`, and one caller bypasses the facade to get it.** `RoleClients`
   (`contracts/role-clients/index.ts:149-186`) exposes `embed`, `rerank`, `imageEmbed`, `summarize` and six
   per-role GETTERS (`embedModel`, `rerankModel`, `imageEmbedModel`, `summarizerModel`,
   `summarizerContextTokens`, `summarizerVision`) — no `structured`, no `chat`, no `generateImage`. The facade
   SNIFFS `opts.responseFormat` on `summarize()` and reroutes to `executor.structured` (`role-clients.ts:325-348`,
   the 2026-07-27 "one facade, two wire roles" ruling), and rpg extraction calls `deps.executor.structured`
   DIRECTLY at `entry/compose/rpg.ts:563` (`extractViaStructured`) — and that bypass has two recorded reasons
   (verify6 H9), of which ONE survives this program: `:499-505` "NOT the summarize dispatcher (whose firewall
   excludes the metered sub, intentionally)" is about `ROLE_SOURCE_POLICY`, which §5.7 DELETES (there is no
   firewall; a user's summarize binding may be their claude-sub row under `allowBackground`) — so it lapses;
   `:506-509` "`conn` comes from `input.turnConnection` — never a re-resolve (stickler F1)" is about WHICH model
   writes the state delta and survives untouched: rpg extraction runs on the CHARACTER TURN's already-resolved
   connection, by ruling (2026-07-27: "rpg extraction summarizes NOTHING; it rides `structured`"). `extractViaChat`
   (`:533`) is a third constrained path on the agent-sdk arm. Census by `pnpm ast callers summarize --in packages/server/src`, RUN
   (verify7 H2 — an earlier draft printed 18/12 by arithmetic from the narrower `…/domain` run; that scope is
   BLIND to `entry/compose`, where injected ops are bound): **23 hits / 16 files, scanned=1511, status=complete**.
   The 23 = 13 constrained + 5 prose domain sites (below) + 2 prose COMPOSE sites (`assets-character.ts:349`
   greeting studio, `imagery.ts:147` the D45 vision caption with `images: [bytes]` — both `SIDE_GEN_POSTURES`
   - `resolveUserPresetParams`, both unconstrained) + the facade's own `deps.executor.summarize` (`role-clients.ts:346`)
   - the agent-sdk backend's `summarize`/`structured` methods (`agent-sdk/index.ts:132,137` — `structured` is
     implemented by calling its own summarize shaper). Constrained
     (`responseFormat`) sites: refinery `schema-forge.ts:138` (+ `:114`, `run-stage.ts:521`, `score-sweep.ts:202,296`,
     `test-schema.ts:69` through their `sampleOpts` — the lane confirms per site), discovery `verbs/analyze.ts:70,125`
   - `verbs/distill.ts:178,309` (the "corpus summarize was structured" confusion), the embeddings caption lens
     `indexer/caption.ts:98` (structured AND `images: [bytes]` — a vision requirement the tree half-knows via the
     bespoke `summarizerVision` getter, #2422), AND the two `entry/compose/automation-plugin.ts` sites the domain
     scope hid: `:370-379` (the automation analysis arm's quiet-LLM op — its producer chain
     `automation/contract/ops.ts:314` → `engine/analysis-arm.ts:469,484` builds the `ResponseFormat`) and
     `:686-694` (the PLUGIN `llm.quiet` seam with `opts.schema`, whose header `:678-684` says a non-liftable schema
     THROWS rather than silently downgrading to unconstrained). Real prose `summarize`: `chat/engine/smart-arbitrate.ts:116`,
     `chat/memory/build/digests.ts:88,102`, `chat/verbs/extract-quiet.ts:117`, `discovery/themes/generate.ts:162`
     (cluster naming; `ident`/`literal responseFormat` over its 4 files = 0, complete). `pnpm ast callers
     structured --in packages/server/src` = exactly the facade + the rpg bypass (scanned=1511). Refinery calls
     NO embed (`callers embed` over `domain/refinery`: not in the 7-file search set). The task must be named at
     the call site, not guessed from an option, and there must be ONE path to a role (§7.5).
3. Embed swap has no transition state: `search/persistence/nearest.ts:47,103` reads the live `embedModel`
   (`role-clients.ts:352-360`); the PD-139a reindex fires on save (`update-user-settings-section.ts:55-63`).
   Confirmed by code shape only.
4. Embeddings have no capability descriptor at all; the `(model, dim)` tag and the new dtype tag are the
   only admission facts, applied at write time.

Things v1 called defects that are RULINGS (see §14): the vLLM permissive modality cell (D143 c — kept for
modalities; its turns/reasoning cells are DELETED, F15), the vLLM born default (D142 — RETIRED with the
owner-engine premise, F2), `structured` riding the summarize binding (2026-07-27, the purged `entry/compose/role-clients.ts:325-328` —
kept, F4), the sub excluded from background roles (2026-08-07, D109(4) — FLIPPED to per-row `allowBackground`,
F5), D17's "local compute shared + count-budgeted" clause (RETIRED, F11), the rpg extraction bypass (kept on
stickler F1 alone, §7.5-1a).

---

## 3. Target shape

### 3.1 Cake

```
kit ← contracts ← db ← inference ← server ← client
                        (node-only; never imported by client or ui)
server keeps: domain/connection (thin, delegating), entry/compose wiring, transport routers
```

`@orb/inference` depends on `@orb/kit`, `@orb/contracts`, `zod`, the provider SDKs. It does NOT depend on
`@orb/db` (snapshot persistence is a port) or on `server`. Two `@orb/server/kit` modules it uses today move
DOWN to `@orb/kit` first (M1): `server/kit/custom-parameters` (imports only `@orb/kit/guards`) and
`server/kit/secret-redaction` (`redactKnownSecrets`, `secretRedactionLiterals`, `secretSafeRedactionMarker`).

### 3.2 Vocabulary — five primitives, chosen for where this is going, not for what exists

The registry axes below replace today's `CredentialSource`-as-routing-axis, `CRED_PROVIDERS`-as-storage-enum,
`roleDefaults.<role>.{source, model, api}` and the one-active-row-per-provider index. They are chosen so the
next provider, task, modality or model quirk is a ROW, not a retrofit. (`UserIntent` — the gen settings —
stays in `contracts/preset`; `Spine-Config-and-Serialization.md`'s nature (d) home is unchanged.)

1. **Wire** (closed tuple, `@orb/contracts/inference/wires.ts`, one backend each — the only axis that is code):
   `openai-compat | anthropic-messages | agent-sdk | local-light`. A wire is how bytes are spelled and parsed.
2. **Provider** (REGISTRY ROWS, data — `contracts/inference/providers.json` ships the built-ins through the
   same schema a plugin or admin row uses): `{ id, label, wire, dialect?, features?, auth, baseUrl?, apis,
   serves?, catalog, metered, docsUrl? }` (§5.2). OpenRouter, Anthropic, OpenAI, Groq, Mistral, Together,
   Fireworks, xAI, Ollama, LM Studio, vLLM, "custom OpenAI-compatible" are all rows; most are
   `wire: openai-compat` on the `openai-compatible` transport + a `features` block and need zero code.
3. **Connection** (a TABLE, N per user — `user_connections`): credential + provider + model + declared
   capability overrides + extras + transport + spend flag + label. THE unit every binding references by id.
4. **Modality** (closed tuple): `text | image | video | audio | file | vector`. Capability input/output are
   `Modality[]`; task requirements are spelled in the same vocabulary.
5. **Task** (closed tuple + `TASK_DEFS`): what a caller asks for; routable tasks are the Connections pane's
   slots; each ACTOR (a user, a rule, a plugin grant) holds one `connection_bindings` row per routable task.

Homes: wires, providers (built-in rows), modalities, tasks, capability schemas and `ConnectionRef` in
`@orb/contracts/inference/` (isomorphic; the client renders the picker from them). The `user_connections` table
in `@orb/db`. `CRED_SOURCES`/`CRED_PROVIDERS` are RETIRED as axes: the credential row's `provider` column
becomes a provider-registry id (a string FK-by-convention, CHECK-free, validated at the domain against the
registry). Registry ids are HYPHENATED (`custom-openai`, `claude-sub`, `local-light`), so the stored
`custom_openai` string does NOT survive — and because the id is half of the GCM AAD
(`domain/credentials/persistence/aad.ts:9-11`), a kept row would fail to decrypt at first resolve and the #1373
post-generation hook would then REVOKE the key (`maybeRevokeOnAuthFailed`). Step 4's migration therefore
**deletes every `user_credentials` row** (pre-launch posture, F19); the owner re-pastes his handful of keys. The
AAD formula itself is untouched. Vocabulary-map edit first (D151/#914) for the new words; D31/D67 amended in
the lane.

### 3.3 The runtime surface (what `domain/connection` and compose call)

```ts
interface InferenceRuntime {
  resolve(args: { task: Task; principal: Principal; ref?: ConnectionRef; requires?: CapabilityRequirement }): Promise<Resolved<Task>>;
  availability(args: { task: Task; principal: Principal; ref?: ConnectionRef }): Promise<ChatSendAvailability>;
  executor: ProviderExecutor;
  capabilities: { for(connection: ResolvedConnectionRow, evidence?): Capability };   // provider + declared overrides + catalog row → one descriptor
  funnel: { chat(intent, cap): ResolvedChatKnobs; embed(opts, cap): ResolvedEmbedKnobs };
  roleClientsFor(funder: Principal, actor?: BindingActor): Promise<RoleClientsWithSignal>;   // the §7.1 fold: actor binding → funder's user binding → none; RoleClients = embed/rerank/imageEmbed/summarize/structured + resolved(task)
  catalogs: { models(connection): Promise<ModelCatalogEntry[]>; refresh(providerId) };   // strategy = PROVIDER.catalog (url | builtin); an endpoint row's `url` is the connection's baseUrl
  diagnostics: { verifyClaudeAuth, accountCredits, generationCost, probe, inspect };    // H1: the three router verbs
  providers: {
    registry: ProviderRegistry;                                   // built-ins ∪ the ProviderStore's rows (§5.9-1, F9)
    available(principal): Promise<ProviderAvailability[]>;        // what the picker may offer
    register(row: ProviderDef, origin: { plugin: PluginId } | { admin: UserId }): Promise<void>;   // refuses a built-in id; persists via deps.providerStore
    drop(id: ProviderId): Promise<void>;                          // plugin deactivation / admin removal; connections on it read `no-connection`
  };
}
```

`transport/trpc/routers/connection.ts` keeps calling `ctx.services.connection.*` — a domain front door
(Core-0 §3: transport calls DOWN into domain via front doors only). `domain/connection`'s verbs become thin
delegations to `runtime.*`. This is a stated amendment to Core-0 §6 / Tier-3b "NOT owned" / AGENTS §6
("connection owns resolution" → "connection is the domain door; resolution executes in `@orb/inference`").

---

## 4. Package layout

```
packages/contracts/src/inference/                NEW
  kinds.ts          MODEL_KINDS = ["generation","embedding","rerank"]; KIND_DEFS: Record<ModelKind, { capabilitySchema, floor }>
                    (no `image` kind: image generation is a GENERATION model whose output modalities include `image` — §6.7)
  tasks.ts          TASKS = ["chat","embed","rerank","imageEmbed","summarize","generateImage","agent","structured"]  (tuple order is ARBITRARY; the
                    client owns its Model-roles render order — a contract tuple's order is not a UI decision, side-eye 8 P3-1)
                    TASK_DEFS: Record<Task, TaskDef>   (§5.2)
  capability/
    generation.ts   today's modelCapabilitySchema + output.modalities; tools.silencesProse KEPT
    embedding.ts    { dims, mrl, maxInputTokens, modalities, instructionAware, dtype?, windowEstimated? }
    rerank.ts       { maxInputTokens, modalities, instructionAware }
    reads.ts        acceptsAssistantPrefill · acceptsHistorySystemRows · coEmitsProseWithTools · TURNS_FLOOR · CACHE_MIN_FLOOR
                    + NEW: acceptsImageInput · acceptsVideoInput · acceptsImageEdit · acceptsMidConversationSystem
                    · roleHandlingFloorOf · canEmbedImages · fitsSpace(dims)   (the 13 sites in §2.7 migrate here)
    requirement.ts  CapabilityRequirement { input?: Modality[]; output?: Modality[]; tools?: boolean; structured?: boolean; dims?: number }
  wires.ts · providers.ts (built-in rows + schema) · modalities.ts · deltas.ts   (§5)
  features.ts       `endpointFeaturesSchema` + `EndpointFeatures` + `BELT_OWNED_BODY_KEYS` + `isBeltOwnedBodyKey` (§8.1b) — HERE, in
                    contracts, because the tuple has a LIVE CLIENT reader (`client/.../preset/components/custom-parameters-editor.tsx:14,182`
                    greys the belt keys; it moves to the Connections pane's Extras editor) and `@orb/inference` is node-only (verify6 H1).
                    Coupled sites of the move: `contracts/preset/index.ts:687-701`, that editor, `vllm/surfaces/chat.ts:8,390,416`
                    (deleted with the surface), and the EQUALITY pin `tests/contracts/preset/index.contract.test.ts:613` (a node suite
                    `pnpm check` never runs — it moves with the tuple)
  evidence.ts       `EVIDENCE_TIERS` — THE ONE spelling of the ladder (§6.2): `declared > measured > advertised > curated > family-floor (add-only) > kind floor`
  connection-ref.ts ConnectionRef = { connectionId: UserConnectionId }   (a bare branded id, no model override — the local-light floor is two SEEDED rows, §7.2, not a union arm)
  index.ts

packages/kit/src/ids/index.ts                    `ID_PREFIX.userConnection = "user_connection"` + `UserConnectionId` (the `schema-branding` gate reds a bare entity id, F7)
packages/contracts/src/credentials/index.ts     `CRED_SOURCES`/`CRED_PROVIDERS` RETIRED as axes; `provider` is a registry id string; row metadata = discriminated on `auth`
packages/contracts/src/chat/history.ts           `ChatHistoryMessage.wireMeta?: { cacheBreakpoint?: true; clearAt?: "next_user_message"; effort?: ReasoningEffort }` — the
                                                 assembly's per-row hints the hosted wires forward (§8.0); the projection stays credential-free
packages/contracts/src/inference/finish-reasons.ts · usage.ts   `NORMALIZED_FINISH_REASONS` (moved from server), the normalized `ChatUsage` core (§5.3c)
packages/contracts/src/chat/messages.ts          + `MESSAGE_ASSET_ORIGINS`, `variantMetadataSchema` + the closed `ProviderMetadata` union (§5.3c); `cost_provenance`
                                                 REUSES `TOKEN_PROVENANCES` + `combineTokenProvenance` — no new tuple
packages/db/src/schema/connection.ts             NEW `user_connections` (§5.3, `$type<UserConnectionId>()`) — producer `domain/connection`
packages/db/src/schema/connection.ts (cont.)      `provider_rows` (the ProviderStore's table, F9 — real columns + a `features` document) AND `connection_bindings`
                                                 (§5.3 — every actor→connection ref as an FK row; replaces the `connection_refs` json idea and settings
                                                 `roleDefaults`). Producer `domain/connection` for all three tables, so `db-structure-producer-home` passes on
                                                 the `domain/<name>` existence test with NO reviewed grant and `own-tables-only` needs NO `SCHEMA_OWNERS` row
                                                 (its map is only for schema files without a same-named domain — ground5 M10/L2). THREE registrations, not
                                                 one (verify7 H1): (1) the file in the `schema/index.ts` barrel (`db-structure`, hard); (2) a `TABLE_SCOPING_ROWS`
                                                 row per new table with `scope` + `why` in `tooling/src/verify/lib/tenancy-scope.ts:71` — `table-scoping-class` is
                                                 hard with NO exemption vocabulary and reds UNCLASSIFIED on every `sqliteTable` under `packages/db/src/schema/**`
                                                 (`session_entries`/`message_assets` have theirs at `:193`/`:226`); (3) an `OWNERID_CLASSIFICATIONS` row for
                                                 `user_connections.ownerId` in `gates/ownerid-registry.ts` (hard: "the escape is re-deciding D23") PLUS the bump of
                                                 that gate's EXACT `count: 27 → 28` literal in its own stale-arm conformance row (`:200`) — a coupled-literal edit.
                                                 Derive the arrival set with `grep -rln "DRIZZLE_SCHEMA_POPULATION\|packages/db/src/schema" tooling/src/verify/gates/*.ts`
                                                 (40 gates), never from this list. NOTE for the lane: `own-tables-only.ts:112,118,123`
                                                 cite a "`db-structure` `NON_DOMAIN_PRODUCERS`" that exists nowhere on the tree (a dangling-cite tree defect,
                                                 filed separately) — do not implement it
packages/db/src/schema/{chat,sdk-session,stats,imagery}.ts
                                                 `message_variants.{connection_id, cost_provenance}` + CHECKs on `finish_reason`/`reasoning_effort` + `$type<ProviderId>()`
                                                 on `provider`; `message_assets.origin`; `session_entries.connection_id`; `model_stats.provider` typed;
                                                 `imagery_generations.{provider, connection_id}` (§5.3b/§5.3c). ONE D163 forward migration that also DELETES
                                                 `user_credentials` + `session_entries` rows (F2) and seeds the two `local-light` rows per existing user (§7.2)
packages/contracts/src/connection/index.ts       its surviving members (ChatApi, ModelCatalogEntry, AgentSdkModel, the availability shapes) MOVE into
                                                 contracts/inference; the file is DELETED, every importer re-pointed in the same commit (no re-export hop)

packages/inference/                              NEW @orb/inference (node-only)
  package.json      deps: @orb/kit, @orb/contracts, zod, ai + @ai-sdk/provider (pinned, §8.0), @ai-sdk/openai-compatible, @ai-sdk/anthropic,
                    @openrouter/ai-sdk-provider, @anthropic-ai/claude-agent-sdk, @huggingface/transformers.
                    DROPPED: @openrouter/sdk (1.1.8 today; leaves `pnpm.allowBuilds` too) — see §8.2
  src/
    index.ts        createInferenceRuntime(deps: InferenceDeps): InferenceRuntime
    deps.ts         InferenceDeps (§11)
    contract/       today's infra/providers/contract/*, unchanged. `FirewallRequest.ownerConsented` + `ChatRequest.ownerConsented` DELETED (§8.4-3)
    registry/
      backends.ts   BACKEND_DEFS: Record<Wire, BackendDef>; buildRegistry(deps) constructs only wires whose `needs` are present
      providers.ts  ProviderRegistry: BUILTIN_PROVIDERS ∪ deps.providerStore.list() (plugin/admin rows), one zod schema; a built-in id
                    can never be shadowed — `register()` of a colliding id is a typed refusal (§5.9-1, F8/F9)
      catalogs.ts   CATALOG_STRATEGIES: Record<ProviderDef["catalog"], …>  (url → GET <baseUrl>/v1/models — the provider's fixed URL or the connection's, + OR-shaped
                    enrichment where the dialect says so, typed-id fallback when the list is empty/unreachable; builtin → the in-process runtime's bundled list)
      dispatch.ts   backend = BACKEND_DEFS[provider.wire]; api ∈ provider.apis checked on write + resolve (no (api, source) matrix)
    capability/
      synthesize.ts   per kind; precedence = `EVIDENCE_TIERS` (contracts/inference/evidence.ts, the ONE spelling — §6.2), field-wise, then family-floor OR-ed in
      evidence.ts     the Evidence bundle the resolver assembles
      families.ts     MODEL_FAMILIES + detectModelFamily (today's model-family.ts) — regex-fenced
      sources/
        advertised/openrouter.ts · advertised/agent-sdk.ts · advertised/openai-compat.ts (/v1/models window when present)
        measured/anthropic.ts  DATED PROBE RECEIPTS ONLY (script name + date + value) — EMPTY at landing: today's anthropic turn cells are
                               id-regex derivations (D69), i.e. CURATED (anthropic.json below), and `historySystemRows` is explicitly UNMEASURED
                               (`turns.ts:73-81`); the first entry here is what step 6c's `pnpm probe:history-system-rows` run may write
        (no measured/vllm.ts — VLLM_TURNS / VLLM_REASONING are DELETED: they described one template on one box; a user's engine
         declares what it accepts on its row (`declared.turns`, `declared.reasoning`), else the generic openai-compat floor)
        curated/               DATA, not code: `*.json` rows in ONE schema — `capabilityOverrideSchema` = `{ match: { model: <regex> | ids: [...],
                               provider?: ProviderId, wire?: Wire, api?: ChatApi }, generation?: Partial<GenerationCapability>, embedding?: …,
                               rerank?: …, features?: EndpointFeatures, evidence: { tier, dated, cite } }` — `match.wire`/`match.api` exist
                               because two live curated cells are functions of (id × wire-shape), not of id alone (`turns.ts:57-66`:
                               `anthropicPrefill` is false on `anthropic-cli`, `anthropicMidConvSystem` true ONLY there; OpenRouter carries two
                               apis under one provider id — verify6 H2), so a model row may be repeated per (wire, api) arm. The SAME schema a
                               connection's `declared` block and a plugin's `capabilities: [...]` manifest entry use (three scopes, one parser,
                               one panel). `loader.ts` parses every file at module load and is the ONLY place a model-id regex is evaluated
                               (the `inference-model-regex-fence` gate's one allowed home besides `families.ts`). Shipped files: anthropic.json
                               (today's turns.ts version regexes + cache mins + budget range, D69; the turn-shaping cells ship with the
                               tree's CURRENT values — `historySystemRows: false`, `roleHandlingFloor: "strict"` on every anthropic arm, the
                               prefill/mid-conv cells per (id, api) — see §8.0), openai/google/qwen/meta/deepseek/mistral/xai.json,
                               local-light.json (jina-clip-v2 text+image 1024 MRL q8, MiniLM rerank, RMBG matte), embedders.json (dims/MRL/
                               max-input for known hosted embedders). Adding a model row is a JSON edit + the table test; never a `Record`.
        family-floor.ts        the ADD-ONLY tier (verify6 H3): today's `synthesizeToolAxes` (`resolve-model-capability.ts:250-263`, "the floor
                               only ever ADDS" — OR's catalog omits `structured_outputs` for Claude, so a Claude id gets `tools`/`structured`
                               OR-ed in after every other tier) and its agent-sdk twin (`:377-382`). It is a rung of the ladder by name
                               (§6.2), applied AFTER declared/measured/advertised/curated with OR semantics, never override; a data row cannot
                               express "add, never subtract", which is why it stays code, keyed by `families.ts`
      floor.ts        per-kind floors; generation floor: tools declared-but-unmeasured ⇒ silencesProse: true (D112 posture); NO default model
    resolve/
      selectors.ts    TASK_SELECTORS: Record<Task, …> (today's ROLE_SELECTORS; NO born default — the fold ends at the principal's own rows, §7.2, D142 retired)
      precedence.ts   the §7.1 fold over `connection_bindings`: binding(actor, task) → binding(actor, ridesOn) → binding(funder, task) → binding(funder, ridesOn) → none
      coherence.ts    api ∈ PROVIDER_REGISTRY.get(providerId).apis — the ONE home; client reads the same registry
      heal.ts        source-specific id NORMALISATION only (agent-sdk alias → daemon resolvedModel; trim; case). NO default-model heal:
                     `DEFAULT_CHAT_MODEL_ID`, `DEFAULT_OR_CHAT_MODEL_ID` (`openrouter/auto`), `healToChatDefault`, `pickOrModel`'s
                     heal-to-auto and the curated `CHAT_MODELS` shortlist (`catalog/chat-models.ts`) are DELETED. An unset or
                     unknown model resolves `requirement: {ok:false, missing:["model"]}` and availability `no-connection`; the
                     picker is the only way a model gets set. `curated-shortlist.ts` + `or-skin-tier-models` go with it.
      warm.ts · resolve-task.ts · availability.ts · models-for-connection.ts   (today's verbs, re-keyed on the connection; the `source` axis is gone, F15)
    funnel/
      resolve-chat.ts  unchanged
      resolve-embed.ts NEW: (EmbedOptions × EmbeddingCapability) → { dimensions | truncate, instruction, inputType, warnings }
    catalog/
      snapshot-store.ts  PORT { read(key), write(key, value) } — server wires the KV table
      caches.ts · refresh.ts   (today's substrate caches + refresh verbs; the WorkloadContribution WRAPPER stays in server, D117)
                     CALLOUT — the agent-sdk daemon catalog (`supportedModels()`) is fetched by spawning the runtime
                     "through the mode-1 firewall" (`backends/agent-sdk/catalog.ts:1-4`), i.e. under a CREDENTIAL. With no
                     host credential the scheduled `refresh-model-catalog` workload (no principal) can no longer run that
                     lane: it is DROPPED from the workload (the OR lane stays — `/models` is keyless). The daemon catalog is
                     warmed on demand under the calling user's own `claude` row (first `verifyAuth` or first resolve), and
                     the RESULT is cached process-wide + snapshotted like today because the model list is not per-user.
                     `CatalogRefreshResult.agentSdkModels` becomes `null`-by-design in the workload's own result.
    roles/
      run-role.ts · executor.ts · role-clients.ts · chat.ts agent.ts embed.ts rerank.ts image-embed.ts summarize.ts structured.ts generate-image.ts
      policy.ts      `providerTasks` + `connectionTasks` + `canFund` + `requirementMet` (§5.7) — derived, no hand-kept mirror (D39 amended: its
                     reason was that contracts could not import the firewall); no consent arm; there is no file named firewall because there is no firewall
    backends/        ONE FOLDER PER WIRE
      kit/           today's backends/kit/* (retry, sanitize, history projection, error-classify, cache-control, image-normalize, abort-flatten)
      openai-compat/ the wire: two TRANSPORTS over the Vercel AI SDK, every quirk read off folded `EndpointFeatures` (§8.0–§8.1b)
        model.ts     connection row → `createOpenAICompatible({ name: providerId, baseURL, apiKey, headers, fetch, includeUsage,
                     supportsStructuredOutputs, metadataExtractor, transformRequestBody })` (the openai-compatible transport) or `createOpenRouter(...)`; `.chatModel(id)`,
                     `.embeddingModel(id)`, `.imageModel(id)` are what the task runners call through `doStream`/`doGenerate`/`doEmbed`
        stream.ts    the V4 stream-part → `ChatDeltaEvent` reducer (text, reasoning, tool-call, usage, image, citation) — ONE for the wire
        transports/  openai-compatible.ts · openrouter.ts — a Record<Dialect, TransportDef> (§8.1), ONE module per SDK provider package:
                     `injectOptions(req, features, extras)`, `transformRequestBody(body, features, transport)` (extras merge behind the belt
                     denylist, include/exclude, prefill pair, strict, the assistant-image re-attachment), `wrapFetch(conn,
                     transport)` (headers, responseMap, OR's mandatory-reasoning replay), `extractMetadata(res)`, `retry`. Both read the
                     FOLDED `EndpointFeatures` (§8.1b) and never a provider id — there is no vllm.ts, no generic.ts
        features.ts  `foldFeatures(wireDefault, providerRow.features, connection.declared.features)` — the one precedence fold
        rerank.ts    plain `fetch` to `features.rerankPath` when set (no rerank model in the SDK's openai-compatible provider)
        (today's backends/openrouter/runners/* → transports/openrouter.ts + `@openrouter/ai-sdk-provider` + three plain-fetch calls (§8.2);
         today's vllm/surfaces/* AND custom-byo/* → transports/openai-compatible.ts + the vllm row's `features` + the `transport` column)
        reachability.ts cached `GET /v1/models` per connection (TTL ~5s) → `up | down | unknown`; feeds availability for every endpoint provider
        wake/          ~150 lines, for ANY endpoint row whose folded `features.sleep` is set: `getIsSleeping` · `postWakeAndAwait` (today's
                       fleet-control.ts:389-427, paths read off `features.sleep`) · `ensureAwake` HTTP-only (today's wake-gate.ts minus the
                       reaper/gpu/spawn arm) · the per-connection awake cache. Called before a request; a wake that fails within
                       WAKE_READY_TIMEOUT_MS is `endpoint-unreachable`. The word vLLM appears only in the built-in row's JSON.
        (NOT HERE — tooling/src/stack/lib/engine-fleet/: build-argv.ts · launch-config · templates/ · spawn-engine.ts · reaper.ts ·
                     process-identity.ts · gpu.ts · wake-budget.ts · fleet-control.ts markers/metrics/capacity/auto-sleep ·
                     the supervisor loop + breaker. `pnpm engines` owns spawn, hold/stop, auto-sleep on idle; `pnpm engines compose`
                     owns the overlay. DELETED outright: engine-control.ts registry, engine-status.ts, the admin engine verbs.)
      anthropic-messages/ first-party API key over `@ai-sdk/anthropic` (`createAnthropic({ apiKey, fetch })`), no subprocess (§8.5): def.ts index.ts chat.ts summarize.ts
      agent-sdk/     today's agent-sdk/*, rebuilt per-user (§8.4), SUBSCRIPTION ONLY — the OpenRouter skin (mode-2) is deleted
      local-light/   def.ts + today's local-light/*
    diagnostics.ts

packages/server/src/domain/connection/           STAYS (8-slot). verbs delegate to runtime; contract/service.ts drops the
                                                 foundation type import (`LocalEngineReachability` vocab is minted in contracts/inference)
tooling/src/stack/ops/engines.ts (+ engines-ctl, engines-compose, dev-process-identity, contract/types, seed/lib/fake-vllm,
verify/gates/no-raw-egress.ts, verify/lib/reviewed-grants-*.ts, scripts/probes/rpg-extraction/local-8b-vehicles.ts)
                                                 re-pointed to `tooling/src/stack/lib/engine-fleet/` (the moved builder + spawner; dev-only
                                                 KISS carve-out). The compose generator's "ONE builder, never duplicated" invariant
                                                 (`engines-compose.ts` header) still holds: builder and launcher are both in tooling.
tests/inference/**  mirrors packages/inference/src; tests/contracts/inference/** table tests
```

DELETED (not moved):

- `backends/agent-sdk/host-token.ts`; the host `.credentials.json` arm and `mode1IsolatedConfigDir` in `env.ts`;
  the purged `foundation/env/host-claude.ts` credential DETECTION (its executable-resolves check was kept); `CLAUDE_BACKEND`
  posture (registration becomes "runtime installed"); `mintMaxProSub`'s `requireOwner` (the mint becomes row-backed).
- `connections-model.ts` `CHAT_APIS_BY_SOURCE`, `chatApisForSource`, `chatApiForSourceChange`, `ROLE_SLOTS.chat.sources`
  (step 1); the other five `ROLE_SLOTS.*.sources` arms — fed by `INFERENCE_SOURCES`/`SUMMARIZE_SOURCES` and the
  INLINE `["openrouter"]` at `:143` (a fourth hand-kept spelling) — die in step 4 with those lists.
- `contracts/settings` `INFERENCE_SOURCES`, `SUMMARIZE_SOURCES`, `GENERATE_IMAGE_SOURCES` as authored lists (derived).
- `server/kit/custom-parameters`, `server/kit/secret-redaction` (moved to `@orb/kit`).
  YEETED FROM THE SERVER (F1, owner word 2026-09-19): the in-server fleet machinery. To `tooling/src/stack/lib/
  engine-fleet/`: `build-argv.ts`, launch-config resolution, `templates/`, `spawn-engine.ts`, `reaper.ts`,
  `process-identity.ts`, `gpu.ts`, `wake-budget.ts`, the markers/metrics/capacity/auto-sleep halves of
  `fleet-control.ts`, the supervisor loop + breaker. DELETED: `engine-control.ts`, `engine-status.ts`,
  the purged `foundation/env/posture.ts` + `ENGINES_POSTURE` and its deprecated inputs (`VLLM_DISABLED`, `STACK_ENGINES`),
  `postureManages`, `effectiveVllmDisabled`, `entry/lifecycle.ts` engine start/drain, `entry/app.ts` engine handle,
  `entry/compose/admin.ts` engine wiring + `vllmManages`/`repoRoot`/`superviseDetached` in `compose/services.ts`,
  the purged `domain/admin/verbs/vllm.ts` + its contract/views/service rows + `transport/trpc/routers/admin.ts` engine
  procedures, `domain/settings/effective-config/layer.ts` `engineLaunch` + `contracts/settings::engineLaunchSchema
  :253-286` (hand-written AppSettings lift; the launch knobs become a tooling config file `tooling/src/stack/
  engine-launch.json` the argv builder reads), the D120 config-section door (`client/src/state/config-section-
  {registry,partition}.ts`, `client/src/compose/config-sections.ts`, `tests/client/state/config-section-registry.test.ts`, `tests/client/state/config-section-partition.dom.test.ts`, `tests/client/state/config-section-registry-context.ct.tsx`,
  `tests/support/browser/ct-data-providers.tsx`), client `user-admin/components/{admin-engines-section,
  compute-section,engine-launch-config}.tsx` + nav/section rows, `snap/ops/stage.ts` posture read, the
  `stack/{engines,stack,dev,multi-user-fixture}.sh` posture arms (they keep reading `ENGINES_POSTURE` for the DEV fleet — `engines.sh:92-98,240`; the SERVER schema drops the key and its deprecated input `VLLM_DISABLED`), the
  `verify/gates/no-raw-egress.ts` + `reviewed-grants-*` grant rows for the engine module (re-pointed to tooling),
  the engine test tree is SPLIT, not deleted: the 7 pins for MOVED code (`build-argv`, `spawn-engine`, `reaper`,
  `process-identity`, `gpu`, `wake-budget`, `fleet-control`) MOVE to `tests/tooling/stack/lib/engine-fleet/`
  (central-tests law; they leave `tests:tooling`'s whole-only `--full` stage, but a tooling test AFFECTED by a
  change now runs at `--push` via `tests:instrument-affected` — #1967, `8b9b1c867`; step 6b still runs
  `pnpm verify --full` for the whole-instrument verdict; verify7 M9); `wake-gate`, `gen-window`, `client`,
  `engine-url` pins stay under `tests/server/…/vllm/`; `supervisor`, `engine-control`, `engine-status` pins are
  deleted with their code.
  FOUR `vllm/engine/` MODULES ARE NOT FLEET MACHINERY and have their own disposition (verify7 H5 — the yeet
  list was not exhaustive over its directory): `embedding.ts` (`toEmbedPrompt`, `fitToDim`, `normalizeVector`,
  the query/doc instructions — the embed math + ChatML instruction scaffold that decides what a stored vector
  MEANS) and `image.ts` (`sniffMime`, `toDataUri`) STAY in the server, re-homed to
  `backends/openai-compat/{embed,rerank}.ts` keyed off the resolved `EmbeddingCapability`, never a provider id;
  `chat-completion.ts`'s `cleanJsonSchema` (the structured vehicle's JSON-Schema sanitizer — `agent-sdk/
  output-schema.ts:5` calls itself its mirror) STAYS as `backends/kit/clean-json-schema.ts` (ONE sanitizer for
  both wires); `engines.ts` (`VLLM_ENGINES`) goes to tooling with `engines-ctl`.

ADMIN CONFIG THAT GOES WITH IT (`contracts/settings/index.ts`, `domain/settings/effective-config/layer.ts`; the
keys are deleted from the schema, stored values are ignored — no lift):

- `engineLaunch` (`:253-286`: models, max-model-lens, GPU-util fractions, vision max_pixels) → the tooling json.
  Its two HOT leaves `genPresencePenalty`/`genRepetitionPenalty` (per-request gen defaults) are DELETED, not
  moved: sampling is preset-owned (the preset's `presencePenalty`/`repetitionPenalty` already reach the vllm
  wire through the funnel); `deps.vllm.genPresencePenalty/genRepetitionPenalty` and the surface's fallback go too.
- `vllmConcurrency {embed, summarize}` (`:216-220`) + the client **Compute** section (`compute-section.tsx`) →
  DELETED as an admin knob; the fan-out caps are `features.concurrency` on the provider row / connection
  (§8.1b; wire default 4/8 = today's `vllm/index.ts:52-53`). NO env key survives — a cap is a property of the
  server you dialled, which the row already describes.
- The **Engines** section (`admin-engines-section.tsx`, `engine-launch-config.tsx`), its nav rows, and the
  `admin.vllm*` verbs/router procedures.
  KEPT: `agentSdkConcurrency.summarize` (`:226-231`, the claude-runtime global fan-out cap; the per-user semaphore
  sits under it) in **System tuning**; `rateLimits`, `memory*`, media, structured-output sections untouched.
  ALSO DELETED from AppSettings (not kept): the D17 governance trio `allowNonOwnerLocalCompute` /
  `nonOwnerLocalComputeBudget` / `nonOwnerLocalComputeBudgetWindowMs` (`:380-383`; F11 — there is no owner
  compute to budget) and `allowNonOwnerMaxProSub` (`:393`; §8.4-3 — there is no by-proxy sub). Governance GAINS
  one row, `privateEndpointAllowlist` (F12, below).

NO OWNER ENGINE (owner word 2026-09-19). vLLM is a provider row (`wire: openai-compat`, transport
`openai-compatible`, `auth: endpoint`, a `features` block, §5.2) and a user's engine is a CONNECTION to it (§5.3): `{ providerId: "vllm", baseUrl, credentialId?
(the `--api-key` bearer, sealed like any key), model, declared: { modalities?, window?, dims?, turns?,
reasoning?, tools?, features? }, extras }`. One vLLM serves one model, so a user with a gen engine and an embed
engine has TWO connections (one per task), same as any provider.
Consequences, all in this lane: `mintVllm` (keyless) → gone (the connection's credential row is minted like any
endpoint key, or null when the box runs open); EVERY `VLLM_*` env key leaves the server schema
(`VLLM_ENGINE_HOST`, ports, `VLLM_*_MODEL`, `VLLM_*_MAX_MODEL_LEN`, `VLLM_EMBED_DIM`, the concurrency floors —
fan-out caps are `features.concurrency`, §8.1b) and lives only in `tooling/src/stack`
for the owner's dev fleet; `substrate/config-model.ts`'s vllm arm and `isConfigDerivedModelSource("vllm")` go
(the model is on the connection, never derived from config);
`infra/network/egress.ts:99-103` `internalBackendHostPorts` (the env-declared loopback allowlist) AND the
owner-saved-endpoint admission (`egress.ts:91-183` + the purged `domain/credentials/substrate/egress-admission.ts`, a
derivation that publishes the single `users.role='owner'` row's endpoints — a my-box rule: it assumes one
privileged human whose LAN is the LAN) are BOTH DELETED and replaced by ONE deployment setting,
`AppSettings.privateEndpointAllowlist: string[]` (hosts, CIDRs, and optionally `host:port`; env floor
`PRIVATE_ENDPOINT_ALLOWLIST`, DB
override wins per the settings tiers; DEFAULT EMPTY on a multi-user install, so it admits hosted providers
only; BORN `[127.0.0.1, ::1]` under `AUTH_MODE=single-user` — one spelling, repeated in F12 and pinned in
step 6b; verify9 M4). The rule:
an `auth: endpoint` connection whose `baseUrl` resolves to a private/loopback/link-local address is admitted
iff that address is in the allowlist; a public address is admitted by the existing SSRF guard as today. It is
per-DEPLOYMENT, not per-principal — the self-hoster who runs vLLM on `127.0.0.1` or `192.168.1.0/24` writes
that once in Governance, and every user's endpoint connection is judged against the same set, owner or not
(F12 rewritten; `security-executor` scope; the fetch guard still sees only host/port/address and still never a
principal — the allowlist is a second input to the same guard, not a new door). A member who wants their own
LAN box admitted needs the admin to add it, which is the honest multi-tenant posture.
THE PORT ARM (owner-approved, landed 2026-09-20, `security-executor`): an entry MAY carry a port —
`127.0.0.1:8703`, `[::1]:8703`, `ollama.lan:11434` — and then admits that host at those ports and NO other.
Strictly additive: a BARE entry still admits its subject at every port, so no deployment that never writes a
port changes behaviour. It restores the least-privilege half the retired `internalBackendHostPorts` had
(its own header: *"only the exact declared ports (e.g. `127.0.0.1:22` stays BLOCKED)"*) and which F12's
host/CIDR-only replacement dropped — on a multi-user box, admitting `127.0.0.1` so a member can reach Ollama
also admits `:22` and `:5432` to anyone who can author an endpoint connection. Three rules, stated rather
than emergent, and all three are in the `egress.ts` header, which is this feature's law: (a) PRECEDENCE —
the narrower spelling is the host's last word, so listing `127.0.0.1` beside `127.0.0.1:8703` admits :8703
only, and so does a containing CIDR; (b) a port on a CIDR is REFUSED, because the only gate that consults
ranges for a hostname target is the DNS lookup override and node's `dns.lookup` never sees a port — the
port-scoped decision therefore lives in the connect wrapper, where `options.port` exists; (c) an entry that
cannot match is REFUSED at publish and COUNTED at warn, never stored as an unmatchable key — before this,
`127.0.0.1:8703` parsed as a hostname no host could equal, so a runbook migrated from the port-scoped model
admitted nothing and said nothing.
CONTAINERS DO NOT FORCE HOST-SCOPING, checked rather than assumed — do not "simplify" the port arm away
believing it breaks Docker. The container accommodation is ONE hostname and THREE ports
(`tooling/src/stack/lib/engines-compose.ts:19-26`: `VLLM_ENGINE_HOST=vllm-gen`, with `vllm-embed`/
`vllm-rerank` joining gen's network namespace — *"the container shape of loopback-with-three-ports"*), and
the retired port-scoped mechanism covered it through that same env. The inversion worth holding: Docker is
where the widening is LEAST harmful (a private container network that publishes no engine port, so "every
port on `vllm-gen`" is just the three engines); loopback is where it bites. Port-scoping costs the container
case nothing. FIRST-RUN (side-eye 8
P0-1 — the single most likely early adopter is one human, one box, on `127.0.0.1`): (a) the setting's BORN
value is loopback (`127.0.0.1`, `::1`) when `AUTH_MODE=single-user` — one principal, so the "member wants
their LAN box admitted" threat F12 exists for does not exist; multi-user installs are born empty; (b) the
endpoint form checks the allowlist BEFORE the list call and, when the principal can edit Governance, renders
an inline **"Admit `<host>`"** button that writes the row and re-runs the list without losing the form; when
they cannot, the copy names who can. Never a generic listing failure, never a trip to another screen; the D17 "local compute shared with authenticated principals, count-budgeted"
clause and its trio `allowNonOwnerLocalCompute`/`nonOwnerLocalComputeBudget`/`…WindowMs` + `createMemberBudget`
(`entry/compose/chat.ts:1555-1660`, `transport/rate-limit.ts:44`) + the Governance rows are RETIRED (F11 —
there is no owner compute to share; a member on the owner's URL is a member who was given the URL). The owner's
dev box: `pnpm engines` spawns the fleet as today and the owner adds vllm CONNECTIONS pointing at
`http://127.0.0.1:8703` etc. and declares what each engine accepts (§6.3, F15); nothing in the server knows they
are the owner's.

KEPT in the server (inside `backends/openai-compat/`): the `/v1/models` window self-report, the new
`reachability.ts` and `wake/` — all keyed on folded `features`, none on a provider id. Today's
`vllm/surfaces/**` body/stream code is REPLACED by the SDK transport + the vllm row's `features` JSON; nothing
named vLLM survives as code.
`checkChatAvailability`: `engine-off` is
RETIRED as a cause (no row ⇒ `no-connection`, like every other source) and `engine-down` is RENAMED
`endpoint-unreachable` (the engine is gone with the fleet; side-eye 8 P2-4) — in BOTH tuples that spell them:
`CHAT_UNAVAILABLE_CAUSES` (`contracts/connection:422`) and `SOURCE_MODELS_STATES`
(`domain/connection/contract/results.ts:73`, produced at `get-models-for-source.ts:157`, pinned at
`get-models-for-source.int.test.ts:261,272`, rendered by `client/.../role-status-dot.tsx:34`, copy at
`client/src/lib/injection-copy.ts:179`); `SOURCE_MODELS_STATES.owner-only` dies in the same sweep (nothing
mints it once `requireOwner` leaves the picker arm); `endpoint-unreachable` = reachability says down,
or a wake timed out. A sleeping engine on a row whose `features.sleep` is set reads AVAILABLE (it wakes on the
turn); without it, sleeping IS down. D7 amended: "vLLM = a provider row on the `openai-compat` wire
(`openai-compatible` transport + a `features` block) plus the wake slice; the owner's fleet is
`tooling/src/stack/lib/engine-fleet/`". #2421 becomes moot (no
postures). `.dependency-cruiser.cjs:645` `vllm-surface-isolation` is DELETED (there is no vllm module left to isolate).

ALSO DELETED (owner word 2026-09-19, F18): the OpenRouter agent-sdk skin (mode-2) — `buildClaudeOpenRouterEnv`

- its `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` env, `substrate/or-model-cache`'s tier arm,
  `verbs/get-or-skin-tier-models.ts` + `OrSkinTierModels` on `ChatRequest` (`contract/chat.ts`) and on the service,
  the `agent-sdk × openrouter` arm of `deriveRunner`/`assertCoherent`/`healAgentSdkModel`, the vocabulary map's
  "claude code via openrouter key" row, the `agent-sdk` entry in openrouter's `apis`, and the one rpg consumer
  `entry/compose/rpg.ts:532` (`deps.connection.getOrSkinTierModels()` inside `extractViaChat`; the JSDoc at
  `:504` says the request field is non-optional — prose, not the type — and the consumer goes with the field). `agent-sdk` is the
  subscription's wire and nothing else's.

---

## 5. Registries

Rule: **closed tuples for the axes that are CODE (wire, modality, task, kind); data rows for the axes that are
VOCABULARY (provider); a table for the axis that is the USER's (connection); every policy derived.**

### 5.1 Wires (code)

```ts
export const WIRES = ["openai-compat", "anthropic-messages", "agent-sdk", "local-light"] as const;
export interface WireDef {
  readonly apis: readonly ChatApi[];              // chat protocols this wire can speak: openai-compat → chat-completions (+responses where the provider says so)
  readonly serves: readonly Task[];               // the tasks a backend for this wire implements (the policy ceiling)
  readonly deltas: readonly DeltaKind[];          // which stream events this wire can emit (image on openai-compat/anthropic; audio later)
}
export const WIRE_DEFS: Record<Wire, WireDef>;    // one backend per wire in @orb/inference (§5.6)
```

### 5.2 Providers (data)

```ts
export const PROVIDER_ID = /^(?:[a-z0-9-]+|plugin:[a-z0-9-]+\/[a-z0-9-]+)$/;   // built-ins are bare; runtime rows are namespaced (F8)
export interface ProviderDef {
  readonly id: ProviderId;                        // "openrouter" | "anthropic" | "openai" | "groq" | "vllm" | "lm-studio" | "ollama" | "custom-openai" | "plugin:<name>/<id>"
  readonly label: string;
  readonly wire: Wire;
  readonly dialect?: "openai-compatible" | "openrouter";  // WHICH TRANSPORT PACKAGE speaks the wire (§8.1) — nothing else; a server's quirks are `features`, not a dialect
  readonly features?: EndpointFeatures;           // shipped defaults for this provider's servers (§8.1b) — a CONNECTION may override any field in `declared.features`
  readonly auth: "apiKey" | "oauthToken" | "endpoint" | "none";     // endpoint = base URL + OPTIONAL bearer key (vLLM `--api-key`, LM Studio, a proxied Ollama)
  readonly baseUrl?: string;                      // fixed for hosted (api.openai.com, openrouter.ai); absent ⇒ the connection supplies it
  readonly apis: readonly ChatApi[];              // ⊆ WIRE_DEFS[wire].apis; e.g. openrouter = ["chat-completions","responses"]; agent-sdk is the subscription's wire ONLY (the OR skin is deleted, F18)
  readonly serves?: readonly Task[];              // ⊆ WIRE_DEFS[wire].serves; ABSENT ⇒ the whole wire set. Hosted rows NARROW it (OpenAI has no /rerank; F5)
  readonly catalog: "url" | "builtin";            // url = GET <baseUrl>/v1/models — hosted rows use the provider's fixed baseUrl, endpoint rows the CONNECTION's
                                                  //   (+ the OR-shaped enrichment where the dialect says so); builtin = the in-process runtime's bundled list.
                                                  //   There is no "user types a model id" strategy: typing is the FALLBACK of `url` when the endpoint's list
                                                  //   call fails or returns nothing (LM Studio with no model loaded, a bare proxy), and the pane says so
  readonly metered: boolean;
  readonly docsUrl?: string;
}
export const BUILTIN_PROVIDERS: readonly ProviderDef[];   // shipped rows; the registry accepts more at runtime (plugin/admin), validated by the same schema
```

Built-in rows, so the shape is concrete:

```ts
{ id: "openrouter",    wire: "openai-compat", dialect: "openrouter",         auth: "apiKey",     baseUrl: "https://openrouter.ai/api/v1", apis: ["chat-completions","responses"], catalog: "url",     metered: true }   // serves: the whole wire set
{ id: "anthropic",     wire: "anthropic-messages",                           auth: "apiKey",     baseUrl: "https://api.anthropic.com",    apis: ["anthropic-messages"],            catalog: "url",     metered: true }
{ id: "claude-sub",    wire: "agent-sdk",                                    auth: "oauthToken",                                          apis: ["agent-sdk"],                     catalog: "url",     metered: false }
{ id: "openai",        wire: "openai-compat", dialect: "openai-compatible",  auth: "apiKey",     baseUrl: "https://api.openai.com/v1",    apis: ["chat-completions"],              serves: ["chat","summarize","structured","embed","generateImage"], catalog: "url", metered: true }
{ id: "vllm",          wire: "openai-compat", dialect: "openai-compatible",  auth: "endpoint",                                            apis: ["chat-completions"],              catalog: "url",     metered: false,
                       features: { prefill: "continue-final-message", strictJson: "default-on", sleep: { isSleepingPath: "/is_sleeping", wakePath: "/wake_up" }, rerankPath: "/rerank", reasoningKeys: ["reasoning", "reasoning_content"], prefillSuppressesThinking: true } }
{ id: "lm-studio",     wire: "openai-compat", dialect: "openai-compatible",  auth: "endpoint",                                            apis: ["chat-completions"],              catalog: "url",     metered: false, features: { prefill: "none" } }
{ id: "ollama",        wire: "openai-compat", dialect: "openai-compatible",  auth: "endpoint",                                            apis: ["chat-completions"],              catalog: "url",     metered: false, features: { prefill: "none" } }
{ id: "custom-openai", wire: "openai-compat", dialect: "openai-compatible",  auth: "endpoint",                                            apis: ["chat-completions"],              catalog: "url",     metered: false }   // the BYO row: no shipped features; the connection declares what its server honours + its `transport`
{ id: "local-light",   wire: "local-light",                                  auth: "none",                                                apis: [],                                catalog: "builtin", metered: false }
```

Adding Groq tomorrow is one row: `{ id: "groq", wire: "openai-compat", dialect: "openai-compatible", auth:
"apiKey", baseUrl: "https://api.groq.com/openai/v1", apis: ["chat-completions"], serves: ["chat","summarize","structured"], catalog: "url", metered: true }`. Adding a llama.cpp server or TGI is an
`auth: endpoint` row with its own `features` block. No backend code for any of them. A plugin ships a row the
same way (namespaced id, §5.9-1). **The rows are shipped as a JSON document** (`contracts/inference/providers.json`,
parsed once through `providerDefSchema` at module load — the same parser a plugin row or an admin row goes
through), not as TypeScript literals: the built-in set is DATA that happens to ship in the box, and a lane
adding a provider edits data, never a `Record`.

The table test (§12) pins for every row: `apis ⊆ WIRE_DEFS[wire].apis`, `serves ⊆ WIRE_DEFS[wire].serves`,
`id` matches `PROVIDER_ID`, and a built-in id is bare (no `plugin:` prefix).

### 5.3 Connections (the user's table)

```ts
user_connections {
  id: UserConnectionId,           // `@orb/kit/ids` brand, prefix `user_connection` (schema-branding gate, F7)
  ownerId: UserId, label,
  providerId,                     // registry id (validated at the domain against the registry, CHECK-free)
  credentialId | null,            // FK → user_credentials (null for auth: none, or an open vLLM box)
  baseUrl | null,                 // for auth: endpoint providers
  model,                          // the picked model id (NEVER defaulted, F16)
  api,                            // ∈ PROVIDER.apis (coherence is data); "auto" ⇒ the provider's first api
  declared: json | null,          // per-connection OVERRIDES in `capabilityOverrideSchema` (§4 curated/): kind, modalities, window, dims, turns, reasoning, tools, pricing, and `features` (§8.1b)
  extras: json | null,            // extra BODY fields (today's preset customParameters — moved to the CONNECTION, where the quirk lives; the preset keeps only sampling)
  transport: json | null,         // the endpoint's REQUEST/RESPONSE transforms (today's custom_openai metadata: headers, includeBody, excludeBody, responseMap —
                                  //   `contracts/credentials/index.ts:51-70`, runner `custom-byo/runners/chat.ts:64-112,305-335`); headers + responseMap in the
                                  //   transport's `wrapFetch`, include/exclude in its `transformRequestBody` (§8.1, F4)
  modelListed: boolean,           // true when `model` came from the provider's list; false = typed fallback (§7.4) — the pane shows why
  allowBackground: boolean,       // F5
  createdAt, updatedAt
}

connection_bindings {             // EVERY actor → connection reference lives HERE, as FK physics (D61-B6: "a real FK junction, never a JSON id-array")
  id: ConnectionBindingId,
  actorKind: text CHECK ∈ BINDING_ACTOR_KINDS = ["user","automation-rule","plugin-grant"],
  userId | null,                   // set ONLY on the `user` arm. On the other two arms the owner is DERIVED — `ruleId → automation_rules.ownerId`
                                   //   (`automation.ts:76-79`), `pluginId → plugins.ownerId` (`plugin.ts:35-38`) — one FK away, so D23 says no doubling (ground5 M1)
  ruleId | null,  pluginId | null, // exactly one of {userId, ruleId, pluginId} non-null, matching actorKind — the `chat_participants` kind-shape CHECK idiom; each FK CASCADE + indexed
  task: text CHECK ∈ ROUTABLE_TASKS,
  connectionId: UserConnectionId FK user_connections SET NULL, indexed,   // SET NULL = the binding survives a deleted connection as `no-connection`, never a dangling id
  // NO `model` override column (side-eye 8 P1-3): the model has ONE home, `user_connections.model` — a second, unvalidated home on the
  //   binding was the §13 two-homes defect inside the doc's own schema; "the connection IS the pick" (§7.1). Switching models on one key
  //   is "Add another model on this key" (§5.3a), not an override
  // THREE PARTIAL UNIQUES, one per arm — the tree's NULL-distinctness idiom (`message_reactions`, `workloads`), never a coalesce
  //   expression (not a drizzle `onConflictDoUpdate` target; ground5 M2):
  UNIQUE (userId, task)   WHERE actorKind = 'user'
  UNIQUE (ruleId, task)   WHERE actorKind = 'automation-rule'
  UNIQUE (pluginId, task) WHERE actorKind = 'plugin-grant'
}
```

"A binding may only point at a connection its derived owner holds" is enforced at the ONE writer verb
(`domain/connection`) plus a named negative test — the `rpg_snapshots`/`plugin_kv` pattern — not by a CHECK
(a CHECK cannot join), and the doc says so instead of calling it a schema fact.
**CHATS DO NOT BIND TO CONNECTIONS, and neither do rpg games** (owner word 2026-09-19). Under `funderUserId`
every turn runs on the TRIGGERING principal's connection, so "the room's connection" has no referent — a
member's turn is the member's row, the host's is the host's. A per-chat override would only be meaningful under
the retired host-funds-the-room model. Precisely what D58 says, so nobody over-reads it again (ground5 c-2/c-3):
D58 BANS binding config to `chats` (the `schema-banned-shapes` gate reds any `chats.*presetId*`) and in the same
clause SANCTIONS the owning FEATURE carrying an association — `rpg_games.gmPresetId` is D58's own named
mechanism and is live (`db/schema/rpg.ts:84-88`), as is the host-set `chats.metadata.toolRecurseLimit`. So the
honest statement is: a ROOM never binds a connection; an owning feature MAY carry generation-adjacent state
(rpg already does for a preset); and the owner has ruled that rpg does NOT carry a connection — the game's
rounds run on the round-trigger's rows like any chat turn. The three kinds that remain are all PER-USER: `user` (that user's defaults per task — replaces the `roleDefaults.<task>` leaves in the settings
json), `automation-rule` (the rule's author picks a specific row for the rule; else the author's `user`
binding), `plugin-grant` (the installing user grants the plugin a row per task; else nothing — a plugin never
inherits a user's defaults silently, §5.9-2). One table, one fold, one FK — a deleted connection SET-NULLs every
binding in one cascade instead of leaving stale ids inside JSON blobs nobody can index. `provider_rows` (§5.9-1) is
likewise REAL COLUMNS for every scalar of `ProviderDef` (`id`, `label`, `wire`, `dialect`, `auth`, `base_url`,
`catalog`, `metered`, `docs_url`, `origin_kind`, `origin_id`) with JSON only for `features` (a parsed document)
and the two tuple arrays `apis`/`serves` (validated against the closed tuples on write) — not a KV blob.
One user, many connections; several may share one credential (two OpenRouter connections, different models).
`(ownerId, label)` unique. The one-active-row-per-provider index on `user_credentials` is DROPPED — not
because it stops a user holding several keys (it never did: rows are slot-keyed `(owner, provider, label)`,
`verbs/add.ts` `findSlotLabelRow`, and inactive rows coexist per `credentials.ts:15-17`) but because it decides
which key RESOLVES, and under connections the CONNECTION decides: `resolve` takes the `credentialId` off the
connection row instead of `loadActiveCredential(owner, provider)`, so the `active` column, `setActive`,
`hasAnyInSlot`'s auto-active-first and the `active` half of the pane are DELETED with the index (ground5 M9,
c-11). A credential row is just a sealed secret with a label; connections give it meaning. `extras` vs `transport`, so nobody conflates
them: `extras` is WHAT goes in the body (merged last, D156); `transport` is HOW the bytes travel and come back
(headers on the request, a strip/keep list applied AFTER extras as the endpoint's final word, a dot-path map
that reshapes a non-OpenAI reply into one the shared stream reducer can read). Both are per-connection; the
pane shows `transport` only on `auth: endpoint` rows.

**JSON columns — defend or strike (the house rulings: D61-B6 "never a JSON id-array" for references; D134 an
independently-gated JSON column owes its own ratchet; open JSON is the defect surface).** Kept, each with its
defence: `declared` — a parsed single-owner capability DOCUMENT in `capabilityOverrideSchema`, never queried by
field, never copied through an allow-list (the `params`/`promptSnapshot` class); `extras` — open by definition
(the user's own body fields), its ratchet is the belt denylist applied on write AND read; `transport` — a
CLOSED zod object (four fields), one owner, never queried; `provider_rows.features` — a document. STRUCK: the
`budget` column (reserved with no shape — YAGNI, add columns when a ceiling is real), every `connection_refs`
json and `chats.connection_id` (references → `connection_bindings`), and `roleDefaults` in the settings blob
(same). Never a JSON column whose members are ids, and never one a query filters on.

ONE forward migration file (step 4) does all of this: creates `user_connections` + `connection_bindings` +
`provider_rows`; adds `message_variants.connection_id`, `message_assets.origin`,
`session_entries.connection_id` (§5.3b); drops the `user_credentials` index + CHECK; DELETES every
`user_credentials` row (F2) and every `session_entries` row (its new NOT NULL FK has nothing to point at, and
a lineage is a cache — D8 reseeds from canon); seeds the two `local-light` rows AND their two `user` bindings
(`embed`, `rerank`) for every existing user (§7.2). NO data lift — old
`roleDefaults.{source, model, api}` blobs are simply no longer read (the settings parser's `.catch(undefined)`
drops them), and users create connections fresh.

### 5.3a The user surface — what the pane shows, in what tier, with what words (side-eye 8)

The schemas above imply ~40 leaf fields on one endpoint form; today's whole Connections pane is six rows with
one decision each (`snap` run `main-3679834-2026-09-19T19-17-42-222Z`). The architecture is not SillyTavern;
a pane that rendered those fields flat WOULD be ST's API drawer in a zod costume. So the surface is specified
HERE, before the schema freezes it, and step 3b mocks it before step 4 lands.

**Disclosure tiers — one rule, per field, no exceptions.** A connection editor has four tiers; Advanced and
Diagnostics are collapsed by default and carry a count badge of non-default overrides, so a user who has
touched nothing sees three fields and a "how it's used" line:

| Tier | Fields | Default state |
| - | - | - |
| **Essential** | provider · key (pasted inline — the credential row is minted behind it with its `label` copied from the connection's, which is what "Saved keys" shows; a second inline paste on the same `(owner, provider)` mints a NEW labelled row rather than overwriting — the `(owner, provider, label)` slot key, verify9 L6) or URL · model (listed; typed fallback with its copy) | open |
| **Purpose** | kind, rendered as an INFERRED verdict in task words ("This looks like a **chat & writing** model — change ▾"; options *Chat & writing* / *Search vectors* / *Reranking search results*), never a bare "what is this model for?" (`*-embed*`/`*rerank*` id heuristics beside `families.ts`); the task-requirement badges | open |
| **Advanced** | "What this server accepts" (= `declared`, a capability STATEMENT never a setting — keeps it off D154's turf) · "Endpoint quirks" (= `features`, READ-ONLY by default, each field showing its resolved value + source — "`prefill: continue-final-message` — from the vLLM provider row" — with one Override affordance per field; a diagnostics surface, not a setup step) | collapsed, badge |
| **Diagnostics** | "Extra request fields" (= `extras`, THE EXISTING ROW EDITOR `preset/components/custom-parameters-editor.tsx` moved to the connection — row identity by id, autosave-holding unfinished rows, per-belt-key gloss; a lane that ships a textarea has regressed three properties; its `SCOPE_GLOSS :29` copy re-derives from the transport, not from two dead source words) · "Request & response shaping" (= `transport`, endpoint rows only; a "paste a sample response" preview that shows the map resolving live is the one authoring aid the dot-path map needs) · reachability · wake | collapsed, badge |

The `api` control renders ONLY when `provider.apis.length > 1` (today: OpenRouter alone) — a one-option
combobox can only be gotten wrong. `label` auto-mints `<provider> · <model>`, editable, collision-suffixed.
`modelListed: false` carries its string: "This model id wasn't in `<host>`'s list. It'll be sent as-is; if
the server doesn't have it, turns will fail." plus a re-check action.

**Model roles — the user word for `connection_bindings`.** "Binding" is a schema word and never reaches copy
(SEALED, like `wire`/`dialect`). The pane keeps the shipped **Model roles** rows (Chat / Text embedding /
Rerank / Image embedding / Summarize / Image generation, each with a gloss — `connections-nav.ts:14` already
teaches "which connection each role resolves to"; the SAME file's `:14` continuation "A room or preset can
override any role" and `:23` "a room's own connection or a preset's routing can pick differently" become
FALSE under F20/§7.1 and are rewritten in step 9 — verify9 M6). Two changes to the rows: (1) **the Summarize row is
renamed "Utility model — summaries, structured extraction, captions"** and renders THREE requirement badges
(`prose` · `structured JSON` · `image input`) that resolve pass/fail against the bound connection's capability
through the existing `requirementMet` — eleven consumers ride this slot across three capability profiles
(§8.5b), and a cheap text-only model bound here silently breaks captioning otherwise; (2) **every row renders
what a turn resolves TODAY, against the PERSISTED read, never the form state** — the 2026-08-01 incident
(`connections-model.ts` header: two hours of a NULL `roleDefaults` under a "Saved" chip) paid for
`role-slot-row.tsx:123-152`'s "Not applied yet — a turn still uses …" readout, and the rebuild keeps it.
**A binding to a `spend: "background"` task on a row with `allowBackground` off is refused INLINE with the
reason and an "allow background work on this connection" switch right there** — the slot is the FIRST
enforcement point (so the user learns at authoring time), and resolve's `canFund` re-checks because the flag
can flip after the binding is written (§5.7); otherwise a subscription user binds Utility to their sub and ten consumers go silent
(only arbitration degrades visibly). The background tasks share ONE degrade notice so "nothing ran" is never
the whole signal.

**Three actions that make no-defaults survivable without a default:** (1) **"Use this connection for
everything it can serve"** on a connection row — one explicit, visible, undoable action that writes every
compatible `user` binding at once (the 90% OpenRouter case collapses from four five-step passes to one); (2)
**"Add another model on this key"** on a saved connection, pre-filling provider + credential and landing on
the model picker; (3) the provider picker grouped into four — *Hosted (key) · Your own server (URL) ·
Subscription · Built-in* — never twelve options flat. `claude-sub` renders DISABLED with its reason when the
`claude` executable does not resolve (`providers.available(principal)` is the §3.3 surface this needs — it
does NOT exist today, it lands with step 7; verify9 M3), and the paste step
carries a copyable `claude setup-token` plus "run this on the machine you use Claude Code on";
`runtime-missing` is a cause, not a sentence a person can act on.

**Where it lives.** Connections moves from the `app` shelf (`config-group-ids.ts:26-29`, beside Automation
and Admin — correct today, wrong once every row is the member's own) to the **`user` shelf** beside
Personas / Appearance / Chat behavior; the group description is rewritten in the user's words. "Saved keys"
becomes a read-only reuse view ("used by 3 connections · replace · revoke") — a credential is minted inline
from the connection form, so the user's noun count is three (connections · model roles · presets), not four.

**Inside a room.** The composer carries a quiet **"running on \<your connection · model>"** readout (the #54
gate is already re-keyed to the funder at `compose/chat.ts:1575`, so the value is in hand); the transcript's
per-swipe attribution renders from the columns step 4 adds (`message_variants.connection_id`/`provider`/
`model`) so "who wrote this" is answerable in a mixed room; the image affordance in a shared room carries one
line — "pictures you make here live in this room" — plus a gallery filter for the room (§6.7's host-CAS
consequence made legible).

**Warnings — cadence, not just codes.** The capability panel's greying is the AMBIENT pre-turn channel and
carries an explicit connection switcher ("showing what **chat · OpenRouter · Claude Opus 5** honours ▾",
default the `chat` binding) — "the connection in view" is otherwise undefined with N connections × 6 roles.
The per-turn stream carries AT MOST ONE aggregated notice, and only when the dropped set CHANGES from the
previous turn on that connection — a subscription user's eleven inert sampling knobs must not fire eleven
warnings per turn forever. Every `WARNING_CODES` member has a named client home: `sampling_knob_dropped`,
`effort_dropped`, `sampling_knob_conflict` → the capability panel (ambient) + the aggregated turn notice;
`custom_parameters_ignored{key}` → inline on the offending Extras row at AUTHORING time (the editor already
does this for belt keys); `declared_overrides_measured` → a badge on the connection row ("3 fields
overridden"), NEVER the turn stream (the user asked for it); `smart_arbitration_degraded` → the room,
aggregated per session; the background-task degrade → the shared notice above. `engine-down` is renamed
`endpoint-unreachable` in the same tuple sweep that retires `engine-off` (the engine is gone with the fleet);
copy "Can't reach `<host>` — the server may be down."

**Words (the vocabulary-map edit step 1 owes, enumerated — P1-8):** `connection` user-facing (already
taught) · `provider` user-facing label · `binding` SEALED → "Model roles" · `wire`, `dialect` SEALED (the new
`runner`/`family`; never in copy) · `task` SEALED → the six role labels · `kind` SEALED → the task phrasing
above · `declared` → "What this server accepts" · `features` → "Endpoint quirks" · `extras` → "Extra
request fields" · `transport` → "Request & response shaping" · `engine-down` → `endpoint-unreachable` ·
`anthropic` + `anthropic-messages` returned · the OR-skin row removed.

**What only a render answers** (owed on the step-3b mocks and again on the built pane): whether the editor
fits the settings body at 486px with the context panel open; whether a list of user-owned rows inside a
settings body collides with shell anatomy; what the per-role status dot means with badges + reachability;
warning density in a live stream; the mobile arm; the inline-image placeholder's reading rhythm.

### 5.3b Attribution — what a message row records about the connection that generated it

Attribution and routing are different columns and stay that way: routing is a `connection_bindings` row (which
connection the NEXT turn should use); attribution is on the variant (which row DID generate this swipe), and it must
survive the connection being edited or deleted. Changes, all in step 4's migration:

| Column | Today | After |
| - | - | - |
| `message_variants.connection_id` | absent | NEW, `UserConnectionId` brand, nullable, FK `user_connections` **SET NULL** (a deleted connection never deletes history; `messages.selectedVariantId`'s idiom), indexed (`fk-columns-indexed` gate). Written at commit from `Resolved.connectionId`; null on user-authored rows, imports and edits (`edit.ts:322` already writes `provider: null`). |
| `message_variants.provider` | the SOURCE word (`credential.source`, `compose/chat.ts:783`) | the PROVIDER REGISTRY ID (`Resolved.provider.id`) — denormalised on purpose so attribution reads need no join and outlive the connection row. Branded `$type<ProviderId>()`, validated at the producer, no CHECK (§5.3c class 2 — a plugin provider id is `plugin:…`). |
| `message_variants.model` | the resolved model id | unchanged in value (`Resolved.model`), branded `ModelId` (§5.3c). |
| `message_variants.generationId` | the OR `gen-…` handle | unchanged in shape; written by the openrouter transport's `extractMetadata`, null on every other transport/wire. |
| `message_variants.costUsd` | OR usage | `extractMetadata` on every hosted wire that reports it; null elsewhere. |
| `model_stats.provider` | the source word | the provider registry id for every row written after step 4; typed `$type<ProviderId \| "(unknown)">()` because the column's own `NOT NULL DEFAULT '(unknown)'` (`stats.ts:46,241`) fails `PROVIDER_ID` and stays (ground5 M3). `@orb/kit/stats-tally` needs no change. STATED, not hidden: `rebuild-from-canon.ts:500,603` re-reads `message_variants.provider` from HISTORY in raw SQL keyed `(model, provider)` at `:281-282`, so a reconcile after step 4 yields one old-word row (`max-pro-sub`, `custom_openai`) and one new-word row per model — acceptable pre-launch, and the migration MAY `UPDATE message_variants SET provider = <new>` for the two respelled words to avoid it (ground5 M12). |
| `message_assets.origin` | absent | NEW, CHECK on `MESSAGE_ASSET_ORIGINS = ["attached", "illustration", "inline-reply"]`, NOT NULL, NO column default — every writer stamps it. The table has LIVE rows from two writers, and SQLite cannot add a NOT NULL column without a value, so the migration BACKFILLS in the same `.sql` (the `db-schema.md` step-3 sanctioned form): `CASE WHEN (SELECT kind FROM messages m WHERE m.id = message_id) = 'narrator' THEN 'illustration' ELSE 'attached' END` — exactly the two writers' current split (ground5 H2). WHY a per-LINK column when `assets.kind` already spells `attachment` vs `generated` (`contracts/assets/index.ts:17`, both live: `use-send-message.ts:53`, `imagery/substrate/generate-core.ts:62`): `kind` cannot separate an `/imagine` illustration from an inline reply picture — both are `generated` — and that is exactly the distinction the wire-history predicate needs (verify4 H2). The two `insertMessageAssetStatements` callers (`canon-write.ts:291-311`): `chat/verbs/turn.ts:785` writes `attached`; `chat/verbs/post-narrator-message.ts:105` (illustration posts, an ASSISTANT row with real `asset:` spans — verify4 H3, settled) writes `illustration` EXPLICITLY and is pinned to; the §6.7 reducer writes `inline-reply`. Only `inline-reply` rides back. |
| `session_entries.connection_id` | absent | NEW, `UserConnectionId` brand, NOT NULL, FK `user_connections` **CASCADE**, INDEXED (the session file lives in that connection's user runtime dir, which is removed with the row — §8.4-2). D8/D25 survive (lineage still hangs off `chatId`, staleness still detected vs canon). The PRIMARY becomes per `(chatId, connection_id)`, enforced by a NEW partial unique `(chat_id, connection_id) WHERE is_primary` — new, because today the one-primary rule is writer discipline only (the table's only indexes are `(chat_id, seq)` and `(sdk_session_id)`, `sdk-session.ts:66-71`, and "reseeds spawn a secondary that is later reaped", `:61-62`; verify6 M5). Because a reseed on the SAME connection is the common case, the promotion's statement order is fixed and written at the index: un-primary the old row, THEN set the new one, inside one batch — the `chat.ts:597-600` host-handoff idiom ("compatible … precisely because its statement order is demote → promote"). **All of this is NEW code, not a description of today's `session/`** (scout-surfaces 3): `SessionEntryWriter` (`agent-sdk/session/store.ts:65-73`) is `insert({chatId, sdkSessionId, seededThroughSeq, canonHash})` / `update({sdkSessionId, seededThroughSeq, canonHash})` — no `connectionId`, no `isPrimary`, no two-row pair; `reseeded` (`:228-234`) is one in-memory `replace` + one `persistUpdate`, and both persists are best-effort (`:75-99`, the row is reap substrate, the cache is the correctness path). Step 4 grows `insert` by `connectionId` and gives the CONCRETE writer — `entry/compose/session-entries.ts`, which today writes `{id, chatId, sdkSessionId, seq, seededThroughSeq, canonHash, isPrimary}` with `isPrimary` set ONCE at insert (`seq === 0`) and never updated, and there is NO dual-session reaper anywhere on the tree despite `sdk-session.ts:61-62`'s "later reaped" (scout-providers) — the demote→promote batch; the six dispositions and the salt-walk (`:180-282`) are untouched. Two funders alternating in one room each keep THEIR lineage warm instead of appending one per turn and destroying the prompt-cache survival this table exists for (`sdk-session.ts:1-14`; ground5 M8). Stated cost: a 2-human room on two subscriptions holds two cached sessions. |

Every new FK column above and in §5.3 is INDEXED unless it is a PK or leads a unique: `message_variants.connection_id`,
`session_entries.connection_id`, `user_connections.credential_id`, `imagery_generations.connection_id`,
`connection_bindings.connection_id` and each of its THREE actor FKs (`userId`, `ruleId`, `pluginId`;
`user_connections.owner_id` leads the `(owner_id, label)` unique; each actor FK leads its own partial unique
`(<actor id>, task) WHERE actorKind = …` — the §5.3 spelling, the only one — so none needs a second index). `fk-columns-indexed` is `authority: "hard"` (`gates/fk-columns-indexed.ts:35-62`) — no waiver door
(verify4 M1).

**Producer ownership (Tier-1-DB "producer-names-the-schema", locked; gates `db-structure`,
`db-structure-producer-home`, `own-tables-only`).** A table lives in the schema file of the domain that
PRODUCES its rows and only that domain writes it; another domain reaches the data through an injected op. So:
`user_connections` AND `provider_rows` → `schema/connection.ts`, both written ONLY by `domain/connection` verbs
(the package's `ConnectionStore`/`ProviderStore` ports are wired by the server to connection's persistence, so
the WRITER is a scanned domain and `own-tables-only` — whose population is `packages/server/src/domain/**`,
header `:4-7` — actually enforces it; a non-domain producer outside `packages/server` would be UNSCANNED, i.e.
a wish, verify4 M2). The registrations are the THREE §4 names (barrel · `TABLE_SCOPING_ROWS` per table ·
`OWNERID_CLASSIFICATIONS` + its `count` literal; verify7 H1). NO `SCHEMA_OWNERS` row — the gate's dispatch (`own-tables-only.ts:252-258`, header
`:27-30`) maps a schema file to its same-named domain automatically and hand rows are RULING DATA reserved for
files without one (verify6 H6; an earlier draft said "two edits" — it was wrong, §4 is the accurate sentence). The
seed at user-create is a `domain/connection` verb reached through an injected op from BOTH user-minting
sites — there is no `users.create`: `domain/sessions/persistence/users.ts:103` (`insertUser`, the JIT/SSO
path, `onConflictDoNothing` + re-read) and `domain/admin/verbs/create-user.ts:86` (inside `commitAuditedWrite`'s
one batch, #1691). Posture: the seed runs AFTER the user row commits (never inside the audited batch — a seed
failure must not un-create an account), is idempotent by the `(owner_id, label)` unique so the
`onConflictDoNothing` loser's re-read path double-seeds nothing, and a failed seed is a logged warning the
pane repairs with "add local-light rows" (verify4 M7);
`message_variants.connection_id` + `message_assets.origin` → chat's file, chat's writes (chat stores the id
`Resolved` handed it; it never reads `user_connections`); `session_entries.connection_id` → `sdk-session.ts`,
written by the agent-sdk backend from the same `Resolved`; `model_stats.provider` → stats, which receives the
string on the delta. Every FK crosses domains at the SCHEMA level only (D23's one-FK-to-an-owned-parent shape);
no write crosses.

### 5.3c Wire-neutral record vocabulary — closed where it can be, opaque where it must be

"Compatible across every endpoint" is a property of the RECORD, not of the wire: every wire reduces to one
normalized shape, and what cannot be normalized is stored as provider-opaque provenance beside it, never
laundered into a shared column. The free-text columns below are authored as `{ enum: TUPLE }` +
`checkList(TUPLE)`, the form the `db-enum-from-tuple` gate polices:

| Column | Today | After | Home of the tuple / type |
| - | - | - | - |
| `message_variants.finish_reason` | free text; every writer types it bare `string \| null` (`canon-write.ts:140`, `engine.ts:241,1222,1389,1424`, `compose/chat.ts:797`, `compose/rpg.ts:1004`) | CHECK on `NORMALIZED_FINISH_REASONS` (`stop \| length \| filter \| tool \| other`) AND the writer chain narrowed to `NormalizedFinishReason \| null` starting at `canon-write.ts:140`, so `tsc` refuses a raw string before the CHECK ever aborts a commit (verify4 M10a; the ST import writes no `finishReason`, so the CHECK is safe on that path) | MOVES from the purged `infra/providers/contract/chat.ts:209` (server — a db CHECK cannot import it) to `@orb/contracts/inference/finish-reasons.ts`; `FINISH_REASON_MAP` (the per-wire raw → normalized fold) stays in the package, extended for the Vercel V4 finish vocabulary |
| `message_variants.stop_reason` | free text | UNCHANGED, provider-OPAQUE by declaration (the raw upstream string — `end_turn`, `max_output_tokens`, …; provenance for the normalized column, `chat.ts:208`) | none — it is not an enum |
| `message_variants.terminal_reason` | free text | UNCHANGED, provider-opaque (the agent-sdk terminal-channel word / the error class's `terminalReason`, `contract/errors.ts:107`) | none |
| `message_variants.reasoning_effort` | free text | CHECK on `EFFORT_LEVELS` at `contracts/preset/index.ts:256` (`["none", ...MODEL_EFFORT_LEVELS]`, 7 members, derived from `contracts/connection/index.ts:77`'s 6; `REASONING_MODES` at `:71` is the capability MODE axis, a different tuple). NOTE for §8.0's `wireMeta.effort`: `@ai-sdk/anthropic`'s per-turn effort is `low \| medium \| high \| xhigh \| max` (`anthropic-language-model-options.ts:88`) — `none`/`minimal` are DROPPED with a `effort_dropped` warning before the forward, never clamped silently (verify4 M10b) | contracts/preset |
| `message_variants.provider` · `model_stats.provider` · NEW `imagery_generations.provider` | free text | `$type<ProviderId>()` (`ProviderId \| "(unknown)"` on `model_stats`), validated at the PRODUCER verb against the registry; NO CHECK (plugin rows are runtime data — a CHECK would be the closed-`BACKEND_KEYS` mistake again). ONE live writer bypasses that validation and is named: the ST import writes `provider` verbatim from the source file (`import/substrate/chat-input.ts:40,62,76` → `chat/persistence/import-write.ts:339`); it is narrowed to "registry id if it parses, else `(unknown)`" in step 4 (ground5 M3) | `@orb/contracts/inference/providers.ts` (`ProviderId`, `PROVIDER_ID`) |
| `message_variants.connection_id` · NEW `imagery_generations.connection_id` | absent | branded `UserConnectionId`, SET NULL (imagery's image provenance gets the same attribution pair as a chat swipe) | `@orb/kit/ids` |
| NEW `message_variants.cost_provenance` | absent (`costUsd` is OR's reported number or null) | `measured \| estimated \| unrecorded` — the SAME tuple as `token_provenance` (`TOKEN_PROVENANCES`, `contracts/chat/messages.ts:24`; an earlier draft minted `reported` beside `measured` on the same table — the §15c-3 mistake, verify6 M4). `measured` = the transport's `extractMetadata` (OR usage cost, Anthropic/OpenAI usage where the SDK exposes it); `estimated` = catalog pricing × normalized tokens when the catalog row carries prices and the wire reports none (the OR catalog does; an endpoint connection may declare `pricing` in its `declared` block) AND the subscription wire's SDK-computed `costUSD` (a notional API price with no invoice behind it, §8.4-7); `unrecorded` otherwise. Rollups combine it with the EXISTING `combineTokenProvenance` (`messages.ts:33-38`: one estimate makes the sum approximate) — no second precedence rule | `TOKEN_PROVENANCES`, reused |
| `message_assets.origin` | absent | CHECK on `MESSAGE_ASSET_ORIGINS = ["attached","illustration","inline-reply"]`, no default (§5.3b) | `@orb/contracts/chat/messages.ts` |
| `message_variants.metadata` | open `Record<string, unknown>` (today one key, the measured reasoning window, `canon-write.ts:66-71`) | a PARSED sidecar: `variantMetadataSchema = { reasoningMs?, providerMetadata?: ProviderMetadata }` where `ProviderMetadata` is a CLOSED discriminated union of NAMED per-provider shapes in contracts (`{ provider: "openrouter", cache?, generationId?, upstreamCost? } \| { provider: "claude-sub", cacheCreation5m?, cacheCreation1h?, warmSpareClaimed?, durationApiMs?, numTurns?, sdkSessionId? } \| { provider: "anthropic", … }`; a plugin provider gets `{ provider: PluginProviderId, raw: JsonValue }` and NO reader by key). `Record<ProviderId, unknown>` would have been the #164 open-bag defect one level below `open-json-column-key-parity`'s reach (it judges the column's `$type`, never a bag inside it — ground5 M7); a reader like the OR cost pill names a typed field or does not compile. Parsed at the read seam (`.catch` → `{}`), not cast | `@orb/contracts/chat/messages.ts` |
| `ChatUsage` (`contract/chat.ts:262-278`) | one type with Anthropic-shaped fields on every wire (`cacheCreation5mTokens`, `cacheCreation1hTokens`, `webSearchRequests`) | the NORMALIZED core: `model: ModelId`, `tokensIn/Out`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`, `contextWindow`, `maxOutputTokens`, `costUsd`, `costDetails`, `costProvenance`. The V4 `usage` is NESTED (`inputTokens: {total, noCache, cacheRead, cacheWrite}`, `outputTokens: {total, text, reasoning}`, `raw`, `language-model-v4-usage.ts`) so the fold is nested→flat, and three fields have NO V4 source: `contextWindow` comes from the resolved capability, `maxOutputTokens` from the funnel's resolved cap, `costUsd`/`costDetails` from `extractMetadata` or the `estimated` arm (verify4 M5). `isByok` (`:277`) and the Anthropic/OR-only fields move into `providerMetadata[<providerId>]` | `@orb/contracts/inference/usage.ts` |

**The closing rule — every string column in this program is one of four things, and a lane says which:**

1. a CLOSED tuple from `@orb/contracts` with a SQL CHECK (`finish_reason`, `reasoning_effort`, `cost_provenance`,
   `token_provenance`, `origin`, `user_connections.api` — CHECK on `CHAT_APIS`, the tuple the wire defs use);
2. a BRANDED id validated at the producer against a registry or a parent row, no CHECK because the vocabulary
   is runtime data (`ProviderId` on every `provider` column; **`ModelId` — the brand ALREADY in `@orb/kit/ids:150`,
   used by `refinery.ts:113` and by nothing else — on `user_connections.model`, `message_variants.model`,
   `model_stats.model`, `imagery_generations.model`, `Resolved.model`, `ChatUsage.model`**; `UserConnectionId`,
   `UserCredentialId`, `AssetId` as FKs);
3. a PARSED JSON sidecar with a zod schema at the read seam and a producer-side parse on write (`declared`,
   `extras`, `transport`, `provider_rows.features`, `variantMetadataSchema`) — never `Record<string, unknown>`
   past the seam;
4. a declared-OPAQUE provenance string that is never compared, switched on or joined (`stop_reason`,
   `terminal_reason`, `generation_id`, `label`, `baseUrl` — the last validated as a URL by the domain's zod on
   write and by the egress guard on use).
   Anything not on that list is a free string, and a free string is the defect. Enforcers, honestly (ground5
   M4/M5): class 1 is policed by the SQL CHECK plus `db-enum-from-tuple` — which judges a column's `enum:` CONFIG
   (an inline array vs a named contracts tuple), so the authoring form `{ enum: TUPLE }` + `checkList(TUPLE)` is
   what brings a column under it; class 2 is policed by NO gate (`schema-branding` judges only PK entity ids and
   FK brand parity) — its enforcer is the producer verb's registry validation + a named negative test per column,
   which AGENTS §2.3 accepts as a placement only because the test is named; class 3 is the `parse-on-read` idiom
   the tree already uses for `macroFreezes`/`toolCalls`, and every new `mode: "json"` column ALSO enters
   `json-column-write-parity`'s derived population on arrival (Arm A reds a column with both a key-wise and a
   whole-replace writer; Arm B + `requireIntactStoredConfig` is the #471/#1026 degrade-then-write class) — so the
   Connections pane's edit flow is a FIELD-WISE patch verb, never a GET→whole-blob PUT (ground5 M6); class 4 is a
   header comment on the column, which is the honest amount of enforcement a provenance string can carry.

What this buys: a stats rollup, a cost pill, a "why did it stop" badge and a swipe's attribution read
IDENTICALLY for OpenRouter, Anthropic, a vLLM box, a custom endpoint and the subscription; the only
per-provider thing on a row is under `providerMetadata[<providerId>]`, where a plugin provider's payload also
lands with no schema change. Embedding space tags (`embeddings.ts:22-28`, `(model, dim)` + dtype) are
deliberately NOT given a provider id: two providers serving the same weights at the same dtype ARE one space.

The D19 amendment's comment sweep rides step 6 and is DEFINED by a command, not a list (ground5 H4 — the
premise-carrying population is ~20 sites in 12 files across `db`, `contracts` and `server`):
`/usr/bin/grep -rn "host's money\|funds the turn\|FUNDS\|funding\|funder" --include=*.ts --include=*.tsx packages/ --exclude-dir=node_modules`
(multiline-aware follow-up for the wrapped phrase at `db/schema/chat.ts:593-594`). Two are CONTRACT comments
that become FALSE, not stale, and will not be in a chat lane's diff unless named: `contracts/chat/metadata.ts:245`
(the `toolRecurseLimit` justification "the loop spends the host's money, so the funder tunes it") and
`contracts/plugin/bridge.ts:60-61` (describes the by-proxy consent + per-member budget belts this program
deletes). The rest: `db/schema/chat.ts:568,590-594,790`, `domain/chat/verbs/turn.ts:2547-2554`,
`domain/chat/contract/{params.ts:277-291, results.ts:279}`, `domain/plugin/contract/ops.ts:112-113`,
`domain/automation/contract/ops.ts:138-141,252`, `automation/engine/arm-executors.ts:347`,
`infra/plugin-host/membrane.ts:782`, `chat/substrate/{group-bucket.ts:20, backfill.ts:93,525}`,
`chat/persistence/participants-read.ts:140`. The lane's receipt is that grep returning ZERO premise-carrying
hits after the sweep.

### 5.4 Modalities

```ts
export const MODALITIES = ["text", "image", "video", "audio", "file", "vector"] as const;
```

`GenerationCapability.input: Modality[]`, `.output: Modality[]`; `EmbeddingCapability.input: Modality[]` (text,
image), `.output: ["vector"]`. Today's `input.{vision, video, audio, file}` booleans and `outputModalities`
strings collapse into these. One read helper: `accepts(cap, "input" | "output", modality)`. Unknown-value
rule (F18): catalogs hand us free strings (OR stores `architecture.inputModalities.map(String)`,
`backends/openrouter/catalog.ts:72-73`, consumed by `Set.has` today so a new value is silently ignored); the
parser DROPS an unknown string and sets `modalitiesEstimated: true` — a parse outcome, never a throw, never
silence. `vector` is emitted by no catalog; it exists only as `EmbeddingCapability.output`.

### 5.5 Tasks

```ts
export const TASKS = ["chat","embed","rerank","imageEmbed","summarize","generateImage","agent","structured"] as const;  // order = pane render order
export interface TaskDef {
  readonly kind: ModelKind;                                  // generation | embedding | rerank
  readonly requires?: { input?: Modality[]; output?: Modality[]; tools?: boolean; structured?: boolean; dims?: number };
  readonly scope: "actor" | "owner";                         // owner = the vector space (one per owner)
  readonly spend: "foreground" | "background";               // background needs connection.allowBackground
  readonly routable: boolean;                                // has a pane slot + may be a `connection_bindings.task`
  readonly ridesOn?: Task;                                   // non-routable tasks resolve through another task's connection
}
```

Rows as in v2 (`generateImage: { kind: "generation", requires: { output: ["image"] } }`; `agent` rides `chat`;
`structured` rides `summarize`). A future `transcribe` is `{ kind: "generation", requires: { input: ["audio"] } }`
plus a `transcribe` member on `WIRE_DEFS[wire].serves` and a backend method.

### 5.6 Backends (one per wire, `@orb/inference/registry/backends.ts`)

```ts
export const BACKEND_DEFS: Record<Wire, { serves: readonly Task[]; needs: readonly (keyof InferenceDeps)[]; create(deps): ProviderBackend }>;
```

Dispatch is trivial: `backend = BACKEND_DEFS[provider.wire]`. No `(api, source)` matrix. The openai-compat
backend takes `provider.dialect` + `connection.baseUrl` + the credential at call time.

### 5.7 Derived policy (`contracts/inference/policy.ts`)

```ts
providerTasks(p)        = WIRE_DEFS[p.wire].serves ∩ (p.serves ?? WIRE_DEFS[p.wire].serves)          // provider-level: what the PICKER may offer (F5)
connectionTasks(conn)   = providerTasks(provider(conn)) ∩ tasksOfKind(kindOf(conn))   // one connection = one model = one kind
kindOf(conn)            = catalog row kind (OpenRouter only — NO OpenAI-compatible /v1/models carries a kind: OpenAI, Groq, Ollama, vLLM all return {id, object, created, owned_by}; LM Studio's `type` lives on its own /api/v0/models, verify4 M4)
                          → curated/*.json kind by model id → conn.declared.kind (the pane asks "what is this model for?" on EVERY non-OpenRouter row when curation is silent, hosted rows included)
taskProviders(task)     = providers whose providerTasks ∋ task
coherentApis(p)         = p.apis
canFund(conn, task)     = TASK_DEFS[task].spend === "foreground" || conn.allowBackground   // BOTH sites: the binding slot refuses inline at bind time (§5.3a) AND resolve re-checks, because the flag can flip after the binding is written (verify9 M2)
requirementMet(cap, t)  = every TASK_DEFS[t].requires clause holds on the connection's resolved capability
```

The whole policy — there is no firewall — is `providerTasks` (picker) + `connectionTasks` (resolve) + `canFund` + `requirementMet`. Today's
hand row `generateImage: ["openrouter"]` (`roles/firewall.ts:11-26`) is reproduced by DATA: openrouter's
`serves` is the whole wire set, openai's names `generateImage` explicitly, and no other built-in hosted row
does — the derivation is not wider than the belt it replaces, which is the table test's job to pin. `agent` is served only by the `agent-sdk` wire,
so `taskProviders("agent")` = the providers on that wire, by construction (the 2026-07-27 ruling becomes a
property of `WIRE_DEFS`, not a hand row). A table test pins `WIRE_DEFS[w].serves ≡` the methods
`BACKEND_DEFS[w].create()` implements.

### 5.8 Stream events (one open-ended union)

```ts
export const DELTA_KINDS = ["text", "reasoning", "image", "audio", "tool-call", "citation", "usage"] as const;
```

`ChatDeltaEvent` is `{ kind: DeltaKind, … }` per kind. Runners emit what their wire supports
(`WIRE_DEFS[wire].deltas`); the bus and the canon content blocks consume the same union; the client renders by
kind. Inline images (§6.7) are the `image` member, not a feature.

### 5.9 Plugin hooks into providers and connections

Three hooks, all data + a capability grant, none of them a backend:

1. **Ship a provider row.** A plugin manifest may carry `providers: ProviderDef[]` (wire ∈ the closed `WIRES`,
   validated by the same schema). The fences, because a provider row is HOST egress carrying the user's sealed
   credential and touches neither the membrane's SSRF allowlist nor its hourly belt (F8, `security-executor`):
   (a) the id MUST match the `plugin:<name>/<id>` arm of `PROVIDER_ID` and `<name>` MUST be the shipping
   plugin's own name — a bare id is a manifest-parse refusal; (b) built-ins win: `providers.register()` of any
   id already registered is a typed refusal at activation, so a row can never inherit another id's credential
   rows by AAD or redirect them; (c) the row's `baseUrl` host MUST be in the plugin's `netHosts` and the
   manifest MUST declare an egress capability (`EGRESS_CAPABILITIES` biconditional,
   `contracts/plugin/manifest.ts:98-105`), so the host it names is the host the user consented to; (d) a
   `providers` block without `baseUrl` (an `auth: endpoint` row) is allowed — the user supplies the URL and the
   deployment's `privateEndpointAllowlist` (F12) judges it as for any endpoint row. The plugin domain calls `providers.register(row,
   { plugin })` at activation and `providers.drop(id)` at deactivation; rows persist in `provider_rows` (F9), so a
   connection on a not-yet-activated plugin provider reads `no-connection` until activation, never a parse error.
   A rename/reinstall under a new id orphans the credentials sealed under the old id by construction (the id is
   the AAD half); the pane says so on the orphaned row.
2. **Use the user's connections.** `connection.use` is a NEW member of `PLUGIN_CAPABILITIES`
   (`contracts/plugin/manifest.ts:13-97` — the closed tuple, its consent line and band placement, the #1041
   consent aggregate, AND the `CAPABILITY_HOST_FUNCTIONS` row in `host-v1.ts` — `manifest.ts:10-12`: a
   capability with no host function fails `tsc` at that map; verify4 M9 — are the coupled sites). A plugin declares the TASKS it wants (`{ tasks: ["summarize"] }`,
   `Task` restricted to the ROUTABLE members — `structured` rides `summarize` for a plugin exactly as for every
   other actor; F16); the user grants a connection per task in the plugin's settings (the plugin row stores
   `connection_bindings` rows with `actorKind: "plugin-grant"` keyed by the installing user + the plugin, §7.1 — the same table every actor uses). The membrane binds `roleClientsFor(installer, pluginRefs)` (today's `llm.quiet` seam,
   `domain/plugin/contract/ops.ts:273-300`), so the plugin gets text back and never sees a credential, a
   provider id or a wire; `allowBackground` and the hourly quiet-LLM floor apply unchanged. The seam's SCHEMA
   arm (`compose/automation-plugin.ts:686-694`: `opts.schema` → `buildQuietResponseFormat`, a non-liftable
   schema THROWS — never a silent downgrade) resolves `structured` through the grant's `summarize` binding
   (§7.5-1); it is one of the 13 constrained sites step 2 renames.
3. **Read the registry for its own UI.** `providers.list()` (rows, no secrets) and
   `connections.mine({ task })` (the user's connections the plugin was granted, with the credential-free
   `resolveChatCapability` projection) are class-1 membrane reads.
   Not offered: creating or editing a user's connections, reading a credential, adding a wire. Those stay host-only.

## 6. Capability

### 6.1 Per-kind schemas

- **generation**: today's `ModelCapability` with its modality booleans (`input.{vision, video, audio, file}`)
  replaced by `input: Modality[]` and `output: Modality[]` (from OR `inputModalities`/`outputModalities`, a
  provider's curated row, or the connection's `declared`), plus `modalitiesEstimated?`; `tools.silencesProse`,
  `turns`, reasoning, sampling, output.maxTokens, context all KEPT verbatim.
- **embedding**: `{ dims, mrl, maxInputTokens, input: Modality[] (text, image), output: ["vector"], instructionAware, dtype?: string, windowEstimated? }`.
- **rerank**: `{ maxInputTokens, input: Modality[], instructionAware }`.
- Image generation has NO separate schema: `generation.output.modalities ∋ "image"` says a model can emit images;
  `generation.input.imageEdit` + `input.references` say it accepts an init/reference image on that call.
  `edit-image.ts:48`, `generate-picture.ts:58`, `image/runner.ts:170` migrate to `acceptsImageEdit(cap)`.

### 6.2 Precedence and tiers — ONE ladder, spelled once (verify6 H4)

`EVIDENCE_TIERS` (`contracts/inference/evidence.ts`) is the only spelling; §0, §4, §6.3 and §16 cite it, never
re-spell it:

`declared > measured > advertised > curated > family-floor (add-only) > kind floor`

- `declared` — the CONNECTION's own block. It WINS over a dated measurement, with a `declared_overrides_measured`
  warning naming the field: the user's box is the truth about the user's box (§6.3's own argument), and a shipped
  measurement describes OUR probe of SOME deployment.
- `measured` — a probe receipt, dated, named script (`capability/sources/measured/*`).
- `advertised` — catalog row / daemon row / `/v1/models`.
- `curated` — the JSON rows (§4), cited.
- `family-floor` — `capability/sources/family-floor.ts`, OR semantics only (adds, never subtracts), applied after
  the four above; today's `synthesizeToolAxes` (`resolve-model-capability.ts:250-263`).
- `kind floor` — `KIND_DEFS[kind].floor`.

Higher tiers override only the fields they state (family-floor excepted — it ORs). D69 is engaged by the
`match.wire`/`match.api` fold (derived per wire-shape, curated refinement). D68 is a SEPARATE constraint on
one wire and is honoured explicitly (verify7 M8): "direct-transport per-model Claude sampling is FAIL-CLOSED —
`ANTH_DIRECT_SAMPLING` ships EMPTY until a live probe validates each model's honored set; absence means the
knob does not render, never a guessed default" (`Core-Path-Registry.md:192`). So `curated/anthropic.json`
ships NO sampling ranges for the `anthropic-messages` wire (the knobs do not render until a dated
`measured/anthropic.ts` entry says otherwise); its `sampling.exclusive` pair (§8.7) is a RESTRICTION and is
compatible with fail-closed.

### 6.3 Where modality truth comes from, by provider `catalog` strategy

| `PROVIDER.catalog` | generation | embedding |
| - | - | - |
| `url` with the openrouter transport | the catalog row's `input`/`output` modalities | catalog row + `curated/embedders.json` |
| `url` on anthropic-messages / agent-sdk | `curated/anthropic.json` (image + file in; text out) refined by the daemon row | n/a |
| `url` on a hosted openai-compat provider (OpenAI, Groq, …) | KIND: curated row by model id → else `declared.kind` (the pane asks); MODALITIES: curated row → else permissive + `modalitiesEstimated` | `curated/embedders.json` → else refuse at pick |
| `url` on an `auth: endpoint` provider (vLLM, LM Studio, Ollama, custom) — the list comes from the CONNECTION's `<baseUrl>/v1/models`, which carries ids + sometimes a window, never modalities | the CONNECTION's `declared` block (kind, modalities, `reasoning`, `turns?`, `features`) → else the curated JSON row by model id (a Qwen3-VL on vLLM gets Qwen's row) → else **D143(c) PERMISSIVE** modalities + `modalitiesEstimated:true`, generic reasoning (`mode: "effort"` iff `features.effort`, else `none`), the generic openai-compat `TURNS_FLOOR` (D143's input changed: a declared endpoint replaces a launched engine; never a bare text-only floor) | `declared.dims/mrl` → `curated/embedders.json` by model id → refuse at pick |
| `builtin` (local-light) | n/a | `curated/local-light.json` incl. `dtype` |

Every connection may OVERRIDE any cell through `declared` (`EVIDENCE_TIERS`, §6.2 — `declared` is the top rung),
which is how a user pins a quirk for one model without touching a table.

### 6.4 `silencesProse` (H4)

Hosted catalogs (openrouter transport, anthropic) carry it absent (co-emits, 6/6 measured); for any
`auth: endpoint` connection the generation FLOOR sets `silencesProse: true` whenever `tools` is declared but
the connection does not declare `tools.coEmitsProse: true` (the 36/36 local-Qwen measurement is the reason the
floor is closed).
`coEmitsProseWithTools` is unchanged, so the D112 fold guard fails closed on any unmeasured wire.

### 6.5 Requirements

Checked in `resolve` (returns `requirement: {ok:false, missing}` instead of throwing) and in
`catalogs.models(connection)` (filters what the picker lists). The runtime belts (`pipeline.ts` vision/video
drop, the imagery edit strip) stay as the last line.

### 6.6 Rule 1 — where a quirk lives

Changes what the domain may ASK for → a capability bit under `capability/sources/*`, read through a helper in
`contracts/inference/capability/reads.ts`. Changes how the same request is SPELLED on the wire → the backend's
dialect (`injectOptions` / `wrapFetch`) where the wire is OpenAI-compatible, the wire's converter elsewhere.
Model-id regexes are fenced to `capability/families.ts` + `sources/curated/*`;
`backends/kit/cache-control.ts::isAnthropicModel` gets a reasoned allowlist row (Tier-3b esoteric #7 keeps the
duplicate deliberate).

### 6.7 Modalities and media — the callouts (so nobody re-derives them)

**Input modalities (what a chat turn may carry).** `generation.input: Modality[]` from §6.3. Consumers: the
chat pipeline drops image/video parts with a warning when the modality is absent (`pipeline.ts:634-635` →
`accepts(cap, "input", "image" | "video")`); `audio`/`file` are captured as truth but NO consumer sends those
parts today — the picker says so ("audio input: supported by the model; not yet used").

**Image generation (`generateImage`, the `/imagine` surface).** ONE task, wire arm chosen by the backend
from the row/catalog:

1. *images API* — OpenRouter's dedicated `POST /api/v1/images` (`n` up to 10, `input_references` for
   image-to-image, base64 bytes back, native SSE partial images on models that advertise `supports_streaming`,
   all-or-nothing billing — OR docs, features/multimodal/image-generation); an endpoint connection whose folded
   `features.images` is `images-api` uses the SDK's `imageModel(id)` against `/v1/images/generations` +
   `/v1/images/edits`. NEW `backends/openai-compat/images.ts` normalises both transports' results to
   `ImageGenerateResult`.
2. *chat-with-image-output* — the chat surface with `modalities:["text","image"]`, images on
   `message.images[].imageUrl.url` (today's `backends/openrouter/runners/image/runner.ts:5-6`); the fallback for
   image-output chat models with no images-API listing, and the arm a connection declares as
   `images: "chat-modalities"`.
   Serves: the openrouter dialect (both arms), any endpoint openai-compat connection whose `declared` block names an arm; NOT
   anthropic-messages, agent-sdk, local-light. Capability: `output ∋ image` gates the picker
   (`requires: {output:["image"]}`); `input.imageEdit`/`references` gate the edit belt (imagery's
   strip-with-warning stays). Cost: the dialect's cost read (OR `usage`); null elsewhere.

**Images INSIDE an ordinary chat turn — IN SCOPE (owner word 2026-09-19: "go look at nano banana").** A
chat model whose `output.modalities` includes `image` (Gemini 2.5 Flash Image and its successors on
OpenRouter, any endpoint row whose capability says so) answers a roleplay turn with interleaved text + pictures, and
edits them across turns when the prior pictures ride back as input. The design, end to end:

- *Ask for it:* the preset gains ONE knob, `params.replyMedia: "text" | "text+image"` (default `text`), and
  the funnel emits `modalities` on the wire only when the knob asks AND `output.modalities ∋ image`; a knob on a
  text-only model drops with a `sampling_knob_dropped` warning like every other unsupported knob.
- *Receive it:* the chat runners read `message.images[]` (final chunk or per-delta where the provider streams
  them) and emit a NEW `ChatDeltaEvent { kind: "image"; url | base64; mediaType }` beside `text`/`reasoning`
  (`contracts/chat/bus.ts:29`). Package-internal until the delta; the bus contract is the only place it grows.
- *Persist it:* the engine hands the bytes to the ASSETS DOMAIN through the injected store op imagery already
  uses (`storeAsset(owner, bytes, kind, mime)` — `imagery/contract/service.ts:134`; the blob↔row pair has
  exactly one writer, `domain/assets/persistence/queries.ts:119`, fenced by the `assets-single-writer` gate —
  `cas.putBytes` alone mints no `assets.id`, verify4 M6) with `kind: "generated"` (`contracts/assets/index.ts:17`),
  OWNED BY THE HOST (`runAsUserId`). There is no "chat owner" — D18 abolished it (`db/schema/chat.ts:8-10,119`:
  chats are membership-scoped, no `chats.ownerId`) — and the two tree precedents disagree: the narrator writer
  stores under the host (`post-narrator-message.ts:43`), imagery under the caller (`generate-core.ts:62`). The
  host is right here because `GET /api/blob/:hash` is owner-gated with one narrow roster exception
  (`entry/http/blob.ts:1-3`, D21): a picture stored under a MEMBER funder would render for that member alone
  in a shared room. Stated consequence: a member-funded generation's bytes land in the host's CAS (ground5 H3). Canon is ONE text column
  (`message_variants.content`, `db/schema/chat.ts:408`, the D51 post-transform text) and blocks are DERIVED
  from the content-span grammar (`contracts/chat/content-blocks.ts:91-109` `imageSpanBlock`; the `media` block
  arm at `:33-40` REQUIRES `alt` today (F22 relaxes it), and `:26` is the media `src` arm `{kind:"asset", assetId}`, not a block kind).
  So the stream reducer EMITS an `![<alt>](asset:<id>)` span into `content` at the offset the image arrived at,
  and mints the alt: the model's caption text if it emitted one, else the PRECEDING PROSE SENTENCE, else
  `""` — never `"image N"` (side-eye 8 P1-9: a counter is a filename read aloud, and because the alt is baked
  into canon at generation time it can never be fixed at render). `alt: ""` is the correct HTML answer for a
  genuinely undescribed picture (a screen reader skips it) and the grammar ALREADY admits it
  (`content-blocks.ts:38` is a bare `z.string()`, F22 — a policy, not a schema change). The `replyMedia`
  contract asks the model for a caption beside each image. The commit ALSO writes a
  `message_assets` row with `origin: "inline-reply"` (§5.3b) — that row is the only reference GC can see
  (`chat.ts:515-546` header: body text spans are invisible to `asset-refs.ts`), so without it the blob is
  reaped under a live transcript. Stated cost: `message_assets` is keyed on the SLOT, so every swipe that
  emits a picture adds a RETAINING link and a swiped-away variant's blob is kept with no rendered reference
  (correct, wasteful; a `(messageId, assetId)` unique dedupes byte-identical swipes; a variant-scoped GC pass
  is a later fork, not this program). Model/generation-id/cost provenance is on the VARIANT row (§5.3b);
  `imagery_generations` is `/imagine`'s own record (`imagery.ts:40-69`, written only by `generate-core.ts`).
- *Show it:* the client renders the derived `media` block through the existing media block; the bus delta shows
  an in-progress placeholder until the asset id lands. TWO failure renders, named (side-eye 8 P2-9): a
  placeholder whose `storeAsset` fails or whose turn aborts mid-picture resolves to an inline "couldn't save
  this picture" notice with the prose around it still readable; a model that emits an image on a connection
  whose capability says no `image` output folds into the aggregated turn notice (§5.3a), never a silent drop.
- *Send it back (multi-turn editing) — THIS IS THE NEW WORK (verify3 F1, verify4 H1).* Two seams refuse it today,
  on purpose: (1) `domain/chat/substrate/wire-history.ts:67-69` `isUserAttachment` projects an asset span as an
  image part ONLY for `role === "user" && userAuthored`; `:66` states the rule ("everything else is
  DISPLAY-ONLY") and `:60-64` states why (the scoped-fold demotion re-roles a character's row to a user line,
  and a narrator/`/imagine` post carries real `asset:` refs that must not ride — and it DOES write
  `message_assets` rows on an assistant row today, `post-narrator-message.ts:85,89,105`, verify4 H3). A
  model-generated picture on an assistant row is exactly what that predicate excludes. (2) BOTH SDK converters
  drop an assistant `file` part (§8.0). The three deltas: (a) a deliberate RELAXATION of `isUserAttachment` to
  "user-authored user attachment OR an `asset:` span on an ASSISTANT row whose `message_assets` link for THAT
  asset has `origin = 'inline-reply'`" — per-ASSET, and the origin set is loaded by both callers
  (`chat/engine/pipeline.ts:632`, `chat/verbs/read.ts:1148`) and passed into `buildWireHistory` (`:293-336`
  has no db handle — new plumbing, named); the illustration case stays excluded because its writer stamps
  `illustration`, pinned at that writer (`security-executor` scope — the same predicate fences external-URL
  exfil); (b) the assistant-image re-attachment in the transport's `transformRequestBody` (openai-compat) and
  the anthropic post-convert hook — OURS, because the SDK converters discard it (§8.0); (c) the span-emission +
  alt-mint at the reducer (above). The `visionOk` gate (`pipeline.ts:634`) applies to those parts too.
  Token/cost accounting comes from `usage` as today.
- *What is not new:* no new task, wire or capability field beyond `output.modalities`; `generateImage` stays
  the explicit `/imagine` path. The two share the asset write and the `image` delta.
- *Receipts owed by the lane:* a live OR turn on an image-output model with `replyMedia: text+image` producing
  a message whose derived blocks contain a `media` block with a minted alt; a second turn whose wire capture
  shows the prior assistant image as an `image_url`/`file` part on an `assistant` row (the H1 pin); a narrator
  `/imagine` post in the same room NOT riding, pinned on `post-narrator-message.ts:105`'s `illustration` stamp
  AND on the predicate; a text-only model with the knob on emitting the drop warning and no `modalities` on
  the wire (wire-capture pin).

**Image embedding (`imageEmbed`).** The joint text+image space: the openrouter transport via the provider's
`embeddingModel(id)` with `image_url` parts (today `image/runner.ts:2-4` on the raw SDK); an endpoint connection whose embed model declares `input ∋
image` (a VL embedder on vLLM); local-light via jina-clip-v2. §10's rule: `embed` and `imageEmbed` are ONE model or `imageEmbed` falls to the
captioned-text lens; `canEmbedImages(cap)` is the read.

**Audio (transcribe / speak) and video generation.** NOT tasks in this program. The registry is what makes them
cheap later: `transcribe` = `{ kind: "generation", requires: { input: ["audio"] } }` + a `transcribe` method on
`ProviderBackend` + a translator; `speak` = `{ requires: { output: ["audio"] } }`. Nothing is reserved for them
now (YAGNI); adding one is a `tsc`-forced sweep of the three `Record`s, which is the point.

**Video input.** `input ∋ video` gates the chat send exactly as image does (#317); only catalog rows that
advertise it and connections that declare it carry it.

---

## 7. Resolution

### 7.1 `ConnectionRef` and precedence

A `ConnectionRef` is a `connectionId: UserConnectionId` — nothing else (the per-use `model` override an earlier
draft carried is struck, §5.3). Every actor's refs are ROWS in `connection_bindings` (§5.3, `(actorKind, userId, [ruleId|pluginId], task) → connectionId`, FK SET NULL) — `RoutableTask` only, never `Task`: `structured`/`agent`
ride their `ridesOn` task for EVERY actor, plugins included (F16). The actor kinds are all per-user: `user`
(replaces the `roleDefaults.<task>` leaves in the settings json), `automation-rule`, `plugin-grant` (neither
has a routing column today: `db/schema/automation.ts:70-113`, `db/schema/plugin.ts:33-96`; `plugin_settings` is
the wrong home because the grant is host-written); an agent principal is a future kind when D60 builds it.
**A chat is NOT an actor** and neither is an rpg game (§5.3): the turn's connection is the FUNDER's, resolved
by `funderUserId` (§8.4-3), so a room never stores one. Fold for a turn funded by `u` in the context of actor `a`
(a rule or a plugin grant, or none): `binding(a, task) → binding(a, ridesOn) → binding(user u, task) →
binding(user u, ridesOn) → none` — one indexed lookup per hop, no JSON parse. `scope: "owner"` tasks ignore the actor ref. A
connection resolves to `{ provider, wire, api, model, credential, baseUrl, capability }` in one hop; there is
nothing to "heal" — the connection IS the pick.

**The per-chat overlay that exists today is NOT `{api, source, model}`** — `chats` has no routing columns
(`db/schema/chat.ts:100-200`). It is `chats.metadata.providerRouting` (`contracts/chat/metadata.ts:244`): an
OpenRouter routing PREFERENCE (order/only/ignore/sort/quantizations/max_price, `shared.ts:344-359`), read at
`entry/compose/chat.ts:1570,1578` and `entry/compose/rpg.ts:1935-1941` (`readRoutableChat`, called at `:1529/:1691/:1964`), threaded as `RouteChatAssignment`
(`contracts/connection/index.ts:402-407`, whose `{api, source, model}` fields are type-only with no writer),
and deliberately unwired at the middle hop (`resolve-chat.ts:9-13`). Ruling here: **DELETE it.** Routing
preference is a property of the connection you picked, not of the room — a user who wants two OR routings
makes two connections (the OR provider's `providerOptions.openrouter.provider.{order, only, ignore,
quantizations, sort, max_price}` come off `connection.extras`, §8.2). The deletion's coupled sites are ~10 across three packages, not three compose reads
(ground5 M11): `chats.metadata.providerRouting` + the schema key, `RouteChatAssignment`, the compose reads
(`compose/chat.ts:1570,1578`; `compose/rpg.ts:1935-1941` `readRoutableChat` + its three call sites `:1529`/`:1691`/`:1964` + the `routableChat` argument on the three `deps.connection.resolveChat` calls `:1532`/`:1694`/`:1973`, verify9 M7), BOTH `ChatRequest` arms
(the purged `infra/providers/contract/chat.ts:174,183`), the two OR runners' `resolveProviderPreferences`, FOUR doc-comment
precedent cites that would dangle (`contracts/chat/metadata.ts:250,255,261`, `contracts/roster-preset/index.ts:8`
— re-point them to `databankVisibility` as the foreign-schema precedent), and three test files including a
TYPE-level pin neither `pnpm check` nor the node suites see: `tests/server/domain/chat/contract/
metadata.contract.test.ts:19,24,37-38,112-114`, `tests/server/infra/providers/backends/openrouter/runners/chat/
responses.test.ts:196`, `tests/e2e/support/mirror-parity.dom.test-d.ts:411`. Also deleted with the settings
blob's routing leaves: `coherentRoutingPatch` (the `(source, model)` write guard — deleted by construction),
`SETTINGS_OP_CODES.incoherentRoleModel` + its client copy, and the routing keys in
`client/src/data/invalidation.ts` (ground5 M13).

### 7.2 No defaults (F2, F16) — and the local-light floor is two SEEDED rows

No born connection, no default model. A task with no connection in the fold is `no-connection`, and the
composer/picker is the call to action. **`local-light` gets EXACTLY the vLLM treatment** (owner word
2026-09-19): it is a provider row (§5.2) and a user's use of it is an ORDINARY connection row — `providerId:
"local-light"`, `credentialId: null`, `model` picked from the builtin catalog (`jina-clip-v2`, `MiniLM`,
`RMBG`, and whatever the in-process runtime bundles later — a node-llama-cpp text generator is just a new
`kind: generation` entry in `curated/local-light.json` + a `chat` method on the backend + `chat` in
`WIRE_DEFS["local-light"].serves`, no new shape anywhere), `declared` overrides, `extras` for the runtime's own
knobs (threads, GPU layers, dtype), deletable like any row. The only differences from a vLLM connection are the
provider's `auth: none` and `catalog: builtin`, and that the wire is in-process instead of HTTP. The vector
floor on a fresh install is a CONVENIENCE SEED, not a special row: BOTH user-minting sites (`sessions/persistence/
users.ts:103`, `admin/verbs/create-user.ts:86` — there is no `users.create`, §5.3b) call a `domain/connection`
seed op after the user row commits, inserting two connections (`local-light · encoder` on `jina-clip-v2`,
`local-light · reranker` on `MiniLM`) plus their `user` bindings, and step 4's migration inserts
them for every existing `users` row; a user who deletes them gets `no-connection` on search like any other
unset task, and can re-add them from the picker. `ConnectionRef` therefore stays a bare branded id and
`Resolved.connectionId` is always a row (verify3 F10: no `{ builtin }` union arm).

### 7.3 Coherence — data

A connection's `api` must be ∈ `PROVIDER.apis` (validated on write, re-checked on resolve). There is no
`assertCoherent` matrix and no client mirror: the picker offers `coherentApis(provider)` from the registry.
§2.8-1 closes because `responses` appears only on providers that list it and `local-light.apis = []`.

### 7.4 Normalise, warm, availability

There is no heal. A connection's `model` is validated on WRITE against the provider's catalog strategy
(`url` → must exist in the list fetched from the provider's fixed baseUrl or, for an endpoint row, the
connection's own `<baseUrl>/v1/models` — fetched SERVER-SIDE by a `connection.listEndpointModels` verb the
pane calls once URL + key are entered (a browser cannot reach a user's loopback box; the fetch rides the F12
admission + the SSRF guard like every other endpoint call) and cached like any catalog; if that call fails or lists nothing the pane offers a typed id with an "endpoint listed no models"
note and the row is saved with `modelListed: false`; `builtin` → the builtin id; agent-sdk aliases
`sonnet`/`opus` normalise to the daemon's `resolvedModel` on write). A model that later
disappears from a catalog is a WARN on the connection row, never a swap. Warming is keyed by `PROVIDER.catalog`
(`WARM_WINDOW_TRUTH: Record<ProviderDef["catalog"], …>`: `url` warms the list — the provider mirror for a
hosted row, the connection's own `/v1/models` (ids + window) for an endpoint row; `builtin` nothing). `checkChatAvailability` keeps the down cause as `endpoint-unreachable` (renamed from `engine-down`, §5.3a; read off `reachability.ts`
for any `auth: endpoint` connection), retires `engine-off` (no connection is `no-connection`), and its
`host-claude` cause becomes `runtime-missing` (L5: `CHAT_UNAVAILABLE_CAUSES` + `HOST_CLAUDE_STATES` + client copy sweep).

### 7.5 The three questions every caller answers — and the only three dials a user has

Chat, refinery, imagery, rpg, memory, search, arbitration, automation, plugins, future agents: each one is a
CALLER of the runtime and answers exactly three questions. Nothing else is configurable, which is how this
does not drown in knobs or grow a second implementation.

1. **Which TASK?** — one of the closed `TASKS`, NAMED AT THE CALL SITE. `RoleClients` gains a real
   `structured(inputs, { responseFormat, … })` method and `summarize()` REFUSES a `responseFormat` option
   (`tsc`: the option leaves `SummarizeOptions` in `contracts/role-clients`, and the facade's `SummarizeCallOptions`
   alias with it); the facade's sniff-and-reroute (`role-clients.ts:325-348`)
   is deleted. The census (§2.8-2): refinery's schema forge, stage runs, score sweep and test-schema are
   `structured`, its prose passes `summarize`, and it calls NO embed; discovery's analyze + distill are
   `structured`; the embeddings caption lens is `structured` WITH an image input, so it carries
   `requires: { input: ["image"] }` on the resolve and the picker says "captioning needs a vision-capable
   summarize/structured connection" instead of failing at the wire; chat's arbiter, memory digests and
   extract-quiet are real `summarize`; imagery is `generateImage`; rpg rounds are `chat`; search is
   `embed`/`imageEmbed`/`rerank`; automation's analysis arm and a plugin's `llm.quiet` with a schema are
   `structured` on the rule author's / the grant's binding (§5.9-2 gains the schema arm). `structured` still
   RIDES the `summarize` binding (F4 — one slot in the pane), but the wire role, the span tag, the policy
   verdict and the warning vocabulary are honest because the caller said the word. Two more things are settled here:
   (a) **rpg's TURN-TIME extraction is NOT routed through the facade** — it keeps running on the character
   turn's own already-resolved connection (`compose/rpg.ts:563` and `:533`), by the 2026-07-27 ruling and
   stickler F1 ("never a re-resolve"; the state delta must come from the model that wrote the turn). That
   rule is about those two sites ONLY: the resync extraction (`:1532`) and the populate round (`:1694`)
   deliberately DO re-resolve, as the host today and as the trigger after §8.4-3 (verify9 H2). NOT because of any firewall: there is none after §5.7, and the `:499-505` comment
   that cites one is rewritten in the same lane to name F1 alone. The `executor` is therefore legitimately called from compose for `runChatTurn`,
   `generateImage` (`imagery.ts:93`) and rpg's `structured`; the enforcer for "no OTHER compose site reaches a
   facade-served task" is `tsc`, not a path glob (verify6 H8 — a dep-cruiser row would red seven live sites
   including the composition root's own wiring at `services.ts:812`): each compose tier's deps type exposes
   exactly the executor methods that tier may call — and this fence is ALREADY BUILT at HEAD (verify7 M5):
   `entry/compose/rpg.ts:181` `Pick<ProviderExecutor, "structured" | "runChatTurn">`, `imagery.ts:54`
   `Pick<…, "generateImage">`, and chat receives a single bound `runChatTurn` (`services.ts:812`), so there is
   no chat `Pick` to mint. Step 2 changes nothing here; the fence is what SANCTIONS the rpg bypass, not what
   removes it; (b) the six per-role getters on `RoleClients` (`embedModel`,
   `rerankModel`, `imageEmbedModel`, `summarizerModel`, `summarizerContextTokens`, `summarizerVision`)
   collapse into ONE `resolved(task): Resolved<Task>` read — model, capability, connection id in one object,
   so the caption lens asks `accepts(resolved("structured").capability, "input", "image")` and the memory
   token-guard reads `capability.context.window`, no bespoke getter per fact. Coupled sites of that collapse
   (verify7 M6): `contracts/role-clients/index.ts:160-180`; the two domain-contract THUNKS that re-spell two of
   them — `refinery/contract/service.ts:68,72,126` (`summarizerModel: () => string`, `summarizerContextTokens`)
   read at `run-stage.ts:327,342`, `preflight.ts:97,106,116`, `score-sweep.ts:136`, and `chat/contract/
   context.ts:1346`; the caption consumer `embeddings/indexer/caption.ts:86`; three fixtures
   (`tests/contracts/role-clients/index.contract.test.ts:44`, `tests/server/domain/embeddings/_support.ts:155`,
   `tests/server/domain/search/_support.ts:138`); and ONE persisted column — `chat_digests.summarizerModel` is
   written from `summarizerModel` (`role-clients/index.ts:167`), so the digests writer reads
   `resolved("summarize").model` instead. A caller that cannot name its
   task from the tuple is asking for a new task (a `tsc`-forced add), never a private client.
2. **Who FUNDS it?** — the triggering principal (§8.4-3; the per-call table is §8.5b; the preset section is §8.7), full stop. For refinery that is the user who ran the
   workload (the workload's principal; `allowBackground` gates it because it runs unattended); for a rule its
   author; for a plugin the installing user through its `plugin-grant` bindings; for a future agent principal
   its own `actorKind`. The CONNECTION is then `binding(actor, task) → binding(funder, task) → none` (§7.1).
   **There is no refinery connection, no imagery connection, no rpg connection** — those are callers, not
   actors, and they use the funder's per-task rows. The ONLY actors are things a user configures on purpose:
   their own defaults, a rule, a plugin grant, an agent.
3. **Which PURPOSE?** — for a non-chat call, one member of the closed `SIDE_GEN_POSTURES` record
   (`contracts/preset/index.ts:205`: `arbiter`, `quiet_generate`, `extract_quiet`, `compaction`,
   `schema_forge`, `greeting_studio`, `caption`, …) whose row is a sampling FLOOR (temperature, output cap)
   that `resolveSideGenSampling` (`@orb/kit/side-gen-posture`) folds BENEATH **the preset of the principal the
   PURPOSE is scoped to** — the funder supplies the CONNECTION (§8.5b) and is the preset principal ONLY when
   the purpose is scoped to them. THREE scopes exist on the tree and all three stay (verify8 H4): (i) a
   CHAT-scoped posture folds beneath the ROOM HOST's preset and prose
   (`resolveChatPresetParams(chatId)` / `resolveChatProse(chatId)` — a RECORDED OWNER DECISION at the contract,
   `chat/contract/context.ts:304-309`: "the host, not the triggering member, is the ruled principal
   (owner-decision 8, option (a)) … a chat's digests / arbiter / summary marker must not change voice depending
   on who spoke"; consumers `turn.ts:863,874`, `extract-quiet.ts:116`, `compaction.ts:115`,
   `quiet-generate.ts:76`, `memory/build/digests.ts:287,509`, `assembly/context.ts:841`,
   `arm-executors.ts:412` and `analysis-arm.ts:540` for their PROSE); (ii) a PER-USER posture folds beneath
   the CALLER's own preset (`resolveUserPresetParams(ownerId)` — refinery `run-stage.ts:313`,
   `score-sweep.ts:125`, `preflight.ts:89`, `test-schema.ts:35`, `schema-forge.ts:99`; discovery
   `analyze.ts:59,119`, `distill.ts:167`; compose `assets-character.ts:347`, `imagery.ts:146`); (iii) an
   ACTOR-scoped posture folds beneath the rule AUTHOR's / plugin INSTALLER's preset
   (`automation-plugin.ts:375` on `authorUserId`, `:688` on `installerUserId`) — who for those two classes IS
   the funder, so "never the funder" is true of (i) and (ii) only. The automation arms SPLIT the axes inside
   one generation and a lane must not unify them: PROSE is host-keyed (`arm-executors.ts:412`,
   `analysis-arm.ts:540` → `resolveChatProse(chatId)`), PARAMS are author-keyed (`automation-plugin.ts:375`,
   `analysis-arm.ts:474-475`). Then through the ONE funnel × the connection's capability. A chat turn's
   purpose is the preset itself. Every listed caller already uses the record (verify7 H2/H4) except TWO
   (verify9 M5): `discovery/themes/generate.ts:162` passes NO options at all (no posture, no preset fold), and
   the embeddings caption lens folds its posture (`caption.ts:68` aliases `SIDE_GEN_POSTURES.caption` as
   `ANALYSIS_FLOOR`, `:95`) but BOTH its callers pass no preset params (`embeddings/indexer/handlers.ts:97`,
   `embeddings/service.ts:35`), so its preset rung is dead; both join the record fully in step 2. A side call
   that hand-writes `{temperature, maxTokens}` or passes nothing is a defect. Adding a
   purpose = one row in one record + naming its scope, no user knob: the user's dial is their preset (D154),
   ours is the posture table, and the two never fight because the fold is fixed. (An earlier draft said "the
   funder's preset" unqualified — a collision with owner-decision 8 for the chat-scoped arm, withdrawn,
   verify7 H4; a later draft said "never the funder" — false for arm (iii), verify8 H4.)

So the user configures THREE things: connections (rows), bindings (one per task, plus per rule / per plugin
grant), and presets (global gen settings + prompt config). Every feature reads those through the same fold,
the same funnel and the same transports. A feature that needs "its own model" edits a binding; one that needs
"its own sampling" adds a posture row; one that needs "its own provider" adds a provider row. None of them
adds code to the runtime.

### 7.6 `Resolved<Task>` = `{ connectionId, provider, wire, api, model, credential, baseUrl, capability, requirement }`; `resolveChatCapability` stays the credential-free projection (`connectionId, provider, model, capability`).

---

## 8. Backends

### 8.0 The hosted wires ride the Vercel AI SDK (owner decision 2026-09-19; F9 settled)

The two HOSTED wires — `openai-compat` and `anthropic-messages` — are built on the Vercel AI SDK's provider
layer (`ai` 7.x, provider spec **V4**: `LanguageModelV4.doGenerate/doStream`, `EmbeddingModelV4.doEmbed`,
`ImageModelV4.doGenerate`), pinned by exact version in the pnpm catalog. `agent-sdk` and `local-light` stay
ours (a subprocess protocol and an in-process ONNX runtime — nothing in the SDK for either). What we take and
what we never take:

- **Taken:** `@ai-sdk/openai-compatible` (`createOpenAICompatible` — one instance per CONNECTION, built from
  the row: `name: providerId, baseURL, apiKey, headers, queryParams, includeUsage, supportsStructuredOutputs,
  fetch, metadataExtractor`, **`transformRequestBody`** — `openai-compatible-provider.ts:99`, applied to the
  converted body of BOTH `doGenerate` (`:333`) and `doStream` (`:441`); it is the hook our dialects do their
  body work in, §8.1), `@ai-sdk/anthropic` (`createAnthropic`; its converter merges consecutive same-role rows,
  places `cacheControl` per message/part, trims a trailing assistant row, and forwards mid-conversation
  `system` rows with `clearAt: 'next_user_message'`, per-turn `effort` and `toolChanges` — four betas it adds
  itself, `convert-to-anthropic-prompt.ts:242-262`: `mid-conversation-system-2026-04-07`,
  `mid-conversation-system-clear-at-2026-08-21`, `mid-conversation-effort-2026-08-01`,
  `mid-conversation-tool-changes-2026-07-01`; NOTE the FIRST system block is hoisted to the top-level `system`
  and its `clearAt`/`effort` are dropped with a warning, `:211-233`, so `wireMeta` on the assembly's leading
  system row is inert by construction), `@openrouter/ai-sdk-provider` 3.1.0 (official, by OpenRouter, spec V4 —
  chat, embeddings, `imageModel()`, routing prefs, `extraBody`, reasoning,
  `providerMetadata.openrouter.usage.cost`, per-message `cache_control` forwarding — an implementation read,
  not a typed contract, so the lane pins it), the model-level `providerOptions` seam, `wrapLanguageModel`
  middleware where a dialect needs a pre/post hook the SDK exposes.
- **What the SDK converters DROP, and we therefore OWN (verify4 H1):** both converters' `assistant` branch
  switches on `text | reasoning | tool-call` with no `file` arm and no default
  (`openai-compatible/src/chat/convert-to-openai-compatible-chat-messages.ts:185-248`,
  `anthropic/src/convert-to-anthropic-prompt.ts:665-696`), so an assistant `file` part — which the V4 PROMPT
  type permits (`language-model-v4-prompt.ts:34-41`) — is silently discarded. The assistant-image projection
  §6.7 needs is therefore OURS: the openai-compat dialect re-attaches it in `transformRequestBody` (it sees the
  converted `messages[]`), the anthropic wire in the equivalent post-convert hook. A spec type permitting a
  shape is not a converter emitting it; the pin is a wire capture with an image part on an `assistant` row.
- **Never taken:** `streamText`/`generateText`'s agent loop (ours is `domain/chat/engine`), `ai/react` /
  `useChat` / the UI message stream (server → client streaming is the bus, §9), the Vercel gateway, `ai`'s
  tool-call executor (tools execute under the host principal in our engine, D152), its message persistence.
- **Why this over TanStack AI:** a versioned provider spec (V4) we can pin against; native Anthropic
  mid-conversation-system support with the betas already in the converter; an OR provider maintained by
  OpenRouter. TanStack's `ai-claude-code` adapter is the wrong posture (host env passthrough) and its
  persistence/compaction layers would duplicate ours.

**What the package must widen to carry turn-shaping through the SDK** (the assembly already decides these; the
wire just needs the hints): `ChatHistoryMessage.wireMeta?: { cacheBreakpoint?: true; clearAt?:
"next_user_message"; effort?: ReasoningEffort }` (§4). The wire converter maps them: `cacheBreakpoint` → a
`cacheControl` provider option on that message (anthropic wire) or the OR dialect's cache placer (§8.1);
`clearAt`/`effort` → the anthropic wire's beta fields when the CURATED row says the model honours them.
**The curated anthropic cells ship with the TREE'S CURRENT VALUES, not permissive ones** (verify6 H5):
`historySystemRows: false` on every anthropic arm (`turns.ts:73-81`: "UNMEASURED on every anthropic arm … the
fact is a LIVE-WIRE MEASUREMENT (`pnpm probe:history-system-rows`), never a model-name regex (D69)"),
`roleHandlingFloor: "strict"` (`:90,:103` — Anthropic is the wire that hard-errors on adjacent same-role rows,
`:136`), `midConversationSystem` and prefill per (id, api) as today (`:57-66`), `clearAt` as beta-advertised.
An earlier draft flipped the first two to `true`/`merge` on the strength of the SDK converter's merge — exactly
the §15c-1 mistake. Lowering either cell is a MEASUREMENT: step 6c runs `pnpm probe:history-system-rows` against
a real key and the same-role-merge no-op pin as the PRECONDITION, and only a dated `measured/anthropic.ts` entry
may relax them. Role handling stays ours: the assembly's `roleHandlingFloor` decides merge vs demote BEFORE the
converter sees the rows.

### 8.1 The `openai-compat` wire: ONE backend, TWO transports, and everything else is data

A **dialect is a transport package and nothing more**: `openai-compatible` (`createOpenAICompatible`) or
`openrouter` (`createOpenRouter`). There is no `vllm` dialect, no `generic` dialect — a server's quirks are
`features` (§8.1b), a user's extra body fields are `extras`, a custom endpoint's transforms are `transport`,
and the ONE dialect module per transport is four small functions that read those three: `injectOptions(req,
features, extras)` → `providerOptions[name]`, `transformRequestBody(body, features, transport)` (the SDK's
post-convert hook, `openai-compatible-provider.ts:99`, applied to `doGenerate` `:333` and `doStream` `:441`),
`wrapFetch(conn, transport)` → `fetch`, `extractMetadata(res)`. Never a subclassed runner; never a
server-named code path.

**Where the SDK puts `providerOptions`, measured (verify4 H4):** the body literal at
`openai-compatible-chat-language-model.ts:267-322` writes `model`, sampling, `response_format`, `stop`, `seed`,
THEN spreads `providerOptions[name]` (`:297-307`, filtering out any key that collides with the SDK's own option
names), THEN `reasoning_effort`, `verbosity`, `messages`, `tools`, `tool_choice` (`:310-320`). So the SDK's
spread is neither "last" nor a precedence we can rely on; we do not use it for `extras` at all. `extras` merge,
`transport.includeBody`/`excludeBody` and the assistant-image re-attachment (§8.0) all happen in
`transformRequestBody`, on the OBJECT after every SDK write and before serialisation, so nothing re-parses JSON
in `wrapFetch`. `providerOptions` is used only for the keys the SDK models natively.

**Precedence is D143(b)/D156, unchanged (ground5 H1): MODELLED WINS over `extras` on every endpoint we build the
body for, and the belt-owned keys are never user-writable.** `VLLM_BELT_OWNED_PARAMETER_KEYS`
(`contracts/preset/index.ts:687-696`) is already transport-shaped, not vLLM-shaped, and it is EIGHT keys, each
with its failure written at the tuple: `truncate_prompt_tokens`, `truncation_side`, `stream`, `stream_options`,
`model` (the resolved connection's identity — window math, cost attribution, catalog), `messages` (the assembled
canon), `continue_final_message`, `add_generation_prompt` (the prefill pair: a stray value folds the next turn
into the previous message or 400s outright — and under `features.prefill` they are infra-owned for the same
reason). It is RE-HOMED beside `EndpointFeatures` as `BELT_OWNED_BODY_KEYS` (the preset editor's copy of the fact
moves with it, since `extras` left the preset), applied in `transformRequestBody` for BOTH transports: a belt key
in `extras` is dropped with `custom_parameters_ignored{key}`, and a non-belt key that collides with a modelled
param is dropped with the same warning — modelled wins. Custom-byo's old "your endpoint, your risk" inverse
(`custom_openai` passthrough winning over `model`/`messages`) is RETIRED with that backend: one rule for the
wire, and the connection's `transport.excludeBody` is how a user removes a modelled key their server rejects.
If the owner ever wants passthrough-wins anywhere, it is fork F21 against D143(b)+D156, not a lane default.

| Concern | `openrouter` transport | `openai-compatible` transport (OpenAI, Groq, vLLM, LM Studio, Ollama, llama.cpp, custom…) |
| - | - | - |
| **client** | `@openrouter/ai-sdk-provider` `createOpenRouter({ apiKey, fetch })` + three plain-`fetch` calls it lacks (§8.2) | `createOpenAICompatible` per connection |
| `extras` (today's `customParameters`, D156) | DROPPED with `custom_parameters_ignored` (the modeled surface is the surface) | merged in `transformRequestBody` behind `BELT_OWNED_BODY_KEYS` (all eight, named above); MODELLED WINS on collision (D143(b)); the same rule for every endpoint, vLLM and custom alike |
| `transport.headers` / `includeBody` / `excludeBody` | n/a (no `transport` on a hosted row) | headers in `wrapFetch`; include/exclude in `transformRequestBody` AFTER `extras` (today `custom-byo/runners/chat.ts:305-335`) |
| `transport.responseMap` | n/a | `wrapFetch` reshapes each SSE chunk / the body through the user's dot paths (today `reshapeChunk`, `:142-173`, defaults `STREAM_DEFAULT_MAP`/`BODY_DEFAULT_MAP`) BEFORE the SDK parses it |
| `response_format` strict | CALLER-SET ONLY (`shared.ts:196-206`: the 2026-08-02 400 matrix; it never consults a catalog) | `features.strictJson`: `default-on` (vLLM guided decoding, `strictByDefault` today) · `declared-only` · `never` |
| thinking / effort | the funnel's effort → `providerOptions.openrouter.reasoning` | effort → `reasoning_effort` iff `features.effort === "reasoning_effort"`; template toggles are just `extras` (`{"chat_template_kwargs": {"enable_thinking": false}}`, typed as today — no pane sugar, no feature field) |
| prefill | per catalog/measured cell | `features.prefill`: `continue-final-message` (vLLM's `continue_final_message` + `add_generation_prompt:false`) · `deliver` (trailing assistant row, hope) · `none` — only when the capability says `turns.assistantPrefill` |
| **cache placement** | OURS: the static system block AND the rolling history breakpoint pair at depths `d`/`d+2` with the `cacheMinTokens` floor (`chat-completions.ts:87-134`, `shared.ts:61-76`), emitted as per-message `cache_control` the OR provider forwards (implementation-read, pinned); the `provider.cache` receipt read off `extractMetadata` (`:146-172`) | none |
| **retry** | `runWithPreCommitRetry` + `markCommitted` (`:136-160`) AND the mandatory-reasoning strip-and-replay-once (`:163-172`, `shared.ts:404-412`) inside `wrapFetch` | pre-commit retry, same module; no replay arm |
| **extra body knobs** | `plugins: withContextCompressionPlugin(params)` (`:221`), `parallelToolCalls` (`:219`), routing prefs (`providerOptions.openrouter.provider.{order, only, ignore, quantizations, sort, max_price}` — snake_case, nested under `provider`, from `connection.extras`) — all `injectOptions` | none |
| images arm | `imageModel()` (the OR provider implements `ImageModelV4`) + chat-modalities | `features.images`: `images-api` (`imageModel(id)`) · `chat-modalities` · absent |
| catalog enrichment | OR's reasoning/modality/pricing fields (plain-fetch `GET /models`) | `/v1/models` ids (+ window when the server reports one) |
| cost read | `providerMetadata.openrouter.usage.cost` + plain-fetch `GET /generation?id=` | `extractMetadata` where the server reports usage cost; else `estimated` from declared/curated pricing; else `unrecorded` (§5.3c) |
| rerank | n/a | plain `fetch` to `features.rerankPath` when set — no SDK rerank model on this wire |
| sleep / wake | n/a | `features.sleep` (`isSleepingPath`, `wakePath`) — the wake slice reads the paths off the row; nothing in it knows the word vLLM |
| reachability | n/a | cached `GET <baseUrl>/v1/models` → `up \| down \| unknown`, every endpoint row alike |

**Five custom-byo controls that are NOT body shape and SURVIVE the collapse, each with its new home** (the scout's
full read of `custom-byo/runners/chat.ts` found them unmapped; every one was paid for, so a lane that lets the SDK
"handle it" ships a regression):

1. **Redirect host-pin (#25)** — `redirect: "manual"`, any 3xx/opaqueredirect is a hard NON-retryable
   `ProviderError`, never followed (`:329-343,378-497`): Node's default follow re-sends `Authorization: Bearer` to
   an attacker-chosen host past the egress belt. Home: `wrapFetch` on the `openai-compatible` transport, for EVERY
   `auth: endpoint` row (vLLM included — today only custom-byo had it), pinned with a redirecting fake server.
2. **A declared `application/json` body that fails to parse is `ProviderError{kind:"server", retryable:true}`,
   never an empty successful turn (#1400, `:465-483`)** — the collapse-to-null fed an all-null chunk that committed
   an empty reply as canon. The SDK now parses; whether its parse failure surfaces as an error or as an empty
   result is §15 unverified and the FIRST non-stream pin of step 5, planted against a fake server returning
   `{"choices": ` truncated.
3. **Error bodies read capped at 64 KiB with `reader.cancel()` past it** (`:345-376`) — `wrapFetch`, both transports.
4. **Wire-capture bodies are secret-scrubbed BY VALUE** (`scrubCapturedBody` `:499-515`: credential literals + any
   secret-valued header) because `transport.includeBody` is user-controlled and can carry key-in-body auth. Home:
   the `captureWire` seam in `wrapFetch` (§8.2 already moves the OR capture there) — it scrubs before the ring,
   pinned with an `includeBody: {api_key: <secret>}` connection whose capture must not contain the literal.
5. **D41 no-silent-degrade folds** (`:196-233`): a funnel signal with no slot on this wire (`verbosity`,
   `budgetTokens`, tool-result `isError`) becomes a `warning` event, never a dropped field. Home: `injectOptions`
   emits the warning at the point it declines to spell the key; `features.effort: "none"` is one such fold.
   Also carried verbatim: the multimodal projection is TOTAL even when the capability declares no `input`
   (`:267-303`, D45/#317 — a silent flatten is the defect class), and the broadest OpenAI field names
   (`max_tokens`, never OR's `max_completion_tokens`, `:175-194`) are what the `openai-compatible` transport spells.

The vendored-template thinking door (`vllm/surfaces/chat.ts:154-211`), the `minimal→low` fold, `VLLM_REASONING`
(`resolve-model-capability.ts:58-90`), `VLLM_TURNS` (`catalog/turns.ts:161-197`) and the reasoning-dropped-for-
prefill special-casing are DELETED. A user whose Qwen3 template wants thinking off puts
`{"chat_template_kwargs": {"enable_thinking": false}}` in the connection's `extras`, exactly as in today's
preset `customParameters`, through the SAME row editor (§5.3a — never a textarea). (An earlier draft added a
`features.templateKwargs` key-name field so the pane could offer a toggle; cut as sugar — `extras` is one
JSON object with two rules, nothing more.)
STATED CONSEQUENCE of that deletion (verify6 M2): today's `reasoningFields(reasoning, prefill, warnings)`
(`vllm/surfaces/chat.ts:196-211`) drops reasoning with a `reasoning_dropped_for_prefill` warning on a bare-content
prefill, because the measurement at `:244-254` is "thinking on ⇒ `content: null`, the prose in the reasoning
channel — an empty reply". After the deletion a row with `features.prefill: "continue-final-message"`, thinking
enabled via `extras`, and a content prefill reproduces that empty reply. The interlock is KEPT as a feature bit
rather than deleted: `features.prefillSuppressesThinking: true` on the shipped `vllm` row makes the transport
strip the thinking toggle on a prefill turn with the same warning; a row that leaves it unset gets the raw
behaviour, which is the honest default for a server we have not measured.

### 8.1b `EndpointFeatures` — the schema that replaces server-named code

```ts
export const endpointFeaturesSchema = z.object({
  prefill:        z.enum(["continue-final-message", "deliver", "none"]).optional(),
  strictJson:     z.enum(["default-on", "declared-only", "never"]).optional(),
  effort:         z.enum(["reasoning_effort", "none"]).optional(),         // how a generic effort level is spelled, if at all
  images:         z.enum(["images-api", "chat-modalities"]).optional(),
  rerankPath:     z.string().optional(),
  sleep:          z.object({ isSleepingPath: z.string(), wakePath: z.string() }).optional(),
  prefillSuppressesThinking: z.boolean().optional(),                        // the measured vLLM interlock (§8.1, verify6 M2): a content prefill with thinking on ⇒ empty reply
  reasoningKeys:  z.array(z.string()).optional(),                           // the stream-delta field(s) the server puts reasoning in, read in order — vLLM ships
                                                                            //   ["reasoning", "reasoning_content"] (0.26 renamed it; a `reasoning_content`-only read silently
                                                                            //   dropped EVERY reasoning token, live-verified 2026-08-10, `vllm/surfaces/chat.ts:334-339,368`);
                                                                            //   applied by the transport's chunk reshaper so a built-in row can ship it (verify6 M1)
  pricing:        z.object({ inputPerMTok: z.number(), outputPerMTok: z.number() }).optional(),   // feeds `estimated` cost (§5.3c)
  concurrency:    z.object({ embed: z.number().int().positive(), imageEmbed: z.number().int().positive(), summarize: z.number().int().positive() }).optional(),
                                                                            // fan-out caps — THREE, one per surface that takes a `concurrency` dep today (`embed.ts:88`,
                                                                            //   `image-embed.ts:19`, `summarize.ts:33`; scout-surfaces 2); wire default 4/8 (today's `vllm/index.ts:52-53`); NO env key
  embedBatch:     z.object({ maxTokens: z.number().int().positive(), floorTokensPerSec: z.number().positive() }).optional(),   // the #187 per-POST token ceiling + derived deadline (`embed.ts:43-74`); replaces VLLM_EMBED_MAX_BATCH_TOKENS
  requestTimeoutMs: z.number().int().positive().optional(),                 // replaces VLLM_EMBED_REQUEST_TIMEOUT_MS (the dep `embed.ts:89`, consumed by `postDeadlineMs` `:69-74`);
                                                                            //   today only the embed POST carries a deadline — rerank's `enginePost` has none (`rerank.ts:125-158`);
                                                                            //   after step 5 it bounds EVERY non-chat POST on the row (a stated change, pinned per surface)
});
```

**Scope, honestly: `EndpointFeatures` is the CHAT body/stream quirk schema** (verify7 H6). The non-chat
surfaces' measured behaviours are NOT features and are NOT deleted: they stay CODE in
`backends/openai-compat/{embed,rerank,image-embed}.ts`, keyed off the resolved `EmbeddingCapability`/
`RerankCapability`, never a provider id — the ChatML embed-prompt wrap + query/doc instruction
(`embed.ts:177,207`, gated by `instructionAware`), the `dimensions`-rejected retry (`:126-129`), the #165/#173
client-side window clamps with their scaffold reserves (`embed.ts:15-36`, `rerank.ts:4-20`; `maxInputTokens`
now from the capability, not `VLLM_*_MAX_MODEL_LEN`), the per-POST token ceiling + derived deadline (#187,
`embed.ts:43-74` — `maxBatchTokens` becomes `features.embedBatch: { maxTokens, floorTokensPerSec }` because
it IS server-specific), `requestTimeoutMs` (→ `features.requestTimeoutMs`), the prose `<think>` strip that is
SKIPPED on the structured role (`summarize.ts:21-29` → the transport's chunk reshaper beside `reasoningKeys`),
and rerank's multimodal data-URI body (`rerank.ts:62` → the rerank fetch's body builder, off the capability's
`input ∋ image`). **`image-embed.ts` is the THIRD file and owes its own rows** (scout-surfaces 1 — an earlier
draft named it as a destination and then cited only its siblings): it is NOT the raw-`input` path with an image
bolted on but a chat-style `messages` request (`:1-6`, `add_generation_prompt: true` reproduces the cookbook
similarity matrix; `toMessages` `:35-40` = system instruction + user content parts), with its OWN `dimensions`
retry (`embedOne` `:76-83`), its own worker pool (`:93-119` → `features.concurrency.imageEmbed`), the image riding
the SAME `dim` as text (`:88`, one multimodal space) — and NO client-side window clamp at all: the accompanying
`pair.text` (`pairParts` `:46-51`) goes to the wire uncapped, which the tree neither justifies nor flags. Stated
default for the lane (F24 if the owner disagrees): the text part gets embed's #165 clamp + scaffold reserve, the
image part keeps the fast-400 backstop exactly as rerank's `clampSide` (`rerank.ts:74-93`) does for unmeasurable
image tokens — same rule, third surface. Two more behaviours that stay CODE and are pinned by name because a
reader would otherwise assume the SDK owns them: `fitToDim` (`engine/embedding.ts:40-49`) truncates a LONGER
vector (MRL) and REFUSES a shorter one with `ProviderError{kind:"invalid"}` — never pads (#1635: a padded vector
poisons the store); and `engine/image.ts:31-35` `toDataUri` keeps the HONEST mime (a GIF stays `image/gif`, no
first-frame PNG decode) — the deliberate asymmetry with the OpenRouter path (MA-6: loopback bytes never leave
the box, and a GIF-blind local VL model should fail visibly), which survives keyed off the row's `auth: endpoint`

- private-host admission, never a provider id. Rerank's optional per-task `instruction` (`rerank.ts:152-153`) is
  request-level, not a feature. `doEmbed` has NO `transformRequestBody`, so the embed body is built by OUR code and handed
  to the SDK's `embeddingModel` only where the SDK's shape fits; step 6b's `pnpm ast literal vllm` receipt
  expects these files to exist under the new package with ZERO `vllm` literals. Three scopes, one schema, one
  precedence (connection > plugin-shipped provider row > built-in provider row > wire default): the built-in
  `vllm` row ships vLLM's defaults; a plugin row for a server we never heard of ships
  its own; a connection overrides any field in `declared.features` because the user's server is the truth. The
  transport module reads the FOLDED features and never a provider id. Every `VLLM_*_CONCURRENCY` env key is gone
  with the rest — the caps are `features.concurrency`.

**Shape change for a custom BYO endpoint and for vLLM, stated plainly:** today each is a BACKEND with its own
request builder, stream parser and history projection (`custom-byo/runners/chat.ts`, `vllm/surfaces/chat.ts`).
After this step each is a provider ROW (`custom-openai` with no features; `vllm` with its feature defaults) + a
CONNECTION (`baseUrl`, optional key, `model`, `declared` incl. `features`, `extras`, `transport`) on the ONE
`openai-compatible` transport. The request body is built by the SDK's model and finished in
`transformRequestBody`; the stream is parsed by the SDK after `wrapFetch` reshapes it; the history is projected
by the wire's ONE converter plus our assistant-image re-attachment. What a user could do before, they can still
do — a non-OpenAI-shaped reply is reshaped by `transport.responseMap`; a rejected field is stripped by
`transport.excludeBody` after every other layer; template kwargs ride `extras`. The pane for an
`auth: endpoint` connection shows: URL · key (optional) · model (listed from `/v1/models`, typed fallback) ·
kind · declared capability · Features (the folded row, editable) · Extras (body) · Transport (headers / include
/ exclude / response map).

Today's three backends (`openrouter/`, `vllm/surfaces/`, `custom-byo/`) collapse into this one; their test pins
(`tests/server/infra/providers/{backends/openrouter/runners,vllm/surfaces,backends/custom-byo/runners}/**`)
re-home to `tests/inference/backends/openai-compat/transports/<transport>/**` (with the vLLM-shaped pins driven by the `vllm` row's `features` fixture, not a vllm module) and keep pinning the same wire bytes
MODULO the deletions §13 step 5 names. The `vllm` literal sweep is scoped to the env keys, the keyless mint,
`config-model.ts`, the availability cause, the thinking door and the measured cells (packages 108 / tooling 52 /
tests 425 hits to triage; the body/stream code is REPLACED by the SDK, not carried).

### 8.1c Provider extras live on the CONNECTION, not the preset

`customParameters` today rides the preset (D156/D143(a)). It moves to `user_connections.extras`: a quirk like
`chat_template_kwargs` is a property of the endpoint you are talking to, not of a sampling preset you might
reuse across three providers. The preset keeps sampling only. The transport table above owns the merge rule
(openrouter drops with the warning; openai-compatible merges in `transformRequestBody` behind the eight-key
`BELT_OWNED_BODY_KEYS`, modelled wins — D143(b)/D156 unchanged, §8.1). The Connections pane shows **Extras**
on any `openai-compatible`-transport connection — one JSON editor, the belt keys greyed as "owned by the
wire", nothing else. No preset migration: `customParameters` is deleted from the preset schema and its
stored blobs are ignored; the owner re-enters his vLLM kwargs on the connection.

### 8.2 `openrouter` — a DIALECT, not a backend; `@openrouter/sdk` is DROPPED

Today's client is the raw `@openrouter/sdk` (1.1.8; `chat.send`, `embeddings.generate`, the `ChatRequest$outboundSchema`
wire-capture serializer, `chat-completions.ts:143-149`). It goes. Its runners become `transports/openrouter.ts`
inside the openai-compat backend over the official `@openrouter/ai-sdk-provider` (`createOpenRouter`), which
covers chat, embeddings, images (`imageModel()` implements `ImageModelV4`, `dist/index.d.ts:991`), routing
prefs (`providerOptions.openrouter.provider.{order, only, ignore, quantizations, sort, max_price}` —
snake_case, nested under `provider`, `OpenRouterProviderOptions` `:496` / `:213-245`), `extraBody`,
reasoning, and cost (`providerMetadata.openrouter.usage.cost`, `:582`). The split — what the provider package
does NOT cover and the transport does with plain `fetch` against `https://openrouter.ai/api/v1` (three calls,
not four — verify4 L1):

| Call | Endpoint | Used by |
| - | - | - |
| models list (keyless) | `GET /models` | `catalogs.refresh("openrouter")` — the catalog enrichment (reasoning/modality/pricing fields) |
| account credits | `GET /credits` | `diagnostics.accountCredits` |
| generation lookup | `GET /generation?id=` | `diagnostics.generationCost`, the post-turn cost receipt |

Nothing is lost: routing prefs come off `connection.extras` (§7.1 killed the per-chat overlay), cache placement
and the mandatory-reasoning replay are the transport's own rows (§8.1), wire capture serialises the SDK's built
body (the `captureWire` seam moves from the OR serializer to the `wrapFetch` request). Deps: `@openrouter/sdk`
has THREE removal sites — `packages/server/package.json:27`, `pnpm-workspace.yaml:32` (`allowBuilds`) and
`pnpm-workspace.yaml:198` (the catalog pin). Version resolution is a lane fact, not a doc fact:
`@openrouter/ai-sdk-provider@3.1.0` peers `ai ^7.0.0`; the pinned `ai`/`@ai-sdk/provider` pair must satisfy it
at `pnpm install` (the 6.0.0-alpha line peers an OLDER `@ai-sdk/provider` major — do not pick it).

### 8.3 `local-light` — a provider row on its own in-process wire, same shapes as vLLM (§7.2)

`curated/local-light.json` IS the builtin catalog: one entry per bundled model with its kind + capability
(`jina-clip-v2` embedding text+image 1024 MRL q8; `MiniLM` rerank; `RMBG` matte; later a `generation` entry for
a llama.cpp text model), so `catalogs.models(connection)` for a local-light connection lists them and
`serves` derives from the kinds present — adding a text generator later widens `serves` through the same
`Record`s every other wire uses. Two launch callouts:

- **The boot prefetch downloads ~1.1 GB on a fresh install** (jina-clip-v2 q8 874 MB + MiniLM 92 MB + RMBG
  176 MB, `prefetch.ts:4-8`) the moment any task resolves to local-light — and §7.2 makes it the derive
  default when a user has no vector-capable row, i.e. every fresh install. `LOCAL_LIGHT_PREFETCH` stays
  `on` (the stall is paid at boot rather than on the first search, which is the right trade for a GPU-less
  box) but the prefetch fires only for the slots a task has ACTUALLY resolved to (embed/imageEmbed → the
  encoder; rerank → MiniLM; the matte only when imagery is used), never all three unconditionally.
- **Its status surface was the admin Engines panel** (`prefetch.ts:2`, `LOCAL_LIGHT_STATUS_PREFIX` read by
  `entry/compose/admin.ts`), which this program deletes. `engine-status.ts` and the admin verbs go; the
  process-local registry stays inside the backend.
  **IT GETS NO REPLACEMENT SURFACE (owner ruling 2026-09-20).** An earlier draft of this section re-homed the
  registry as a `downloading / ready / failed` state on each local-light CONNECTION row, and step 9 was owed a
  pane for it. STRUCK, on the code's own behaviour: the prefetch is a pure LATENCY optimisation with a fully
  automatic fallback — `backends/local-light/prefetch.ts:6-7` "a failure is a WARN, never a crash — the lazy
  path is untouched", and the failure log says so to the operator ("the weights will download lazily on first
  use instead", `:78-79`). It is scheduled non-blocking after the listener binds (`:106-107`). So there is no
  user-ACTIONABLE state to render: a `retry()` affordance is meaningless because the lazy path already retries
  by construction, and a progress readout would show work the user never asked for and is not waiting on. The
  honest surface is the one that already exists — an operator WARN in the log. The runtime keeps
  `prefetch.status()`/`retry()` as an in-process handle (the composition root calls `start(targets)`, §15c);
  neither is owed a tRPC route, and the absence of one is DELIBERATE, not a gap. If a local-light task ever
  fails in a way the LAZY path cannot recover, that is a failure at the point of USE and belongs in that
  call's error, never in a boot-progress pane.

### 8.4 The `agent-sdk` wire (today's `agent-sdk` backend, per-user, subscription only)

Keep: the wire id `agent-sdk`, the discipline asymmetry, D8 sessions (the `session_entries` lineage table keyed
by `chatId` + the in-memory store; per-user dirs DO change one thing — a session file is reachable only from
the runtime dir it was written in, so the lineage row gains `connection_id` and a funder change reseeds,
§5.3b), terminal tools, the stream reducer, `verifyAuth`, the daemon catalog, the child-env allowlist.

Change:

1. **Credential provenance — per user, one arm, one connection.** The token arm already exists
   (`env.ts:343-380`, commit `70ce9a5b3`). A user creates a CONNECTION on provider `claude-sub` (§5.2) whose
   credential row seals a pasted `claude setup-token` like any API key (ONE arm; an in-app `claude login` does
   not exist on the tree — 5 grep hits, all comments about a manual operator action — and is a §14 fork F17,
   not a deliverable). The credential row's `provider` column holds the registry id (`claude-sub`); the AAD is
   `${userId}|claude-sub`; no existing row moves (today's sub has no row — it is a keyless mint). Row metadata
   (`providerMetadataSchema`, `contracts/credentials/index.ts:51-79`, today a SINGLE `kind: "custom_openai"`
   literal whose parser returns `null` for anything else) becomes a discriminated union keyed on the provider's
   `auth` kind (`apiKey | oauthToken | endpoint`), and its readers (`credentials/substrate/parse-metadata.ts`,
   `test-health.ts:164`, `egress-admission.ts:36`) are coupled sites of step 4. `requireOwner` leaves the mint;
   `mintMaxProSub` is deleted. The HOST-file arm, `host-token.ts`'s refresh of the HOST file,
   `mode1IsolatedConfigDir`, the credential detection in the purged `foundation/env/host-claude.ts`, the Dockerfile's
   process-wide `CLAUDE_CONFIG_DIR=/app/data/claude` (`Dockerfile:85`), AND the OpenRouter skin (mode-2, F18:
   `buildClaudeOpenRouterEnv`, `ANTHROPIC_DEFAULT_*_MODEL`, `OrSkinTierModels`, `get-or-skin-tier-models`)
   are deleted. Registration = "the bundled `claude` executable resolves" (`deps.claudeExecutable`).

2. **A persistent per-user runtime dir, not an ephemeral one.** a NEW env key `USER_RUNTIME_DIR`
   (default `./data/users`, a root BESIDE `ASSETS_DIR` — there is no common data-root key; `DATABASE_URL`,
   `ASSETS_DIR`, `LOCAL_LIGHT_CACHE_DIR` each default under `./data/` independently, `foundation/env/index.ts:
   371,377,384`) and `infra/storage` gains `userRuntimeDir(ownerId, "claude")` → `<USER_RUNTIME_DIR>/<ownerId>/
   claude/` (mode 0700, reusing the CAS's `assertOwnerSegment` rule, `infra/storage/cas.ts:70-72`; the CAS's own
   layout is `<ASSETS_DIR>/<owner>/<ab>/<cd>/<hash>` and is not touched), created by the credentials domain when the row is saved and removed
   when it is deleted. Every spawn for that user sets `CLAUDE_CONFIG_DIR`/`ANTHROPIC_CONFIG_DIR` to it — the
   runtime's own writable state (history, statsig, its own settings) lives THERE, never in
   a process-wide dir (`env.ts:325-341` says why sharing one is the pipe the firewall exists to prevent) and
   never in `~/.claude`. Still per spawn: an empty tmp `cwd`, `settingSources: []` (the runtime must not read a
   `settings.json` a user could plant in their dir), `persistSession: false` (D8 seeds from canon),
   `strictMcpConfig: true`, the cowork denylist. `CLAUDE_CODE_DISABLE_CLAUDE_MDS` stays. For the `agent`
   discipline the SDK `sandbox` + a `canUseTool` ceiling derived from the principal's own capability factor
   (D60/Spine §4) are MANDATORY; tools execute under the chat HOST principal (D152), which is why the ceiling
   is required. The Docker data volume already holds `/app/data`, so per-user dirs ride it with no compose change.
   The preset's `advanced.claudeEnv` escape hatch (the allowlisted Claude runtime knob namespace) stays on
   the preset (§8.7-1), read at `agent-sdk/translate.ts:261` into `userEnv` and reserved-key-filtered at the
   builder (`env.ts:210-215`).

3. **No by-proxy spend, so no consent belt (H5 flipped, owner word 2026-09-19) — but `runAsUserId` is NOT
   redefined.** `runAsUserId` is the ASSEMBLY scope, not only the funder (`turn-identity.ts:19-20`, 168 refs in
   41 files): it resolves the room's world-info (`assemble-gather.ts:405-408`, whose comment names the exact
   widening D19 exists to prevent), character cards (`:350`), preset/prompt config (`compose/chat.ts:944-989`),
   user settings (`:1582`), the attach union (`contract/context.ts:128`), the tool-execution host principal
   (`compose/chat.ts:641,655`, D152) and it is a persisted column (`db/schema/chat.ts:790-802`
   `pending_turns.run_as_user_id`). All of that STAYS the host's. What changes is WHICH id the connection resolves
   under — and the tree ALREADY SPELLS THAT ID: **`funderUserId`** on `chat.requestTurn`
   (`domain/chat/contract/params.ts:291`, "a user with no membership cannot fund a turn on it"), walled on
   present membership at `verbs/turn.ts:2589` and minted into the identity triple at `:2592-2594`
   (`{ triggeredBy: funderUserId, runAsUserId: room.hostUserId }`), persisted as `pending_turns.triggered_by`
   (`db/schema/chat.ts:786-789`) on the host-offline DEFERRED path only (`insertPendingTurn`'s two callers,
   `turn.ts:1150,2482`; verify7 L4 — a live turn carries the triple in memory). NOTE the spelling survives but
   its DEFINITION inverts: `params.ts:290` today reads "NOT the funding box: the box is the resolved host" —
   the §5.3c sweep REWRITES that clause, it does not restyle it. No new word is minted (ground5 H5 — `fundedBy` was a second spelling of a
   live identifier, the D151 class); this doc says `funderUserId` from here on, and every earlier `fundedBy`
   reads as it. **`funderUserId` selects the WHOLE CONNECTION, not "the credential half"** — `resolveChat` is
   one fold returning `{api, model, credential, capability}` (`verbs/resolve-role.ts:1-3`), and under
   connections-as-the-unit a connection IS provider + model + credential + declared capability. The seams:
   `entry/compose/chat.ts:1129` (`resolveChat`), `:1131` (`resolveCredential`), `:1571` (`resolveConnection`,
   the turn's own resolve), `:1575` (`checkSendAvailability`, the #54 pre-send gate — without it the composer
   says AVAILABLE against the host's connection and then spends the member's — BUT the id is not chosen at
   compose: `domain/chat/verbs/read.ts:767` is the `checkSendAvailability` VERB and it HARDCODES
   `runAsUserId: hostUserId`, with its `:754-758` header stating the rule this program inverts ("a member's
   own settings never enter the room's routing"); a lane that edits only `:1575` ships the exact failure just
   quoted — verify8 H1), `domain/chat/verbs/turn.ts:2594` (the triple mint — `runAsUserId` stays
   `room.hostUserId`), the SEVEN `deps.resolveConnection` sites in THREE files (`pnpm ast callers
   resolveConnection --in packages/server/src` = 7/3, scanned=1511, complete — and the list below IS that
   run's output, verify9 H1): `turn.ts:1478`, `:1657`, `:1810` (each off a `resolveTurnIdentityVia` mint at
   `:1474`/`:1643`/`:1806`), `turn.ts:2595` (off `requestTurn`'s hand-built triple), `turn.ts:2417` (off the
   PERSISTED `pending_turns` row — its "change key" is a read of `triggered_by`), `read.ts:447` (the dry-run
   PREVIEW, host-hardcoded — it follows the funder: the verb already holds the reader's own principal and
   derives `hostUserId` locally, `read.ts:412-447`, a one-line swap), and `compaction.ts:262` (the manual
   `compact` lever, host-only by `requireHost` — UNCHANGED, host funds, `:260`); PLUS, under a DIFFERENT
   verb, the `checkSendAvailability` VERB at `read.ts:767` (`callers checkSendAvailability` = 2: this and the
   transport router `chat.ts:523`) — the seam described above, CHANGES KEY, header rewritten; PLUS the
   THREE host-keyed resolves in `entry/compose/rpg.ts` that ride `deps.connection.resolveChat({ principal:
   host, routableChat })` and are invisible to every `resolveConnection` census (verify9 H2): `:1532`
   (`runResyncExtraction` — an rpg extraction that DOES re-resolve "AS THE HOST — fresh, at the verb",
   `:1524-1527`), `:1694` called from `:1727` (`resolveHostRoundConnection`, the POPULATE round's connection
   — exactly the round §5.3's ruling re-keys to the trigger), `:1973` (the read-side pill). All three re-key
   to the trigger; §7.5-1a's "never a re-resolve" describes the TURN-time extraction (`:533`, `:563`) only.
   AND the
   three sites that SUPPLY the funder and therefore now choose whose connection is spent:
   `entry/compose/automation-plugin.ts:236` (`req.authorUserId`), `:518`, `domain/plugin/substrate/bridge.ts:132`
   (`installerUserId`). Good news those three carry: the rule author and the plugin installer are exactly the
   `automation-rule` / `plugin-grant` binding owners (§7.1), so the fold agrees with the live tree for free. Two consequences, stated because they change verdicts (verify3 F6):
   (a) the HOST's assembly reads the FUNDER's CAPABILITY — `pipeline.ts:608` (`midConversationSystem`), `:614`
   (`acceptsHistorySystemRows`), `:616` (`roleHandlingFloor`), `:634-635` (vision/video) — capability, NOT
   preset: the PRESET and prose stay the host's per §7.5-3 (verify8 L5 — a lane reading this as "the funder's
   settings shape the turn" re-implements the fold §7.5-3 withdrew). So a member's turn in a host's room is
   shaped by the member's model's capability while the CONTENT and gen settings come from the host. That is
   the intended meaning of "your connection, your turn"; (b) rpg's read-side pill resolves under the HOST
   (`entry/compose/rpg.ts:1973` inside `buildResolveStateDelivery` `:1951`, "mirrors the flush's F2 gate so
   the pill and the actual round-eligibility agree" — NOT `:1935-1938`, which is `readRoutableChat`'s body,
   a `providerRouting` reader §7.1 deletes) — under `funderUserId` the pill MUST resolve under the
   triggering member too or the D112 fold-guard verdict and the round diverge; the two extraction rounds at
   `:1532` and `:1694`/`:1727` re-key with it. Both are `security-executor`
   scope in step 6; (b) is also an owner-visible change to a D112 verdict's authority and is called out in the
   lane report. D19 is amended to say exactly that split.
   Deleted (the FULL site list — 13 production files / 27 lines, `ast ident ownerConsented`, plus one reader):
   `domain/chat/engine/turn-identity.ts:47-57` (`assertMaxProSubConsent`, `resolveOwnerConsented`);
   `domain/chat/engine/engine.ts:1534,1563,1568,1601,1686,1779` AND the SECOND consent pair at `:2020-2041`;
   `domain/chat/engine/pipeline.ts:97,674`; `domain/chat/contract/context.ts:675,691,729`;
   `domain/chat/contract/results.ts:145`; `domain/chat/verbs/quiet-generate.ts:86`;
   `entry/compose/chat.ts:717,750`; `entry/compose/rpg.ts:508,519,546,778,1267` and its THREE force-stamps
   `:1487,1586,1744` (the D109(2) shape); `infra/providers/contract/{agent.ts:54, backend.ts:150, chat.ts}`
   (`AgentRequest.ownerConsented` is a second request shape, not a re-spelling); `infra/providers/roles/
   {agent.ts:21, chat.ts:18, firewall.ts:46-48}`; `CHAT_OP_CODES.consentRequired` + its READER at
   `domain/chat/verbs/turn.ts:2399` (an error-classification predicate — re-classify, do not just delete) +
   client copy; `AppSettings.allowNonOwnerMaxProSub` (`settings/index.ts:393,1116`, key deleted, no lift) and
   its Governance row. Group-chat consequence, stated so nobody rediscovers it: a member in a host's chat who has
   NO generation row of their own gets `no-connection` on send — the composer's add-a-connection state, not
   the host's bill; the prompt they would have sent is still assembled from the HOST's books, cards and preset.

4. **Discipline registry** `DISCIPLINE: Record<"chat"|"agent"|"utility", …>` (chat: tools:\[], no MCP, maxTurns 1,
   terminal-tools stop; agent: MCP + hooks + canUseTool; utility: maxTurns 2, no tools).

5. **Spend + concurrency per credential:** per-user semaphore under the global cap; rate-limit snapshot on the
   user's own row; the row's `allowBackground` flag (default off) decides whether summarize/structured/quiet/
   compaction may use it (F5).

6. **In-app setup:** Add connection → Claude subscription → one instruction line (`claude setup-token`) + paste
   → save runs `verifyAuth` with that row and stores the report on it. (No in-app login; F17.)

7. **It speaks the same record as every other wire — stated so nobody leaves it on its own vocabulary.** The
   runner already produces one `ChatResult` (`runner.ts:597-620`: `finishReason: normalizeFinishReason(stopReason
   ?? terminalReason)` at `:614` through the SAME `FINISH_REASON_MAP` the hosted wires use; `costUsd` summed from
   the SDK's `modelUsage.costUSD` at `:862`; cache-creation tokens at `:872`; `contextUsage`). Under §5.3b/§5.3c
   the mapping is: `message_variants.provider = "claude-sub"`, `connection_id` = the user's claude-sub row,
   `model` = the daemon's `resolvedModel` (`ModelId`) — approximate under an SDK overage/rate-limit downgrade,
   where `costUsd` is summed across every billed model (`runner.ts:857-866`, `detectModelDowngrade :878-880`) while
   `model` names one; the per-model split rides `providerMetadata["claude-sub"].modelUsage` (verify6 L1) —
   `finish_reason` from the shared fold (`end_turn`,
   `max_tokens`, `budget_exhausted` are already arms), `stop_reason`/`terminal_reason` raw as today,
   `generation_id` null, `model_stats.provider = "claude-sub"`. TWO deliberate differences: (a) **cost on a
   subscription is `costProvenance: "estimated"`** — the SDK's `costUSD` is what the turn WOULD have billed at API
   prices, no invoice exists, and a stats rollup must not sum it with a metered provider's `measured` figure;
   the raw number still lands as `costUsd`; (b) the agent-sdk-only facts (`cacheCreation5mTokens`,
   `cacheCreation1hTokens`, `warmSpareClaimed`, `durationApiMs`, `numTurns`, `mcpServerHealth`, the D8
   `sdkSessionId`) go under `providerMetadata["claude-sub"]`, not on shared columns. Capability comes from the
   same `curated/anthropic.json` rows the `anthropic-messages` wire reads (same model ids) refined by the daemon
   row; `sampling` is EMPTY on this wire (the runtime exposes no sampler knobs), so the funnel drops every
   preset sampling knob with the ordinary `sampling_knob_dropped` warning — the same mechanism, not a special
   case; `wireMeta` is inert because the curated row says `midConversationSystem: false` for this wire and the
   assembly never emits it. `EndpointFeatures` does not apply (it is the openai-compat wire's schema);
   `DISCIPLINE` is this wire's equivalent translator config. `connection_bindings` treats a claude-sub row like
   any other; `agent` rides the `chat` binding.

Layout: `backends/claude-runtime/{def,credential,child-env,discipline,spawn}.ts`, `session/`, `turns/`, `tools/`,
`stream/`, `catalog.ts`, `verify.ts`. All lanes here are `security-executor`.

### 8.5 The `anthropic-messages` wire — IN (F6 flipped, owner word 2026-09-19)

A user with an API key and no subscription is now the common case. Provider row `anthropic` (`wire:
anthropic-messages, auth: apiKey`), backend over `@ai-sdk/anthropic` (`createAnthropic({ apiKey, fetch })`,
§8.0) — no subprocess, an observable wire body (`wrapFetch` captures it), the SDK's retry under our
`backends/kit/retry.ts`. Serves chat, summarize, structured (tool-forced JSON). The converter is the SDK's: it
places `cacheControl` from `wireMeta.cacheBreakpoint`, forwards mid-conversation `system` rows + `clearAt` +
per-turn `effort` under the beta headers the curated row enables, and merges same-role rows (a no-op after our
floor, pinned). Our `backends/kit/cache-control.ts` placer decides WHERE the breakpoints go (it stays the ONE
placement policy for both hosted wires); a USER image rides the V4 `file` part the converter honours, an
ASSISTANT image is re-attached by OUR post-convert hook because the converter drops it (§8.0, verify4 H1).
`wireMeta.effort` values outside the SDK's `low | medium | high | xhigh | max` are dropped with a warning
(§5.3c). `curated/anthropic.json` serves it, extended with the three turn-shaping cells §8.0 names. Sequencing: the vocabulary-map edit + D31/D67 amendments land FIRST
in the lane, then the wire member + provider row, then the backend. Mode-4 (`buildClaudeAnthEnv`, zero production callers, 11 test refs) is deleted with the rest of the
host arms — the subprocess is for the subscription only. STATED CONSEQUENCE: an API-key user has NO `agent`
path (the Claude Code agent loop needs the runtime); `anthropic-messages` serves chat/summarize/structured only
(§8.6). The first-party-key agent path is dropped, not ported; reopening it is a fork.

### 8.5b Who pays for what in a room — every side call names its task and its funder

Per-task bindings (§5.3) mean a room's side machinery never rides the chat model by accident. The table is
the tree's current wiring with the program's changes marked per row, and ONE change that is not a row but
the rail itself (verify9 H3): today ONE owner-bound `RoleClients` bundle serves every chat-side side call —
`entry/compose/services.ts:524` `bindRoleClients(deps.ownerId)`, handed to eight contexts including chat at
`:798` (`callers bindRoleClients` = 3: that site + the two per-actor arms in `automation-plugin.ts:374,687`)
— so smart arbitration, extract-quiet and memory digests spend the OWNER's rows today, not the trigger's.
Under the program every side call resolves through `roleClientsFor(funder, actor?)` (§3.3, a NEW surface —
`callers roleClientsFor` = 0 today), and `services.ts:503-524` + the eight context hand-offs are step 7's
named coupled sites. The rows below state the POST-program funder; the digests row also gains the
`allowBackground` gate; the reply row's funder is re-keyed. The PRESET params and the PROSE slots a
chat-scoped side call folds beneath its posture keep following the ROOM HOST as they do today — `verbs/turn.ts:860-874` ("the `arbiter` floor ← the chat host's default-preset params", "the
arbiter prompt is the room HOST's slot") and `verbs/extract-quiet.ts:114-117` resolve through
`resolveChatPresetParams(chatId)` / `resolveChatProse(chatId)`, and those two seams stay host-keyed (verify6
M3). Reason: the host authored the room's content and prose; the member brought the model that reads it — the
same split §8.4-3 states for the reply itself (host assembly, funder connection). The `funderUserId` column
below is therefore the CONNECTION's owner only:

| Call | Task it rides | Funder (`funderUserId`) | Today's seam | Cost posture |
| - | - | - | - | - |
| the reply itself | `chat` | the human whose message triggered the turn (the rule/plugin author for an unattended one) | `compose/chat.ts:1571` | one generation |
| smart speaker arbitration (`smart` mode) | `summarize` — NOT chat (`engine/smart-arbitrate.ts:1-9`: "a request-shaper over the INJECTED `summarize` role") | the round's trigger | `verbs/turn.ts:864` | ONE low-temp classify call per round; solo / single-eligible rooms make NO call (`:15-16`); no `summarize` binding ⇒ deterministic `natural` fallback + the visible `smart_arbitration_degraded` warning (D41), never a chat-model call |
| `natural` / round-robin arbitration | none | — | `engine/select-speakers.ts` | zero |
| auto-mode rounds | `chat` per generated reply + the arbiter rule above | the human who started auto-mode, for every round it drives | `engine/auto-mode.ts` | N replies per round — the one place a cheap default matters; the picker's per-task slots make that the user's choice, not ours |
| extract-quiet (imagery scene keywords) | `summarize` (`verbs/extract-quiet.ts:114-117`, the `extract_quiet` side-gen posture) | the human who triggered the image | `deps.summarize` | tiny budget (320 out) |
| memory digests / recap | `summarize` | the trigger, and ONLY if their row has `allowBackground` (F5) | `memory/build/digests.ts:88,102` via `role-clients.ts` | background |
| compaction + quiet-generate | `chat` — the TURN's already-resolved connection, NOT the summarizer rail (`compaction.ts:8-9` "rides the chat's OWN model via the injected `quietGenerate` … NOT the summarizer rail"; `quiet-generate.ts:4-5,77` `runChatTurn({ connection })`; `SIDE_GEN_POSTURES.quiet_generate`'s only consumer) | the turn's funder — whoever's turn is being compacted | `runCompaction({ connection })`, `quietGenerate` | no `allowBackground` gate: it is part of the turn it serves (verify7 H3 — an earlier row routed it to `summarize` and would have silently disabled compaction for a user with no summarize binding); the program KEEPS the tree's ruling |
| greeting studio, D45 image caption | `summarize` (`assets-character.ts:349`; `imagery.ts:147` with `images: [bytes]` — a SECOND vision-summarize beside the caption lens, so it carries the same `input ∋ image` requirement) | the caller — who FUNDS and supplies the PRESET, the two coincide on a per-user side gen (§7.5-3 arm ii) | compose | per-user side gen |
| compaction, MANUAL `compact` lever | `chat` on the chat's connection | the host — `requireHost` gates the verb, so trigger = host (`compaction.ts:260-262`, unchanged) | `compaction.ts:262` | host-only |
| tool execution inside a turn | (executes under the HOST principal, D152 — an authority fact, not a spend fact) | spend stays the trigger's | `compose/chat.ts:641,655` | — |
| an `agent` turn | `agent` rides `chat` | the trigger's `claude-sub` row | §8.4 | subscription |

Two consequences the picker must make visible: a user with no `summarize` binding gets deterministic
arbitration and no summaries — a correct, visible degrade, not an error; and `summarize` is the slot to point
at the cheap model, which the pane says in its copy for that slot. Future actor kinds (an agent principal with
its own connections, D60) drop into the same table as another `actorKind` — the funder column is the only
thing that changes.

### 8.6 What each WIRE serves (`WIRE_DEFS[w].serves`, pinned by a table test against the backend's methods)

| Wire | chat | agent | summarize | structured | generateImage | embed | imageEmbed | rerank |
| - | - | - | - | - | - | - | - | - |
| openai-compat | ✓ | | ✓ | ✓ | `features.images` arm | ✓ | capability `input ∋ image` | ✓ (`features.rerankPath` set) |
| anthropic-messages | ✓ | | ✓ | ✓ | | | | |
| agent-sdk | ✓ | ✓ | ✓ | ✓ | | | | |
| local-light | | | | | | ✓ | ✓ | ✓ |

A provider on a wire can serve at most what the wire serves; a connection serves only the tasks of its one
model's kind (§5.7 `connectionTasks`). `agent` is agent-sdk-only by construction.

### 8.7 Presets across providers — one neutral intent, capability says what is honoured, the transport spells it

**Scope (owner word 2026-09-19): the preset's GENERATION section — sampling, reasoning effort/budget,
verbosity, output cap, `replyMedia` — is IN this program's REMIT (its behaviour, its capability gating, its
funnel) and STAYS ON THE PRESET (owner word 2026-09-19: "we aren't moving gen settings out of presets").**
Nothing about where a user sets a gen setting changes. `UserIntent` stays at `contracts/preset/index.ts:336-395`
(an earlier draft moved its type home to `contracts/inference`; withdrawn — a folder move with zero user
effect and real confusion cost); the funnel imports it from there as today. `AdjustedKnob` is `ADJUSTED_KNOBS`
at `contracts/chat/bus.ts:189-206`, a BUS payload tuple (13 members incl. `quality`, `logitBias`, `stop`) with
a type-level `keyof UserIntent` pin in `tests/contracts/chat/index.test-d.ts` and the `bus-payload-allowlist`
gate over it (verify7 H7); it stays there too. Adding a knob is FOUR coupled sites: the `UserIntent` member,
`ADJUSTED_KNOBS`, the `.test-d.ts` pin (a `types:testd` stage `pnpm check` runs), and the client copy mapper.
The funnel + the capability panel are the `Record<AdjustedKnob, …>`-driven consumers. D154 is the law over all of it and is restated here so no lane
re-litigates it: **gen settings belong to the user's preset — GLOBAL, never per-conversation, never force-set
by a feature** (a feature may RECOMMEND on a surface; it never writes). A ROOM binds neither a preset nor a
connection (§5.3); an owning FEATURE may carry a generation-adjacent association where D58 sanctions it
(`rpg_games.gmPresetId`, `chats.metadata.toolRecurseLimit` are live) — the rule is "never on `chats`, never
per-conversation drift", not "nothing about generation near a room".

How it works today, and it is the right shape (kept; only the inputs get better):

1. **The preset is provider-NEUTRAL, with one named carve-out.** `UserIntent` (`userIntentSchema`,
   `contracts/preset/index.ts:336-395`) is one closed set: the sampling knobs (`temperature`, `topP`, `topK`,
   `minP`, `topA`, `frequencyPenalty`, `presencePenalty`, `repetitionPenalty`, `seed`, `logitBias`, `stop`),
   the reasoning knobs (`effort`, `thinkingBudgetTokens`, `thinkingDisplay`), `verbosity`, `maxOutputTokens`
   (NOT `maxTokens` — `:197-198` says so), `maxContextTokens`, `providerContextCompression`, `quality`, the
   `compaction` object (`mode`, `thresholdPct`, `instructions`, `verbatimTail`) and the `advanced` object
   (`roleHandling`, `squashSystemMessages`, `parallelToolCalls`, `claudeEnv`, and **`dynamicContext:
   "system" | "hook"`** — the preset-side dial for the `midConversationSystem` capability cell, with its own
   funnel arm `DYNAMIC_CONTEXT_DEMOTED_WARNING` at `resolve-chat.ts:15`; verify8 M1). Numeric knobs are zod-bounded;
   `logitBias`/`stop`/`compaction.instructions` are typed, not bounded. A user keeps ONE preset and points it
   at any connection. Two members ARE provider-shaped (verify7 H8), stated so nobody thinks the preset is
   pure: `customParameters` moves to `connections.extras` (§8.1c — the owner's ruling, an endpoint quirk not a
   gen setting); **`advanced.claudeEnv`** ("allowlisted to the Claude runtime knob namespace", `:372-374`)
   STAYS on the preset (owner word 2026-09-19; an earlier draft moved it by symmetry with `extras` —
   withdrawn). Precisely: the tree calls it "a config-tier escape hatch … not a generation knob"
   (`params-limits.tsx:313`), so this is the owner's call rather than D154's reach (verify8 M2); it is read at
   `agent-sdk/translate.ts:261` into `ClaudeRuntimeOverrides.userEnv`, merged and reserved-key-filtered at the
   builder (`agent-sdk/env.ts:197,210-215`).
   `advanced.parallelToolCalls` is a real knob the OR transport spells; it stays.
2. **Capability says which knobs THIS model honours.** `capability.sampling` (`contracts/connection/index.ts:129-141`)
   carries a `Range` per numeric knob and a boolean for `seed`/`logitBias`/`stop`; `reasoning` carries
   mode/effort/budget truth; `verbosity` its levels. Absent ⇒ not honoured.
3. **The funnel folds intent × capability ONCE** (`resolve-chat.ts`, pure, both runners call it): clamp into
   the range, DROP with a structured `sampling_knob_dropped` warning when the model exposes no range
   (`resolveNumeric`, `:29-41`), the effort/budget/adaptive guards, the mandatory-reasoning clamp, verbosity,
   the output cap, and the `dynamicContext` demotion (`hook` → system block when the model has no
   mid-conversation channel, `:15`). The
   warning is `{code, knob}` — operator prose in the log, re-voiced by the client's own copy (D16). CADENCE
   (side-eye 8 P1-10): the preset's capability panel (`features/preset/lib/capability-panel-model.ts`) is the
   AMBIENT channel — it greys the knob for the connection its switcher shows (default: the `chat` role's
   connection, §5.3a) BEFORE any turn; the per-turn stream carries at most ONE aggregated notice and only when
   the dropped set changes from the previous turn on that connection — a subscription user with eleven inert
   sampling knobs sees them greyed once, not eleven warnings per turn forever. A knob never silently vanishes
   and never 400s a turn it could have dropped.
4. **The dialect spells the RESOLVED knobs on the wire.** Under Vercel the standard OpenAI set rides the
   SDK's modelled params; the non-standard ones the capability admitted (`top_k`, `min_p`, `top_a`,
   `repetition_penalty`) ride `injectOptions` → `providerOptions[<transport>]` (both transports take them at
   the top level; a hosted OpenAI row never sees them because `curated/openai.json` declares no range, so step
   3 already dropped them). Anthropic's wire has its own param names and the
   SDK's converter owns that spelling.

What the program CHANGES in the inputs, because today's truth is thinner than the mechanism:

- **Ranges on endpoint rows are permissive today** (`staticProfile(fullSampling=true)`, D143) — nothing drops,
  so an unsupported knob reaches the server and 400s; `excludeBody` was the workaround. After: `declared.sampling`
  on the connection (the pane shows the knob list with checkboxes: "this server honours…") → else the curated
  JSON row by model id → else permissive as before. `transport.excludeBody` stays the last belt.
- **OpenRouter's catalog gives NAMES, not ranges** (`supported_parameters`); the ranges are curated constants.
  That stays; the name list is what gates presence. Stated so nobody expects per-model numeric truth.
- **Mutually-exclusive knobs are inexpressible today** and become live with the first-party `anthropic` wire:
  current Claude models reject a request that sets BOTH `temperature` and `top_p` (verify the exact model set
  in the lane against Anthropic's docs). `capability.sampling` gains `exclusive?: readonly [AdjustedKnob,
  AdjustedKnob][]`; the funnel keeps the first-listed knob and drops the other with a NEW `sampling_knob_conflict`
  warning (a `WARNING_CODES` member — the union is closed and every consumer is tsc-forced). Curated Anthropic
  rows declare it; a `declared` block may too.
- **New sampler families are an ADD, not a retrofit:** a llama.cpp text model (§7.2) brings `typical_p`, `dry`,
  `xtc`, `mirostat`, `dynatemp`. Adding one = a member on `UserIntent` (zod-bounded) + a `Range`/boolean on
  `capability.sampling` + a curated row that states it + one spelling in the dialect that speaks it. The funnel
  and the panel are `Record`-driven off the knob tuple (`AdjustedKnob`), so tsc names every site. Not built now.
- **Quality dial stays:** `QUALITY_LEVELS`/`QUALITY_SAMPLING`/`QUALITY_EFFORT` derive defaults beneath explicit
  knobs (precedence: explicit user > quality > model `defaultEffort` > house), unchanged.

Named so it is a fork later, not a surprise: a preset cannot carry a per-connection OVERRIDE ("on my vLLM
box use rep-pen 1.1, on OpenRouter don't") — the user makes two presets or accepts the drop. A
`declared.samplingDefaults` block on the connection would be cheap, but it COLLIDES with D154 (a second home
for a gen setting beside the preset, folded silently beneath it) and is therefore NOT proposed; if it ever
is, it is an owner fork against D154, not a lane default. The same tension, same answer: `replyMedia` is
global-only under D154 though a per-room desire is obvious (F23).

### 8.8 Reasoning CARRY — replaying the model's own thinking back to it (owner ask 2026-09-20)

We already PRESERVE reasoning (the `message_variants.reasoning` column, the reasoning bus channel, the
host-only visibility gate on a deception game). We have never REPLAYED it: `domain/chat/substrate/wire-history.ts`
carries zero reasoning references, so no prior thinking has ever reached a wire, in any form. The wire lane's
A1 fix (2026-09-20) built the in-turn half — `ChatContentPart` gained `{type:"reasoning", text, meta}` with
`ReasoningPartMeta` closed per wire, and the V4 reducer folds provider metadata across THREE stream parts —
but a turn's parts die with the turn until persistence and a carry policy land. This section is that policy.

**TWO DIFFERENT QUESTIONS, and conflating them is the defect.** (1) INSIDE one turn, across tool hops, a
model that signed its thinking wants that signature back or it loses its verified reasoning every hop — a
CORRECTNESS property, not a preference. (2) ACROSS turns, putting a previous reply's thinking into the next
prompt is a USER preference, and most providers advise against it. SillyTavern models these as two unrelated
controls in two different panels; we model them as one ordered knob whose upper rungs the capability gates.

**The SillyTavern receipts** (local checkout read 2026-09-20, `~/inktomi-stack/SillyTavern`) — cited because
it is the only mature implementation of this and its shape is worth borrowing, its gating is not:

- `power_user.reasoning.add_to_prompts` (`public/scripts/power-user.js:277`, default FALSE, `max_additions: 1`):
  the CROSS-TURN arm. Pure text re-injection — prior reasoning wrapped in the configured `<think>`/`</think>`
  and glued into the message CONTENT string (`public/scripts/reasoning.js:729-760`). Provider-blind.
- `oai_settings.tool_reasoning_mode` ("Interleaved Thinking", `public/index.html:2035-2042`, default
  `disabled`, values `disabled | since_last_user | active_chain`): the IN-LOOP arm. Gated THREE ways —
  the source must be in `interleaved_reasoning_providers` (`public/scripts/openai.js:262`, which is
  OpenRouter and Custom ONLY, so direct Claude never gets it), `show_thoughts` must be on
  (`getEffectiveToolReasoningMode`, `:6463`), and eligibility is `promptIdx > lastUserIdx` (`:998`) — that
  last line IS the in-loop fence, and it is the good idea. The two live modes are a real axis:
  `since_last_user` carries every assistant reasoning in the current chain; `active_chain` walks back
  skipping tool and tool-call rows and stops at the first assistant text boundary (`:1002-1010`).
- `isReasoningSignatureSupported()` (`:6476`): the SIGNED arm, and it is a hardcoded predicate — Google
  Vertex/Makersuite, or OpenRouter with a `google/gemini` model id. Claude is excluded on both routes even
  though their OpenRouter converter carries an `anthropic-claude-v1` format arm (`prompt-converters.js:1397-1450`).
- `gemini.thoughtSignatures` in `config.yaml` + the `skip_thought_signature_validator` bypass string
  (`prompt-converters.js:34,578`): a deployment kill switch and a missing-signature escape.

There is no capability ladder anywhere in it: every gate is a source list or a model-id regex, hand-kept.

**OURS — one capability cell, one preset knob, one converter.** Rule 1 (§6.6) assigns each piece:

1. **What the model will ACCEPT back is a CAPABILITY cell**, not an `EndpointFeatures` quirk — §8.1b is
   explicit that features is the openai-compat chat body/stream schema, and this fact must hold for the
   `anthropic-messages` wire and `agent-sdk` too. `GenerationCapability.reasoning` gains
   `replay?: "signed" | "text" | "none"`: `signed` = the wire round-trips an opaque signature/encrypted
   block (Anthropic thinking blocks, OR `reasoning_details`, Gemini thought signatures); `text` = only
   prose can ride back, with no provenance; `none` = do not send it at all. It rides `EVIDENCE_TIERS`
   like every other cell, so a curated family default is overridable by a dated `measured/*` entry and by
   a user's own `declared` block (the top rung — their box, their truth). Read through ONE helper in
   `contracts/inference/capability/reads.ts` per §2.7's migration, never re-spelled at a call site.
2. **What the USER wants is ONE preset knob** (D154: gen settings are preset-owned and global),
   `UserIntent.carryReasoning: "off" | "tool-chain" | "conversation"`, default `off`. `tool-chain` carries
   within the ACTIVE tool chain only — ST's `promptIdx > lastUserIdx` fence, which is the honest boundary
   because a tool chain is one logical turn; `conversation` additionally carries prior turns' reasoning.
   The knob is ORDERED, so a capability that says `none` drops it to `off` and one that says `text` still
   honours both rungs in prose form. Adding it is §8.7's FOUR-site rule: the `UserIntent` member,
   `ADJUSTED_KNOBS`, the `keyof UserIntent` pin in `tests/contracts/chat/index.test-d.ts`, and the client
   copy mapper.
3. **How it is SPELLED is the wire converter**, already built: `v4/prompt.ts` emits the V4 `reasoning` part
   with part-level `providerOptions`, the anthropic converter turns that into a `thinking` block with its
   signature, the openrouter transport into `reasoning_details`. Nothing per-provider is added here.

**The coherence rule, from ST and kept**: carry above `off` requires reasoning to be ENABLED for the turn —
a carry knob on a non-reasoning turn has nothing to carry. The funnel drops it with the ordinary
`sampling_knob_dropped` warning rather than greying a control the user cannot reason about, exactly as
every other unsupported knob behaves (§8.7-3).

**What it costs to persist, and BOTH RUNGS SHIP (owner ruling 2026-09-20).** `tool-chain` needs the parts
only for the life of the turn, so the engine's in-memory chain is enough and NOTHING is persisted — it buys
the correctness property with no schema change. `conversation` needs them durable (a `message_variants`
column or a `variantMetadataSchema` field) AND the assembly must materialize them onto the assistant history
row IN STREAM ORDER, ahead of the tool-call part, because Anthropic requires the thinking block first in an
assistant turn. An earlier draft shipped `tool-chain` first and refused `conversation` with a warning; the
owner ruled BOTH, so the knob is never partly inert. The build SPLITS by seam, not by rung: the STORAGE (the
durable home + the canon-write path) is one lane's, and the POLICY (the knob, the funnel resolution, the
converter carry, and the `wire-history.ts` materialization that reads the parts back) is the other's.
`wire-history.ts` carries zero reasoning references today, and `buildWireHistory` has no db handle — the
same plumbing shape §6.7's inline-image re-attachment needs, so the two are designed together or one of
them re-invents the seam.

**Stated consequence.** A room whose members run different connections may carry reasoning on one member's
turn and not another's — correct under §8.4-3 (your connection, your turn), and invisible to the room
because reasoning is already a host-only channel on a deception game.

---

## 9. Streaming — in and out

**In:** provider → `ChatDeltaEvent`/`ChatEvent` via the `onDelta`/`onEvent` callbacks and `Promise<ChatResult>`
(`contract/chat.ts:131-133`). On the two hosted wires the source is the Vercel V4 `doStream` part stream
(`text-delta`, `reasoning-delta`, `tool-input-*`, `file`, `source`, `finish` with usage + `providerMetadata`),
reduced by ONE `backends/openai-compat/stream.ts` / one anthropic reducer into our `DELTA_KINDS` union; the
agent-sdk and local-light backends keep their own reducers. `runRole` wraps the call in the `provider.<role>` span.
**Out (unchanged):** `domain/chat/engine/pipeline.ts::reduceStream`, the chat bus (`contracts/chat/bus.ts`
`slotSeq` deltas), rooms, replay, `transport/**`, the client socket. No `ai/react`, no UI message stream, no
`@tanstack/ai-client` for chat.
The wire-capture ring stays in foundation; the package only calls the injected `WireCaptureSink`.

---

## 10. Embeddings

Already true (`db/schema/embeddings.ts:22-28`): `(model, dim)` space tag, additive write + purge, PD-139a
reindex trigger, live `embedModel` getter. Add:

1. **Admission by capability:** `TASK_DEFS.embed.requires.dims === 1024`, `EmbeddingCapability.mrl`;
   `funnel/resolve-embed.ts` emits `dimensions` or client-side truncation with a warning. `F32_BLOB(1024)` never changes.
2. **dtype axis (L3):** `EmbeddingCapability.dtype` and the space tag derivation (`role-clients.ts:187-204`
   `embedSpaceOf`) read the same curated fact.
3. **Joint space rule:** an `embed` model without `image` modality auto-clears `imageEmbed` to the captioned-text
   lens; replaces `embedDimensionWarning` prose.
4. **The PD-139a purge+reindex TRIGGER moves, or it dies (ground5 H6).** Its only home today is
   `domain/settings/verbs/update-user-settings-section.ts` (`embedModelIds(config)` reads
   `routing.roleDefaults.{embed,imageEmbed}.model` and fires `ctx.onEmbedModelChanged()` on an actual change).
   Step 4 removes `roleDefaults` from the blob, so the trigger is RE-RAISED at the two events that now change
   the space tag: the `connection_bindings` write verb when the `embed`/`imageEmbed` binding's resolved
   `(model, dtype)` changes, AND the `user_connections` update verb when a bound connection's `model` changes.
   Both compare the resolved space tag before/after (`embedSpaceOf`) and fire the same `onEmbedModelChanged`;
   step 8's stage-db drive exercises BOTH. Without this a user switches embedders and the old space is never
   purged while `nearest.ts` filters on the new tag — search goes silently empty.
5. **Transition state (embeddings domain):** `activeSpace` = last COMPLETE space, advanced when the reindex
   workload finishes. Its home is the GETTER, not `nearest.ts`: `roleClients.embedModel` (`role-clients.ts:352`)
   is read at 16 production sites (`embeddings/indexer/handlers.ts:31`, `verbs/embed-corpus.ts:37,50`, the two
   purge verbs, `search/verbs/{corpus,digests,discover,documents,knn,search,segments}.ts`, `entry/compose/
   {admin,chat,databank,services}.ts`) and the DIM half comes from `env.VLLM_EMBED_DIM` at composition
   (`databank.ts:92` `getActiveEmbedSpace`, `search-discovery.ts:140-156`). Under a per-user embedder the getter
   returns the last-complete space for THAT owner and the dim is the deployment's `deps.embedSpace.dims` (1024,
   the admission rule) — `env.VLLM_EMBED_DIM`, `character/substrate/embed-text.ts:51` (`VLLM_EMBED_MAX_MODEL_LEN`
   as the card-embed token budget → the row's declared window) and `settings/effective-config/layer.ts:114`
   (`VLLM_EMBED_MODEL`) are the four `VLLM_*` readers OUTSIDE the vllm tree the yeet must re-point.
   Confirm by a stage-db drive before landing.

---

## 11. Deps interface and compose

```ts
export interface InferenceDeps {
  now; log; span; addSpanEvent; securityEvent;                                 // observability (the fleet's superviseDetached leaves with it)
  env: { claudeExecutable?: string; hostEnvAllowlist: () => Record<string,string> };  // the child-env allowlist source (today's processEnvSnapshot, narrowed); no engine env, no host-claude detection
  app: { name; url };                                                           // #foundation/config (1 site)
  snapshotStore: SnapshotStore;
  resolveCredential;                                             // by credentialId off the connection row (§5.3) — `loadActiveCredential` is gone
  bindings: BindingStore;                                        // read `connection_bindings` (the §7.1 fold's input; replaces the resolver's read of `routing.roleDefaults` off the settings blob — the read `verbs/resolve-role.ts` does today)
  captureWire?; imageToPng?; sessionWriter?; localLightCacheDir?; localLightCache?;   // the purged tier's BackendRegistryDeps members (`infra/providers/index.ts:71-102`)
  // no `endpointReachability` port — the package OWNS the probe (`backends/openai-compat/reachability.ts`, §4); an injected one would be a second implementation (verify7 M3)
  agentSdk: { summarizeConcurrency: () => number; query?: SdkQuery; sessionStore?: SessionStore };   // the three live seams `BackendRegistryDeps:72-78` carries today: the KEPT `agentSdkConcurrency.summarize` getter (§4), the SDK `query` test seam, the D8 in-memory store (verify7 M2)
  userRuntimeDir: (ownerId: UserId, tool: "claude") => string;   // infra/storage; `<USER_RUNTIME_DIR>/<ownerId>/claude` (§8.4-2)
  embedSpace: { dims: number };                                  // the deployment's vector width (1024) — the search/discovery/databank composition reads it here, not env.VLLM_EMBED_DIM (V13)
  openaiCompat?: { fetch?; chunkSize?; concurrencyFloors: { embed; summarize } };   // everything else rides the connection + provider row
  providerStore: ProviderStore;                                  // list/put/delete runtime provider rows (`provider_rows`; port; server wires drizzle) — F9
  connections: ConnectionStore;                                  // read/write user_connections (port; server wires drizzle)
  sdkFetch: typeof fetch;                                        // REQUIRED — the transport every `createOpenAICompatible`/`createAnthropic`/`createOpenRouter` and every catalog read issues on (§8.0). No ambient fallback: the root injects it
  // no posture, no engineLaunch, no engineHost, no repoRoot, no superviseDetached — 9 of the 26 providers foundation sites die with the fleet code
  // no OR client seam (the purged `OpenRouterBackendDeps.getClient`, `infra/providers/index.ts:68`) — the raw SDK is dropped (§8.2); the OR provider is built per connection from `sdkFetch` + the credential
  concurrency?; random?;
}
```

The 38 foundation edges (26 providers + 12 connection) resolve to this one interface; the two `@orb/server/kit`
edges resolve by moving those modules to `@orb/kit`; the `backends/agent-sdk/log.ts` self-imports are
re-spelled relative. `domain/connection/workload-contributions.ts` stays in server and wraps
`runtime.catalogs.refresh` (D117). `entry/compose/services.ts` builds `InferenceDeps` and calls
`createInferenceRuntime`; the purged `entry/compose/role-clients.ts` becomes `runtime.roleClientsFor`.

**`sdkFetch` IS REQUIRED, AND THE SSRF BELT IS NOT IT.** An earlier draft of this section called `sdkFetch`
"the egress-guarded fetch every provider receives", which sent at least one reader looking for the guard in
the wrong layer. The tree: `sdkFetch` is the provider TRANSPORT and nothing more. It carries no guard of its
own, and the SSRF belt over provider egress is the boot-installed global undici dispatcher
(`packages/server/src/infra/network/egress.ts` `installEgressFirewall` → `setGlobalDispatcher`, installed from
`packages/server/src/entry/lifecycle.ts`, `EGRESS_FIREWALL` defaulting true), whose DNS-lookup override closes
the rebinding TOCTOU; a user-influenced URL never rides this transport at all, it goes through `safeFetch`,
which runs its own resolve→validate→pin independent of that toggle.

The field is REQUIRED so that statement stays true. While it was optional, `createInferenceRuntime` and
`buildBackends` each resolved `deps.sdkFetch ?? globalThis.fetch`, production never injected it, and an
ambient fallback inside a package below `@server` is an egress door no `@server`-population gate can see.
`entry/compose/services.ts` now reads the ambient transport ONCE and injects it — the
`no-raw-clock:entry-lifecycle` shape, licensed by its own reviewed grant `no-raw-egress:entry-compose-transport`
— and `ServicesDeps.providerSeams.sdkFetch` overrides it. That is also the determinism fix: the runtime
resolves the transport synchronously during `createServices`, so a `vi.spyOn(globalThis, "fetch")` installed
in a test body was always too late, and the shared `app` fixture (`tests/support/fixtures.ts`) now defaults its
`providerFetch` to a REFUSING fake so an unscripted provider call fails loudly instead of reaching whatever is
listening on the box.

---

## 12. Enforcement

- **Resolve-time:** package boundary; `BackendKey`, backends, credentials never leave `index.ts`; dep-cruiser backstop.
- **Compile-time:** every CODE axis is `Record<ClosedTuple, Def>` (wires, tasks, kinds, modalities, deltas); providers are data validated by one zod schema; `TASK_SELECTORS`,
  `WARM_WINDOW_TRUTH`, `toChildEnv`, `DISCIPLINE`, the dialect `Record` are exhaustive.
- **Gate-time (two new gates, landed on a FIXED tree after M4's 13 migrations):** `inference-registry-census`
  (folder ↔ registry row, both directions, planted controls) and `inference-model-regex-fence` (regex/
  `startsWith` on a model id outside `families.ts` + `curated/**` + the `cache-control.ts` allowlist row is RED;
  `capability.<axis>?.` re-spelled outside `reads.ts` is RED).
- **Compile-time, the compose-tier executor fence (§7.5-1a):** `RpgComposeDeps.executor: Pick<ProviderExecutor, "runChatTurn" | "structured">`,
  `ImageryComposeDeps.executor: Pick<…, "generateImage">`, the chat engine's `Pick<…, "runChatTurn">`; every other compose site reaches a
  task through `roleClientsFor`. A dep-cruiser row cannot express a method-level rule (verify6 H8), so this is the enforcer.
- **Gate-time, the EXTRACTION audit (verify3 F3 — a lane deliverable, not a footnote):** 72 gates scope their
  population to `"@server"` (`/usr/bin/grep -rln '"@server"' tooling/src/verify/gates/*.ts`), among them
  `no-raw-egress.ts:122` — the ratchet whose whole point is that a NEW file in the (now purged) `infra/providers` doing
  credentialed egress reds until reviewed — and 14 reviewed-grant rows keyed by absolute
  `packages/server/src/infra/providers/**` subjects (`reviewed-grants-depcruise-to-egress.ts:402,410,418,434`,
  `reviewed-grants-assets-to-home.ts:261-306`, `reviewed-grants-no-to-factory.ts:9,17,25`). Moving the code to
  `packages/inference/src/**` takes it OUT of every one of those populations and strands the rows. Step 7
  therefore enumerates the 72, classifies each as `widen to ["@server","@inference"]` or `genuinely server-only`
  (`caught-failure-ownership` already covers `@packages` and needs nothing), re-points every grant subject,
  and plants the control both ways (a raw `fetch` planted under `packages/inference/src/backends/` reds
  `no-raw-egress`; a stale grant row reds). `assumes-single-replica` (`:122`, `@server` minus persistence) is in
  the widen set: the registry's runtime rows live in `provider_rows`, not a module-level map, precisely so
  nothing in the package needs an `ASSUMES(single-replica)` annotation.
- **Test-time:** `TASKS × BUILTIN_PROVIDERS × CHAT_APIS` table test (a provider's apis ⊆ its wire's; `providerTasks` ⊆ the wire's serves; `serves` narrows, never widens, the hand row it replaces); `WIRE_DEFS[w].serves ≡` the backend's implemented methods; every built-in provider row parses under the registry schema and matches `PROVIDER_ID`;
  synthesis precedence per source; `silencesProse` floor; env-builder pins per credential kind; embed admission; the SDK same-role-merge no-op pin (§8.0);
  the per-wire finish-reason fold (every V4 / agent-sdk raw value lands in the closed tuple — `other` is a named arm, never a fallthrough);
  `db-enum-from-tuple` green on `finish_reason`/`reasoning_effort`/`cost_provenance`/`origin`; `own-tables-only` green with NO new `SCHEMA_OWNERS` row (§5.3b — `connection` maps to its domain automatically); `table-scoping-class` + `ownerid-registry` green with their FOUR new rows + the `count` bump (§4, verify7 H1).

---

## 13. Landing order (each lane green at `pnpm verify`; `pnpm verify --push` per train; sweeps include `tests/**` + `tooling/**`; the app need NOT be usable between lanes — pre-launch posture, §0)

| # | Lane | Tier | Deletes | Receipts owed |
| - | - | - | - | - |
| 1 | **Vocabulary + provider registry (contracts only):** `contracts/inference/{wires,providers,modalities,tasks,deltas}.ts` with the built-in provider rows (hyphenated ids — `custom-openai`, `claude-sub`, `local-light` — settled HERE because step 4's credential wipe rests on it, F2), `PROVIDER_ID`, `serves`, and one zod schema; `coherentApis(provider)` replaces the CLIENT mirror only; the vocabulary-map edit — EVERY word §5.3a enumerates with its user-facing spelling or its SEALED mark (`wire`/`dialect`/`binding`/`task`/`kind` sealed; `declared`/`features`/`extras`/`transport` given their pane names; `engine-down` → `endpoint-unreachable`; `anthropic` + `anthropic-messages` returned; the OR-skin row removed) + D31/D67 amendments land here | executor | `CHAT_APIS_BY_SOURCE`, `chatApisForSource`, `chatApiForSourceChange`. **`assertCoherent` STAYS server-side until step 4** (verify3 F12: it carries a second refusal, `max-pro-sub ⇒ agent-sdk`, that no provider row can express while `max-pro-sub` is still a source, and `coherentApis` takes a provider the step-1 resolver does not have — a source→provider bridge would be the shim F19 forbids); its `responses × vllm/local-light/custom_openai` hole is closed by the client no longer OFFERING those pairs, and `dispatch.test.ts:59-64` stays as the server-side pin | `connections-model.test.ts:318-322` rewritten; the `TASKS × BUILTIN_PROVIDERS × CHAT_APIS` table test; `dispatch.test.ts:59-64` green; every built-in row parses and matches `PROVIDER_ID` |
| 2 | **Every constrained caller names `structured`; one path per role (§2.8-2, §7.5-1):** `RoleClients.structured` added, `responseFormat` removed from `SummarizeOptions`, the facade sniff at `role-clients.ts:325-348` deleted; ELEVEN unconditional renames (refinery 6, discovery 4, caption 1) PLUS two CONDITIONALLY-constrained seams that become an explicit two-arm dispatch at the compose op — `automation-plugin.ts:377-379` (the `responseFormat` conditional is `:378`; `:376` is `resolveSideGenSampling` — scout-compose2) (`responseFormat` is optional on `automation/contract/ops.ts:314`; `/autobg` passes none) and `:691` (gated on `opts?.schema`): present ⇒ `rc.structured`, absent ⇒ `rc.summarize` — the ONE place the deleted facade sniff is legitimately re-homed, because those seams' own contracts make the field optional (verify8 H3); `themes/generate.ts:162` gains its posture and `analyzeAvatarImage`'s two callers (`embeddings/indexer/handlers.ts:97`, `embeddings/service.ts:35`) start passing the owner's preset params its `:77` header documents, with the `ANALYSIS_FLOOR` alias at `caption.ts:68` folded into the record name (§7.5-3, verify9 M5/L7); the 5 prose sites untouched; rpg's `compose/rpg.ts:533,563` extraction arms are LEFT ALONE by ruling (§7.5-1a) and the compose deps types narrowed to `Pick<ProviderExecutor, …>` per tier as the `tsc` enforcer; the six getters replaced by `resolved(task)` (caption reads `accepts(…, "input", "image")`, digests reads `capability.context.window`) | executor (judgment on the rpg arm and the deps narrowing — not mech) | the `responseFormat` sniff; `summarizerVision` + the other five getters | `tsc` red on any leftover `summarize(…, { responseFormat })` in `packages/server/src` (control: plant one in `entry/compose`); `pnpm ast callers structured --in packages/server/src` = **15 hits** post-sweep (the lens matches by method NAME regardless of receiver — verify8 H2: the 11 renames + the 2 dispatch arms + the facade `role-clients.ts:342` + `rpg.ts:563`), and `deps.executor.structured` specifically is STILL only the last two (the compose `Pick` fence, §7.5-1a); refinery, discovery, embeddings-caption, automation-analysis, plugin-quiet (schema arm) and rpg-extraction suites green; the `provider.structured-item` span tag observed on a caption call and a plugin schema call; a caption call on a text-only structured connection refused at resolve with `missing: ["input:image"]`, not at the wire |
| 3b | **Mocks BEFORE the schema freezes UI decisions (side-eye 8 §E-1):** three mocks under `docs/design/mocks/` driven through the same instruments as a live route — the connection LIST inside a settings body, the connection EDITOR with the four disclosure tiers (§5.3a) at 870px and 486px, the Model-roles rows with requirement badges + the persisted-resolve readout — shot at the real mount widths; the mock decides `modelListed` copy, the read-only-with-Override features tier, the inferred-kind verdict, the grouped provider picker, and whether a user-owned list inside a settings body collides with shell anatomy | executor + side-eye | | side-eye review of the three mocks with the full instrument battery (`--design-audit`, `--contrast`, `--mobile`, keyboard walk); every §5.3a copy string exists in the mock, none says "the pane says so" |
| 3 | **Capability split on the modality enum:** `contracts/inference/capability/*` with `input/output: Modality[]`, the 13 helper migrations (§2.7), `silencesProse` floor, dtype axis, `cache-control.ts` allowlist row, `EVIDENCE_TIERS` + `family-floor.ts` (§6.2), then the two gates. `UserIntent` and `ADJUSTED_KNOBS` do NOT move (§8.7 — gen settings stay on the preset, owner word); no Spine edit is owed | executor + gate lane | the `input.{vision,video,audio,file}` booleans, `outputModalities` strings | synthesis tests; gate planted controls; `pnpm check` on the fixed tree |
| 4 | **Connections become the unit — THE ONE MIGRATION of the program:** `user_connections` (branded `UserConnectionId`, `ID_PREFIX.userConnection` in `@orb/kit/ids`, F7; the `transport` column, F4; NO `budget`) + `connection_bindings` (every actor→connection ref as FK rows with the kind-shape CHECK — user / automation-rule / plugin-grant, all per-user; chats and rpg games do NOT bind; replaces settings `roleDefaults` leaves and any `connection_refs` json, D61-B6) + `provider_rows` (real columns + `features` doc, F9) + `message_variants.{connection_id (SET NULL, indexed), cost_provenance}` + CHECKs on `finish_reason`/`reasoning_effort` + `message_assets.origin` (CHECK) + `session_entries.connection_id` (CASCADE; existing rows deleted) + `imagery_generations.{provider, connection_id}` + `$type<ProviderId>()` on the three `provider` columns (§5.3b/§5.3c) + the two seeded `local-light` rows per existing user (F10); `NORMALIZED_FINISH_REASONS` moves to contracts; `ChatUsage` narrowed to the normalized core + `variantMetadataSchema.providerMetadata` for the rest; the variant/stats stamp at `compose/chat.ts:783` writes `Resolved.provider.id` + `Resolved.connectionId`; user-create seeds through a `domain/connection` injected op; `roleDefaults` LEAVES the settings json entirely (a user's per-task picks are `connection_bindings` rows with `actorKind: "user"`; `USER_SETTINGS_SCHEMA_VERSION` bumps, old leaves are dropped by `.catch(undefined)`, NO lift); `user_credentials.provider` becomes a registry id (CHECK dropped, domain-validated) and **every existing `user_credentials` row is DELETED in the migration** (F2 — the `custom_openai`→`custom-openai` respelling moves the AAD slot; a kept row decrypt-fails and #1373 revokes it); the `(owner, provider) WHERE active` unique index dropped; `providerMetadataSchema` → union keyed on `auth`, whose `endpoint` arm is the bearer key ONLY (the transforms moved to `connections.transport`); `chats.metadata.providerRouting` + `RouteChatAssignment` + the three compose reads DELETED (§7.1); `assertCoherent` deleted with the resolver it belonged to; `ConnectionRef` fold; NO default model (F16: delete `DEFAULT_CHAT_MODEL_ID`/`DEFAULT_OR_CHAT_MODEL_ID`/`healToChatDefault`/`pickOrModel` heal/`CHAT_MODELS`/`curated-shortlist`/`or-skin-tier-models`; the `ChatModelId` brand goes with the shortlist); `ROLE_SOURCE_POLICY` + `INFERENCE_SOURCES`/`SUMMARIZE_SOURCES`/`GENERATE_IMAGE_SOURCES` deleted (F14; policy = §5.7); preset `customParameters` deleted, `connections.extras` is the home (§8.1c) | forge + security-executor (credential/AAD/egress-admission reads `user_connections.baseUrl`) | listed | the migration SQL read before commit (12-step rebuild, `db-schema.md:33-35`); a fresh db boots and a wiped-connections db boots to `no-connection` everywhere except the seeded local-light rows; `tests/server/domain/connection` born-default pins REWRITTEN to `no-connection`; `pnpm ast literal` sweep for `claude-opus-4-8` + `openrouter/auto`; the client provider/source label pairs (`connections-model.ts:10-15,26-33`, `add-credential-form-model.ts:77`) become registry-driven — `Object.fromEntries(PAIRS) as Record<Tuple,…>` compiles clean when a tuple grows, so `connections-model.test.ts:299` is in the floor; **the three NODE suites that pin the retired axes and are invisible to `pnpm check` (F17):** `tests/contracts/credentials/index.contract.test.ts:26,45-57` (`CRED_PROVIDERS` equality + "source axis ≠ storage axis") rewritten against the registry, `tests/db/schema/credentials.int.test.ts:54,65,105` (the CHECK-fires probe is meaningless once the CHECK drops) rewritten; `schema-branding` green on the new table |
| 5 | `custom-parameters` + `secret-redaction` → `@orb/kit`; **the Vercel cut-over (§8.0)**: `ai` + `@ai-sdk/provider` + `@ai-sdk/openai-compatible` + `@openrouter/ai-sdk-provider` pinned in the catalog, `@openrouter/sdk` REMOVED (three sites, §8.2); the `openai-compat` backend = `model.ts` + `stream.ts` + `features.ts` + two `transports/` (`openai-compatible`, `openrouter`, each = `injectOptions` + `transformRequestBody` + `wrapFetch` + `extractMetadata` + `retry`) collapsing today's three backends into one; `EndpointFeatures` schema + the built-in rows' `features` JSON (§8.1b); `extras` merge + `transport.includeBody/excludeBody` + the assistant-image re-attachment in `transformRequestBody` (H4/H1), headers + `responseMap` in `wrapFetch`; `rerank.ts` plain fetch; the three OR plain-fetch calls (§8.2); `ChatHistoryMessage.wireMeta` + the one history converter; the curated tables converted to JSON in `capabilityOverrideSchema` + `loader.ts`; test pins re-homed per transport | forge | `backends/openrouter/`, `vllm/surfaces/`, `custom-byo/` as separate backends; the OR serializer-based wire capture; every `curated/*.ts` | D156 pins green (extras drop on OR; belt-denylist + MODELLED-WINS merge on openai-compatible, F21); a BYO `responseMap` + `excludeBody` connection pinned end-to-end against a fake non-OpenAI-shaped server; an `extras` key colliding with `reasoning_effort` PROVEN to be DROPPED with `custom_parameters_ignored{key}` and a non-colliding `chat_template_kwargs` key PROVEN to reach the wire (the H4 order pin — both only hold through `transformRequestBody`); wire-capture byte-equality per transport against the pre-collapse bodies **MODULO** the two deleted sampler defaults (`presence_penalty`/`repetition_penalty` on every preset-silent vLLM body, `vllm/surfaces/chat.ts:50,60,289-292` — §4) and the deleted thinking/prefill fields (F15), each pinned by its own before/after capture (verify3 F13); the vLLM-shaped bodies reproduced from the `vllm` row's `features` alone (control: a connection on `custom-openai` with the same `features` in `declared` produces identical bytes — proof there is no vllm code path); OR cache-placement receipt (`provider.cache`) unchanged before/after; mandatory-reasoning replay pinned in `wrapFetch`; an assistant-row image part on the wire (H1) |
| 6 | **agent-sdk wire per-user (subscription only):** `claude-sub` provider row + token credential, `USER_RUNTIME_DIR` env key + `userRuntimeDir` in `infra/storage` + create/remove on connection save/delete, per-user `CLAUDE_CONFIG_DIR`, the resolve re-keyed on the existing `funderUserId`/`triggeredBy` (not `runAsUserId`; the four compose seams + the SEVEN `resolveConnection` sites + the `checkSendAvailability` verb at `read.ts:767` + the three rpg host-resolves at `rpg.ts:1532/1694/1973` + three suppliers, all per §8.4-3), the consent belt DELETED (D19/D109(2) amended, `allowNonOwnerMaxProSub` key deleted — no lift), the OR skin DELETED (F18), in-app setup (paste token), `host-claude` cause → `runtime-missing`, Dockerfile `CLAUDE_CONFIG_DIR` line removed | security-executor | `host-token.ts` host arm, host-file adoption, `CLAUDE_BACKEND`, `mintMaxProSub`, `turn-identity.ts:47-57`, `FirewallRequest.ownerConsented`, `Dockerfile:85`, mode-2 + mode-4 env builders, `get-or-skin-tier-models` | env-builder pins; `verifyAuth` with a real token on the owner's box AS A USER CONNECTION; two users' dirs proven disjoint (a user/project/local-tier settings.json planted in user A's dir never reaches user B's spawn, and never reaches A's either: `settingSources: []` — the managed-policy tier at `/etc/claude-code` is still read, `sdk.d.ts:2640-2643`, and is not per-user); a member with no connection in a host's chat gets `no-connection`; `max-pro-sub` literal sweep (183) for the consent deletion + cause rename + skin removal |
| 6b | **vLLM as a provider + fleet yeet (before extraction):** the §4 move/delete list; `VLLM_TURNS`/`VLLM_REASONING`/thinking door/prefill special-casing deleted (F15); `engine-fleet/` in tooling with the builder + spawner + auto-sleep; `wake/` + `reachability.ts` in the openai-compat backend; every `VLLM_*` env key out of the server schema; `engineLaunch`/`vllmConcurrency`/governance-trio AppSettings deletions; `egress-admission.ts` + `internalBackendHostPorts` DELETED, `AppSettings.privateEndpointAllowlist` + its Governance row + the guard's second input (F12); the `vllm` provider row's `features` JSON (§8.1b) replaces every vLLM-named code path; D7 amended, D142 + D17-local-compute + #2421 retired | forge + security-executor (egress) | listed in §4 | `engines-compose.test.ts` regen row green; `pnpm engines` boots + auto-sleeps the dev fleet; `checkChatAvailability` int tests for no-connection/down/asleep-with-sleep-feature/asleep-without; egress tests: an allowlisted loopback endpoint is admitted for ANY user, a non-allowlisted private one is refused for the owner too, a public one rides the SSRF guard unchanged, a fresh single-user install admits `http://127.0.0.1:8703` and a fresh multi-user one refuses it (the born value, verify9 M4); `pnpm ast literal vllm` under `packages/inference/src/backends/` returns ZERO hits outside `providers.json` (planted control: a `vllm` literal in `transports/openai-compatible.ts` reds); `pnpm verify --full` (the moved fleet pins are `--full`-only); wake slice pinned with a fake engine (`seed/lib/fake-vllm.ts` re-based) |
| 6d | **Inline reply images (§6.7 — the program's largest NEW feature; verify7 H9 found it had no row):** `params.replyMedia` on the preset + its `ADJUSTED_KNOBS` member + the `keyof UserIntent` pin (`tests/contracts/chat/index.test-d.ts:159`) + the client copy mapper (§8.7's four-site rule — the drop warning's `knob` is an `AdjustedKnob`, `bus.ts:230`; verify8 M3) + the funnel's conditional `modalities` emission + its `sampling_knob_dropped` arm; the `ChatDeltaEvent { kind: "image" }` member on `contracts/chat/bus.ts` (the bus contract's one growth); the reducer's `![alt](asset:<id>)` span emission + alt mint + `storeAsset(runAsUserId, …, "generated")` + the `origin: "inline-reply"` `message_assets` row; the per-ASSET relaxation of `isUserAttachment` (`chat/substrate/wire-history.ts:67-69`) + the origin-set plumbing into `buildWireHistory` from both callers (`pipeline.ts:632`, `read.ts:1148`); the client's in-progress placeholder; the copy mapper arm at `client/src/features/chat/lib/warning-notice.ts:102` | executor + security-executor (the predicate fences external-URL exfil) | | §6.7's four receipts: an OR turn on an image-output model producing a `media` block with a minted alt; a second turn whose wire capture shows the prior assistant image as an input part; a narrator `/imagine` post in the same room NOT riding (pinned at `post-narrator-message.ts:28/:52`'s `illustration` alt stamp — `:105` is the asset-row insert — AND at the predicate); a text-only model with the knob on → the drop warning and no `modalities` on the wire |
| 6c | **`anthropic-messages` wire** (F6): the wire member + backend over `@ai-sdk/anthropic` (§8.0/§8.5), the `anthropic` provider row already shipped in step 1; `curated/anthropic.json` gains `midConversationSystem`/`historySystemRows`/`roleHandlingFloor`/`clearAt`; the assembly emits `wireMeta`; the assistant-image post-convert hook (H1) | executor (security-executor reviews the key handling) | | table test picks up the new wire automatically; a live chat + structured turn on a real key; `extras` dropped with the warning on this wire; a mid-conversation system row reaches the wire as a `system` message with `clear_at` under the FOUR beta headers (wire capture), and a `wireMeta` hint on the FIRST system row is proven inert (the SDK hoists it, §8.0); `effort: none/minimal` dropped with the warning; the same-role-merge no-op pin; an assistant-row image part on the wire |
| 7 | Package extraction with `InferenceDeps` (`providerRegistry` + `providerStore` + `connections` + `bindings` ports); `domain/connection` thinned to delegations; `SnapshotStore` port; compose rewired — INCLUDING the owner-bound `bindRoleClients(deps.ownerId)` bundle at `services.ts:503-524` and its eight context hand-offs (`:619,640,666,709,798,1259`) replaced by per-call `roleClientsFor(funder, actor?)` (§8.5b, verify9 H3; price the per-call resolve — a cache keyed on `(funder, actor, task)` per turn is the expected shape); Core-0 §6 / Tier-3b / AGENTS §6 amended; **the 72-gate population audit + 14 grant-row re-point (§12, verify3 F3)** | forge | `#foundation` imports in providers | `pnpm verify --full`; dep-cruiser; census gate; the classified list of the 72 `@server`-scoped gates (widen vs server-only) in the lane report; planted raw-`fetch` control under `packages/inference/src/backends/` reds `no-raw-egress`; every re-pointed grant row green and a stale one reds |
| 8 | Embeddings: admission, joint-space rule, transition state (`activeSpace` at the getter; `deps.embedSpace.dims`) | executor | `embedDimensionWarning` | stage-db reindex drive |
| 9 | Client, BUILT FROM THE STEP-3b MOCKS (§5.3a is the spec): the Connections group on the `user` shelf; the connection list + editor with the four disclosure tiers, inline credential mint, grouped provider picker, inferred-kind verdict, read-only "Endpoint quirks" with per-field Override, the existing row editor for "Extra request fields", "Request & response shaping" on endpoint rows with the sample-response preview, `api` control only when `apis.length > 1`, auto-label, `modelListed` copy, the inline "Admit `<host>`" affordance; the Model-roles rows with the renamed Utility row + requirement badges, the persisted-resolve readout, the inline `allowBackground` refusal + switch, "Use this connection for everything it can serve", "Add another model on this key"; the rule editor's role slot and the plugin-grant slot — NO chat override (F20); the capability panel's connection switcher; the room readouts ("running on …", per-swipe attribution, the shared-room image line); the warning-code → client-home table; `endpoint-unreachable`; `providers.available` read | executor + side-eye | the per-role source/model pickers, `SOURCE_LABELS`/`PROVIDER_LABELS` hand tables (labels come from the registry rows), the `app`-shelf placement, "Saved keys" as a first-class section | CT per host; the add-connection flow driven live for every built-in provider AND for the three §5.3a personas (OpenRouter key in one pass via "use for everything"; subscription user with the inline background refusal; self-hoster on 127.0.0.1 in single-user with no Governance trip); side-eye full battery on the built pane at 870/486px + mobile |

Ordering notes: step 4 owns the program's ONE schema migration (`packages/db/src/migrations/` holds only
`0000_baseline.sql`; two lanes emitting `0001` off the same parent is the failure `db-schema.md:36-37,46-47`
names) — every later step rebases on it and adds no DDL, which is why `connection_bindings`, `provider_rows`,
the credential wipe, the `origin` backfill and the local-light seed rows are ALL in step 4 (verify3 F7/F10/F11).
Step 1 is startable now; step 4 is startable once step 1 has landed the id spellings (F2) — nothing else gates it. 6 and 6b land BEFORE 7 so the extraction never mints
`hostClaudeConfigDir`/`processEnvSnapshot`/`superviseDetached`/`engineLaunchEnvFloor`/`repoRoot` seams only
to delete them (M9); 11 of the 38 foundation edges die in 6/6b. Steps 1–3 are pure vocabulary and land inside
today's tree; step 4 is the pivot and everything after it is written against connections, never against sources.

---

## 14. Owner forks (each collides with a recorded ruling; default stated; none is a lane default)

| # | Fork | Colliding ruling | Default in this doc |
| - | - | - | - |
| F1 | vLLM in the server: yeet the fleet machinery (keep URL client + reachability + wake-on-next-turn) vs keep the supervisor | #2421/#2423 (`43dfef6f2`), D7, Tier-3b inv 7; the CONTAINER story already has no in-image supervisor (`Dockerfile:80-82`, `c4e2b9024`) | **YEET** (owner word 2026-09-19: "just let people connect to vLLM"; keep wake-on-next-turn). The builder + spawner + auto-sleep move to tooling where `pnpm engines` already lives; #2421 is moot; D7 amended in the lane. |
| F2 | Born chat default | D142 (`vllm × chat-completions` for every principal) | **RETIRE D142** — no owner engine exists to be born onto; the default derives from the principal's own rows (§7.2). Owner word 2026-09-19. |
| F3 | Modality posture for `custom_openai` endpoints with no declaration | D143(c) | permissive + `modalitiesEstimated` (D143's input changed) |
| F4 | Make `agent` / `structured` routable rows | 2026-07-27 (`entry/compose/role-clients.ts:325-328`, "one facade, two wire roles"), D109(4); `roleDefaults.agent` is a D107 dead switch today | **NOT routable**; `ridesOn` in `TASK_DEFS`. STATED CONSEQUENCE (side-eye 8 P2-10): a subscription holder who binds `chat` to OpenRouter and holds a `claude-sub` row for agent work cannot route `agent` to it — the only remedy is re-binding chat. When `agent` becomes a live feature, either it gets its own role row or its resolution falls through to ANY `agent-sdk`-wire connection the principal holds, rather than dead-ending on chat; decide then, cheaply, because nothing routes `agent` today (`ROUTING_ROLE_KEYS` has no `agent`). |
| F5 | Let a user's own sub fund background arms (summarize/structured/quiet/compaction) | 2026-08-07 (`settings/index.ts:477-479`), D109(4), D17 | **FLIPPED** (owner word 2026-09-19): per-row `allowBackground`, default off; the rulings' premise (the OWNER's metered sub) is gone. Amend in the lane. |
| F6 | First-party Anthropic API key path | D67, `vocabulary-map.md:160-183` | **FLIPPED** (owner word 2026-09-19): vocabulary-map edit first, then source + api + backend (§8.5). |
| F7 | The `CredentialSource` axis itself (`max-pro-sub`, `vllm`, `custom_openai`, … as a routing enum) | D31 (one home), the vocabulary map's connection register, 183/587/223 literal hits | **RETIRE THE AXIS** (owner word 2026-09-19: "stop limiting based on what we have"): providers are registry rows, connections are the unit. The vocabulary map's register becomes "spoken name → provider id + wire"; `max-pro-sub` → provider `claude-sub`, `vllm` → provider `vllm`, `custom_openai` → provider `custom-openai`. `message_variants.provider` stores the provider id, branded (§5.3c). |
| F8 | Third-party PROVIDERS via plugins | `BACKEND_KEYS` closed today | **Providers are data, so a plugin may ship a row** (validated by the same schema, wire ∈ the closed `WIRES`, fenced per §5.9-1); WIRES stay closed — a plugin cannot add a backend. Say both in the contract header. |
| F9 | Which SDK carries the hosted wires: TanStack AI vs Vercel AI SDK vs hand-rolled | none | **VERCEL, DECIDED** (owner word 2026-09-19): `@ai-sdk/openai-compatible` + `@ai-sdk/anthropic` + the official `@openrouter/ai-sdk-provider`, pinned to an exact version; never its loop, UI hooks or gateway (§8.0); the SDK converters' dropped assistant `file` part is re-attached by OUR hook (verify4 H1). `@openrouter/sdk` dropped (§8.2). `agent-sdk` and `local-light` stay ours. |
| F10 | Multi-tenant tool execution under the host principal for non-owner `agent` turns | D152, D60 | sandbox + capability-factor ceiling mandatory (§8.4-2); a stricter ruling welcome |
| F11 | D17's "local compute shared with authenticated principals, count-budgeted + concurrency-capped" clause and the governance trio | D17, `entry/compose/chat.ts:1555-1660`, `transport/rate-limit.ts:44`, Governance pane | **RETIRE** — there is no owner compute; a member on the owner's URL was handed the URL. Owner word 2026-09-19. Amend D17 in the lane. |
| F12 | Private-range `baseUrl` on a per-user endpoint row (any `auth: endpoint` provider) | the egress SSRF guard (`egress.ts:14-39`); the SHIPPED owner-saved admission (`egress.ts:91-183`, `egress-admission.ts`, owner-only, no `can()` by design) | **REPLACE the owner-row derivation with a deployment allowlist** (`AppSettings.privateEndpointAllowlist` — hosts, CIDRs, and optionally `host:port`; default EMPTY on multi-user, BORN loopback under `AUTH_MODE=single-user`; §4). The owner-only derivation was a one-box premise (owner word 2026-09-19: "not specific to my box"); a per-deployment host set is the same guard with a data input and no principal comparison. `security-executor`. **LANDED, then AMENDED 2026-09-20 (owner-approved):** the first cut was host/CIDR-only, which dropped the least-privilege half the retired `internalBackendHostPorts` had and made a migrated `host:port` runbook entry SILENTLY INERT. The optional port arm restores it, strictly additively — precedence, the CIDR refusal and the no-tell rule are in the `egress.ts` header (§4). Containers were checked and do not force host-scoping. |
| F13 | By-proxy funding in group chats (D19 host-funds-the-room) and its consent belt | D17, D19, D109(2), `turn-identity.ts:47-57` | **FLIPPED** (owner word 2026-09-19): the triggering principal funds every turn; the belt is deleted (§8.4-3). Amend D19/D109(2) in the lane. |
| F14 | D39's hand-kept firewall mirror beside the derived table | D39, `firewall.ts:11-26` | **FLIPPED**: one derived table (§5.7). Amend D39 in the lane. |
| F15 | The vLLM-specific turns floor, thinking door and reasoning cell (`VLLM_TURNS`, `VLLM_REASONING`, the template door, the prefill measurement) | D143 (errs-open cells), D69 (measure-then-declare), the 2026-08-18/19 probe receipts | **DELETE** (owner word 2026-09-19: "the vllm floor has never really worked"). A user's row DECLARES turns/reasoning; template toggles ride `extras` as plain JSON, exactly like today's `customParameters` (§8.1c); effort → `reasoning_effort` iff `features.effort` says so. No vLLM-named code survives (§8.1). |
| F16 | Default models (`DEFAULT_CHAT_MODEL_ID`, `openrouter/auto`, the curated shortlist, "its default model") | D142's heal targets, `contracts/connection:439-443`, `catalog/chat-models.ts` | **DELETE** (owner word 2026-09-19): no default model anywhere; unpicked = `no-connection` + picker. |
| F17 | An in-app `claude login` (browser OAuth ceremony driven from the server) as a second subscription credential arm | nothing on the tree (5 grep hits, all operator comments) | **Out of program**; the pasted setup-token arm is the whole delta. Design it before anyone briefs it. |
| F18 | The OpenRouter agent-sdk skin (mode-2: Claude Code's runtime pointed at OpenRouter's Anthropic-compatible base URL) | D67 (`anth-direct` only through openrouter), the vocabulary map's "claude code via openrouter key" row | **DELETE** (owner word 2026-09-19: "we don't need openrouter agent sdk skin"). `agent-sdk` is the subscription's wire only; `agent` on OpenRouter is not served. |
| F19 | Back-compat during the program (lifts, dual reads, re-export hops, "thin adapter until step N") | D163's data-preservation spirit; the v7→v8 lift precedent | **NONE** (owner word 2026-09-19: pre-launch, nobody is using this, the app need not work between lanes). Schema changes are still numbered forward migrations (D163 mechanics), but they drop and create; no data is carried. |
| F20 | A per-chat connection binding | D58 ("never bind a preset to a chat; the owning feature carries the association") | **NO BINDING — D58 holds and `funderUserId` makes it moot** (owner word 2026-09-19: "chats don't bind to connections"). A room has no connection; each turn runs on its funder's `user` binding. Recorded here only because an earlier draft proposed the column; no ledger amendment needed. |
| F22 | The ALT-MINT POLICY for a model-generated inline image | none — `contracts/chat/content-blocks.ts:38` is `alt: z.string()` with no `.min(1)`, so `""` already parses (verify9 M1; an earlier draft called this a schema change — it is not) | prefer the model's caption, else the preceding prose sentence, else `""`; never a counter (side-eye 8 P1-9 — baked into canon, unfixable at render). The §6.7 reducer's rule, no zod edit. |
| F23 | `replyMedia` is global-only under D154, and it is the one gen knob whose per-room desire is strongest (an RPG room wants pictures, a help room does not) | D154 | **Global-only now** (the ruling holds); recorded as a known tension beside the per-connection-override fork in §8.7 so the first "let me turn pictures on for this room" request is a fork, not a surprise (side-eye 8 P3-4). |
| F24 | `image-embed.ts` sends the pair's TEXT part to the wire with no window clamp while `embed.ts`/`rerank.ts` clamp (#165/#173); the tree neither justifies nor flags the gap | the #165 owner ruling (clamp memory-feeding embeds only with a logged receipt) | **Clamp the text part exactly as `embed` does; images keep rerank's fast-400 backstop** (§8.1b). Two surfaces already carry the rule, so the third gets it — not a new mechanism. If the owner wants image-embed text uncapped, it is one arm of a wire-level pin, not a lane default (scout-surfaces 1). |
| F25 | **Compaction GENERATION is api-axis gated to `agent-sdk`** — `engine.ts:801-805`, a recorded owner ruling: "Stateless apis (chat-completions/responses) NEVER generate a marker — the history-budget fit hard-cap is their only trim". Under this program the fleet is gone, `anthropic-messages` is a first-class wire and most users will be on openai-compat, so the gate means the MAJORITY of connections have no compaction at all, only truncation. The marker itself is already portable (chat canon, survives an api swap; the read side is source-agnostic, D25) — only the WRITE is gated. | the api-axis ruling at `engine.ts:801-805`; D25; PD-140 | **KEEP THE GATE (owner ruling 2026-09-20, LATER WORD — this supersedes the un-gate ruling recorded earlier the same day).** Owner: "its fine that there is only gating on agent sdk for compaction, that was kinda the intent at least for now." So `engine.ts:965`/`:1078` stay as written and F25 is CLOSED without a lane. The consequence is INTENDED, not a defect, and is recorded here so nobody re-files it: on `openai-compat` and `anthropic-messages` connections there is NO compaction at all — the history-budget fit hard-cap is their only trim. Do not "fix" that on sight. The gate's own comment at `:808` still enumerates the excluded set as "(chat-completions/responses)", written when `CHAT_APIS` had three members; it now has four and `anthropic-messages` is ALSO excluded by the predicate — that COMMENT is stale even though the CODE is correct, and repairing it is the only thing F25 leaves behind. PD-140 (the marker silently dropped when the preset carries no `compact_summary` section) is NOT closed by this ruling: it is an independent read-side defect, now scoped to agent-sdk chats only, and stays filed on its own. |
| F26 | Anthropic Message Batches for the background `summarize`/`structured` rail (half price, experimental `ai`-core import) | none — audit row C7 | **DROPPED PERMANENTLY (owner ruling 2026-09-20).** We will not batch. The per-item `doGenerate` runner stays and the experimental import is not taken; C7 is recorded as decided so it is not re-opened from the SDK docs. |
| F21 | `extras` precedence on the openai-compatible transport: modelled-wins (D143(b)/D156) vs passthrough-wins | D143(b), D156, `VLLM_BELT_OWNED_PARAMETER_KEYS` (`contracts/preset/index.ts:687-696`) | **MODELLED WINS, unchanged** (§8.1; ground5 H1 caught an earlier draft reversing it with no fork). Custom-byo's passthrough inverse is retired with that backend; `transport.excludeBody` is the user's door for a rejected modelled key. Flip only by an explicit owner word. |

---

## 15. Unverified (carry into the first lanes as red-first probes)

- A live pasted `setup-token` spawn on SDK 0.3.216 with a per-spawn empty config dir (the token arm exists; not driven).
- The embed-swap read-during-reindex on the stage db.
- Whether `roleDefaults.agent` is registered anywhere the `knob-wire-coverage` gate reads.
- Whether `transformRequestBody` can carry the assistant-image re-attachment end to end (verify4 read that it
  sees the converted `messages[]` at both call sites; nobody has prototyped it) — the FIRST thing step 5 plants.
- Whether `@openrouter/ai-sdk-provider@3.1.0`'s per-message `cache_control` forwarding survives the exact
  `ai`/`@ai-sdk/provider` versions the catalog pins (an implementation read, not a typed contract).
- Whether drizzle-kit emits a clean 12-step rebuild for the CHECK/index drops plus the new CHECKs.
- Whether the Vercel openai-compatible model surfaces a malformed non-stream JSON body as an error or as an
  empty result (#1400's defect class, §8.1 survival item 2) — planted before any transport code is written.
- Whether image-embed's uncapped `pair.text` (§8.1b) has ever hung the engine the way #165 measured for
  `embed` — the clamp default stands either way; the probe decides whether the lane also owes a #165-style
  measurement receipt.
- (SETTLED by scout-providers, whole-file read of `vllm/surfaces/chat.ts` on `954c12004`: every §8.1/§8.1b line
  cite — `:50,60,289-292`, `:154-211`, `:196-211`, `:213-281`, `:244-254`, `:321-330`, `:334-339,368`,
  `:380-433` — holds; `strictByDefault`'s body is `:327-329` under its comment.)
- Project 1 Needs-owner / Parked rows touching F1–F21 (`pnpm work:item overview` before claiming).

SETTLED by verify4 (kept here so nobody re-opens them): `/imagine` posts DO write `message_assets` rows on an
assistant row (`post-narrator-message.ts:105`) — §5.3b's `illustration` arm; zero source-word readers in
`domain/stats/**`, client stats, `contracts/stats` (with control), `modelKey` vocabulary-free — the ONE reader
the vocabulary change touches is the ST EXPORT, `packages/server/src/kit/serde/chat/index.ts` — TWO writers
(`:905` the main-message line `api: m.provider`, `:942` `api: v.provider` into `swipe_info[].extra`) and TWO
readers (`:550`, plus `:678`/`:798`; scout-compose2): nothing breaks, the exported string changes vocabulary, and
the lane says so in its report — and `get-models-for-source.ts`'s only ownership read is `ctx.isOwner(principal)`
at `:85`, which sets the `max-pro-sub` arm's `state` (`ok` vs `owner-only`) and never withholds the list, so it
dies with that arm; there is NO `/v1/models` id-list fetch on the tree today (`get-models-for-source.ts:1-3`
"zero outbound fetch by construction"; the BYO id is free text via `allowsFreeText`; `needs-probe` has zero
client handlers), so endpoint listing is all-new work and, because a browser cannot reach a user's loopback,
it is a SERVER-side fetch inside the F12 admission — the pane calls a `connection.listEndpointModels` verb.

## 15b. Tree defects this program FIXES in passing (found by the passes; each is a step-4 line item)

- `tooling/src/verify/gates/own-tables-only.ts:112,118,123` cite a "`db-structure` `NON_DOMAIN_PRODUCERS`"
  that exists nowhere on the tree (repo-wide grep over `tooling/` returns only those three comments; positive
  control: the same command finds them). Re-point the three cites to the real mechanism (`SCHEMA_OWNERS` +
  the `db-structure-producer-home` reviewed grant) so no lane implements a map that is not there.
- The ST import writes `message_variants.provider` verbatim from the source file
  (`import/substrate/chat-input.ts:40,62,76` → `chat/persistence/import-write.ts:339`) and no pass before
  ground5 named it; step 4 narrows it (registry id if it parses, else `(unknown)`).
- `contracts/plugin/bridge.ts:60-61` and `contracts/chat/metadata.ts:245` describe funding belts as CONTRACT
  comments; they become false, not stale, and are outside any chat lane's diff (§5.3b sweep).

## 15c. What the six passes paid for — read before briefing a lane (the lessons live HERE, not in a memory store)

1. **A spec type permitting a shape is not a converter emitting it.** Vercel's openai-compatible and anthropic
   converters switch on `text | reasoning | tool-call` with no `default`, so an assistant `file` part the V4
   prompt type allows is dropped silently; and `providerOptions` is spread in the MIDDLE of the body, not last.
   When a change says "the SDK handles X", read the converter's switch arms and find the post-convert hook
   (`transformRequestBody`) before deciding a shape is reachable. Paid twice (verify3 F1, verify4 H1/H4).
2. **D58 has two halves.** It BANS binding config to `chats` and SANCTIONS the owning feature carrying an
   association (`rpg_games.gmPresetId` is its own live mechanism). Never cite it as "nothing about generation
   is a property of a room". Paid in two drafts (ground5 c-2/c-3).
3. **Before minting a word, grep for the tree's.** `funderUserId` already meant "the triggering principal
   whose connection pays"; the doc minted `fundedBy` beside it for three revisions (ground5 H5). Same class:
   `summarizerVision` already half-knew the caption lens needs vision; the six per-role getters were the
   tree's answer to "what did this role resolve to" (§2.8-2).
4. **An ellipsis in a denylist is where the collision hides.** Four of eight belt-owned keys sat behind a
   "…", each with a written failure mode, and the doc sold overriding one of them as a feature (ground5 H1).
   Name every member of every tuple you cite.
5. **A NOT NULL column on a table with live rows needs its backfill in the same file**, and "no data lift"
   does not cover it (ground5 H2). Read the writers of the table before adding the column.
6. **Deleting a settings key deletes the triggers that hung off it.** `roleDefaults` carried the PD-139a
   reindex trigger in its update verb; nothing in "the blob is no longer read" re-raises it (ground5 H6).
   For every deleted key: `pnpm ast callers` on its update verb before the delete.
7. **"Chat owner" does not exist** (D18); the candidates are the host (`runAsUserId`) and the caller, and
   `/blob` ownership gating makes the choice visible to users (ground5 H3).
8. **Every negative claim carries a scanned count**, and a `pnpm ast` verb's subject is positional (`ident X`,
   never `ident --x`); an exit 3 is misuse, not a clean. Grep corroborates, never decides.
9. **A `callers X --in <dir>` census inherits the directory as its blind spot, and a facade's callers live one
   tier up.** The `summarize` census run `--in packages/server/src/domain` (16/11) missed two live constrained
   callers in `entry/compose` that the `--in packages/server/src` run (23/16) finds — compose is where injected
   ops are BOUND, not where domains live (verify6 H7, verify8 M5). For an injected op or facade method: widen to
   `packages/server/src` and second-method grep the OPTION name, since the option is what a removal breaks.
10. **A bypass with a comment is a ruling, not a duplicate — and a ruling's REASONS can lapse separately.**
    `rpg.ts:563` skipped the facade for two written reasons; the doc called it duplication for two revisions
    (verify6 H9). Read the header above a bypass before scheduling its deletion — then check each reason against
    what the program deletes: the firewall reason lapses with `ROLE_SOURCE_POLICY`, the F1 reason does not, and
    the bypass survives on the one that stands.
11. **"Never re-spell" applies to enums you are extending, not just ones you are citing.** `cost_provenance`
    minted `reported` beside `token_provenance`'s `measured` on the same table (verify6 M4); the fix was to reuse
    the tuple AND its combinator (`combineTokenProvenance`).
12. **A new drizzle table is never "one barrel edit".** `table-scoping-class` (hard, no waiver) reds
    UNCLASSIFIED without a `TABLE_SCOPING_ROWS` row; a new `ownerId` needs an `OWNERID_CLASSIFICATIONS` row AND
    a bump of that gate's exact `count` literal. `own-tables-only`'s `SCHEMA_OWNERS` is the one NOT needed when
    a same-named domain exists — the fact everyone finds first and then over-generalises (verify7 H1). Derive
    the arrival set from the gates that read `DRIZZLE_SCHEMA_POPULATION`, never from a doc's list.
13. **A census claim is a RUN, never arithmetic over a narrower run.** "16 + 2 = 18" printed with a scanned
    count nobody produced at that scope; the real run was 23/16 (verify7 H2). If the epilogue is quoted, the
    command was executed with those args.
14. **Fixing a count is not re-deriving the set — and re-deriving it inside ONE FILE is not re-deriving it.**
    "five seams, not six" left four `resolveConnection` sites in the same file unnamed (verify7 M1); the fix
    listed those and left `read.ts:447` and `compaction.ts:262` unnamed (verify8 H1); THAT fix then filed the
    neighbouring verb that actually chooses the pre-send gate's id (`read.ts:767`, a `checkSendAvailability`
    caller) into the WRONG census, so a "SEVEN sites" list enumerated eight (verify9 H1) — and the whole
    `resolveConnection` family was blind to three host resolves reached under `deps.connection.resolveChat`
    in `entry/compose/rpg.ts` (verify9 H2). A corrected number owes the list it counts AND the verb that
    produced each row, checked per row against the run's own output lines, from a repo-scoped census run
    once per VERB NAME the seam is reached under.
15. **A receipt must be re-derived when its deliverable grows.** Step 2's receipt ("`callers structured` = 2
    and nothing else") was copied from the pre-sweep tree; after the 13 renames the same command returns 15,
    so the receipt could only pass on unfinished work (verify8 H2). The lens matches by method NAME regardless
    of receiver. Tell: the receipt and the deliverable cite the same command with the same args.
16. **A conditionally-constrained seam is a dispatch, not a rename.** Two of the 13 "constrained" sites carry
    an OPTIONAL `responseFormat`; renaming them routes prose to `structured`. Read the option's TYPE, not just
    its presence at one call (verify8 H3).
17. **"The tree's current wiring" is a claim about the BINDER, not the call sites.** §8.5b listed each side
    call's funder as "the trigger" while one owner-bound `RoleClients` bundle (`services.ts:524`) served all
    of them today; the rows were right about the program and wrong about the tree (verify9 H3). Before calling
    a table "today's wiring", find who BINDS the bundle each row reads from.
18. **BUILD LOG, 2026-09-19 (the package as built — deviations from the text above, each with its reason;
    the code is the doc, this is the delta):**
    - *Data rows are `.ts` modules, not JSON* (owner word: "avoid weak JSON"). `contracts/inference/
      builtin-providers.ts` and `capability/sources/curated/*.ts` are `as const satisfies readonly <Input>[]`
      — `tsc` checks a row at authoring time AND the same zod parses it at load, so a plugin/admin row and a
      shipped row still go through ONE parser. Every "`providers.json`" / "`curated/*.json`" above reads as
      the `.ts` twin.
    - *`BACKEND_DEFS.needs` is a predicate, not a `keyof InferenceDeps` list*: the one real need is nested
      (`env.claudeExecutable`), which a top-level key list cannot spell. It returns the missing need's name.
    - *OpenRouter's catalog is THREE lists, and `kind` is the output modality* (measured against the live API
      - raw SDK 1.1.8, owner correction): the bare `GET /models` EXCLUDES embedding and rerank models; they
        come from `GET /models?output_modalities=embeddings` / `?output_modalities=rerank`, and a row's
        `architecture.output_modalities` (`["embeddings"]`, `["rerank"]`) IS its kind — no name regex. The §5.7
        "kindOf = catalog row kind (OpenRouter only)" line holds, with that derivation. OpenRouter also answers
        `POST /rerank` in the vLLM shape, so its row carries `features.rerankPath: "/rerank"` and serves the whole
        wire set (an earlier build narrowed it — wrong). The OR-list serve-`rerank` rule is now the table test:
        every openai-compat row that serves rerank names its path.
    - *Pins*: `@openrouter/ai-sdk-provider` stays 3.0.0 — 3.1.0 was published inside the repo's 24h
      `minimumReleaseAge` supply-chain window (the `pnpm-workspace.yaml` comment already says so; forcing past
      the gate is an owner call); `@huggingface/transformers` ^4.3.0 (mature); the four Vercel packages were
      already at latest.
    - *Step 4 landed as a REGENERATED BASELINE, not a forward migration* (owner word 2026-09-20: "we haven't
      launched, you can just make the change and delete and remake the db"). This overrides the 2026-09-18
      frozen-baseline ruling (`.claude/rules/db-schema.md`, D163 mechanics, `DB_LAUNCHED = true`) for THIS
      landing: `0000_baseline.sql` + `meta/` were regenerated from the schema, the dev db is wiped with
      `pnpm seed:demo --fresh`. The rule file itself is left as written — it is the post-launch law and the
      owner's word was a pre-launch exception, recorded here. **BROADENED 2026-09-20 to a STANDING posture, and the chain SQUASHED under it** (owner: "db can be freely nuked and remade whenever" + "please squash shit into baseline"): the exception is no longer scoped to this one landing, so a schema change in this program regenerates rather than stacking a forward migration. It had already cost one — the record lane read the "THIS landing" wording as binding and landed `0002` as "the launched-regime procedure, never a regenerated baseline". `0001` (the `revoked_reason` CHECK) and `0002` (`reasoning_parts` / `reasoning_tokens` / `cost_details`) are now FOLDED INTO `0000_baseline.sql` — one journal entry, `meta/` regenerated, both changes verified present in the squashed SQL, `check:drizzle-kit` and `check:db-baseline` green, dev db reseeded with `pnpm seed:demo --fresh`. Neither folded migration carried a data backfill (`0002` was three bare `ADD COLUMN`s; `0001`'s four `INSERT`/`UPDATE`s were SQLite's 12-step rebuild copies, the only way to add a CHECK), which is what made the fold safe. TWO THINGS DELIBERATELY NOT DONE: (1) `.claude/rules/db-schema.md` is UNTOUCHED — it is the post-launch law, its own text retires the squash era, and the exception belongs here rather than in the rule; (2) `DB_LAUNCHED` stays `true` in `entry/boot/migrate.ts`. Flipping it to `false` would make a divergence AUTO-RESET (drop + re-migrate, all data dropped) instead of refusing loudly, which is data loss by default rather than by decision, and no production caller passes `false` today. So the cost of a squash is a LOUD boot refusal until the developer runs `pnpm seed:demo --fresh` on purpose — which is the right trade and is what happened here. A lane that regenerates again must decide what to do with any forward migrations sitting on top of the baseline; after this squash there are none. What the schema carries: the three new
      tables (`connection.ts` + `connection-bindings.ts`, split ONLY to break an import cycle through
      `automation.ts`/`plugin.ts` → `chat.ts` → `user_connections`), `message_variants.{connection_id,
      cost_provenance}` + CHECKs on `finish_reason`/`reasoning_effort`, `message_assets.origin` (NOT NULL, all
      three writers stamp it), `session_entries.connection_id` (NULLABLE until the per-user agent-sdk writer
      lands — the pre-cutover writer has no connection to name; the `(chat, connection) WHERE is_primary`
      partial unique is in), `imagery_generations.{provider, connection_id}`, the credentials `provider`
      CHECK + active-slot unique DROPPED (the `active` column and the `CRED_PROVIDERS` typing survive until the
      credentials-domain cut-over; the three `provider` columns are not yet `$type<ProviderId>()` for the same
      reason). The local-light seed is a BOOT step (`entry/boot/seed-local-light.ts` over the
      `domain/connection` verb `seedLocalLightConnections`, idempotent by `(owner_id, label)`) rather than
      SQL — a TypeID suffix is not mintable in SQLite — and covers every existing user on the first boot.
    - *`finish_reason` vs `stop_reason`, settled* (owner question 2026-09-20): they are the same FACT in two
      spellings — `finish_reason` is the closed normalized tuple every wire folds onto (CHECK-enforced, the only
      one code branches on), `stop_reason` the raw upstream word kept so an `other` can be debugged. The one
      site that compared the RAW word (`engine.ts` `emptyGenerationMessage`) now reads the normalized member
      only; `stop_reason`/`terminal_reason` have ZERO branching readers on the tree (census `pnpm ast ident`),
      which is what "opaque provenance" means. `MessageView.finishReason`, `TurnEconomics.finishReason` and the
      canon-write chain are typed `NormalizedFinishReason | null`; `reasoningEffort` is `EffortLevel | null`.
    - *`api: "responses"` is RETIRED — the member is DROPPED* (owner ruling 2026-09-20, closing the fork this
      entry used to state as open). The history is the part that matters, because it is the premise a future
      reader will get wrong: `responses` was NOT an unbuilt transport. It was a WORKING feature — a 523-line
      runner that lived at infra/providers/backends/openrouter/runners/chat/responses.ts on the pre-cutover
      tree (the path is deliberately un-backticked: it no longer exists, and `146f71cd5^` is where to read it)
      running a full turn over OpenRouter's GA Responses API via `@openrouter/sdk`'s `responses.send`, with its
      own stream reducer and view→`ChatResult` mapper because the Responses event/usage shapes differ from
      chat-completions. It was
      DEMOLISHED AS COLLATERAL in `146f71cd5`: this program dropped `@openrouter/sdk` wholesale (§8.2, F9) and
      the runner went with the dependency. The replacement `@openrouter/ai-sdk-provider` speaks
      chat-completions, and the AI SDK's Responses transport is a DIFFERENT model (`@ai-sdk/openai`'s
      `.responses()`) that was never wired. So the vocabulary outlived the implementation by exactly one
      refactor, and a listed member whose only possible outcome was a typed refusal at send is a trap for the
      user (pick it, save a connection, every turn fails) and for the next reader of `CHAT_APIS` (who assumes
      four working protocols). Retired: the `CHAT_APIS` member, `WIRE_DEFS["openai-compat"].apis`, the
      openrouter row's `apis`, the `ChatRequest` arm, the openai-compat typed refusal, the curated
      `api: "responses"` capability row, the client api-picker label, the `user_connections.api` CHECK
      (forward migration `0001_retire_responses_api`), and `backends/kit/reasoning-budget.ts` + its
      importer-less `backends/kit/index.ts` barrel (`effortToResponsesReasoning` was that module's chain head;
      `effortToOpenAIReasoning`/`OPENAI_EFFORT_LEVELS` had no call site either). **If reviving it is ever
      wanted, the honest path is `@ai-sdk/openai`'s `.responses()` transport — not restoring the deleted
      runner, which is written against a dependency this package no longer has.** One visible consequence:
      OpenRouter was the only provider listing two apis, so `showsApiControl` (§5.3a) is now false for every
      provider and the api control never renders.
    - *`Resolved.ownerId`* is the CONNECTION ROW's owner (the funder), never a box owner — no `isOwner` /
      `role === "owner"` read exists in `packages/inference` or `contracts/inference`; the resolver refuses
      (and records a security event for) a binding that names a stranger's row.
    - *`kit/custom-parameters` is CALLED, not just moved*: `body.ts`'s extras merge routes through
      `deepMergeRequestBody` — a raw spread of user-authored extras is exactly the Layer-2 hole it closes
      (the first draft spread it; the importer census caught it).
    - *A hosted-URL rule keyed on `auth` was wrong for the subscription*: the agent-sdk wire is a subprocess,
      so its `oauthToken` row carries no base URL; the schema refine keys on the WIRE.
    - *Availability orders `runtime-missing` before `unavailable`* for the agent-sdk wire — the unbuilt wire
      and the missing runtime are the same fact, and only one of the two causes is actionable.
    - *`requirementMet` on dims honours MRL*: a wider MRL model FITS a narrower space (it truncates); only a
      narrower model fails `dims:N`.
    - *Local-light's prefetch `start(targets)` is the COMPOSITION ROOT's call* — the runtime exposes the
      handle; which slots actually resolved is known where bindings are read, not inside the package.
    - *Biome vs eslint on a three-arm union*: biome cannot narrow a cross-module discriminated union in a
      `switch` (every arm unreachable) and eslint refuses a third `if` on an already-narrowed remainder; the
      house shape is two `if`s + a bare tail, exhaustive because a fourth arm makes the tail's property read
      a `tsc` error.
    - *BUILD LOG, 2026-09-20 (steps 2 + 6/6b + 7 landed on the server tree; the client + the test tree
      are the open half):*
      - *The getter collapse (§7.5-1b) is `RoleClients.resolved(task)`* and every domain reads its facts
        through a per-domain substrate: `refinery/substrate/summarizer.ts` (`summarizerFactsOf`),
        `search/substrate/space.ts` (`requireSpaceModel`), `embeddings/substrate/task-model.ts`,
        `databank/substrate/active-space.ts`. A caller with no binding is the domain's own `no-connection`
        class — `RefineryNotConfiguredError`, `DiscoveryNotConfiguredError`, `DatabankNoEmbedSpaceError`,
        `SEARCH_NO_SPACE` — never a default model.

      - *`theme_name` joined `SIDE_GEN_POSTURES`* (`{ temperature: 0.3, maxOutputTokens: 24 }`): the one caller
        that passed no options (§7.5-3, verify9 M5) now folds the funder's preset beneath it.

      - *Vector tasks are OWNER-scoped, and the owner is the ENTITY's* (a card's, an asset's, a document's, a
        chat's HOST): `MemoryQueryOptions.ownerId`, `DocumentSearchParams.ownerId` and
        `DatabankGatherParams.hostUserId` are new contract fields; `MemoryScope` stays owner-free (D20), so the
        compose seam resolves the chat host from `chat_participants` for every digest/segment write and read
        (`searchDigests`/`searchCorpus`/`embeddingsStore`/`embeddingsStoreSegments`). A hostless room writes
        and reads nothing (leak-free). Under the old box-wide embedder this question never existed.

      - *Every workload's funder is `WorkloadRunContext.userId`* (the row's owner, or the synthetic `system` id
        on a scheduler row). A scheduler BULK pass therefore runs summarize-class work under a principal with
        no bindings and lands `no-connection` — honest, and the reason a bulk refinery/discovery/memory pass
        wants an acting human. `funderUserId` is threaded through `ScoreSweepOptions`, `ComputeThemesOptions`,
        `DistillCharactersOptions` and chat's `CorpusSweepArgs`.

      - *The composition root* (`entry/compose/services.ts`) builds `createInferenceRuntime` over
        `createConnectionPorts({ db, now })` (the four ports, `domain/connection` stays the writer), publishes
        the F12 allowlist from the resolved config, resolves the funder Principal through
        `createHostPrincipalResolver` and hands every seam ONE binder: `roleClientsFor(funderUserId)`. The
        seams that used to take `roleClients`/`bindRoleClients`/`embedModel` (assets-character,
        search-discovery, refinery, admin, imagery, databank, chat, automation-plugin) take it instead;
        the purged `entry/compose/role-clients.ts` + `provider-credential.ts` are deleted. `ServicesResult` surfaces
        `runtime` + `roleClientsFor`; `vllmEngine`/`localLightPrefetch`/`roleClients`/`bindRoleClients` are gone.

      - *`resolveClaudeExecutable()` is SDK MODULE RESOLUTION*: this `@anthropic-ai/claude-agent-sdk` ships no
        `cli.js` on disk (`extractFromBunfs`), so "the runtime resolves" = the SDK entry resolves; `null` ⇒
        the wire is unbuilt (`runtime-missing`). Returns `null`, not `undefined`, because biome's
        `noUselessUndefined` autofix deletes a `return undefined` and tsc's `noImplicitReturns` then reds it.

      - *`ChatRequest` carries `connection: Resolved<"chat">`* (provider row, credential, folded features,
        extras, capability); the compose bridge dispatches on the connection's own `api` over FOUR arms
        (agent-sdk seed+prompt, chat-completions / responses / anthropic-messages history) and refuses a
        `null` api as an invariant. `TurnEconomics` gained `connectionId` + `costProvenance`, threaded through
        `EconomicsCommon` and `canon-write`'s `VariantEconomics` onto the new variant columns; `provider` is
        the registry id.

      - *The member budget belt + `resolveTurnPolicy` are gone from `ChatServiceDeps`* (F11/F13);
        `resolveConnection`/`checkSendAvailability` are funder-keyed; `summarizerContextTokens`/
        `embedContextTokens` read the funder's resolved capability (a `NoConnectionError` when unbound).

      - *`WireCapture.backend` → `wire` + `providerId`* (foundation) and the debug filter follows; the
        `/api/_debug/vllm/metrics` route + `VllmMetricsInspector` are deleted with the fleet.

      - *Databank's embed space is per owner and ASYNC* (`getActiveEmbedSpace(ownerId)`); a count read on an
        owner with no binding uses `NO_EMBED_SPACE_MODEL` (`""`, a tag no chunk carries) and answers zero.
        The PD-139(b)/(c) old-space purges after a BULK sweep run PER CORPUS OWNER at compose
        (`listCorpusOwners`) until step 8's `activeSpace` getter lands.

      - *The local-light prefetch plan reads the BOX OWNER's bindings only* (`principals: [owner]` — there is
        no user enumeration on `sessions`); §8.3's per-row download state is step 9's.

      - *Deleted instruments*: the seven `scripts/probes/sdk-*` probes (every one drove the deleted host-file
        / OR-skin env arms) + their `sdk:*` package scripts, and the purged `scripts/probes/st-goldens/capture-orbweaver.ts`
        (raw `createOpenRouterBackend` + the retired budget/skin seams; the parity protocol is retired). The seed
        tooling's `fake-vllm.ts` is `fake-local-light.ts` — a scripted `LocalLightModelCache` injected via
        `providerSeams.localLight.cache`; the demo's best-effort chat turns log `no-connection` (no scripted
        chat wire any more).

      - *The admin `vllm` verbs, `VllmSupervisorPort`, `AdminEngineStatus`, the engine router procedures* are
        deleted (§4); the verbs-tier `kind.ts` and `toResolvedView` moved to `packages/server/src/domain/connection/substrate/` (the
        `domain-no-cross-verb` cruiser rule); the JSON-schema sanitizer has TWO homes today —
        `@orb/kit/json-schema` `scrubWireSchema` (per wire mode) and the agent-sdk `sanitizeAnthropicOutputSchema`
        — not the `backends/kit/clean-json-schema.ts` §4 named; a merge is a follow-up.

      - *The CLIENT COMPILE PASS (the pre-step-9 minimum, landed 2026-09-20)*: `packages/client` typechecks
        clean against the new contracts; what it is and is not. DELETED: the admin Engines / Compute /
        Shared-access sections (+ their nav rows, `useRestartEngine`/`useUpdateAppSettings`, the engine
        test-ids, the `nonOwnerLocalComputeBudgetWindowMs` + `engineLaunch.*` tuning knobs), the credentials
        feature's host-Claude section, endpoint-inspector dialog, per-role source/model pickers
        (`role-slot-row`, `model-picker`, `use-role-source-models`, `use-connections-form`), the
        add-credential dialog + its form model, the preset `customParameters` editor + model + the
        `preset-editor-model` arms. REWRITTEN (`features/credentials/`, the directory name kept for now):
        `connections-model.ts` = `ROLE_ROWS` keyed on `RoutableTask` (client render order; the Utility row
        copy), `providerPickerItems(available)` grouped by the row's `auth` with an unavailable row DISABLED
        - its reason, `showsApiControl` (`apis.length > 1`), `bindRefusal`/`persistedRoleLabel`; a NEW
          Connections LIST section (rows: label · provider · model · task badges · the `allowBackground`
          switch · "Use for everything it can serve" · confirmed remove) + an "Add a connection" dialog
          (provider → URL and/or key → model with the SERVER-SIDE `listEndpointModels` "List models" arm and
          the typed-id fallback copy → api control only when >1 → label → background switch; the key is
          minted into a credential row FIRST with the connection's label, then the row references it — the
          validator reads a DERIVED `auth` form value the provider field's change listener writes, because the
          factory validator runs at module scope); Model roles = one `Select` per routable task over the
          user's COMPATIBLE rows → `setBinding`, beside the persisted readout from `listBindings` (which now
          returns ONE view per routable task, bound or not, carrying `task`); Saved keys = the read-only reuse
          view (label · provider · "used by N connections" · revoke pair · remove — no set-active, no test,
          no add). The group moved to the `user` shelf. `MessageView.connectionId` is NEW (the read projection
          selects it; fork copies it) and the cost readout keys `connection.generationCost({ connectionId,
          generationId })`. The admin catalog section keeps ONE refresher (`refreshCatalog({ providerId:
          "openrouter" })`); the agent-sdk one is gone (§4 callout). `capability.data.capability` is the KIND
          union now, narrowed by `chatCapabilityOf()` (`features/preset/lib/chat-capability.ts`) before the
          params deck reads it. The OpenRouter balance tile is DROPPED (credits are a per-CONNECTION diagnostic,
          `connection.accountCredits({ connectionId })`; a per-row tile is step 9's). NOT this pass (step 9,
          built from the 3b mocks): the four disclosure tiers (declared / features / extras / transport
          editors), the inline "Admit `<host>`" affordance, the hosted-row model picker off `catalogModels`
          (the dialog takes a TYPED id for hosted rows today), requirement badges, "Add another model on this
          key", the capability panel's connection switcher, the room readouts, and the D120 config-section
          registry (`config-section-registry.ts` etc. is NOT deleted — only the engine rows left it; §4's
          "deleted" line for the door is withdrawn on the tree's evidence: every other section rides it).
          Dependency hygiene in the same pass: `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`,
          `@huggingface/transformers`, `@openrouter/sdk` leave `packages/server/package.json` (they live in
          `@orb/inference`); `@openrouter/sdk` leaves the catalog + `allowBuilds` (§8.2's three sites); the
          knip `nvidia-smi`/`ss` binaries row moved from the server to tooling with the fleet;
          `tests/support/matchers.ts` imports `ProviderError` from `@orb/inference`.

      - *THE TEST-TREE CUT-OVER (2026-09-20, WIP at `dd39b45bd`; four worktree lanes finishing the ~127-error
        residual)*. What worked: a DIAGNOSTIC-DRIVEN codemod (`scripts/codemods/inference-test-cutover.ts`)
        run off a `tsc -p tsconfig.json --noEmit --pretty false` LOG by line/column — NOT off the codemod kit's
        own ts-morph project, whose glob-built resolution (no vitest globals, looser subpath resolution) hides
        most of the funder/ProviderId sites. It filled `funderUserId`/`hostUserId`/`ownerId`/`modalities` from
        the nearest in-scope funder identifier (with a describe-level `let owner` fallback), deleted retired
        properties by (name × receiving type) allowlist, cast `ProviderId` literals and repointed the
        purged `infra/providers` imports: ~290 edits over ~70 files in four rounds, each round re-measured. Two
        lessons paid for: every plan's TRANSFORM runs at the plan boundary, so every diagnostic must be
        resolved to its node BEFORE the first `ctx.plan` (round three aborted on a shifted position); and a
        text insertion into a literal that already ends with a comma must strip it (a `,,` shipped once).
        The hand pass: `tests/support/factories/resolved-connection.ts` is `makeResolved` /
        `makeCapability` / `makeGenerationCapability` / `makeResolvedSecret` / `makeApiKeySecret` /
        `makeResolvedView`; `tests/support/factories/role-clients.ts` is the ONE scripted `RoleClients`
        (with `structured` + `resolved(task)`) every domain harness hands through `roleClientsFor`; chat's
        `asSummarizeOp(fn)` lifts a `(inputs, opts)` fake onto the funder-keyed op. DELETED, subjects gone:
        the backend-matrix + memory-recall live e2e, the four-layer wire-capture fidelity harness (it pinned
        the deleted backends' bytes — the re-home under `tests/inference/backends/openai-compat` is owed),
        the vLLM gen-window parity + admin vllm + the purged `tests/contracts/connection` suites, every
        `customParameters` / consent-belt / budget / `routing`-blob / OR-skin / resolver-heal pin, the
        credentials router inspector test and the six client CT/model specs of the deleted components.
        REWRITTEN: credentials `resolve` (by-id semantics), the client connections model, the local-light
        prefetch planner, the db-schema + contracts credentials suites. `MessageView.connectionId` and the
        `listBindings` one-view-per-routable-task change rode this pass.

      - *OWNER RULINGS 2026-09-20 (posed after the three audit lanes were cut, folded here + into the audit)*:
        (1) **A1 re-rated P1 → P2 and re-worded** — its 400 symptom was refuted by four live probes; the
        replay defect was real and shipped. A stickler row's SYMPTOM is as re-derivable as its mechanism,
        and inheriting a severity without probing it is how a non-blocker becomes a launch blocker.
        (2) **`carryReasoning` ships BOTH rungs** (§8.8), split by SEAM — storage in one lane, policy +
        the `wire-history.ts` materialization in the other — not by rung.
        (3) **C6's premise was the owner's correction, not the audit's finding**: compaction GENERATION is
        api-axis gated to `agent-sdk` (`engine.ts:801-805`), so the Anthropic wire has no compaction at
        all. Both arms taken — expose Anthropic's `contextManagement` as an extras key (cb-audit-doors)
        AND un-gate our own generation (fork F25, its own lane, PD-140 in scope with it).
        (4) **C7 Message Batches DROPPED permanently** (fork F26) — recorded as decided, not deleted, so
        the SDK docs do not re-open it.

      - *Still open on this landing*: step 9 proper (above), the runtime (vitest/CT) verdict on the rewritten
        tree, the D-ledger amendments, and the vocabulary-map edit.

      - *REASONING IS A CONTENT PART NOW* (2026-09-20, audit A1/H4): `ChatContentPart` gained
        `{ type:"reasoning", text, meta }` where `meta` is a CLOSED per-wire object in contracts
        (`ReasoningPartMeta`: `anthropic.{signature,redactedData}` · `openrouter.reasoningDetails`), the V4
        reducer accumulates one block per SDK part `id`, `ChatResult.reasoningParts` carries them out, and
        `v4/prompt.ts` writes them back as a V4 `reasoning` part with the PART-LEVEL `providerOptions` each
        converter reads. THREE stream parts carry provenance, not the two the audit named — `reasoning-start`
        is where `@ai-sdk/anthropic` puts `redactedData` (dist `index.js:5133-5145`), `reasoning-delta` the
        `signature` (`:5639-5651`), `reasoning-end` the OR `reasoning_details` (OR dist `:4070-4080`) — so the
        reducer folds metadata on all three. A block with NO provenance is DROPPED rather than replayed: both
        converters refuse one (the anthropic converter warns and discards, the OR converter strips an unsigned
        entry), so carrying it would manufacture a part that cannot ride. The SDK's `JSONValue` admits
        `undefined`-valued properties and ours does not, so the OR details list crosses the seam through
        `jsonValueSchema` (parse-on-read), never a cast. PERSISTENCE of `reasoningParts` is the record lane's.

      - *A1's 400 DID NOT REPRODUCE, and the fix landed anyway* (live probes 2026-09-20, `ANTHROPIC_PROBE_KEY`
        / `OPENROUTER_PROBE_KEY`). A thinking+tool loop whose second leg OMITS the thinking block answered
        **200** on every arm probed: `claude-opus-4-5` + `thinking.enabled` (req_011CfEBGcgbeHUCTihPoc661),
        the same under `interleaved-thinking-2025-05-14` (req_011CfEBJjtkANdE67dtK7fqZ), `claude-opus-5`
        adaptive (req_011CfEBJZyw7WGC6JV6dSP4n), and `google/gemini-3-flash-preview` via OR
        (`gen-1789883934-f8FjzXjAcKdw3R1KliDg`). So the audit's "400s on both Anthropic paths" is REFUTED as a
        symptom. The defect is still real and still P1-shaped: the replay is what the providers' own SDKs are
        built to carry (OR strips unsigned entries and warns), and the measured behavioural delta is that a
        replayed leg CONTINUES THINKING (req_011CfEBJoxZy8KZifA8xi4Br returns a fresh signed thinking block)
        while the amnesiac leg does not. Treat A1 as "the model loses its verified reasoning every tool hop",
        not "the turn 400s".

      - *A7 IS REFUTED — the anthropic transport gets NO assistant-image `shapeBody`* (live probe 2026-09-20).
        The audit is right that the header's stated reason was false (`wrapFetch.shapeBody` IS a post-convert
        hook), but the FIX would ship a guaranteed 400: `messages.1.content: 'image' blocks are not permitted
        within assistant turns` (req_011CfEBBYooCmJyWSAv45UPL; the identical body without the block is 200,
        req_011CfEBBZzjfJ88KQ58U3qzi). The drop + `image_edit_dropped` stay; only the false premise was
        rewritten, with the request ids in the file header. Second-order finding the audit row also assumed
        away: the anthropic converter GROUPS consecutive same-role rows into ONE wire message
        (`groupIntoBlocks`, dist `index.js:3585`) and hoists the leading system block out of `messages[]`, so
        the openai-compat `reattachRows` plan-index walk is not transferable to this wire in any case.

      - *D1 landed in `wrapFetch`, not at the `doStream` result.* The `init.body` that wrapper parses IS the
        post-`transformRequestBody` payload AND is downstream of our own `shapeBody`, so it is strictly more
        faithful than the SDK result's `request.body`; and the wrapper holds the `Response`, so
        `responseHeaders` rides the SAME ring entry rather than a second correlated row. The capture moved
        from before the send to after the attempt; a transport failure still records the request with no
        headers to claim.

      - *The three new `WARNING_CODES` do not all MATCH a chat kind.* `sdk_unsupported_tool` → the existing
        `tools_unsupported`; `sdk_unsupported_setting` → the existing `sampling_knob_dropped` adjustment (same
        user sentence, `knob` riding through); `sdk_compatibility` needed a NEW
        `PROVIDER_ADJUSTMENT_KINDS` member, `provider_compatibility_mode`, because "the provider substituted
        its own value" is not the "wasn't used" sentence the ten drop classes share. That makes it the first
        chat adjustment kind with no identically-spelled infra twin, so `engine.test.ts`'s match census now
        excludes it by name and pins the translation instead. Also fixed in passing there: the "EVERY infra
        code reaches the bus" census expected an event for `declared_overrides_measured`, which
        `emitCapabilityDropWarnings` has always filtered by the §5.3a ruling — an inherited red, now an
        explicit "must stay off the turn stream" assertion.

      - *B4's display default lives in the FUNNEL* (`resolveChat`), not in the anthropic transport: the funnel
        is the one place reasoning policy is decided ("the policy already ran in the funnel"), and the default
        is inert on the OR route because that transport spells no display at all. `reasoningRedacted` now
        derives ONLY from a real `redactedData` part.

      - *E2's camel `providerOptions` key is only OBSERVABLE once A3 lands* — the SDK's deprecation is a
        `deprecated` warning nobody read. Its pin is therefore a defect proof only in that order, verified by
        reverting the key with A3 in place (the turn then carries `the provider reports "providerOptions key
        'custom-openai'" as deprecated: Use 'customOpenai' instead.`).

      - *BUILD LOG, 2026-09-20 (lane cb-audit-record — the RECORD-TRUTH rows of the AI-SDK integration audit;
        design, receipts and rejected arms in `../design/inference-record-truth-2026-09-20.md`)*: (1) `sampling`
        is a REPLACE key in the fold — a stated SET, never a patch: an empty measured `{}` could not subtract an
        advertised range under the one-level merge (B3; the same rule makes a `declared.sampling` the whole list);
        (2) the measured tier has a `match`-based loader (`capability/sources/measured/loader.ts` over the shared
        `sources/rows.ts` compiler — `resolve-task.ts` used to hand `MEASURED_ANTHROPIC` WHOLESALE to every
        anthropic-family id, so a per-model measurement was inexpressible) and its first rows are
        `measured/openrouter.ts` (opus-5, opus-4.8: OR advertises `temperature` and strips it upstream, measured
        by `echo_upstream_body`); (3) a curated `claude-opus-5` row now exists — before it the id resolved as
        NON-reasoning on the direct wire; the SDK-table ids carry `sampling: {}` and the fable/mythos cell
        `reasoning.mandatory: true` (A8, a measured 400); (4) `verbosity` is never derived from OR's
        `supported_parameters` (inverted on that knob, H1a) — it is a curated/measured statement; (5)
        `message_variants.{reasoning_tokens, cost_details}` land by FORWARD migration `0002` (two `ADD COLUMN`s,
        the launched-regime procedure, never a regenerated baseline); `costDetailsSchema` is zod-first in
        `contracts/inference/usage.ts` with an OPTIONAL phase split — Anthropic reports a total only, and a
        required split would fabricate a `0` into a `measured` record (a deviation from the brief's spelling) —
        and the BYOK arm keys on OR's `usage.raw.is_byok` (A4: `cost` is the gateway fee there); (6)
        `ChatResult.appliedEffort` (REQUIRED) is what the wire CARRIED in the preset vocabulary, read back off
        the built options on every wire; compose folds it onto `reasoningEffort`, the requested value stays in
        `params` (B1); (7) `generation_id` is the provider's response id on every hosted wire (Anthropic `msg_…`,
        B7) — the client cost-readout gate (`message-metadata-row.tsx:151`, `message-cost-readout.tsx:42`) is the
        orchestrator's follow-up; (8) rate-limit headers → `ChatResult.rateLimit` through ONE kit parser over the
        two OBSERVED families (Anthropic per-axis / OpenAI-style suffixed) plus `retry-after`; OpenRouter sent no
        rate-limit header on a 200, so its unsuffixed family is documented, not parsed (B6); (9) A5 rides the
        EXISTING `refusal` ChatEvent member (`contract/events.ts` — the audit's "new member" premise was stale)
        from the anthropic call site via `anthropic-messages/refusal.ts`; (10) H2 measured on gpt-5-mini (400 on
        `max_tokens`, 400 on `temperature ≠ 1`, 200 with `max_completion_tokens` + `reasoning_effort`): arm (a) —
        `EndpointFeatures.outputCapField` + body-shaper rule 8 on the `openai` row and a curated `sampling: {}`
        gpt-5/o-series row; the `@ai-sdk/openai` `.responses()` transport stays a written fork; (11) the
        `inference-model-regex-fence` gate two comments cited does not exist on the tree — the one-compile-home
        rule is prose, now spelled at `sources/rows.ts`; (12) A1's STORAGE landed (owner scope ruling: the
        record lane owns the durable home, `carryReasoning` owns the read path): a `message_variants.reasoning_parts`
        typed-JSON column in the same `0002` migration — replay MATERIAL the assembly reads back, not
        provider-opaque provenance, so a column and not the `metadata` sidecar — threaded
        `ChatResult.reasoningParts` → `TurnEconomics` → compose → engine → canon-write (NULL when nothing
        replayable; a continue REPLACES them with the continuation's, only the last generation's signed blocks
        replay; fork class `member-projected`, the P3 cut `reasoning` takes). The funnel knob, the converter
        carry and `wire-history.ts`'s re-materialization ahead of the tool-call part are the doors lane's.

      - *BUILD LOG, 2026-09-20 (lane cb-audit-doors — §8.8 reasoning CARRY, both rungs, plus the audit's C/D
        doors)*: (1) the `conversation` rung reads its stored parts through a DEDICATED query
        (`loadCanonReasoningParts`) and an injected, LAZY `loadReasoningParts` op, NOT a `MessageView` column.
        A column was tried first and refused for two reasons, both measured: `MessageView` crosses the tRPC
        boundary, so every client would receive KBs of provider-opaque signatures on every history read and the
        deception-game strip would grow a second arm to keep them from a non-host member; and tRPC's output
        inference DROPS an array's `readonly` when the element carries an optional property, so
        `reasoningParts` on the view broke the client's own cache writer under `exactOptionalPropertyTypes`
        (`toolCalls` survives because every field of `ToolCallRecord` is required). The read fires only on the
        `conversation` rung, so every other turn performs none. (2) `ReasoningPartMeta` + a NAMED
        `ChatReasoningPart` MOVED `chat/bus.ts` → `chat/messages.ts`, and `ChatContentPart`'s reasoning arm now
        references the named type: `messages.ts` owns the column's parse seam and the import may only run
        bus → messages (bus already reads `MessageView`; three gates refuse the cycle). (3) `wireCostText` now
        prices a replayed reasoning part's PROSE — it is real prompt bytes, unlike a media URL, and a carry the
        fit valued at zero overflows the window it was fitted to; the opaque provenance is not estimated.
        (4) The carry policy has ONE home (`resolveCarryReasoning`) with TWO readers: the funnel folds its drop
        warning onto the turn, and the chat engine calls it with a throwaway sink because it must know the rung
        BEFORE the first wire call (the `conversation` materialization happens at the history-build seam). The
        mandatory-effort clamp is therefore re-derived there and its warning deliberately discarded — one
        decision, one notice. (5) C2's allowlist REFUSES `mcpServers`, `container` and `toolStreaming` with a
        stated reason (all three make the PROVIDER act — an egress decision, a provider-side tool executor
        against D152, and a stream kind our reducer discards); `metadata.userId` is a SHA-256 digest of the
        connection owner under a fixed non-secret domain string, never the raw TypeID. (6) C3's `plugins` merge
        strips a user's `context-compression` entry BEFORE the union parse, because that id is deliberately
        absent from the modelled union and leaving it in would fail the whole block with a generic message.
        (7) The F-table "Adopt" row landed with TWO fences: `extractReasoningMiddleware` applies only where
        `features.reasoningKeys` is absent AND the preset's tag pair is XML-shaped — the middleware builds
        `<name>`/`</name>` itself, so a user's `[thinking]` pair is inexpressible and is left to the engine's
        post-hoc split, which is a boundary and not a gap. (8) **D2/D3 REFUSED, with the receipt**: the audit's
        fix shape is "the reducer forwards `raw` parts to the capture sink", and the sink cannot take them —
        `emitCapture` fires in `wrapFetch` immediately after the response headers arrive, BEFORE the body
        streams, so a post-stream payload has no entry to ride. Landing it needs a `WireCaptureSink` redesign
        (a second entry shape, or a deferred emit) whose live reader is the `/api/_debug/wire/captures`
        surface, outside this lane. Also worth re-deriving before that ticket: OR's `debug.echo_upstream_body`
        rides the ordinary SSE once the body flag is set, so `includeRawChunks` is what the SDK needs to
        SURFACE it as a part, not what our capture needs to SEE it.\*

      - *THE CHAT-DOMAIN RUNTIME REDS (2026-09-20, lane cb-chat-reds — `tests/server/domain/chat`, 13 failures
        → 0 / 2382 passing)*. Five pins DELETED, subjects gone: the engine's four belt-refusal pins
        (`budget exhausted → budget_exceeded` ×2 and `max-pro-sub … without consent → consent_required` ×2,
        F11/F13) and `requestTurn`'s WALL 4 (consent, F13) — the seam's header now names two walls, not four.
        Three pins KEPT with only their dead half dropped: the stats-attribution pin loses its
        `debitBudget` assertion and keeps `buildTurnStatsDeltas`' `runAsUserId` keying (§8.4-3, unchanged);
        the concurrent-drain pin loses "no double-spend" and keeps exactly-once CLAIMING; `requestTurn`'s
        FIRES/SPENDS/STAMPS pin loses SPENDS. The drain's TEMPORAL-requeue pin was RE-POINTED rather than
        deleted — its subject is the non-permanent class itself, so it now drives the other documented member
        (a provider outage) instead of the retired budget throw. Both test harnesses carried an INERT
        `debitBudget` (neither was ever handed to `createTurnEngine`/`createTurn` after the belt left
        `ChatServiceDeps`), removed with the pins. Three fixture repairs the cut-over left: provider ids
        `custom_openai` → `custom-openai` and `max-pro-sub` → `claude-sub` (§5.2/§7.2 — `makeResolved` throws
        on an unknown registry id, which failed the whole credential-strikeout FILE and hid a second red);
        that file's `SearchContext` double still wired `roleClients` and needed `roleClientsFor` +
        `makeFakeRoleClients` (§7.5-1b); and the recovered-turn fixture spread `tools` onto the Capability
        ROOT where it belongs on the GENERATION descriptor, which left the wire tool-less and the prose-less
        RECOVERY unreachable (the turn refused with `empty_generation`). NEW seeder `seedConnection` in
        chat's `_support.ts`: `message_variants.connection_id` (§5.3b) is a real FK, and any pin driving the
        REAL compose bridge — which stamps `TurnEconomics.connectionId` off the resolved connection — now
        fails the commit batch with `SQLITE_CONSTRAINT_FOREIGNKEY` unless the `user_connections` row exists.
        NOT fixed (product-side residue, reported not touched): `CHAT_OP_CODES.budgetExceeded` survives with
        no raiser and carries the orphaned `consent_required` JSDoc above it; `verbs/turn.ts`'s
        `isDrainVerdictDrop` header + `requestTurn`'s four-wall JSDoc still describe the deleted belts.

      - *THE RECORD-TRUTH TAIL (2026-09-20, lane cb-record-tail — the follow-ups
        `inference-record-truth-2026-09-20.md` §4 named, plus the residue the chat-reds lane reported above)*.
        **B7's client half:** the per-message cost reveal now gates on the provider's DIALECT, not on
        `generationId`'s presence — `canRevealGenerationCost` in `message-cost-readout.tsx`, read by the
        readout AND by the metadata row that hands it a slot. Once the column became the provider's response
        id on every hosted wire, an Anthropic swipe carried a `msg_…` there and offered a button whose only
        possible outcome was `requireOpenRouter`'s typed refusal. A non-builtin provider id resolves no
        dialect and is HIDDEN (the client has no synchronous registry for plugin/admin rows; hiding a working
        button beats spending a paid call that refuses). This also repaired three CTs that had been RED since
        `connectionId` joined the gate — the story never set one, so the subject rendered nothing — and a
        stale `connection.orGenerationCost` proc name in the same file.
        **The compose seam:** `warningChunks` forwarded `warning` only, so the `refusal` ChatEvent (the
        anthropic wire's, and the agent-sdk's since it was written) died there. It now crosses as its OWN
        `TurnStreamChunk` kind — not a `ResolvedWarning`, because `WARNING_CODES` is the resolve/wire DROP
        vocabulary and a refusal is the model's verdict, not a degrade of our settings — collected across
        recursion depths by the pipeline and emitted as the new `provider_refused` chat warning.
        PAYLOAD-FREE and that is a constraint, not a preference: a `warning` bus member may carry only enum
        literals and plain scalars (the bus-payload allowlist + the `index.test-d.ts` anchor pins), and
        `category`/`explanation`/`fallbackModel` are raw provider strings — they stay on `ChatResult.events`
        for the wire-outcome ring. **`rate_limit` was REFUSED at the same seam, with reasons:** it is an
        operator signal about account headroom on a turn that SUCCEEDED, its payload is raw provider strings,
        and it already has a home (the `provider.rate_limit` log line). Telling every member of a room that
        the host is at 80% of a rate limit mid-story is noise, not honesty; the same reasoning covers
        `compaction`/`api_retry`/`status`/`auth_status`/`model_downgrade`/`permission_leak`, and the bridge's
        header now states the ruling so the next lane does not re-derive it.
        **The residue:** `CHAT_OP_CODES.budgetExceeded` DELETED (no raiser anywhere on the tree, and the
        orphaned `consent_required` JSDoc above it went with it — `ChatOpCode` is a derived union with no
        client spelling of `budget_exceeded`); the eight drifted comments repaired to describe what the code
        does now (`turn.ts`'s drain-verdict header, its drain-one header, the re-queue comment + log line,
        `requestTurn`'s wall list, `contract/params.ts`, `contract/context.ts` ×2,
        `automation/contract/ops.ts`, `rpg/contract/service.ts`); and `drainOne`'s
        `err instanceof ChatNotFoundError ? "chat-gone" : "consent"` ternary, whose else arm the same fork
        made unreachable, collapsed to the literal (the notification contract keeps both reasons).
        **Coverage:** deleting the consent drop-pin had removed the ONLY test of the deferred-turn drain's
        `dropped` arm; it is re-pinned on the live path (a HOSTLESS room → `loadRoom`'s `ChatNotFoundError`
        → claim, notify the frozen `triggeredBy` with `reason: "chat-gone"`, row stays deleted), proven by a
        planted control (`isDrainVerdictDrop` forced false → that one test reds, 123/124 still pass).

      - *BUILD LOG, 2026-09-20 (lane cb-barrier-cites — the CITATION tail: every living-doc cite the
        extraction broke).* The `dangling-ref-citations` (44) and `ledger-symbol-liveness` (15) findings
        are cleared by RE-DERIVING each target, never by re-prefixing it: paths that MOVED were re-pointed
        (agent-sdk session/env, `backends/kit/retry.ts`, the fleet templates + `engine-url.ts` to
        `tooling/src/stack/lib/engine-fleet/`, the extras belt to `backends/openai-compat/body.ts`), and
        cites whose FACT is gone were rewritten rather than aimed at a lookalike: the consent belt, the D17
        member budget, the OR agent-sdk skin, the engine supervisor + `ENGINES_POSTURE`, the per-role
        firewall table, `deriveRunner`/`BACKEND_KEYS`, `CRED_SOURCES`/`CRED_PROVIDERS`, the `source` axis.
        LEDGER AMENDMENTS landed with the forks that ruled them: D7 (vLLM is a provider row; the fleet is
        tooling, F1), D8 (moved), D39 (`local-light` is a WIRE, its task policy derived, F7/F14), D109-4
        (one executor method, no firewall row, and the subscription wire DOES serve `structured`), D112
        (the `silencesProse` floor is endpoint-keyed, not vendor-keyed), D129(B) (the turns cell is curated
        data), D135 clause G (the binder folded into `entry/compose/services.ts`), D142 RETIRED (F2), D143
        (wire-level extras; the vllm turns cell DELETED, F15), D156 RE-HOMED (the custom-BYO
        passthrough-wins inverse is retired, F21). `vocabulary-map.md`'s connection register — the ONE home
        for which word names which connection — was REWRITTEN on (provider × api) per F7/F6/F18; it still
        published the 6-mode `(api × source)` canon and the "claude code via openrouter key" row.
        **Gate-side debts this surfaced and did NOT fix (they are gate edits, not doc edits):**
        `providers-runner-seal` seals symbols that no longer exist anywhere, so it passes VACUOUSLY;
        `warning-code-coverage` still binds `WARNING_CODES` to the deleted server home and WITHHOLDS;
        `no-raw-egress` is `population: "@server"`, so every credentialed/loopback egress under
        `packages/inference/src/backends/` is now judged by NOTHING and seven of its eight grants alarm
        stale; the six `content-part-seam` per-file grants still name deleted files. **Test debt:** the
        binder's own provenance pin and the agent-sdk idle-timeout fake-timer pin were deleted with their
        sources and have no successor, and `tests/server/entry/boot/local-light-prefetch-*.suite.int.test.ts`
        still poll `/api/trpc/admin.vllmEngines`, a procedure that no longer exists.

      - *BUILD LOG, 2026-09-20 (lane cb-compose-harness — the 8 compose/boot harnesses the cut-over left
        red; 16 tests, all green, `0c7fbde35`)*. Three families, and the SECOND one paid for a trap worth
        the whole lane. (1) The unit harnesses handed the retired `roleClients`/`embedModel`/
        `bindRoleClients` bundle; they now hand a `roleClientsFor(funderUserId)` fake matching each seam's
        actual `Pick<RoleClientsWithSignal, …>` slice. `refinery.test.ts`'s `WORKLOAD_KEYS` pin went from
        seven members to the true SIX — `roleClientsFor` replaced BOTH `summarize` and the
        `summarizerContextTokens` thunk — and the assertion stayed `toStrictEqual` over the exact key set;
        the header comment was rewritten to keep the pin's ORIGINAL reason (a role re-point must take
        effect on the next call, which the getter collapse preserves by threading the binder verbatim).
        (2) The composed-real files were fixed by SEEDING `user_connections` + `connection_bindings`
        through the real per-funder fold — never by weakening a pin — because no default connection exists
        any more (F2/F16, D142 retired): #759's `PresetNotFoundError` degrade needed a `summarize`
        connection, the D53 ReDoS pair needed an `embed` binding (databank's `search.documents` resolves
        the binding BEFORE checking whether the room has a scope at all, and with no attached documents
        the zero-embed-calls short-circuit then fires, so no HTTP double was needed), and
        `peekPrompt`'s multi-human persona arms needed a `chat` binding for the host.
        **THE TRAP, and it generalises far past this lane: a `vi.spyOn(globalThis, "fetch")` inside a test
        body is DEAD for anything the shared `app`/`services` fixture already built.** `buildBackends`
        resolves `deps.sdkFetch ?? globalThis.fetch` ONCE, synchronously, during the fixture's own
        `createServices()` — which vitest runs BEFORE the test callback — so the captured reference
        predates any spy the body installs. Proven live and ugly: the unmocked run reached a REAL
        listening vLLM engine on the box's `:8703` and came back with its real "model does not exist"
        answer. A composed-real test that needs a faked wire must build its OWN
        `createServices({ providerSeams: { sdkFetch } })` rather than use the shared fixture. This is the
        THIRD independent receipt that production never injects `sdkFetch` (see the F12/egress note
        below): the doc's §11 calls it "the egress-guarded fetch every provider receives", the gate-reach
        lane found the two ambient `fetch` sites, and this lane found a test silently reaching live infra
        through the same hole. The belt that actually holds is the boot-installed global undici
        dispatcher (`infra/network/egress.ts:8-16,295`, `entry/lifecycle.ts:330`, `EGRESS_FIREWALL`
        defaults true), whose DNS-lookup override closes the rebinding TOCTOU — so this is a
        DOC-VS-TREE divergence and a test-determinism hazard, NOT an SSRF hole. The clean fix is to make
        `sdkFetch` REQUIRED and inject it at the composition root (the `no-raw-clock:entry-lifecycle`
        precedent); until then every composed-real test is one missing seam away from live inference.
        *LANDED, 2026-09-20 (lane cb-sdk-fetch).* `sdkFetch` is required, the two `?? globalThis.fetch`
        fallbacks are gone, the root injects the ambient transport under the reviewed grant
        `no-raw-egress:entry-compose-transport`, and the shared `app` fixture defaults `providerFetch` to a
        refusing fake. The type change surfaced exactly ONE construction site — the composition root; both
        test harnesses (`tests/inference/_support.ts`, `tests/server/domain/connection/_support.ts`) already
        passed one. §11 above is corrected accordingly.
        (3) The two boot suites polled `admin.vllmEngines`, deleted with the admin Engines surface. The
        tRPC-round-trip half now polls the pre-existing PUBLIC `health` procedure (`router.ts:44`) and the
        download-in-flight half reads the injected cache double's own `preloads` record — the literal
        call the runtime made, which is a STRONGER proof than the deleted admin read-model ever was.
        **FINDING, since RULED ON (2026-09-20, `2fb1a8e8d`): `runtime.localLight.prefetch.status()`/`retry()`
        has NO tRPC route post-cutover** (census over `domain/admin`, `transport`, `foundation` came back
        clean). The lane filed it as a step-9 gap because §8.3 then specified a per-row `downloading / ready /
        failed` readout and `entry/boot/local-light-prefetch.ts`'s header promised the pane rendered it. The
        owner questioned whether the prefetch needs a surface at all, and the code settled it — the prefetch
        is a non-blocking latency optimisation whose failure path is automatic, so there is no user-actionable
        state. §8.3's pane line is STRUCK and the absence of a route is now deliberate; see that section. The
        lane was right about the tree and right to file it; the answer was to delete the requirement rather
        than build it. Its SECOND half stands unfixed: same drift class as the chat-reds lane's stale JSDoc
        residue, `entry/compose/admin.ts`'s docstring still describes a `vllmEngine`/`localLightPrefetch` dep
        the real `AdminComposeDeps` no longer has.

      - *BUILD LOG, 2026-09-20 (lane cb-gate-reach — §12's EXTRACTION AUDIT, the step-7 deliverable that was
        never done; it closes every gate-side debt the cb-barrier-cites bullet above lists).* `@inference`
        already existed as a population root (`tooling/src/verify/contract/population.ts`, landed with the
        cut-over `146f71cd5`, classified `authored: true`, a member of `@authored`) — so policies scoped
        `@authored` were never blind, and the hole was exactly the `"@server"`-scoped set, **73 gate files**
        (`/usr/bin/grep -rln '"@server"' tooling/src/verify/gates/*.ts`; §12 said 72, measured 73 on this tree).
        Each was classified on WHAT IT ENFORCES, from its header, never batched. **WIDENED — 13** (12 of the 73
        plus `content-part-seam`, whose population is `@packages`, not `@server`): `assumes-single-replica`
        (§12 named it), `content-part-seam`, `entry-synthetic-role-is-user`,
        `no-caller-user-id`, `no-handwritten-wire-json-schema`, `no-manual-token-estimate`, `no-raw-egress`,
        `no-rejected-cors-proxy`, `one-principal-mint-population`, `owner-role-split`, `sole-env-reader`,
        `warning-code-coverage`, `wire-schema-vocab-one-home`. **RETIRED — 1**: `providers-runner-seal`.
        **WIDEN-BLOCKED, reported not done — 5**: `brand-in-name-position`, `no-inline-types`,
        `detached-work-traced` (+ its `-health` sibling), `test-presence`. **SERVER-ONLY — 55**, in four reason classes, each class a property of the
        PACKAGE rather than of the gate: (A) the policy is fenced by `under:` to a server TIER directory the
        package has no analogue of — `bus-channel-primitive`, `chat-viewer-plane-canon-reads` (+`-health`),
        `contract-derives-not-respells`, `contract-verb-presence`, `discovery-no-stats-rollups`,
        `domain-freshness-plane`, `infra-auth-no-userid`, `membership-enforcer`, `membership-fan-guard`,
        `membership-write-fan`, `no-direct-users-read`, `no-hardcoded-side-gen-sampling`,
        `no-inline-domain-interface`, `own-tables-only`, `plugin-dump-guard`, `public-route-body-cap`
        (+`-health`), `single-stream-transport`, `turn-identity`, `two-class-role-authority`,
        `types-in-contract`, `untrusted-regex-safe-exec`, `verb-naming`; (B) the subject is a DRIZZLE fact and
        `@orb/inference` declares no `@orb/db`, so it is unreachable at RESOLVE time — physics one rung above a
        gate — `assets-single-writer`, `json-column-write-parity` (+`-health`), `lifecycle-portability`,
        `open-json-column-key-parity` (+`-health`, +`-deferred`), `owner-scoped-reads`, `owner-scoped-upserts`,
        `owner-scoped-writes`, `vector-scope-derived`; (C) the subject is a symbol or vocabulary declared ABOVE
        the package, which it cannot import without an upward dependency — `bounded-list-limit` (a tRPC list
        input), `bus-belt-total`, `bus-consumer-belt`, `bus-definition-belts`, `bus-fact-health`,
        `bus-producer-coverage`, `user-bus-deferred-member` (the package emits through injected ops and names
        no bus union — measured zero), `external-id-single-writer` (+`-health`), `firehose-import-allowlist`
        (+`-health`), `injected-op-caller-param` (+`-health`), `knob-wire-coverage`,
        `message-kind-policy-coverage`, `no-default-props` (no React), `serde-core-definition-uniqueness`,
        `serde-core-seal` (+`-health`, the package does no card serde — measured zero); (D) the selector can
        never match a path under `packages/inference/src/` — `test-factory-contract` (`under:
        tests/support/factories/**`). EVERY widening was MEASURED by a real `pnpm check:structure` run and kept only on the
        result — which is how `brand-in-name-position` ended up in the BLOCKED column: a source grep said zero,
        the RUN said 32, and a grep is not a measurement. Eleven of the thirteen that stayed land at ZERO new
        findings, so they are SEALS over a clean tree rather than debt discoveries — worth exactly as much as
        the day their subject arrives. **The three that were not free:**
        · `warning-code-coverage` needed THREE coupled sites, and no one of them works alone: the policy's own
        population, the SHARED `tupleVocabularyFact` population (without it the index never sees the
        declaration to answer with), and the channel row's `home`/`emitScope`. Its 14 fixture paths moved too —
        a fixture under the dead directory admits zero paths and REFUSES for empty population, which proves
        nothing. Un-blinded, it then produced FOUR findings of which THREE were its own reader lying, each a
        shape the extraction made dominant: `args.warnings.push(…)` (the accumulator as a parameter FIELD; the
        reader demanded a bare identifier), `.map((f) => ({ code, message }))` (the object is an arrow's
        concise body and `getFirstAncestorByKind(CallExpression)` found the `.map` on the far side of a function
        boundary), and `code: isTool ? "a" : "b"` (a ternary, the ONLY emit site either `sdk_unsupported_tool`
        or `sdk_unsupported_setting` has). All three are fixed with a `mustPass` row that dies if the fix is
        cut, plus a `mustFlag` narrowing control proving an IMPORTED bag named `warnings` is still not the
        accumulator. The FOURTH was REAL: `smart_arbitration_degraded` sat in `WARNING_CODES` with no emitter
        anywhere in the package — arbitration is a chat concern, the chat vocabulary already carries and emits
        the code directly, and the inference member existed only to be mapped. Deleted, with its now-impossible
        `toChatWarning` arm (`engine.ts`), which `tsc` couples.
        · `no-raw-egress` — the security half. `packages/inference/src/backends/**` became the tree's primary
        credentialed-egress surface and was judged by NOTHING; SEVEN of its eight grants went stale in the same
        move, and a stale-grant ALARM is not a finding, so nothing failed loudly. Re-pointed: the two ambient
        `deps.sdkFetch ?? globalThis.fetch` defaults (`index.ts`, `registry/backends.ts`). Retired: the two
        `custom-byo` rows and `agent-sdk-host-token` (modules deleted), and the three vLLM engine-plane rows —
        NOT re-pointed, because that plane moved to `tooling/src/stack/lib/engine-fleet/` and following it would
        have widened an SSRF policy into the instrument tree by side effect. RECORDED, because a reader will
        otherwise look for the belt in the wrong place: §11 above calls `sdkFetch` "the egress-guarded fetch
        every provider instance receives", but `InferenceSeams` (`entry/compose/services.ts:157`) makes it a
        TEST-ONLY override and the production `createInferenceRuntime` call passes none. The actual belt is one
        layer down and is live — `installEgressFirewall()` swaps undici's GLOBAL dispatcher at
        `entry/lifecycle.ts:330` with `EGRESS_FIREWALL` defaulting true, and `infra/network/egress.ts:8-16`
        names PROVIDER CALLS as exactly the class it backstops. The doc-vs-tree divergence is the finding; the
        clean-up is to make `sdkFetch` required and inject at the composition root.
        · `providers-runner-seal` RETIRED rather than re-aimed, a five-site edit (module · the
        `origin-server-family` conformance suite · the `Core-Enforcement-Active-Gates.md` row AND its count
        344→343 · a Retired row in `history/Core-Enforcement-Deferred-Dropped.md` · the `provider-vocab`
        deferred row that claimed to be HELD BY it), plus three prose sweeps. Its four sealed symbols and their
        declaration home ceased to exist, so it passed VACUOUSLY — a false clean. **The seal moved UP the
        ladder, which is where constitution §2.2 wants it:** `@orb/inference`'s exports map is `{".":
        "./src/index.ts", "./*": "./src/*/index.ts"}` and `src/registry/` has no `index.ts`, so `BACKEND_DEFS`
        is unreachable from any package. Control, both directions in ONE run: a throwaway module under
        `packages/server/src/domain/` importing `@orb/inference/registry/backends.ts` went
        RED at TWO tiers — `tsc TS2307 Cannot find module` and dependency-cruiser `not-to-unresolvable` — while
        `import { WARNING_CODES } from "@orb/inference"` in the SAME file resolved clean.
        **The four WIDEN-BLOCKED rows, each a fileable question rather than a note:** (0) `brand-in-name-position`
        — widened, MEASURED at 32 findings under `packages/inference/src/`, reverted in the same lane. ELEVEN are
        `sessionId`, a pure NAME COLLISION the census cannot see past: kit's `SessionId` is `TypeIdOf<"session">`,
        the BFF session ROW id, while the package's is the Claude Agent SDK daemon's chat-session handle — two
        vocabularies the constitution separates by name (§5.1) and one brand. TWENTY-ONE are `modelId`, a genuine
        gap (`ModelId` is `Branded<"ModelId">` and means exactly these values) that this program's own §4 step 4
        complicates by deleting the adjacent `ChatModelId` brand with the curated shortlist. The ruling that
        unblocks it covers both halves: do the daemon's session handle and the provider's model id carry kit
        brands, or are they foreign ids waived once per declaration? Until it is taken, a widening could only
        land as 32 waivers, and a waiver added to make a gate pass is the banned escape hatch. (1)
        `no-inline-types` —
        `packages/inference/src/` is not a type home under Spine §7.4's structural list, so widening reds every
        exported type alias outside `src/contract/` (`InferenceDeps`, `BackendDef`, `BuiltBackends`, …). The
        ruling that unblocks it: is a below-server package's own `contract/` directory a §7.4 type home? (2)
        `detached-work-traced` (+`-health`) — the package DOES carry the A1 shape twice
        (`backends/local-light/model-cache.ts:235`, `backends/openai-compat/reachability.ts:120`), but the
        remedy is a supervised-detach boundary declared in `#foundation/observability`, which the package cannot
        import. The ruling that unblocks it: does the package get a detach boundary through `deps.span`, and is
        that shape derivable by `lib/detached-work.ts`? (3) `test-presence` — its ARMS are keyed on the server
        TIER vocabulary (`domain/<d>/verbs/`, `persistence/`, `contract/`, `infra/`), and the package uses
        `backends/ capability/ catalog/ contract/ funnel/ registry/ resolve/ roles/`. Adding the root would
        admit ~104 files no arm recognizes — a no-op widening that LOOKS like coverage, which is worse than
        none. What it needs is a sibling policy with inference-tier arms, sized against `tests/inference/`.
        **Also cleared, same class, found by this lane rather than briefed:** `content-part-seam`'s six per-file
        grants (four of the old runner subjects no longer exist at all; the survivors became
        `inference-contract-chat`, `inference-backend-kit-history`, and a NEW `inference-v4-prompt` for the V4
        prompt converter's media lift), and two `knob-wire-coverage` rows whose subjects the program deleted
        (`EffectiveAppConfig.allowNonOwnerLocalCompute`, `chatMetadataSchema.providerRouting`) — each retired at
        exactly the condition its own `endsWhen` named.
19. **A destination file named in a scope sentence owes its own behaviour rows.** §8.1b named
    `{embed,rerank,image-embed}.ts` as the surviving trio and then cited only two of them; the third had a
    different request shape, its own retry site and NO clamp, and no pass caught it until a scout read the file
    in full (scout-surfaces 1). Same shape as lesson 14: naming a file is not reading it. And the collapse of a
    backend into "SDK + transport" owes an inventory of the backend's NON-body controls (redirect pin, parse
    refusal, capture scrub, error-body cap, degrade warnings) — the body is the part the SDK replaces; the rest is
    the part a lane forgets.

## 16. Glossary

wire (how bytes are spelled; one backend each; the only code axis) · provider (a registry ROW: wire + dialect +
auth + catalog strategy; built-in or added) · dialect (WHICH TRANSPORT PACKAGE speaks the openai-compat wire — `openai-compatible` or `openrouter`; a server's quirks are `features`, §8.1b) · connection
(a user's row: provider + credential + model + declared overrides + extras + spend flags; the unit every actor
references) · modality (`text | image | video | audio | file | vector`) · task · kind · api · capability ·
evidence tier (`EVIDENCE_TIERS`, §6.2 — the one spelling) · discipline (the agent-sdk wire's per-turn
SDK option set) · `funderUserId` (the tree's own name for the triggering principal whose connection pays,
`chat.requestTurn`; `runAsUserId` stays the host's assembly scope; `fundedBy` in earlier drafts = this).
