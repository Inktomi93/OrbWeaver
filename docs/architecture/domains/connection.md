# Orbweaver — `connection`: selection conductor + capability descriptor

> **Status: planning.** Target spec for the `connection` domain. This is the **NEW** domain that
> absorbs neo-tavern's `domain/models` (the catalog seam) and owns ALL of what was fragmented across
> `domain/chat/routing.ts`, `domain/_shared/role-clients{,−binder}.ts`, three `derive*Profile`
> dispatchers, two capability systems (`ChatModel` + `FAMILY_CAPS`), and the per-role hard-pin binder.
> **Part II of this doc (below)** is the capability-descriptor + selection-conductor design (merged
> 2026-06-25 from the former top-level `connection.md` — one home per topic). Upstream:
> `tiers/providers.md` (the sealed-backend contract) + `domains.md §"connection ↔ providers boundary"`;
> `structure.md §4` defines the 8-slot template; `_FANOUT-BRIEF.md §7.5` the exhaustive-dispatch spine.
> Part I (next) is the per-domain layout + movement table.

---

## What this domain owns

**Selection, not execution.** `connection` resolves, per turn or per role, the four-tuple
`{backend, model, credential, capability}` and hands `infra/providers` a request. It contains
**zero execution logic** (no sessions, no env vars, no wire shaping — those are sealed inside the
provider backends).

Concretely, `connection` owns:

- **`resolveRole(role, ctx)` — the one resolver for all 7 roles:**
  `chat · agent · embed · rerank · imageEmbed · summarize · generateImage`.
  Reads `userSettings.routing.roleDefaults.<role>` + the per-agent override → returns
  `{backend, model, credential, capability}` for that role. No per-role hard-pin; every role
  can point at any backend the user's hardware/wallet supports. The per-agent connection axis
  (`participants-agents-identity.md §2`) is resolved here: if the agent participant carries its
  own backend/model override, that wins over the role default.

- **`resolveModelCapability(model, backend)` — the ONE capability descriptor per (model, backend).**
  Curated for the Claude shortlist (`CHAT_MODELS`); synthesized from OR catalog
  `supportedParameters` + family otherwise; static for vLLM; **user-declared for custom/BYO**. Replaces
  `ChatModel` + `FAMILY_CAPS` + the three `derive*Profile` functions (OR/vLLM/custom-openai). Produces a
  `ModelCapability` value (defined in `@orb/contracts`) carrying distinct axes for reasoning /
  sampling / verbosity / output / context. Sits **inside `connection`'s `catalog/` subsystem** —
  connection holds the OR snapshot, so it synthesizes without reaching into provider internals — and is
  surfaced to the client through the connection catalog endpoint; the panel iterates the descriptor, never
  re-hardcodes slider ranges. The infra translator receives the resolved descriptor **on the request**
  (it never imports the factory — infra→domain is illegal upward).

- **The model catalog:** the curated Claude catalog (`CHAT_MODELS`, `getChatModel`, `DEFAULT_CHAT_MODEL_ID`)
  + the OR model catalog snapshot (fetched, stored in the `settings` KV row as
  `'openrouter-model-catalog'`, refreshed on a daily workload). Today both live in
  `providers/_shared/chat-models.ts` and `domain/models/`. In orbweaver they are `connection`'s
  catalog verbs (read/refresh snapshot) — the catalog is "what connections can pick from."

- **`RoutableChat` resolution:** the overlay logic (`chat row api/source/model` ← `UserSettings`
  defaults ← heal-to-default) that today lives in `domain/chat/routing.ts`. The
  `resolveTurnRouting` function becomes `connection.resolveRole('chat', ctx)` wired
  from the chat domain at the composition root. The per-field overlay (chat-row fields →
  UserSettings defaults → system default) stays but is expressed cleanly without re-spelling the
  `api/source` union literals 6+ times.

- **The active embed-space setting:** the embed model ID that defines the vector space for the
  embeddings domain. Changing it to a *different model/dim* triggers the re-index workload
  (`tiers/providers.md §2b`); same-model-different-backend is a free switch. `connection`
  owns the setting and the re-index trigger; `embeddings` owns the store.

- **The `user_settings` routing fields** (`routing.roleDefaults.*`) — consumed but NOT owned by
  `connection`. These are read from `settings.UserSettings` (the `settings` domain owns the KV);
  `connection` projects them into resolved connections.

This domain does **not** own: execution (runners, env vars, wire shaping — `infra/providers`);
credential resolve/CRUD (`credentials` domain injects `credentials.resolve`); session state (agent-sdk
sessions are backend-internal); embedding vectors (`embeddings` domain); generation config (preset).
The `runner` / `family` internal vocab never leaves `infra/providers` — `connection` speaks only the
user vocab `{api, source, model}` + the `ModelCapability` descriptor.

---

## The 8-slot layout

```
domain/connection/
├── index.ts                        FRONT DOOR — the only legal external import
├── service.ts                      COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts                      DI BUNDLE — ConnectionContext interface (explicit, not ReturnType<>)
├── contract/
│   ├── service.ts                  ConnectionService interface — read to know everything the domain does
│   ├── params.ts                   ResolveRoleParams, ChatRoutingOverlay, RoutableChat, RefreshCatalogParams
│   ├── results.ts                  CatalogSnapshot (the get/refresh result; its entries are
│   │                               ModelCatalogEntry, owned by @orb/contracts/connection)
│   ├── views.ts                    ModelCatalogView (client-facing list), ModelCapabilityView (panel descriptor)
│   └── errors.ts                   ConnectionRoutingError, CatalogUnavailableError
├── verbs/
│   ├── resolve-role.ts             resolveRole(ctx, params) — the one resolver for all 7 roles
│   ├── resolve-chat.ts             resolveChat(ctx, params) — the chat-specific overlay
│   │                               (heals RoutableChat → RouteOverlay → resolved connection)
│   ├── get-catalog.ts              getCatalog(ctx) — reads the snapshot; seeds the OR in-memory cache
│   ├── refresh-catalog.ts          refreshCatalog(ctx) — fetches OR /models, writes the KV snapshot
│   └── get-model-capability.ts     getModelCapability(ctx, params) — resolves ModelCapability for (model, backend)
├── persistence/
│   └── catalog-snapshot.ts         readCatalogSnapshot, writeCatalogSnapshot — KV read/write for
│                                   'openrouter-model-catalog' in the shared `settings` table.
│                                   seeds the OR in-memory TTL cache on read (the sync-guard seam).
├── substrate/
│   ├── pick-or-model.ts            pickOrModel(modelId, catalog) — the two defensive guards:
│   │                               (1) Claude-shortlist-id-is-agent-sdk-only guard (wrong-api leak);
│   │                               (2) catalog guard (skipped on cold cache; not a blanket reject).
│   ├── heal-model.ts               healToChatDefault(api, source, model) — isChatModelId guard +
│   │                               DEFAULT fallback; from routing.ts:136-147 (the dual-guard seam).
│   └── or-model-cache.ts           the in-memory TTL OR catalog cache (the sync-guard for hot-path routing).
└── catalog/                        named subsystem: the curated Claude catalog + OR synthesis
    ├── chat-models.ts              CHAT_MODELS array, ChatModelId, getChatModel (3-stage lookup),
    │                               DEFAULT_CHAT_MODEL_ID — migrated from providers/_shared/chat-models.ts.
    │                               The 3-stage prefix-match lookup is load-bearing (§ esoteric).
    ├── model-family.ts             detectModelFamily (the regex, load-bearing anchor — §esoteric).
    │                               FAMILY_CAPS is DISSOLVED into resolveModelCapability.
    └── resolve-model-capability.ts resolveModelCapability(model, backend) — the ONE capability
                                    descriptor factory. Curated for the Claude shortlist; synthesized
                                    from OR supportedParameters + family for other OR models; static
                                    for vLLM; user-declared for custom/BYO. Replaces deriveOrChatProfile + deriveVllmChatProfile
                                    + deriveCustomOpenAiChatProfile + the FAMILY_CAPS lookup.
```

**Named subsystem — `catalog/`:** groups the curated model catalog + family detection + the unified
capability factory. The substrate holds the routing guard helpers (`pick-or-model`, `heal-model`,
`or-model-cache`) that are pure but require their own identities. No mixed-concern helpers.

---

## Public surface (`domain/connection/index.ts`)

```typescript
// Service
export { createConnectionService } from './service'
export type {
  ConnectionService,
  ConnectionServiceDeps,
  ConnectionContext,
} from './contract/service'

// Verb params/results (ResolvedConnection is cross-boundary — it lives in
// @orb/contracts/connection and is NOT re-exported here)
export type {
  ResolveRoleParams,
  ChatRoutingOverlay,
  RoutableChat,
  CatalogSnapshot,
} from './contract/params'
export type {
  ModelCatalogView,
  ModelCapabilityView,
} from './contract/views'

// Errors
export { ConnectionRoutingError, CatalogUnavailableError } from './contract/errors'

// Catalog constant re-exported for consumers (chat, transport router)
export { DEFAULT_CHAT_MODEL_ID } from './catalog/chat-models'
```

**`ModelCapability` (the descriptor shape), `ChatApi`, `ChatSource`, `RoutingRoleKey`,
`ResolvedConnection`** live in `@orb/contracts/connection` — they are cross-boundary types consumed
by both `infra/providers` translators and the client panel. They are NOT re-exported from this front
door; callers import from `@orb/contracts` directly.

**`CHAT_MODELS` array and `getChatModel`** are `connection`-internal (via the `catalog/` subsystem).
They are NOT on the public surface; the catalog endpoint exposes `ModelCatalogView[]` as the
client-facing list.

---

## Verbs (the `ConnectionService` interface)

```typescript
ConnectionService = {
  // Role resolution (the core job)
  resolveRole(params: ResolveRoleParams): Promise<ResolvedConnection>

  // Chat-specific overlay (heals RoutableChat + RouteOverlay → ResolvedConnection)
  resolveChat(params: ResolveChatParams): Promise<ResolvedConnection>

  // Model capability (feeds both the panel and the per-runner translator)
  getModelCapability(params: GetModelCapabilityParams): Promise<ModelCapability>

  // OR model catalog
  getCatalog(params: GetCatalogParams): Promise<CatalogSnapshot>
  refreshCatalog(params: RefreshCatalogParams): Promise<CatalogSnapshot>
}
```

**`resolveRole` vs `resolveChat`:** `resolveRole` is the generic 7-role path (embed/rerank/imageEmbed
etc. do not have a "chat row overlay"). `resolveChat` is the chat-specific path: it reads
`RoutableChat` (from the chat row) + `ChatRoutingOverlay` (from `UserSettings`) + heals
model-id mismatches, then delegates to `resolveRole` for the final `{backend, model, credential,
capability}`. The chat domain calls `resolveChat`; all other callers use `resolveRole`.

**`getModelCapability` is injected into `chat.context`** at the composition root so assembly/
the params panel can read the descriptor without sideways-importing the connection domain.
`infra/providers` runners **never** import `resolveModelCapability` (infra→domain would be an illegal
upward import in the tier list); the funnel `infra/providers/resolve-chat.ts` reads the `ModelCapability`
handed in **on the request** — connection resolves it and threads it through `ResolvedConnection.capability`.

---

## Cross-boundary types (`@orb/contracts/connection`)

| Type | Home | Consumers |
|---|---|---|
| `ModelCapability` | `contracts/connection/capability.ts` | server translator (infra/providers), client panel |
| `ChatApi` | `contracts/connection/routing.ts` | server routing, client UI, shared forms |
| `ChatSource` | `contracts/connection/routing.ts` — re-export of `CredentialSource` (D31) | server routing, client UI, shared forms |
| `RoutingRoleKey` | `contracts/connection/routing.ts` | server (resolveRole) + client (settings panel) |
| `ResolvedConnection` | `contracts/connection/routing.ts` | server (chat, workloads, buddy), infra/providers |
| `ModelCatalogEntry` | `contracts/connection/catalog.ts` | server (list), client (model picker) |
| `DEFAULT_CHAT_MODEL_ID` constant | `contracts/connection/catalog.ts` | server (heal), client (preset default display) |

`ChatApi` / `ChatSource` today live in `shared/providers/chat-routing.ts` and are re-spelled as
inline literals 18+ times (`routing.ts:39,40,48,49,68,69,88`, `start-chat.ts:157,308`,
`context.ts:110`). In orbweaver: ONE importable tuple in `@orb/contracts/connection/routing.ts`;
every dispatch switch uses `assertNever` for exhaustiveness. The 18 re-spellings become RED at
compile time (`no-inline-union-redecl` gate — §7.5 spine).

---

## Movement table

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `domain/models/` (all 8 verbs) | merge → `connection` | `domain/connection/` | Models is a thin seam over providers; in orbweaver the catalog reads become connection verbs, the snapshot becomes `connection/persistence/catalog-snapshot.ts`. The 8-slot template is correct for `connection`; `models`-as-standalone is over-indirected. | resolve-time: `_models` front door is deleted; its callers import from `domain/connection` |
| `domain/models/persistence/snapshot.ts` — catalog KV | stays domain feature, renamed | `domain/connection/persistence/catalog-snapshot.ts` | The KV read/write for `'openrouter-model-catalog'` is a connection persistence concern. The blind cast after `.loose()` parse (§esoteric) must be replaced by a Zod-inferred type assertion (no forced cast). | resolve-time |
| `domain/models/persistence/snapshot.ts:76` — `seedOpenRouterModelsCache` side-effect | stays, explicitly named | `domain/connection/persistence/catalog-snapshot.ts → readCatalogSnapshot` | The side-effect that warms the sync TTL cache must remain co-located with the read that triggers it (§esoteric: the warm-on-read invariant). Document it as a named seam, not a bare call. | test-time: integration test asserts that `readCatalogSnapshot` warms the cache (cold read + `pickOrModel` succeeds without a hot re-read) |
| `domain/chat/routing.ts — resolveTurnRouting` | → `connection` | `domain/connection/verbs/resolve-chat.ts` | The overlay logic (chat-row → UserSettings → heal) is a connection selection concern. The chat domain calls `connection.resolveChat` through its composition-root injection, never sideways. | resolve-time: `domain-no-cross-feature` dep-cruiser rule; chat can only reach `domain/connection` via `index.ts` |
| `domain/chat/routing.ts — TurnRouting` discriminated union | removed | absorbed into `@orb/contracts/connection — ResolvedConnection` | `TurnRouting` keyed on `runner` (infra-internal vocab). Replaced by `ResolvedConnection = {backend, model, credential, capability}`. `runner` is a derivable f(api,source) and never leaves `infra/providers`. | compile-time: all `routing.runner` switch-sites become `routing.backend`; `assertNever` exhaustiveness enforces completeness |
| `domain/chat/routing.ts — RoutableChat` inline interface | → `contracts` | `@orb/contracts/connection/routing.ts` | Cross-boundary input shape for `connection.resolveChat`; needed by the chat domain and the connection domain both. Currently inline in `routing.ts`; belongs in `contracts`. | lint-time: `no-inline-types` gate |
| `domain/chat/routing.ts — RouteOverlay` inline interface | → `contracts` | `@orb/contracts/connection/routing.ts` | Same rationale: the UserSettings overlay shape for chat routing is a cross-boundary input type. | lint-time: `no-inline-types` gate |
| `domain/chat/routing.ts — RouteChatAssignment` unexported inline interface | → `contracts` | `@orb/contracts/connection/routing.ts` | Currently unexported (private) but structurally a connection input shape; promoting to contracts makes the concept explicit and gated. | lint-time: `no-inline-types` gate |
| `domain/chat/routing.ts — chatRoutingOverlay` projection | → `connection` | `domain/connection/verbs/resolve-chat.ts` | The UserSettings → `ChatRoutingOverlay` projection is routing logic, not chat domain logic. Moves with `resolveTurnRouting`. | resolve-time |
| `domain/chat/routing.ts — pickOrModel` (the dual guard) | → `connection` | `domain/connection/substrate/pick-or-model.ts` | The two defensive guards (Claude-shortlist-is-agent-sdk-only + catalog guard with cold-cache skip) are connection-selection concerns. The cold-cache skip is load-bearing (§esoteric); preserve exactly. | test-time: unit tests assert the two guard paths (shortlist guard rejects non-agent-sdk, catalog guard skips on cold cache) |
| `shared/providers/chat-routing.ts — CHAT_APIS, CHAT_SOURCES, chatApiSchema, chatSourceSchema` | → `contracts` (api here; source aliases credentials — D31) | `@orb/contracts/connection/routing.ts` | `ChatApi`/`CHAT_APIS`/`chatApiSchema` are canonical here. `ChatSource`/`CHAT_SOURCES`/`chatSourceSchema` are NOT redeclared — the source axis is the same 4 members as `CredentialSource`, so routing **re-exports `CredentialSource` as `ChatSource`** (D31; `CRED_SOURCES`/the credential source schema are the one source of truth in `@orb/contracts/credentials`). | compile-time: `no-inline-union-redecl` gate rejects any inline re-spelling of the `api`/`source` unions; `assertNever` in every dispatch switch |
| `providers/_shared/chat-models.ts — CHAT_MODELS, ChatModelId, getChatModel, DEFAULT_CHAT_MODEL_ID` | → `connection` | `domain/connection/catalog/chat-models.ts` | The curated Claude catalog is a connection selection resource, not a provider implementation. The 3-stage prefix-match lookup is load-bearing (§esoteric — preserve exactly). `DEFAULT_CHAT_MODEL_ID` is also re-exported from `@orb/contracts/connection/catalog.ts` for client use. | resolve-time: `CHAT_MODELS` is no longer on the `providers/index.ts` barrel; callers import from `domain/connection` front door or `@orb/contracts` |
| `providers/_shared/model-family.ts — detectModelFamily` (the regex) | → `connection` | `domain/connection/catalog/model-family.ts` | Family detection is a connection-layer concern (used by `resolveModelCapability`). The regex anchor is load-bearing (§esoteric). | resolve-time |
| `providers/_shared/model-family.ts — FAMILY_CAPS` | dissolved | `domain/connection/catalog/resolve-model-capability.ts` | `FAMILY_CAPS` is a partial precursor to `ModelCapability`; `hasFastMode` is dead (zero consumers outside the definition). The capability facts merge into `resolveModelCapability`. | compile-time: `FAMILY_CAPS` is deleted; any reference fails `tsc` |
| `providers/_shared/model-family.ts — FAMILY_CAPS.hasFastMode` | deleted | — | Zero consumers outside the definition (confirmed). `ChatModel.thinking.fastMode` superseded it entirely. No preservation needed. | compile-time: deletion; any surviving reference fails `tsc` |
| `providers/resolve-chat.ts — resolveChat function` | → `infra/providers` (stays infra) | `infra/providers/resolve-chat.ts` | `resolveChat` is the `(UserIntent × ModelCapability) → resolved wire knobs` funnel — it needs the wire-quirk knowledge that makes it an infra concern (Opus 4.8 adaptive/budget conflict §esoteric, XOR constraint §esoteric). It reads `ModelCapability` from `connection` (through the injected op model) rather than calling `FAMILY_CAPS` directly. The function is RIGHT-sized; it moves to the correct tier (infra), not further. | resolve-time: domain/connection imports from the providers barrel (infra), not the reverse |
| `providers/openrouter/profile.ts — deriveOrChatProfile` | dissolved into connection | `domain/connection/catalog/resolve-model-capability.ts` | The OR profile deriver reads FAMILY_CAPS to construct a ChatModel. Both are dissolved into `resolveModelCapability(model, backend='openrouter-chat')`. The synthesis logic (supportedParameters → reasoning/sampling/verbosity) moves here. | compile-time: `deriveOrChatProfile` is deleted from the providers barrel; pipeline.ts import fails `tsc` — the replacement is `connection.getModelCapability` wired at the composition root |
| `providers/vllm/profile.ts — deriveVllmChatProfile` | dissolved into connection | `domain/connection/catalog/resolve-model-capability.ts` | Same dissolution path. vLLM capability is a static profile (model heals from env; context window from env). | compile-time: same deletion |
| `providers/custom-openai/profile.ts — deriveCustomOpenAiChatProfile` | dissolved into connection | `domain/connection/catalog/resolve-model-capability.ts` | Hardcoded 128k window + sonnet tier + no-thinking dissolve into a user-declared profile (from `providerMetadataSchema.modelProfile` — credential metadata, ledger §2 / `credentials.md` — or the inspector probe). Nothing baked. | compile-time: same deletion; any reference to `CUSTOM_OPENAI_DEFAULT_WINDOW` fails `tsc` |
| `domain/_shared/role-clients.ts — RoleClients interface` | → `contracts` | `@orb/contracts/role-clients` | `RoleClients` is the cross-boundary composition-seam interface (the workloads `runner-env` bundle carries it; 19 type-only importers confirmed). Moving to `@orb/contracts` makes both consumers (server domain + infra binder) flow DOWN from contracts. | resolve-time: package dep |
| `domain/_shared/role-clients-binder.ts — createVllmRoleClients / createDefaultRoleClients` | → `infra` | `infra/providers/role-clients-binder.ts` | The binder is infra composition (it mints credentials + wires role dispatchers). TODAY it always creates vLLM credentials regardless of `UserSettings` — the one-site rebind (§esoteric). In orbweaver it reads `resolveRole` per role from the composition root. | resolve-time: `entry/` wires the binder; domain never reaches the binder |
| `domain/models/context.ts — cross-feature reach into `_shared/credentials.ts`` | removed | connection context injects `credentials.buildKeylessCatalogCredential` | The cross-_shared reach for the keyless catalog credential becomes composition-root injection (same pattern credentials.md documents). | resolve-time: `_shared` does not exist in orbweaver |
| `shared/prompt/intent.ts — UserIntent, userIntentSchema, generationKnobSchemas` | → `contracts` | `@orb/contracts/preset/intent.ts` | Cross-boundary wire type (server runners AND client form). Lives in the `preset` contracts namespace (generation config lives there). `connection` imports it from `@orb/contracts/preset` when constructing requests. NOT a connection-owned type. | resolve-time: package dep |
| `providers/contract/chat-model.ts — ChatModel, ChatModelSampling, agentSdkHonorsTemperature field` | dissolved | `@orb/contracts/connection/capability.ts — ModelCapability` | `ChatModel` is the precursor to `ModelCapability`. `agentSdkHonorsTemperature` bakes runner-vocab into the model descriptor (§esoteric); in `ModelCapability.sampling` each knob has a per-knob support range. The field disappears; its sole consumer (`resolve-chat.ts:24` warning) is replaced by a real capability check. | compile-time: `ChatModel` type deleted; `ChatModelSampling.agentSdkHonorsTemperature` gone; any surviving reference fails `tsc` |
| `client/features/preset/lib/knob-availability.ts — presetKnobAvailability(api, source)` | → `connection` panel (client) | client feature, reads `ModelCapabilityView` | Coarse source-level gating is replaced by descriptor-driven panel iteration: show only the knobs listed in `ModelCapabilityView.sampling`, cap the effort dropdown to the model's actual `effortLevels`, render the reasoning axis from `reasoning.mode`. The existing source-level gate is the BUILD-ON point, not the replacement. Client-side; out of scope for the server domain doc. | compile-time: panel imports `ModelCapabilityView` from `@orb/contracts`; no static knob list |
| `providers/index.ts — deriveOrChatProfile, deriveVllmChatProfile, deriveCustomOpenAiChatProfile, CHAT_MODELS, DEFAULT_CHAT_MODEL_ID, getChatModel` re-exports | removed from barrel | absorbed into `domain/connection` front door and `@orb/contracts` | The barrel should export only execution surfaces (`runChat`, `embed`, `rerank`, etc.) + the request/result types. Model catalog + derive*Profile are selection concerns; they leave the barrel when dissolved into `connection`. | resolve-time: callers of the removed barrel exports fail the resolver — forces migration |
| `providers/_shared/reasoning-budget.ts — effortToResponsesReasoning` (XOR constraint) | stays infra | `infra/providers/openrouter/reasoning-budget.ts` | Wire-level XOR constraint (OR responses rejects both `effort` + `max_tokens`) — a backend quirk that belongs in the sealed openrouter backend, not in the capability descriptor. `resolveChat` (infra funnel) enforces it; `connection` never sees it. | test-time: unit test asserts `effortToResponsesReasoning` never emits both fields simultaneously |
| `providers/resolve-chat.ts:65-68 — Opus 4.8 adaptive/budget conflict guard` | stays infra | `infra/providers/resolve-chat.ts` | API-level constraint (sending `type:'enabled' + budget_tokens` to Opus 4.8 → 400). A provider-quirk, not a capability gap — stays in the infra funnel. The `adaptiveBuiltIn` flag moves from `ChatModel` → `ModelCapability.reasoning` (as `mode:'adaptive'`); the funnel reads it and still drops the budget. | test-time: integration test asserts Opus 4.8 with a budget set emits `type:'enabled'` (adaptive), not `budget_tokens` |

---

## Cross-feature composition (the injection model)

`connection` is consumed by `chat`, `buddy`, `workloads`, and `entry`. None reach into
`domain/connection` internals — all access is through the front door or through composition-root
injection.

**Injected into `chat.context` at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `connection.resolveChat` | connection domain | per-turn resolution of `{backend, model, credential, capability}` from RoutableChat + UserSettings |
| `connection.getModelCapability` | connection domain | assembly reads the capability for the budget calculation (context window) + the active request |

**Injected into `workloads.runner-env` at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `connection.resolveRole` | connection domain | workload runners resolve `{backend, credential}` for embed/rerank/summarize roles without hard-pin |

**Injected into `buddy.context` at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `connection.resolveRole('agent')` | connection domain | buddy always uses the `agent` role connection (its own backend/model, per `participants-agents-identity.md §2`) |

**Injected into `connection.context` at the composition root (deps of the connection domain itself):**

| Dep injected | Provided by | Used for |
|---|---|---|
| `credentials.resolve` | credentials domain | `resolveRole` resolves the credential for any role's backend |
| `credentials.buildKeylessCatalogCredential` | credentials domain | keyless OR `/models` catalog fetch |
| `providers.fetchOrCatalog` | infra/providers | OR catalog HTTP fetch (used by `refreshCatalog`) |

---

## Spine thread intersections

### §7.1 Identity / auth / permission

The `max-pro-sub` arm is a **credential concern** (`credentials.resolve` is gated behind
`requireOwner` — `role === 'owner'`, ledger D17: the box belongs to the `owner`, not any `admin`), not
a connection concern — `connection` receives a `ResolvedCredential` from injection and never re-checks
the owner gate. The connection domain does carry the per-agent routing axis
(`participants-agents-identity.md §2`): a character participant's own `{backend, model}` override can
target a different backend than the room host's. The `connection.resolveRole` signature accepts an
optional `AgentOverride` (from the participant row) and applies it over the role default. If an agent
override points at `max-pro-sub`, the credentials domain enforces the owner gate — `connection` does
not duplicate it.

### §7.2 Settings / config

`UserSettings.routing.roleDefaults.*` is the per-role routing store that `resolveRole`
reads. Today only the `chat` role is wired; the remaining six roles are hard-pinned in the binder.
The orbweaver target: the binder reads `routing.roleDefaults.<role>` per role via the composition
root (a one-site rebind, `_FANOUT-BRIEF.md §8.7` correction). `connection` is a CONSUMER of user
settings, not an owner; settings lives in the `settings` domain. `connection.context` receives the
UserSettings projection it needs via DI.

### §7.3 Serialization / serde

No serde concern in `connection`. The `ModelCatalogSnapshot` JSON blob in the `settings` KV row is
parsed with a Zod schema at read time (`catalog-snapshot.ts`); the blind cast after `.loose()` parse
(§esoteric) is replaced by a proper Zod-inferred type. No `raw` blobs; no lossy round-trip.

### §7.4 Types and schemas — one home, one direction

- `ModelCapability` → `@orb/contracts/connection/capability.ts` (cross-boundary; server translators
  AND client panel both need it; flows down from contracts).
- `ChatApi` / `RoutingRoleKey` → `@orb/contracts/connection/routing.ts` (canonical tuples); `ChatSource`
  is **re-exported there from `@orb/contracts/credentials`'s `CredentialSource`** (D31, same 4-member axis)
  (no inline re-spelling anywhere — the 18 re-spellings in neo-tavern are the anti-pattern
  to gate out).
- `ResolvedConnection` → `@orb/contracts/connection/routing.ts` (cross-boundary; chat, buddy,
  workloads are all consumers).
- `ModelCatalogEntry` → `@orb/contracts/connection/catalog.ts` (cross-boundary; client model picker).
- `RoutableChat` / `RouteOverlay` / `RouteChatAssignment` → `@orb/contracts/connection/routing.ts`
  (cross-boundary input shapes; currently inline in `routing.ts`).
- `ChatModelId` → `@orb/contracts/connection/catalog.ts` (branded type; used at tRPC boundaries).
- `ConnectionService` interface → `domain/connection/contract/service.ts` (domain-internal; exported
  via front door for type-only client use in tests/transport).
- `ConnectionContext` → `domain/connection/context.ts` top — explicit `export interface
  ConnectionContext`, never `ReturnType<typeof createConnectionContext>`.
- `CatalogModels` (today `Awaited<ReturnType<typeof catalog.rawModels>>`) → `@orb/contracts/
  connection/catalog.ts` as `ModelCatalogEntry[]` (a named shape, not a ReturnType alias that
  couples persistence to providers at the type level).
- `FamilyCapabilities` interface → dissolved into `ModelCapability`; not a standalone type.
- `ConnectionRoutingError`, `CatalogUnavailableError` → `domain/connection/contract/errors.ts`
  (domain-internal errors; exported via front door).

### §7.5 String-union dispatch discipline

Two axes need the full §7.5 treatment:

**`ChatApi` (`'agent-sdk' | 'chat-completions' | 'responses'`) — 12 touch-count, 9 inline re-decls
(scout-confirmed):** ONE importable union in `@orb/contracts/connection/routing.ts`. Every switch
over `api` uses `assertNever` (the dispatch is already fully gated in neo-tavern — the cost is pure
re-spelling). The no-inline-union-redecl gate rejects any new spelling.

**`ChatSource` (`'max-pro-sub' | 'openrouter' | 'vllm' | 'custom_openai'`) — 18 touch-count, 11
inline re-decls (scout-confirmed; the user's lived pain, MEASURED):** same fix, with **D31**: this is the
SAME 4-member axis as `CredentialSource` (routing's `source` IS the credential source). So there is ONE
canonical declaration — **`CredentialSource` + `CRED_SOURCES` in `@orb/contracts/credentials`** — and
`@orb/contracts/connection/routing.ts` **re-exports it as `ChatSource`** (`export { CredentialSource as
ChatSource }`), respecting the connection→credentials dep. The neo `CHAT_SOURCES` tuple (`shared/providers/
chat-routing.ts`) collapses INTO `CRED_SOURCES` (not a second tuple); the source file is deleted. All 11
re-decl sites become RED under the `no-inline-union-redecl` gate. (`ChatApi` is a SEPARATE axis and keeps
its own `CHAT_APIS`/`chatApiSchema` in `@orb/contracts/connection`.)

**`RoutingRoleKey` (`'chat' | 'agent' | 'embed' | 'rerank' | 'imageEmbed' | 'summarize' |
'generateImage'`):** NEW union, does not exist today (roles are 5 hard-pinned functions, not a
typed axis). In orbweaver: one importable union; `resolveRole` dispatch is a
`ROLE_RESOLVERS: { [K in RoutingRoleKey]: Resolver<K> }` mapped-type Record so a new role arm
missing the resolver is a `tsc` error. Gate: `exhaustive-dispatch`.

---

## Esoteric / load-bearing details

1. **`getChatModel` 3-stage prefix-match lookup (must be preserved exactly).**
   OR catalog uses version-only ids (`'claude-haiku-4-5'`) while the curated catalog uses dated
   form (`'claude-haiku-4-5-20251001'`). Stage 3 prefix-match catches `'claude-haiku-4-5'` →
   dated entry. The boundary check (next char must be `'-'`) prevents `'claude-haiku-4'` from
   matching `'claude-haiku-45-…'`. Simplifying to a plain exact match causes Haiku routing to
   silently fall through to `resolveModelCapability` synthesis with a wrong profile
   (`adaptiveBuiltIn=false`, wrong effortLevels, wrong cacheMinTokens). The 3 stages MUST move
   together, with their boundary check intact.

2. **`detectModelFamily` regex anchors are load-bearing.**
   The regex matches both bare (`'claude-opus-4-8'`) and prefixed (`'anthropic/claude-opus-4-8'`)
   BUT explicitly rejects third-party forks (`'some-org/claude-fork' → 'other'`). If the anchor or
   the `(anthropic/)?` or-group is dropped, alien backends containing `'claude'` in their id
   receive Anthropic-only directives (`cache_control`). The or-group MUST be anchored at `^`.

3. **`readCatalogSnapshot` must warm the in-memory TTL cache as a side-effect (the sync-guard seam).**
   `pickOrModel`'s catalog guard uses a synchronous in-memory cache (no await on the hot routing
   path). On a fresh boot, the first `readCatalogSnapshot` warms that cache. Without this
   side-effect, the cold-boot catalog guard finds `null` and skips — every model id passes the
   guard unchecked for the first request. The seam is named (`orModelCache.seed(snapshot)`) and
   tested; it must survive the `persistence/catalog-snapshot.ts` rename.

4. **`pickOrModel` dual guard — cold-cache skip is deliberate (not a bug to close).**
   Guard (2) (the catalog guard) is SKIPPED on cold cache (`getCachedOrModels() === null`). This
   is intentional: a blanket-reject on cold boot would fail every model id before the daily
   snapshot hydrates. The cold-skip is the correct behavior. Removing it (to "plug a hole") breaks
   the boot sequence. The guard is documented as best-effort; it fires in steady state.

5. **`pickOrModel` guard (1) — Claude shortlist ids are agent-sdk-only.**
   Shortlist ids like `'claude-sonnet-4-6'` are valid for `agent-sdk` but NOT for OpenRouter
   (OR wants `'anthropic/claude-sonnet-4.6'`). Stale UserSettings from an agent-sdk session sending
   the shortlist id to OR get a 400. The guard rejects shortlist ids on the OR path.
   `isChatModelId` (the TypeID brand check) is the discriminator. Must survive the move to
   `substrate/pick-or-model.ts`.

6. **Opus 4.8 adaptive/budget conflict — `ModelCapability.reasoning.mode === 'adaptive'` is the flag.**
   Sending `type:'enabled' + budget_tokens` to Opus 4.8 returns a live 400 from the API. In neo-
   tavern `adaptiveBuiltIn: true` in `ChatModel` is the flag; in orbweaver `reasoning.mode ===
   'adaptive'` in `ModelCapability` carries the same semantics. `infra/providers/resolve-chat.ts`
   reads `capability.reasoning.mode` and drops `budget_tokens` when `mode === 'adaptive'` (emits
   the `AdaptiveBuiltIn` warning). The connection domain produces the capability; the infra funnel
   enforces the API constraint.

7. **`ModelCatalogSnapshot` blind cast after `.loose()` parse must be replaced.**
   Today: `const snapshot = value as ModelCatalogSnapshot` after `safeParse` (the inferred Zod
   type doesn't align with `ModelCatalogSnapshot` because of `.loose()`). In orbweaver: the
   `SnapshotSchema` is tightened to an explicit `z.object` matching `CatalogSnapshot` exactly, and
   the result is used as the Zod-inferred type (no forced cast). Any new required field on
   `CatalogSnapshot` not in the schema is a compile error, not a silent pass.

8. **`role-clients-binder.ts` rebind is one site, not a dispatcher rewrite.**
   The role DISPATCHERS (`embed.ts`/`rerank.ts`/`summarize.ts`/`image-embed.ts`) already
   `switch (credential.source)` and route correctly. The vLLM lock is ONLY in the boot binder
   (`createVllmRoleClients` / `createDefaultRoleClients`), which always mints a vLLM credential
   regardless of `UserSettings.routing.roleDefaults`. The one-site fix: the binder calls
   `connection.resolveRole(role)` per role at boot and uses the returned credential instead of
   unconditionally minting vLLM. The dispatchers are untouched.

9. **`effort:'none'` doubles as the off-switch — `reasoning.enabled` is the fix.**
   In neo-tavern, two separate off-trigger paths fire on `intent.effort === 'none'` (line 47) AND
   on `profile.thinking.effortLevels.length === 0` with `effort === 'none'` (line 41). In orbweaver
   `ModelCapability.reasoning.enabled` is its own boolean axis; `effort:'none'` is not a level in
   `effortLevels` and not the off-switch. The panel shows the reasoning toggle; selecting "off" sets
   `enabled: false`, not `effort:'none'`. No cascade.

10. **`agentSdkHonorsTemperature` bakes runner-vocab into a model descriptor.**
    The field is used only once: `resolve-chat.ts:24` to emit a warning when temperature is set for
    an agent-sdk model. All three `CHAT_MODELS` entries set it `false`. In orbweaver: `ModelCapability
    .sampling.temperature` is either a `Range` (honored) or absent (not honored). The warning fires
    when temperature is set AND `capability.sampling.temperature` is absent. The field is DELETED;
    its only consumer is replaced by a real capability check.

---

## Invariants (gate candidates)

1. **`connection` speaks user vocab only (`{api, source, model}` + the `ModelCapability` descriptor).**
   No `runner`/`family` ever crosses the domain boundary; both are sealed inside `infra/providers`.
   *Enforcement: compile-time — `ConnectionService`, `ResolvedConnection`, and all `contract/`
   types reference `ChatApi`/`ChatSource`/`backend` (a sealed opaque key) but never `runner` or
   `family`. A grep for `runner` in `domain/connection/**` in CI goes RED.*

2. **`resolveModelCapability` is the ONE capability descriptor source.**
   No `ChatModel` + `FAMILY_CAPS` duality; no per-family table read inside a translator.
   *Enforcement: compile-time — `ChatModel` and `FAMILY_CAPS` are deleted; any surviving reference
   fails `tsc`. The `resolveModelCapability` function is the only factory for `ModelCapability`.*

3. **`reasoning.enabled` and `reasoning.mode` are distinct axes.**
   `effort:'none'` is not the off-switch; `effortLevels` never contains a `'none'` member.
   *Enforcement: compile-time — `EffortLevel` union in `@orb/contracts` does not include `'none'`;
   a `satisfies never` assertion on a `'none'` case in any switch over `EffortLevel` goes RED.*

4. **`ChatApi` and `ChatSource` are never re-spelled inline.**
   One canonical tuple in `@orb/contracts`; the `no-inline-union-redecl` gate rejects any new
   inline re-spelling.
   *Enforcement: lint-time — `no-inline-union-redecl` dep-cruiser/biome gate (§7.5 spine).*

5. **`RoutingRoleKey` dispatch is exhaustive.**
   The `ROLE_RESOLVERS` mapped-type Record makes a missing role arm a `tsc` error.
   *Enforcement: compile-time — `{ [K in RoutingRoleKey]: Resolver<K> }` fails if a new role is
   added to the union without a resolver entry.*

6. **All role connections read `UserSettings.routing.roleDefaults.<role>` — no hard-pin.**
   The binder calls `connection.resolveRole` per role; no role silently defaults to vLLM without
   consulting settings.
   *Enforcement: test-time — an integration test sets `roleDefaults.embed = openrouter` and asserts
   the embed role client uses an OpenRouter credential, not a vLLM credential.*

7. **`pickOrModel` dual guard (both arms) survives the move.**
   The shortlist-id guard and the cold-cache skip are preserved as named behaviors with tests.
   *Enforcement: test-time — unit tests for `substrate/pick-or-model.ts` assert: (a) shortlist id
   on OR path is rejected; (b) cold-cache yields null (guard skipped); (c) catalog guard fires when
   the cache is warm.*

8. **`readCatalogSnapshot` always warms the in-memory TTL cache.**
   No read path bypasses the `orModelCache.seed` side-effect.
   *Enforcement: test-time — integration test reads snapshot, then asserts `getCachedOrModels()`
   is non-null without an explicit cache-warm call.*

9. **`connection` does not import from `infra/providers` internals (backends/runners).**
   It imports only from the providers barrel (`infra/providers/index.ts`) for the catalog fetch and
   the role dispatcher contracts.
   *Enforcement: lint-time — dep-cruiser rule: `domain/connection/**` may import `infra/providers`
   ONLY via `infra/providers/index.ts`; deep imports into `infra/providers/<backend>/` are RED.*

10. **`ModelCapability` is the panel's single data source.**
    No static knob list; no hardcoded slider bounds; no model-name string matching.
    *Enforcement: compile-time — the client panel component accepts only `ModelCapabilityView`; any
    import of a static knob list from outside `@orb/contracts` fails the resolver.*

---

## Decisions (resolved / deferred)

- **Where `resolveModelCapability` executes — RESOLVED: `connection`'s `catalog/` subsystem.**
  `domain/connection/catalog/resolve-model-capability.ts` does the curated-catalog lookup + the static
  vLLM profile + the user-declared custom/BYO profile + the OR synthesis (reading `supportedParameters`
  from the snapshot `connection` already holds — so no provider internals are needed). The infra funnel
  (`infra/providers/resolve-chat.ts`) reads the resulting `ModelCapability` **handed in on the request**,
  never importing the factory (infra→domain is illegal upward). This was the latent contradiction in the
  earlier draft (a "runners import it directly … correct direction" note) — corrected here and in §verbs.

- **`quality` → axes mapping — DEFERRED (per-model build tuning).** Criterion: `fast/balanced/deep` maps
  to `reasoning.mode` + a per-model sampling preset; the numbers are fixed when the shortlist is finalized
  and verified live. The mechanism (distinct axes, no merged cascade) is settled (Part II §4).

- **Per-agent `ModelCapability` resolution — RESOLVED: yes, per-agent.** `ResolvedConnection` always
  carries `capability`, so resolving a per-agent connection (the per-agent backend/model override)
  inherently yields that agent's descriptor; the panel for an agent's config displays *that* model's
  capability, not the room's. No separate per-agent call path is needed.

- **Custom/BYO model profile — RESOLVED: user-declared (nothing baked).** The user declares the profile
  (window, max output, reasoning, sampling) via `providerMetadataSchema.modelProfile` (the credential
  metadata — ledger §2 / `credentials.md`) or the inspector probe; it feeds
  `resolveModelCapability(model, 'custom-byo')`. **DEFERRED (schema shape only):** the exact field list
  = a subset of `ModelCapability`; uninspected fields default conservative. Fix when the custom-byo form
  is built.

- **`ChatModelId` TypeID vs plain string — RESOLVED.** The branded `ChatModelId` covers **only** the
  curated Claude shortlist (`CHAT_MODELS`). OR model ids (`'anthropic/claude-sonnet-4.6'`) are **plain
  strings** in `ModelCatalogEntry.id`. The boundary is the catalog: curated entries carry the brand; OR
  snapshot entries are plain. `pickOrModel` guard (1) uses `isChatModelId` as the discriminator (a brand
  match means "shortlist id → agent-sdk-only, reject on the OR path"). So the brand ends at the shortlist;
  OR free-form lives only in the snapshot, never branded.

---

# Part II — Selection conductor & the capability descriptor (the authoritative design)

> Merged from the former top-level `connection.md` (2026-06-25 de-duplication — one home per topic).

> **Status: planning (authoritative detail).** `connection` is the *selection* conductor (which
> backend/model/credential a turn or role uses) AND the owner of the **capability descriptor** — the
> ONE source of truth for "what knobs this model honors" that drives **both** the per-runner translation
> AND the generation-params/samplers panel. Pairs with `tiers/providers.md` (execution) and
> `participants-agents-identity.md` (per-agent connection). `domains.md` carries the summary.

## 0. What `connection` owns (selection, NOT execution)

`connection` resolves, per turn/role, a **resolved connection**:
```
{ backend,        // which sealed runner (openrouter-chat | agent-sdk | custom-byo | vllm-*)
  model,          // the model id for that backend
  credential,     // from credentials (handed in)
  capability }    // the descriptor (§2) — what this model honors
```
It then hands `providers` a request. It contains **zero execution logic** (no sessions, env, wire
shaping — that's providers). Selection vs execution, per `domains.md`.

## 1. `resolveRole(role)` — pick the tier/backend/model per role

One resolver for all roles: `chat · agent · embed · rerank · imageEmbed · summarize · generateImage`.
It reads the user's settings (`routing.roleDefaults.<role>`) + the per-agent override and returns the
`{ backend, model, credential }` for that role:
- **Per-role, per-tier** (from `tiers/providers.md` §2b): a role can be local-light / local-heavy
  / hosted depending on the user's hardware/wallet. One resolver, no per-role hard-pin.
- **Per-agent override** (from `participants-agents-identity.md`): a character/buddy can run on its own
  backend/model; default = the role default. New routing axis: per-agent, not per-user.
- **The active embed-space** is a `connection` setting (the embed model = the space). Changing it to a
  *different model/dim* is the rare, set-and-leave action that triggers the re-index workload
  (`tiers/providers.md` §2b); same-model-different-backend is a free switch.
- **Sealed provider vocab:** the user picks/stores only `{api, source, model}`; `runner`/`family` are
  derived *inside* providers and never leak (`tiers/providers.md` §1). `connection` speaks user
  vocab only.

## 2. The capability descriptor — ONE source, DISTINCT axes

The fix for the "bonkers mapper." Today there are TWO capability systems (`ChatModel` + `FAMILY_CAPS`)
in incompatible shapes, cross-merged and double-read, with reasoning collapsed into one cascade.
Orbweaver: **one descriptor per resolved `(model, backend)`**, with reasoning/sampling/verbosity/output
as **separate axes**:

```
ModelCapability = {
  reasoning: {
    mode: "none" | "effort" | "budget" | "adaptive",   // HOW this model reasons — distinct from on/off
    enabled: boolean,                                    // on/off is its OWN axis (NOT effort:"none")
    effortLevels?: EffortLevel[],                        // the model's REAL levels (e.g. [low,med,high,max])
    budgetRange?: Range,                                 // token budget, if mode==="budget"
    displayModes?: ("summarized"|"omitted")[],           // Anthropic-only
  },
  sampling: {                                            // PER-KNOB support + real ranges (not one bool)
    temperature?: Range; topP?: Range; topK?: Range;
    frequencyPenalty?: Range; presencePenalty?: Range; repetitionPenalty?: Range;
    minP?: Range; seed?: boolean; logitBias?: boolean; stop?: boolean;
  },
  verbosity?: Verbosity[],                               // REAL axis (OpenAI) — not vapor
  output: { maxTokens: Range },
  context: { window: number; supports1M?: boolean },
}
```

- **Resolved ONCE** per `(model, backend)` — curated where known (Claude shortlist), synthesized from
  the OR catalog `supportedParameters` + family otherwise, static for vLLM, **user-declared for
  custom/BYO** (§7). **One `resolveModelCapability(model, backend)`** replaces `ChatModel` +
  `FAMILY_CAPS` + the **three** `derive*Profile` functions (OR/vLLM/custom — *verified: three, not four*;
  the static `CHAT_MODELS` catalog + `getChatModel()` was the doc's miscounted "fourth"). No per-family
  table read mid-translation.
- **The shape lives in `contracts`** (both the server translation and the client panel need it); it is
  **resolved by `connection`** — its `catalog/` subsystem holds the OR snapshot, so it can synthesize the
  descriptor without reaching into provider internals (§7) — and surfaced to the client via the
  connection/catalog endpoint. The infra translator reads the descriptor handed in **on the request**; it
  never imports the factory (infra→domain would be an illegal upward import).

## 3. The descriptor drives BOTH translation AND the panel (one source, two consumers)

This is the whole point — the capability is authored once and consumed in both places, so they can't
drift:

- **Translation (server):** each runner's translator reads the descriptor to shape its wire body — a
  knob the model doesn't list is simply not sent (no silent no-op surprises, no second reasoning path,
  no `FAMILY_CAPS` reach-in). `resolveChat` stays the single funnel but reads the descriptor, not two
  capability systems.
- **The panel (client):** renders by **iterating the descriptor** — show ONLY honored sampling knobs
  with their **real ranges**. *(Verified: today the panel is a static sampler stack + full-enum effort
  dropdown, BUT it already has coarse **source-level** gating in `knob-availability.ts` — it disables the
  reasoning/quality groups for vLLM/custom. Orbweaver replaces the static stack with descriptor-iteration
  at the **model** granularity, building on that existing source-level gate, not from zero.)* Render the
  reasoning control by `reasoning.mode` (off-toggle vs
  **effort dropdown of the model's actual `effortLevels`** vs **budget slider** vs adaptive-note);
  show `verbosity` only when present. No static 6-slider stack, no full-enum effort dropdown, no
  hardcoded model-name prose, no showing sampling to agent-sdk (which lists none).

## 4. Reasoning, untangled (the headline)

| Today (mangled) | Orbweaver (distinct axes) |
|---|---|
| `effort:"none"` doubles as the off-switch | `reasoning.enabled` is its own boolean |
| effort / budget / quality / fastMode → 1 cascade | `reasoning.mode` (none/effort/budget/adaptive) selects ONE shape; each is its own field |
| translated twice (`intent.effort` vs `resolved.thinking`) | ONE translation path, from the resolved descriptor |
| `verbosity` is a comment | `verbosity` is a real, model-gated axis |
| `thinkingBudgetTokens` has no UI | budget slider rendered when `mode==="budget"` |
| `minimal→low`, `max→xhigh` silent remaps scattered | the descriptor's `effortLevels` ARE the model's levels; the picker can't offer an unsupported level, so no remap needed |

`quality` ("fast/balanced/deep") stays as the **ergonomic dial** that the resolver maps onto the
descriptor's axes — but it maps to *distinct* fields, not a merged cascade.

## 5. Bounds & defaults live in ONE place

- The numeric bounds/ranges are the descriptor's `Range`s (server) — the client panel reads them, never
  re-hardcodes slider min/max (kills the triple duplication).
- Per-model/per-runner defaults (e.g. vLLM's presence_penalty) live in the **descriptor/profile**, not
  stranded inside a runner's body builder.

## 6. Invariants (gate candidates)

1. **One capability source** — `resolveModelCapability` is the only producer; no `ChatModel` +
   `FAMILY_CAPS` duality, no per-family table read inside a translator.
2. **The panel renders from the descriptor** — no static knob stack; no knob shown that the descriptor
   doesn't list (a gate could assert the panel imports the descriptor, not a fixed list).
3. **Reasoning axes are distinct** — `reasoning.enabled` (on/off) ≠ `reasoning.mode` ≠ `effortLevels` ≠
   `budget` ≠ `verbosity`. No enum value doubles as an off-switch.
4. **One translation path** — runners read the resolved descriptor; no second reasoning derivation from
   raw `intent`.
5. **Bounds defined once** (the descriptor's ranges); the panel and the form schema consume them.
6. **`connection` speaks user vocab only** — `{api, source, model}` + the descriptor; never `runner`/
   `family` (sealed in providers).

## 7. Decisions (resolved / deferred)

- **Where `resolveModelCapability` lives — RESOLVED: `connection`'s `catalog/` subsystem.** It executes
  in `domain/connection/catalog/resolve-model-capability.ts` (connection holds the OR catalog snapshot, so
  it synthesizes the descriptor without provider internals); `contracts` holds the `ModelCapability`
  *shape*; the connection/catalog endpoint ships it to the client. The infra funnel
  (`infra/providers/resolve-chat.ts`) READS the descriptor handed in **on the request** — it never imports
  `resolveModelCapability` (infra→domain is an illegal upward import). Consistent with the movement
  table above (Part I) + `tiers/providers.md`.
- **`quality` → axes mapping — DEFERRED (build-time per-model tuning).** Criterion: fast/balanced/deep
  maps to `reasoning.mode` + a per-model sampling preset; the exact preset numbers are fixed when the
  Claude shortlist is finalized and verified against live model behavior. The *mechanism* (quality → the
  distinct axes, never a merged cascade) is settled (§4) — only the numbers defer.
- **Per-agent capability — RESOLVED: yes.** `ResolvedConnection` always carries `capability` as part of
  the 4-tuple, so resolving a per-agent connection (the per-agent backend/model override, §1) inherently
  produces *that agent's* descriptor. The panel/translation for an agent's own config read that agent's
  `capability`, not the room's.
- **Custom/BYO descriptor — RESOLVED: user-declared (nothing baked).** The user fills in the descriptor
  (knobs, ranges, reasoning, window) for their endpoint, or the inspector probes it
  (`tiers/providers.md` §1a). **DEFERRED (schema shape only):** the exact
  `providerMetadataSchema.modelProfile` fields (credential metadata) = a subset of `ModelCapability` the
  user can fill; uninspected fields fall back conservative. Fix the field list when the custom-byo
  settings form is built.
