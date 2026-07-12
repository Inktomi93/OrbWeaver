# Connections "Roles & Keys" — BUILD SPEC (cold-read executable)

STATUS: verified design, ready to build. This is the CONSOLIDATION of a refinement round that was
checked against the live code — every claim below carries a file:line citation into the tree as of
2026-07-11 (HEAD eb5d6b3 + uncommitted marathon work). If a cited line has drifted, the cited FILE
is still the home; re-anchor by symbol name, not by re-designing.

SCOPE IN ONE LINE: keep the existing 7-role-slot pane (settings modal, USER group) and replace the
free-text model `Input` with a SOURCE-POLYMORPHIC model cell backed by ONE new read-only server
facade (`connection.getModelsForSource`), plus a saved-keys rework (grouping, rendered health,
per-provider Test routing, add-dialog model field) and three additive gap fixes. Zero DB migrations.
Zero net-new `@orb/ui` primitives. One net-new client component (`ModelPicker`, a feature component).

RULINGS ALREADY BAKED (do not re-litigate):
- Connections lives in the settings modal, USER group — it is already there
  (`packages/client/src/features/settings/lib/connections-nav.ts:24-26`, `group: "user"`).
- The dense compact row + `@2xl` container-query switch stays
  (`packages/client/src/features/settings/components/role-slot-row.tsx:80-88`).
- Persistence home stays `UserSettings.routing.roleDefaults` via the section-autosave form — the
  client edits the blob `resolveRole` reads, never calls the resolver
  (`packages/client/src/features/settings/lib/connections-model.ts:7-12`).
- vllm / local-light are DERIVE-NOT-STAMP (D20/D23 flavor): the client persists `""` and GHOSTS the
  resolver's actual pick; the resolver derives from env/builtin when unset
  (`packages/server/src/domain/connection/verbs/resolve-role.ts:75-113,131-142`).
- GAP-1 owner ruling: health results are SESSION-EPHEMERAL row state — NO migration, no persisted
  health column. `revokedAt` stays the only persistent marker
  (`packages/server/src/domain/credentials/contract/views.ts:26`).
- Plaintext write-once key entry stays (documented, intentional —
  `packages/client/src/features/settings/components/add-credential-dialog.tsx:8-11`).
- SSRF/CSRF posture untouched: the facade does ZERO outbound fetch; the outbound probes stay on the
  existing `.mutation()`s (`packages/server/src/transport/trpc/routers/credentials.ts:7-9,85-99`).

Visual truth (mockup): `docs/architecture/proposed/connections/connections-mockup.html` (copied
beside this spec from the design session's scratchpad; the spec text below also encodes everything
load-bearing from it).

---

## 0. Current-state map (what exists, where)

CLIENT (feature: `packages/client/src/features/settings/`):
- `surfaces/connections-settings-surface.tsx` — the pane. `ModelRolesSection` (line 94) renders
  `ROLE_SLOTS_ORDERED.map → RoleSlotRow` (124-126) inside the autosave form
  (`useConnectionsForm`, 108-112); `SavedKeysSection` (line 156) renders a FLAT credential list
  (187-196) + `AddCredentialDialog` (199-204). Anchor helper `anchor(sub)` at line 47
  (`settingsAnchorId("connections", sub)`).
- `components/role-slot-row.tsx` — the compact row. Source `Select` at 91-101; model is a FREE-TEXT
  `Input` at 103-114 (this is what the picker replaces); per-row Clear at 117-132; the
  `@2xl` orientation switch at 88; `ChatSlotKnobs` (protocol `api` Select) at 142-169.
- `lib/connections-model.ts` — the pure model. `SOURCE_LABELS`/`SOURCE_ORDER` (51-66), `RoleSlot`
  descriptors `ROLE_SLOTS` (96-171, agent is `readOnly: true` at 118), `RoutingForm` (256-263,
  6 keys — no `agent`), `projectRoutingForm` (284-298), `toRoutingSection` (337-357),
  `embedDimensionWarning` (214-228), `CHAT_API_LABEL_PAIRS`/`CHAT_APIS_ORDERED` (361-374).
- `lib/connections-nav.ts` — `CONNECTIONS_SUBCATEGORY_IDS = { roles: "model-roles", keys: "saved-keys" }`
  (15-18); the category entry (24-71).
- `components/credential-key-row.tsx` — `ListRow`-based key row; the Test button (83-90) fires
  `useTestCredentialHealth` but the RESULT IS NEVER RENDERED (the mutation only invalidates
  `credentials.list` — `hooks/use-connections-mutations.ts:44-51`).
- `components/add-credential-dialog.tsx` — provider/label/baseUrl/key fields (105-141); the custom
  arm sends `metadata: { kind: "custom_openai", baseUrl }` (78-80) — NO model field, NO pre-save
  fetch check.
- `lib/add-credential-form-model.ts` — `AddCredentialFormValues` (16-21), `validateAddCredential`
  (44-55), `isCustomProvider` (38-40).

SERVER:
- `packages/server/src/transport/trpc/routers/connection.ts` — the connection router
  (`getCatalog` 13, `getAgentSdkCatalog` 35, `testClaudeAuth` 47, `orCredits` 54…), registered as
  `connection:` in `packages/server/src/transport/trpc/router.ts:80`.
- `packages/server/src/transport/trpc/routers/credentials.ts` — `list` 24, `add` 26, `setActive` 45,
  `testHealth` 57, `fetchModels` 86-99 (draft arm `customEndpointDraft` 17-21; `.mutation()` for the
  CSRF gate, Esoteric #9 — lines 7-9).
- `packages/server/src/domain/connection/` — service root `service.ts:19-34`
  (`createConnectionService` — the new verb registers here), authoritative interface
  `contract/service.ts:127-156` (`ConnectionService`), DI bundle `ConnectionContext`
  `contract/service.ts:95-114` (has `db`, `now`, `resolveCredential`, `loadUserSettings`,
  `vllmAvailable` 109, `isOwner` 113), params `contract/params.ts`, results `contract/results.ts`
  (`CatalogSnapshot = {fetchedAt, models}` 14-20; `AgentSdkCatalogSnapshot` 25-31).
- `verbs/resolve-role.ts` — the resolver the ghosts must mirror: per-role selectors 50-114 (embed →
  `env.VLLM_EMBED_MODEL` 78, rerank → `env.VLLM_RERANK_MODEL` 84, imageEmbed → `env.VLLM_EMBED_MODEL`
  90, summarize non-sub → `env.VLLM_GEN_MODEL` 104); `DERIVE_ROLES` + local-light fallback 121-142;
  `assertCoherent(api, source)` 148-166 (agent-sdk ⇒ {max-pro-sub, openrouter}; anthropic-messages ⇒
  openrouter only; max-pro-sub with any other api ⇒ throw); heal 171-181
  (`healToChatDefault` — `substrate/heal-model.ts:25-41`; `pickOrModel`).
- `persistence/catalog-snapshot.ts:33-51` — `readCatalogSnapshot` (warm-on-read);
  `persistence/agent-sdk-catalog-snapshot.ts` — the agent-sdk twin.
- `catalog/chat-models.ts:49` — the curated `CHAT_MODELS` shortlist (opus 4.8 / sonnet 5 /
  haiku 4-5-20251001) — the max-pro-sub cold-cache fallback.
- `packages/server/src/domain/credentials/verbs/resolve.ts` — the credential chokepoint;
  keyless openrouter throws `DomainNoCredentialError` (49-56); `resolveCustomOpenAi` 60-85;
  max-pro-sub owner gate (99-101, D17).
- `packages/server/src/domain/credentials/verbs/fetch-models.ts` — draft-wins, `[]` on any failure
  (17-45); infra op `packages/server/src/infra/network/openai-models.ts:37-56` (`safeFetch`,
  never throws, `[]` fallback).
- `packages/server/src/domain/credentials/verbs/test-health.ts` — openrouter-only probe arm; every
  other provider returns `{status:"ok"}` without probing (90-94) — the reason GAP-4 exists.
- `packages/server/src/entry/compose/services.ts` — credentials wiring 273-283 (note
  `fetchModels: fetchOpenAiModels` 281 — entry already imports infra directly, the precedent for the
  localLightDefaults wire), connection wiring 286-313 (`vllmAvailable = !deps.vllmDisabled` 286,
  `isOwner` 305-312).
- `packages/server/src/foundation/env/index.ts:93-107` — `VLLM_EMBED_PORT/…`, `VLLM_EMBED_MODEL`
  (97, default `Qwen/Qwen3-VL-Embedding-2B`), `VLLM_RERANK_MODEL` (98), `VLLM_GEN_MODEL` (99),
  `VLLM_EMBED_DIM` (100, default 1024), `VLLM_DISABLED` (104-107).
- `packages/server/src/infra/providers/backends/local-light/index.ts:16-19` re-exports
  `DEFAULT_EMBED_MODEL` (`embed.ts:17` = `"jinaai/jina-clip-v2"`), `DEFAULT_IMAGE_EMBED_MODEL`
  (`image-embed.ts:23` = `"jinaai/jina-clip-v2"`), `DEFAULT_RERANK_MODEL`
  (`rerank.ts:15` = `"Xenova/ms-marco-MiniLM-L-6-v2"`).
- `packages/server/src/infra/providers/backends/openrouter/catalog.ts:35-53` — the OR `/models`
  normalizer (GAP-3 lands one line here).
- `packages/server/src/transport/trpc/routers/sessions.ts:33-39` — `sessions.me` returns
  `{ userId, handle, globalRole }` (the owner-gating read).

CONTRACTS:
- `packages/contracts/src/connection/index.ts` — `CHAT_APIS` (36-43), `ChatSource` re-export (54),
  `ModelCatalogEntry` (252-268; **`promptPrice` is USD PER TOKEN** — line 257 — so display
  `$/M = promptPrice * 1e6`; `inputModalities` 264, `supportedParameters` 266), `AgentSdkModel`
  (281-296: `alias`, `resolvedModel`, `displayName`, `supportsEffort`, …), `ROUTING_ROLE_KEYS` /
  `routingRoleKeySchema` (327-337), `DEFAULT_CHAT_MODEL_ID = "claude-opus-4-8"` (375).
- `packages/contracts/src/credentials/index.ts` — `CRED_SOURCES` / `credentialSourceSchema` (42-50),
  `CRED_PROVIDERS` (68-77), `providerMetadataSchema` custom arm ALREADY has optional `model` (93)
  and `contextWindow` (99), `CustomOpenAiCredential` (183-190 — NO `model` field: GAP-6 target),
  `CredentialHealth` (132-136).
- `packages/contracts/src/settings/index.ts` — `INFERENCE_SOURCES` (311), `SUMMARIZE_SOURCES` (312),
  the per-role roleDefaults schemas with per-field `.catch(undefined)` self-heal (314-340).

UI PRIMITIVES (all exist — compose only, nothing net-new in `@orb/ui`):
- `packages/ui/src/primitives/command/` — cmdk seal; `Command` root takes cmdk props (so
  `shouldFilter={false}` passes through) + an `onEscape` seam (`command.tsx:20-31`); the header
  EXPLICITLY blesses composing `<Popover><Command…/></Popover>` at the client layer
  (`command.tsx:41-45`). Exports: Command/CommandInput/CommandList/CommandEmpty/CommandGroup/
  CommandItem/CommandSeparator/CommandLoading (`index.ts`).
- `packages/ui/src/primitives/popover/index.ts` — `Popover`, `PopoverTrigger`, `PopoverPopup` (+
  arrow/title/close/handle).
- `packages/ui/src/primitives/toggle-group/index.ts` — `ToggleGroup`.
- `packages/ui/src/primitives/status-chip/` — `StatusChip` (statuses `idle|running|succeeded|failed`,
  `status-chip.tsx:17`; takes `summary` + pre-formatted `timestamp` strings, 39-51).
- `packages/ui/src/primitives/list-row/`, `skeleton/`, `badge/`, `select/` — as today.
- `packages/ui/src/fuzzy-search/fuzzy-search.ts:135-139` — `useFuzzySearch<T extends {id:string}>(items, query, options)`
  (minisearch sealed here — the approved home; do NOT import minisearch in the feature).

---

## 1. The target UX (from the verified mockup)

Two anchored sections, unchanged ids (`connections-nav.ts:15-18`):

**(a) Model roles** — 7 rows (chat · agent · embed · rerank · imageEmbed · summarize ·
generateImage), each `label-col · source Select · MODEL CELL · tail`. The tail = an 8px status dot
(+ Clear when configured). The chat row keeps its Protocol sub-row. The embed advisory stays.
The MODEL CELL is source-polymorphic:

| selected source | model cell renders |
|---|---|
| `openrouter`, `max-pro-sub` | **ModelPicker** (Popover + Command, §3) |
| `custom_openai` | **ModelPicker** + fires `credentials.fetchModels` on open + permanent "Use "{query}" as typed" row |
| `vllm` | **STATIC read-only display** — the facade's `defaultModelId` ghosted, dashed/e muted, a `server config` chip, NO chevron, NOT interactive |
| `local-light` | **STATIC read-only display** — the builtin trio ghosted, a `built-in` chip, NO chevron |
| unset (`""` = "Default") | ghost of the RESOLVER's actual pick for this role (the facade `defaultModelId` for the role's default source; muted italic) |

**(b) Saved keys** — grouped by provider (a header per `CredentialProvider` present), each row:
health dot · label (+ custom endpoint baseUrl subtitle) · rendered last-probe result ("checked 2m
ago" / "unreachable") · Active badge · Test · Set active · Remove. Add-key dialog gains the custom
model field + draft "Fetch models" check.

Hard behavioral rules (all verified against the resolver):
1. **Source change clears the model** — flipping `<role>.source` also sets `<role>.model` to `""`
   (no stale `claude-*` id riding a flip to vllm).
2. **Chat `api` options are FILTERED by the selected source** — `assertCoherent`
   (`resolve-role.ts:148-166`) hard-throws otherwise. Legal map (derive it as a pure
   `chatApisForSource(source)` in `connections-model.ts`):
   - `max-pro-sub` → `["agent-sdk"]`
   - `openrouter` → all four (`agent-sdk`, `chat-completions`, `responses`, `anthropic-messages`)
   - `vllm` / `local-light` / `custom_openai` → `["chat-completions", "responses"]`
   - plus the empty "Auto" option always.
   An illegal stored `api` (left over from a source flip) renders the Auto option selected.
3. **`max-pro-sub` is OWNER-GATED (D17)** — read `trpc.sessions.me` (`sessions.ts:33-39`);
   `globalRole !== "owner"` ⇒ the source option is DISABLED with an "owner only" hint — visible,
   never hidden.
4. **The Agent row live-mirrors Chat** — `form.Subscribe` selecting `state.values.chat` renders
   Chat's effective source/model ghosted in the read-only agent row ("follows Chat ↑" chip). The
   agent selector in the resolver reads `rd.chat` (`resolve-role.ts:69-74`) so the mirror is honest.
5. **Unset rows ghost the resolver's actual pick** — the facade's `defaultModelId` for that
   (role, default source), rendered muted-italic, NEVER persisted.
6. **A stale stored id** (stored model ∉ facade models, source has a catalog, `allowsFreeText`
   false) renders the raw id + an amber `Badge`: *"not in catalog — falls back to {healTarget}"*.
   healTarget = the facade `defaultModelId` (agent-sdk heals via `healToChatDefault`
   `heal-model.ts:25-41`; OR heals via `pickOrModel` to `openrouter/auto`,
   `contracts/connection:379`).
7. **Per-row 8px status dot** from the facade `state` (+ credential list):
   - green `ok` — resolvable (catalog present + key present, or keyless-legal source healthy)
   - red `needs-key` — clicking it scrolls to the saved-keys anchor
     (`settingsAnchorId("connections", CONNECTIONS_SUBCATEGORY_IDS.keys)` — surface line 47)
   - grey — local tiers (`vllm` available, `local-light` always)
   - amber — `owner-only` (non-owner on max-pro-sub) or `engine-off` (vllm with
     `vllmAvailable === false`) or `empty-catalog` / `needs-probe`.

---

## 2. Phase 1 — the server facade `connection.getModelsForSource`

**Non-negotiable: ZERO OUTBOUND FETCH.** Snapshot/config/state reads only. The SSRF-guarded
outbound calls stay exactly where they are (`credentials.fetchModels` / `inspectEndpoint` /
`refreshCatalog` mutations). This is why it is an `authedProcedure.query` and safe as one.

### 2.1 Contract shapes — `packages/server/src/domain/connection/contract/results.ts` (append)

Domain-internal result (client receives it by tRPC inference, the `CredentialView` pattern —
`domain/credentials/contract/views.ts:1-9`; do NOT put it in `@orb/contracts`):

```ts
/** One pickable model as the Connections picker renders it. */
export interface SourceModelEntry {
  readonly id: string;            // the persistable model id (what roleDefaults.<role>.model stores)
  readonly label: string;         // display name (OR `name`; agent-sdk `displayName`; else id)
  readonly detail?: string;       // secondary line (e.g. agent-sdk alias resolution "sonnet → claude-sonnet-5")
  readonly contextLength?: number;
  readonly promptPrice?: number;         // USD PER TOKEN (ModelCatalogEntry semantics — client formats ×1e6 as $/M)
  readonly inputModalities?: readonly string[];      // OR entries only — feeds the Vision chip
  readonly supportedParameters?: readonly string[];  // OR entries only — feeds the Tools chip ("tools" ∈)
  readonly dimensions?: number;   // embed-role vllm/local-light entries (VLLM_EMBED_DIM / 1024 builtin)
  readonly origin: "catalog" | "curated" | "config" | "builtin";
}

export type SourceModelsState =
  | "ok" | "empty-catalog" | "needs-key" | "owner-only" | "engine-off" | "needs-probe";

export interface SourceModelsResult {
  readonly state: SourceModelsState;
  readonly models: readonly SourceModelEntry[];
  readonly fetchedAt: number | null;      // snapshot fetchedAt (OR / agent-sdk); null for config/builtin/custom
  readonly defaultModelId: string | null; // what the resolver would pick for (role, this source) when unset — the ghost/auto-fill value
  readonly allowsFreeText: boolean;       // true ONLY for custom_openai
}
```

### 2.2 Params — `packages/server/src/domain/connection/contract/params.ts` (append)

```ts
/** `getModelsForSource(params)` — the read-only picker facade (NO outbound fetch). */
export interface GetModelsForSourceParams {
  readonly principal: Principal;
  readonly source: ChatSource;
  readonly role: RoutingRoleKey;
}
```

### 2.3 Verb — NEW `packages/server/src/domain/connection/verbs/get-models-for-source.ts`

Convention (memory: orb verb-file conventions): `createGetModelsForSource(ctx: ConnectionContext)`
factory returning `ConnectionService["getModelsForSource"]`, plus a MIRROR
`get-models-for-source.int.test.ts` beside it (the structure gate requires the pair).

Signature on `ConnectionService` (`contract/service.ts`, alongside `getCatalog` at 136):

```ts
readonly getModelsForSource: (params: GetModelsForSourceParams) => Promise<SourceModelsResult>;
```

Per-source union (the whole verb is a 5-arm switch over `params.source`, `assertNever`-exhaustive
like `credentials/verbs/resolve.ts:93-108`):

**`openrouter`** — read the snapshot via the same path `getCatalog` uses
(`persistence/catalog-snapshot.ts:33` `readCatalogSnapshot(ctx.db)`; warm-on-read is free).
- snapshot null/empty ⇒ `state: "empty-catalog"`, `models: []`, `fetchedAt: null`.
- else map `ModelCatalogEntry` → `SourceModelEntry` (`origin: "catalog"`, carry
  name/contextLength/promptPrice/inputModalities/supportedParameters), `fetchedAt: snapshot.fetchedAt`.
- KEY CHECK (keyless browse stays legal): `await ctx.resolveCredential({principal, source:"openrouter"})`
  in try/catch — `DomainNoCredentialError` ⇒ `state: "needs-key"` **but models stay populated**
  (browse-without-key is deliberate; only the dot goes red). Any other throw re-throws.
- `defaultModelId`: `DEFAULT_OR_CHAT_MODEL_ID` (`"openrouter/auto"`, contracts/connection:379) for
  chat-family roles; `null` for generateImage (resolver has no OR image default —
  `resolve-role.ts:108-113` model stays null and heals through `castId`).

**`max-pro-sub`** — owner state first: `!ctx.isOwner(params.principal)` ⇒ `state: "owner-only"`
(models MAY still be returned — the option renders disabled client-side; returning the curated list
keeps the UI honest). Models: read the agent-sdk snapshot
(`persistence/agent-sdk-catalog-snapshot.ts` read fn, the twin of `readCatalogSnapshot`); map
`AgentSdkModel` → entry `{ id: alias, label: displayName, detail: resolvedModel ? `${alias} → ${resolvedModel}` : undefined, origin: "catalog" }`.
Cold/empty snapshot ⇒ FALL BACK to the curated `CHAT_MODELS` (`catalog/chat-models.ts:49`) as
`{ id, label, origin: "curated" }` with `fetchedAt: null`. `defaultModelId`:
`DEFAULT_CHAT_MODEL_ID` (`"claude-opus-4-8"`, contracts/connection:375 — what
`healToChatDefault(null)` returns, `heal-model.ts:26-28`). `allowsFreeText: false`.

**`custom_openai`** — KEY-PRESENCE ONLY, never a fetch. Try
`ctx.resolveCredential({principal, source:"custom_openai"})`:
- `DomainNoCredentialError` ⇒ `state: "needs-key"`.
- resolves ⇒ `state: "needs-probe"` (the CLIENT fires `credentials.fetchModels` on picker open —
  §3; a `[]` result keeps free-text usable).
- `models: []`, `fetchedAt: null`, `allowsFreeText: true`,
  `defaultModelId`: the credential's metadata `model` when present (post-GAP-6 it is on the minted
  credential; pre-GAP-6 readable via `parseCustomOpenAiEndpoint` — `substrate/parse-metadata.ts:17,34`),
  else `null`.

**`vllm`** — pure env/config read:
- `!ctx.vllmAvailable` ⇒ `state: "engine-off"` (still return the config entry — the user should see
  what WOULD run).
- role→model exactly mirroring the resolver selectors (`resolve-role.ts:75-113`):
  embed/imageEmbed → `env.VLLM_EMBED_MODEL` (env/index.ts:97), rerank → `env.VLLM_RERANK_MODEL`
  (:98), chat/agent/summarize → `env.VLLM_GEN_MODEL` (:99), generateImage → NOT a vllm role
  (schema forbids it — `contracts/settings:327-329` openrouter-only) ⇒ empty result is fine, the
  client never asks.
- ONE entry `{ id: <env model>, label: <env model>, origin: "config", dimensions: env.VLLM_EMBED_DIM for embed/imageEmbed }`
  (env/index.ts:100). `state: "ok"` when available. `defaultModelId` = that same id.
  `fetchedAt: null`. `allowsFreeText: false`.

**`local-light`** — the injected builtin trio via a NEW `ConnectionContext.localLightDefaults`
(§2.5; domain must not runtime-import infra — `domain-no-cross-feature`,
`contract/service.ts:7-9`): embed/imageEmbed → `localLightDefaults.embed` / `.imageEmbed`
(both `"jinaai/jina-clip-v2"`), rerank → `.rerank` (`"Xenova/ms-marco-MiniLM-L-6-v2"`). ONE entry,
`origin: "builtin"`, `dimensions: 1024` for the embeds (the fixed shared space —
`connections-model.ts:180-186`), `state: "ok"`, `defaultModelId` = the id, `fetchedAt: null`,
`allowsFreeText: false`. Non-derive roles: empty models + `state: "ok"` (client never asks —
`INFERENCE_SOURCES` gates the picker options).

AUTO-FILL CONTRACT (binding on Phase 3): for `vllm`/`local-light` the client DISPLAYS
`defaultModelId` ghosted and PERSISTS `""` — the resolver derives it live from env/builtin when the
stored model is unset (`resolve-role.ts:78,84,90,104` env fallbacks; `:139-141` the empty-model
local-light self-default). Stamping the env value into `roleDefaults` would freeze a server-config
change — that is the bug this contract exists to prevent.

### 2.4 Router — `packages/server/src/transport/trpc/routers/connection.ts` (append)

```ts
getModelsForSource: authedProcedure
  .input(z.object({ source: credentialSourceSchema, role: routingRoleKeySchema }))
  .query(({ ctx, input }) =>
    ctx.services.connection.getModelsForSource({
      principal: ctx.auth, source: input.source, role: input.role,
    })),
```

`routingRoleKeySchema` from `@orb/contracts/connection` (:337); `credentialSourceSchema` already
imported (connection.ts:8). Register the verb in `domain/connection/service.ts`
(`createConnectionService`, 19-34) + the interface in `contract/service.ts` (§2.3).

### 2.5 Context wire — `localLightDefaults`

- `contract/service.ts` `ConnectionContext` (95-114) gains:
  ```ts
  /** The local-light builtin model trio (embed/imageEmbed/rerank), injected at the composition
   *  root from backends/local-light (domain cannot runtime-import infra). Read ONLY by
   *  getModelsForSource — the resolver keeps deriving via the empty-model pass-through. */
  readonly localLightDefaults: {
    readonly embed: string; readonly imageEmbed: string; readonly rerank: string;
  };
  ```
- `entry/compose/services.ts` connection block (287-313) gains:
  ```ts
  localLightDefaults: {
    embed: DEFAULT_EMBED_MODEL,
    imageEmbed: DEFAULT_IMAGE_EMBED_MODEL,
    rerank: DEFAULT_RERANK_MODEL,
  },
  ```
  imported from `#infra/providers` (the barrel re-exports them —
  `backends/local-light/index.ts:16-19`; entry→infra imports are legal, precedent
  `fetchModels: fetchOpenAiModels` at services.ts:281).
- Every existing `createConnectionService` TEST FIXTURE gains the field (tsc will enumerate them).

### 2.6 GAP-3 (additive) — `outputModalities` on the catalog entry

- `packages/contracts/src/connection/index.ts` `modelCatalogEntrySchema` (252-267): add
  `outputModalities: z.array(z.string()).optional()` beside `inputModalities` (264). OPTIONAL —
  existing persisted snapshots parse unchanged (`catalogSnapshotSchema` results.ts:14-17 keeps
  passing; no snapshot invalidation).
- `packages/server/src/infra/providers/backends/openrouter/catalog.ts` normalizer (42-52): one line
  `outputModalities: model.architecture.outputModalities?.map(String),` (mirror the
  `inputModalities` mapping at :50; verify the SDK field name on `@openrouter/sdk/models`'
  `Model.architecture` before writing — if absent in the SDK type, map from the raw loose field).
- Purpose: the generateImage picker can filter to `outputModalities ∋ "image"`. Carry it onto
  `SourceModelEntry` as an optional field too.

### 2.7 GAP-6 (additive) — carry `metadata.model` through the custom mint

- `packages/contracts/src/credentials/index.ts` `CustomOpenAiCredential` (183-190): add
  `readonly model: string | undefined;` (the metadata schema already carries it — :93).
- `packages/server/src/domain/credentials/substrate/mint.ts` `mintCustomOpenAi` (62-75): add
  `model` to the args + the literal.
- `packages/server/src/domain/credentials/verbs/resolve.ts` `resolveCustomOpenAi` (79-84): thread
  `model: endpoint.model ?? undefined` (`parseCustomOpenAiEndpoint` already extracts it —
  `substrate/parse-metadata.ts:17,34`).
- tsc will surface any other `mintCustomOpenAi` caller/fixture.

### 2.8 Phase 1 done-criteria

- [ ] `connection.getModelsForSource` callable, authed, `.query` (no CSRF exemption needed —
      grep-verify the verb body has NO `fetch`/`safeFetch`/injected-op-that-fetches call).
- [ ] `get-models-for-source.int.test.ts` covers: OR warm-snapshot ok / cold empty-catalog /
      keyless needs-key with models still populated; max-pro-sub owner ok via snapshot, cold →
      curated fallback, non-owner → owner-only; custom needs-key vs needs-probe; vllm role→env map +
      engine-off; local-light trio + dimensions.
- [ ] Ghost parity test: for each (role, source) the verb's `defaultModelId` equals what
      `resolveRole` actually resolves for an UNSET slot (guards resolver/facade drift — this is the
      load-bearing test of the phase).
- [ ] GAP-3: normalizer maps outputModalities; old snapshots still parse.
- [ ] GAP-6: `resolve` mints `model` from metadata; existing tests green.
- [ ] `pnpm check` green (pre-commit runs check, not test — run the connection/credentials int
      suites explicitly, backgrounded with `timeout: 600000`, read output ONCE in full).

---

## 3. Phase 2 — the `ModelPicker` client component (the one net-new component)

NEW `packages/client/src/features/settings/components/model-picker.tsx` (+ a pure
`lib/model-picker-model.ts` if the mapping logic pushes the component over the §2.1 size cap).
A FEATURE component — NOT an `@orb/ui` primitive (the Command seal's own header directs overlay
composition to the client layer — `packages/ui/src/primitives/command/command.tsx:41-45`).

### Composition

```
<Popover>                                   (@orb/ui/popover)
  <PopoverTrigger render={<the model-cell trigger button: current label + meta + chevron>} />
  <PopoverPopup>                            (anchored under the cell, ~384px wide — mockup .picker)
    <Command shouldFilter={false} onEscape={close}>   (@orb/ui/command — manual filtering)
      <CommandInput aria-label="Search models" />
      [filter chips row — openrouter only]  <ToggleGroup> Vision · Tools   (@orb/ui/toggle-group)
      <CommandList>
        <CommandEmpty>No models match.</CommandEmpty>
        [Recent group]   <CommandGroup heading="Recent">…</CommandGroup>
        [All models]     <CommandGroup heading="All models">… capped …</CommandGroup>
        ["+N more" row]  (non-selectable info row when the cap truncates)
        [free-text row]  <CommandItem>Use "{query}" as typed</CommandItem>   (custom_openai only, permanent)
      </CommandList>
      [footer]  "synced {relative(fetchedAt)}" · "{models.length} models"
    </Command>
  </PopoverPopup>
</Popover>
```

### Props (exact)

```ts
export interface ModelPickerProps {
  readonly source: CredentialSource;            // drives per-source affordances
  readonly role: RoutingRoleKey;                // query input + Recent-list key
  readonly value: string;                       // the form's current model ("" = unset)
  readonly onValueChange: (id: string) => void; // writes the form field
  readonly ariaLabel: string;                   // "<slot label> model"
  readonly result: SourceModelsResult | undefined; // the facade read (surface owns the query)
  readonly isLoading: boolean;
  readonly customModels?: readonly string[];    // custom_openai: the fetchModels ids (client-fired)
  readonly customModelsPending?: boolean;
}
```

The SURFACE owns the tRPC query (`useQuery(trpc.connection.getModelsForSource.queryOptions({source, role}))`,
enabled when the row's source is a picker source) so the picker stays a controlled dumb-ish
component and the query is shared with the status dot.

### Behaviors (each verified feasible against the cited primitive)

- **Manual filtering**: `shouldFilter={false}` on `Command` (cmdk prop, passes through the seal —
  `command.tsx:60-75` spreads `...rest`). Filter with
  `useFuzzySearch(entries, query, { fields: ["label", "id"] })`
  (`packages/ui/src/fuzzy-search/fuzzy-search.ts:135`; entries must carry `id` — they do). Track
  `query` via `CommandInput`'s `value/onValueChange` (cmdk-controlled input).
- **Render cap ~50**: slice the filtered list to `MODEL_PICKER_RENDER_CAP = 50`; when truncated
  append a non-interactive "+{n − 50} more — keep typing" row. (Named constant — no magic number.)
- **Recent group** (device-local, per-source): `localStorage` key
  `orb:connections:recent-models:<source>` holding the last ≤5 picked ids (MRU, de-duped). On pick:
  unshift + persist. Render as the "Recent" `CommandGroup` ABOVE "All models", only for ids still
  present in the current entry list (or, for custom, in customModels), only when the query is empty.
- **Item layout** (mockup .pitem): name + conditional badges — `vision` when
  `inputModalities ∋ "image"`, `tools` when `supportedParameters ∋ "tools"` — over the mono id;
  right meta column: `contextLength` (compact, e.g. `200K`) + price. **Price formatting:**
  `promptPrice` is USD/token (contracts/connection:257) ⇒ display `$${(promptPrice * 1e6).toFixed(2)}/M`
  (trim trailing zeros); `null`/absent ⇒ omit.
- **Vision/Tools filter chips**: `ToggleGroup` (multi), openrouter results only (the only source
  whose entries carry modalities/parameters). Filter BEFORE the cap.
- **custom_openai arm**: on popover open (Popover `onOpenChange(true)`) fire
  `trpc.credentials.fetchModels.mutate({})` — resolves the ACTIVE saved credential server-side
  (`routers/credentials.ts:86-99` with neither draft nor… NOTE: the router requires `credentialId`
  or `draft`; pass the active credential's id from `credentials.list`). `[]` (fetch failed / no
  /models) keeps the picker usable via the free-text row. While pending show `CommandLoading` /
  `Skeleton`. The PERMANENT last row `Use "{query}" as typed` (disabled when query is blank) calls
  `onValueChange(query.trim())`.
- **Query resets on close**: clear the query state in `onOpenChange(false)`.
- **Footer**: `synced {formatRelative(fetchedAt)}` when `fetchedAt !== null`, else the source's
  static note ("endpoint /models" / "curated"). Time formatting happens HERE in the client — ui
  primitives take pre-formatted strings only (`status-chip.tsx:45`).
- **Selection**: `CommandItem onSelect={() => { onValueChange(entry.id); close(); pushRecent(entry.id); }}`.

### Phase 2 done-criteria

- [ ] Component renders from a fake `SourceModelsResult` in a CT/unit harness: filtering, cap +
      "+N more", Recent persistence round-trip, chips filter, price formats `1.5e-5 → $15.00/M`,
      free-text row (custom only), query-reset-on-close.
- [ ] No minisearch/cmdk direct imports (only `@orb/ui/fuzzy-search`, `@orb/ui/command`).
- [ ] Keyboard path: open → type → arrows → Enter selects → focus returns to trigger (cmdk +
      Popover defaults; verify, don't reimplement).
- [ ] a11y: trigger has the row's aria-label; input labeled; verified against the
      side-eye reading-surface rules.

---

## 4. Phase 3 — role-row rework

Files: `components/role-slot-row.tsx` (rewrite the model cell + tail),
`lib/connections-model.ts` (pure additions), `surfaces/connections-settings-surface.tsx`
(queries: `sessions.me`, per-row facade reads — or a small `hooks/use-role-source-models.ts`).

1. **Replace the free-text model `Input`** (`role-slot-row.tsx:103-114`) with the source-dispatched
   cell (§1 table). Keep the field binding: the picker's `onValueChange` writes
   `form.setFieldValue(`${role}.model`, id)` — autosave then persists through the existing
   `toRoutingSection` (`connections-model.ts:337-357`) untouched.
2. **Static vllm/local-light display**: muted value = facade `defaultModelId`, dashed border, chip
   `server config` (vllm) / `built-in` (local-light), `dimensions` shown for embed roles
   ("1024-dim"), NO chevron/interaction. PERSIST NOTHING (the auto-fill contract §2.3). When the
   stored model is non-empty for these sources (legacy hand-typed value), show it with a subtle
   "clears to server config" hint — the Clear button already releases it.
3. **Source-change clears model**: in the source `AppField` `onValueChange`
   (`role-slot-row.tsx:96-99`), also `form.setFieldValue(`${role}.model`, "")`.
4. **Chat api filtering**: add pure `chatApisForSource(source: string): readonly ChatApi[]` to
   `connections-model.ts` encoding the §1.2 map (mirror of `assertCoherent`,
   `resolve-role.ts:148-166` — cite it in the function's header comment); `ChatSlotKnobs`
   (`role-slot-row.tsx:142-169`) subscribes to `chat.source` and rebuilds `apiItems` from it.
5. **Owner gating**: surface reads `useSuspenseQuery(trpc.sessions.me.queryOptions())`; pass
   `isOwner` down; in the source `Select` items mark `max-pro-sub` disabled + label suffix
   "(owner only)" when `!isOwner` (`SOURCE_LABELS` stays one home — compose the suffix at item
   build). Do NOT hide the option.
6. **Agent mirror row**: replace the bare read-only row (`role-slot-row.tsx:64-70`) with the
   label + `follows Chat ↑` chip + `form.Subscribe` ghost of chat's source/model (muted).
7. **Status dot**: a small `RoleStatusDot` (feature component) mapping
   `{facade state, source} → tone` per §1.7; red wraps a button that
   `document.getElementById(anchor(keys))?.scrollIntoView({behavior:"smooth"})` (anchor helper —
   surface line 47). 8px dot with an `aria-label` naming the state (a11y: never color alone —
   pair a title/tooltip text).
8. **Stale-id amber path** (§1.6): compute in the row from (stored model, facade result); render
   the amber Badge under the cell (the `embedDimensionWarning` advisory row is the layout
   precedent — surface lines 128-148).
9. **Ghost-unset**: when `source === ""`, the model cell shows the RESOLVER default ghost. Chat's
   unset default is owner-conditional (`resolve-role.ts:62-68`: owner → max-pro-sub/agent-sdk,
   else vllm) — derive which facade result to ghost from `isOwner`.
10. Query strategy: one `getModelsForSource` query per CONFIGURED (source, role) pair, standard
    react-query dedupe; `staleTime` generous (~60s) — the underlying snapshots are TTL-cached
    server-side anyway (`or-model-cache.ts:22` 1h TTL).

Phase 3 done-criteria:
- [ ] All 7 rows render in the @2xl dense layout AND the narrow stacked layout (the container
      switch untouched — `role-slot-row.tsx:83-88`).
- [ ] Flip source → model clears; pick model → autosave fires (`updateUserSettingsSection` patch,
      surface 100-106); reload round-trips.
- [ ] vllm/local-light rows persist `""` — assert the saved `routing` patch OMITS the role
      (`toRoutingSection` collapse, connections-model.ts:308-318) while the UI shows the ghost.
- [ ] Non-owner: max-pro-sub disabled-with-hint; chat unset ghost shows the vllm default.
- [ ] `assertCoherent` can no longer be tripped from this UI: every reachable (api, source) combo
      the pickers offer passes it (unit-test `chatApisForSource` against a copy of the resolver
      matrix).
- [ ] side-eye pass on the pane (the D62 lesson: verify RENDERED output via __orb/snap, not
      source-token greps — memory `done-not-equal-rendered`).

---

## 5. Phase 4 — saved-keys rework

Files: `surfaces/connections-settings-surface.tsx` (`SavedKeysSection`, 156-207),
`components/credential-key-row.tsx`, `components/add-credential-dialog.tsx`,
`lib/add-credential-form-model.ts`, `hooks/use-connections-mutations.ts`.

1. **Group by provider**: bucket `credentials.list` by `credential.provider`, render a
   `PROVIDER_LABELS[provider]` header (`connections-model.ts:38-40`) per non-empty bucket, rows
   inside (mockup `.kcluster`). Stable order = `PROVIDERS_ORDERED` (+ `gif-search` last if present —
   it is a storage-axis member, `contracts/credentials:68-77`).
2. **Render the health result (GAP-1)**: the Test mutation ALREADY returns `CredentialHealth`
   (`test-health.ts:76-104` → `{status, checkedAt, reason?}`) — it is just dropped today. Hold the
   last result in ROW STATE (`useState<CredentialHealth | null>`), set from `mutateAsync`'s
   resolution. Render: a status dot + text ("checked {relative(checkedAt)}" / "unreachable —
   {reason}" / "throttled — retry in a minute" / "revoked"). SESSION-EPHEMERAL by owner ruling —
   no persistence, no migration; `revokedAt` remains the durable marker (`views.ts:26`,
   the Revoked badge stays — `credential-key-row.tsx:74-78`).
3. **Route Test per provider (GAP-4)**:
   - `custom_openai` rows → `credentials.fetchModels.mutate({ credentialId })`
     (`routers/credentials.ts:86-99`): non-empty ⇒ render "reachable — {n} models"; `[]` ⇒
     "unreachable or no /models" (the verb is best-effort-[] by design — `fetch-models.ts` header;
     accept the ambiguity, it is the designed trade).
   - every other provider → the existing `testHealth` (openrouter probes for real; others return
     `ok` without probing — `test-health.ts:90-94` — render "ok (not probed)" honestly for those).
4. **Add-key dialog, custom arm**: add an optional `model` TextField (persist into
   `metadata: { kind: "custom_openai", baseUrl, model }` — the schema already accepts it,
   `contracts/credentials:93`; extend the save mapping at `add-credential-dialog.tsx:74-81` and
   `AddCredentialFormValues`/defaults/validator in `add-credential-form-model.ts:16-29,44-55`).
   Add a **"Fetch models" draft check** button (enabled when baseUrl non-empty): fires
   `credentials.fetchModels.mutate({ draft: { baseUrl, key } })` (draft-wins arm —
   `fetch-models.ts:19-25`) and renders the count / failure inline BEFORE save. Purely advisory —
   never blocks submit.
5. **Keep** plaintext write-once entry, per-open fresh mount, set-active/remove flows untouched
   (`credential-key-row.tsx:91-130`).

Phase 4 done-criteria:
- [ ] Grouped rendering with ≥2 providers; empty state unchanged (surface 175-186).
- [ ] Test on an openrouter row renders the live result and survives being re-clicked inside the
      60s server throttle (renders "throttled" — `test-health.ts:85-88`).
- [ ] Test on a custom row hits fetchModels, renders reachable-count / unreachable.
- [ ] Add-key custom arm: model saves into metadata (verify via the resolver: post-GAP-6 the
      minted credential carries it) and the facade's custom `defaultModelId` reflects it; draft
      Fetch-models works pre-save.
- [ ] No secret ever rendered (the belt is structural — `views.ts` projection — but side-eye the
      dialog + rows anyway).

---

## 6. Build order, gates, non-goals

Order: Phase 1 → 2 → 3 → 4. Phases 2 can start once Phase 1's result SHAPE is merged (the client
codegen needs the router live for inference). 3 depends on 1+2; 4 is independent of 2-3 (only
GAP-6 from Phase 1).

Gates every phase: `pnpm check` green (the pre-commit hook runs check, not test); the touched
domains' int suites run in full (background, `timeout: 600000`, read output ONCE — never
tail-and-rerun); new verb file has its mirror `.int.test.ts` (structure gate). No DB schema
changes anywhere in this build — if one appears, the design drifted; stop.

NON-GOALS (explicitly out): per-agent connection overrides (deferred to the agent-principal build —
`connections-model.ts:83-88`); BYO modelProfile (FLAG[PD-12], `contracts/credentials:23-29`);
persisted health history (GAP-1 ruling); a `roleDefaults.agent` key; exposing
`resolveRole`/`resolveChat` over tRPC (they stay internal — `routers/connection.ts:3-4`); any new
`@orb/ui` primitive; moving Connections out of the settings modal.
