# Orbweaver — `infra/providers`: the sealed execution tier (roles · backends · the local engine)

> **Status: planning (authoritative detail).** This is the infra **execution layer** — the sealed
> inference backends behind the role contracts. It is the largest, most load-bearing infra subsystem
> (neo-tavern `server/providers/` is ~8.5k lines across 80 files). It **executes**; it never
> **selects**. **Part II of this doc (below)** is the roles/sealed-backends/local-engine design (merged
> 2026-06-25 from the former top-level `providers-and-backends.md` — one home per topic): roles are
> the firewall; sealed backends; vLLM is its own multi-role engine; custom/BYO fully user-declared;
> hardware tiers; the embedding-space invariant. Upstream: `domains/connection.md` (selection vs execution —
> `runner`/`family`/`protocol` are sealed INSIDE providers and never leak; `resolveModelCapability`
> produces the descriptor) + `participants-agents-identity.md` (the agent-sdk backend is reserved for
> the sub + agent mode; the stateless chat-turn foundation; the session is a backend-internal
> canon-derived cache). `core/Core-0-Architecture-and-Structure.md §3` places infra as a sealed executor below domain; `§7` lists
> the gates. `core/AGENTS.md §2/§3/§4(providers)/§8.1/§8.7` + `core/Core-Legacy-Migration-and-Gaps.md`
> supply the dissolution rulings. The per-domain `domains/connection.md` + `domains/credentials.md`
> are the format/depth exemplars and the two domains that call into this tier. Read those four
> upstream docs first.

---

## What this tier owns

**Execution, not selection.** `connection` hands a request — `{ backend, model, credential,
capability }` plus the role-specific payload (a view/history, an embed input, a rerank query) — and
`infra/providers` runs it on the named backend. The tier owns **all wire-shaping, statefulness, env
configuration, name-handling, caching, and engine lifecycle** for every inference role, sealed behind
thin role contracts. Editing one backend cannot touch another; they meet only at the contract.

Concretely, `infra/providers` owns:

- **The role contracts (the firewall seams)** — one thin contract per role: `chat · agent · embed ·
rerank · imageEmbed · summarize · generateImage`. The domain calls a role and hands in a resolved
  request; it never names a backend. Each role is a dispatcher that maps the resolved `backend` (the
  sealed opaque key) → the sealed impl. **Correction (`core/AGENTS.md §8.7`, verified):** the
  non-chat dispatchers already `switch (req.credential.source)` and route OpenRouter as readily as
  vLLM — they are NOT vLLM-hard-pinned. The chat dispatcher switches on `req.runner` (a derived
  `f(api, source)`, sealed). The lock is a boot-binder default one layer up, not the dispatcher.

- **The four sealed chat backends** — `openrouter-chat` (stateless `chat.send` / `beta.responses`),
  `agent-sdk` (stateful; the Max sub + the OR-Anthropic skin + agent mode), `custom-byo` (raw-fetch
  to a user-wired endpoint), `vllm-chat` (the local engine's chat surface). **No backend imports
  another** (strategy isolation). The shared OpenAI-wire reducer/mapper lives in a pure infra `kit`
  module that BOTH `openrouter-chat` and `custom-byo` import downward — never one family reaching
  into another's folder.

- **The agent-sdk credential firewall (load-bearing, unleakable)** — the per-turn env builders
  (`buildClaudeSdkEnv` / `buildClaudeOpenRouterEnv` / `buildClaudeVllmEnv`), the
  `RESERVED_CLAUDE_ENV_KEYS` denylist, the ephemeral `CLAUDE_CONFIG_DIR` symlink-isolation, and the
  ~11 isolation/cost env pins. This is the seam that keeps the Max-sub OAuth token unreachable from a
  paid/third-party spawn — security-load-bearing, rebuilt every turn (see Esoteric §1).

- **The agent-sdk session as a backend-internal canon-derived cache** — the SDK `SessionStore`,
  seed-frame synthesis, resume, and reseed-when-stale. In neo-tavern this leaks UP into the chat
  domain (`chat/persistence/frames.ts` + `store.ts` + `session.ts` build the `SessionStore` and pass
  `req.sessionStore` in). In orbweaver it moves DOWN, inside the `agent-sdk` backend — the domain
  turn is stateless-first and never sees a session concept (`participants-agents-identity.md §0/§7.1`).

- **The vLLM local engine (its own multi-role subsystem)** — the supervisor lifecycle
  (adopt/spawn/death-couple/breaker/health/orphan-reap), the process-local status + control
  registries, the loopback HTTP client, and five INDEPENDENT role surfaces (chat/embed/rerank/
  imageEmbed/summarize). The remote backends serve only `chat`; vLLM serves five roles — that
  asymmetry is why it is its own engine, not a peer in the chat-backend list.

- **The per-backend wire quirks** — `cache_control` placement (Anthropic-only; the runner PLACES the
  breakpoint at an offset the chat domain COMPUTES — see Esoteric §5); the OR-responses
  `effort`+`max_tokens` XOR; the Opus 4.8 adaptive/budget conflict guard; the OpenRouter
  provider-routing pin; the mandatory-reasoning strip-and-replay; the idle-timeout/pre-commit-retry
  machinery; the SSE reducers; the error-classification table; the cost/cache-economics math.

- **`resolveChat` — the intent × capability → wire-knobs funnel** — the `(UserIntent ×
ModelCapability) → resolved wire knobs` site. It needs the wire-quirk knowledge (the XOR, the
  adaptive/budget guard), so it stays infra (`infra/providers/resolve-chat.ts`). It READS the
  `ModelCapability` descriptor from connection; it does not produce it.

- **The diagnostic role surfaces** — `account` (credits/activity/generationCost/verifyAuth),
  `catalog` (the raw OR catalog HTTP fetch), `probe` (credential health probe). Family-agnostic,
  credential-shaped, dispatch on `credential.source`.

This tier does **NOT** own:

- **Selection / routing / policy** — which backend a role uses, the per-agent connection, the model
  pick, role defaults. That is `connection` (`resolveRole`). `runner`/`family`/`protocol`
  are derived INSIDE providers from the resolved `{backend}` and **never leak upward**.
- **The capability descriptor** — `resolveModelCapability` + the curated Claude catalog + family
  detection move to `domain/connection/catalog/` (the synthesis reads the OR snapshot connection
  holds). `ChatModel` + `FAMILY_CAPS` (the two-capability-system duality) dissolve into the ONE
  `ModelCapability` (`@orb/contracts/connection`). Providers consumes the descriptor; it no longer
  authors it.
- **Credential resolve/CRUD/health-state** — `credentials` domain. Providers receives a brand-protected
  `ResolvedCredential` (handed in) and `probe()` returns a raw `ProbeResult`; the throttle/circuit-breaker
  state is the domain's.
- **The model catalog as a stored resource** — `connection` owns the snapshot (KV) + the in-memory TTL
  cache. Providers keeps only the live HTTP `catalog.rawModels` fetch verb (an I/O adapter connection
  calls through injection).
- **Vector math** — `_shared/vector-math.ts` is pure, isomorphic, and has six DOMAIN consumers (zero
  provider consumers). It is mis-homed in infra; it goes to `@orb/kit/vector-math`.
- **The embedding store / the vector space** — `embeddings` owns the store and tags each vector with
  its `(model, dim)` space; `connection` owns the active-embed-model setting + the re-index trigger.
  Providers only PRODUCES vectors (the embed/imageEmbed surfaces); the space invariant is enforced above.

---

## The internal layout (orbweaver target)

```
infra/providers/                    THE EXECUTION TIER — sealed; domain reaches it ONLY via index.ts
├── index.ts                        FRONT DOOR — role surfaces + diagnostics + the catalog-fetch verb.
│                                   NO model catalog, NO derive*Profile, NO DEFAULT_*_MODEL_ID (those
│                                   leave for connection/contracts — kills the foundation→infra edge).
├── contract/
│   └── index.ts                    THE BARREL (NEW) — the one front door for the role request/result
│                                   shapes. Seals the 25 loose `providers/contract/*` deep-reaches
│                                   (§8.1). Cross-boundary shapes (results, ResolvedCredential,
│                                   CredentialHealth, ModelCapability) are RE-EXPORTS from @orb/contracts.
│   ·                               infra-internal request shapes (ChatRequest variants, AgentTurnRequest,
│                                   the ChatEvent/ChatError/wire vocab) stay here behind the barrel.
│
├── roles/                          THE FIREWALL — one thin dispatcher per role (the public surface)
│   ├── chat.ts                     runChatTurn(req) → dispatch on backend (sealed runner key)
│   ├── agent.ts                    runAgentTurn(req) → agent-mode (tools + loop); agent-sdk only today
│   ├── embed.ts                    embed(req) → dispatch on credential.source
│   ├── rerank.ts                   rerank(req)
│   ├── image-embed.ts              imageEmbed(req)
│   ├── summarize.ts                summarize(req)  (a request shaper over the chat role)
│   └── generate-image.ts          generateImage(req)
│
├── backends/                       SEALED STRATEGIES — no backend imports another (strategy isolation)
│   ├── openrouter/                 stateless chat.send / beta.responses (broad catalog incl. Claude-via-OR)
│   │   ├── runners/chat/{chat-completions,responses,shared,context-compression}.ts
│   │   ├── runners/{embed,rerank,image}/runner.ts   (the role surfaces OR serves)
│   │   ├── client.ts · catalog.ts · account.ts · probe.ts · credential-guard.ts
│   │   └── index.ts                family barrel
│   ├── agent-sdk/                  STATEFUL — the Max sub + OR-Anthropic skin + agent mode
│   │   ├── env.ts                  THE CREDENTIAL FIREWALL (3 env builders + reserved denylist +
│   │   │                           ephemeral config-dir isolation) — load-bearing, unleakable
│   │   ├── runner.ts               stream→ChatResult reducer (TurnAccumulator + per-kind handlers)
│   │   ├── agent-runner.ts         agent-mode (mcpServer + maxTurns) — the same firewall base
│   │   ├── session/                THE CANON-DERIVED CACHE (NEW home) — SessionStore + seed/reseed
│   │   │                           frames (moves DOWN from chat/persistence — backend-internal)
│   │   ├── translate.ts · types.ts · verify.ts · index.ts
│   ├── custom-byo/                 raw-fetch to a user-wired endpoint — FULLY config-driven
│   │   ├── runners/chat.ts · inspect.ts · index.ts   (NO baked profile — §1a)
│   ├── local-light/                KEYLESS in-process transformers.js/ONNX (D39) — embed/rerank/imageEmbed
│   │   ├── surfaces/{embed,rerank,image-embed}.ts    NO chat surface (deriveRunner throws); loopback like vLLM
│   └── kit/                        SHARED INFRA-PURE wire helpers (NOT a backend; below the backends)
│       ├── openai-compat/{body,stream}.ts            the OpenAI SSE reducer/mapper BOTH openrouter
│       │                                             + custom-byo import DOWN (the isolation seam)
│       ├── cache-control.ts · reasoning-budget.ts · wire-schemas.ts
│       ├── error-classify.ts · retry.ts · idle-timeout.ts · sanitize.ts
│
├── vllm/                           THE LOCAL MULTI-ROLE ENGINE (its own subsystem)
│   ├── engine/                     ONE OWNER: lifecycle
│   │   ├── supervisor.ts           adopt/spawn/death-couple/breaker/health/orphan-reap (decideTick pure core)
│   │   ├── engine-control.ts       supervisor→admin restart registry
│   │   ├── engine-status.ts        supervisor→runner status registry
│   │   ├── engines.ts              the "embed|rerank|gen" leaf (zero-import identity)
│   │   └── client.ts               loopback HTTP seam (enginePost)
│   └── surfaces/                   INDEPENDENT role surfaces (one registration per role it serves)
│       ├── chat.ts · chat-completion.ts             (the chat core + the summarize shaper over it)
│       ├── embed.ts · rerank.ts · image-embed.ts · summarize.ts
│
├── resolve-chat.ts                 STAYS infra — (UserIntent × ModelCapability) → wire knobs funnel
│                                   (reads the injected descriptor; enforces the wire-quirk XORs)
└── scripted-override.ts            dev/test RUNNER_OVERRIDE seam (credit-free runChat replay)
```

**Three sub-layers, three jobs.** `roles/` is the firewall (thin, stable). `backends/` are sealed
strategies that meet only at the contract + the pure `backends/kit/`. `vllm/` is a self-owned engine
that REGISTERS role impls. The binder (a composition-root concern, lives in `entry/` — see Cross-tier
composition) wires which backend each role resolves to at boot.

**Tree location — RESOLVED (§5 below):** vllm is **nested** under
`infra/providers/vllm/` (the layout above), not a sibling and not under an `infra/inference/` parent —
chosen for cohesion (the engine + its surfaces are one subsystem). `connection` references
`infra/providers/resolve-chat.ts` (exact). The vLLM role-clients builder is `infra/providers/vllm/role-clients`
(the nested path, per §7 D7) — `credentials.md` now uses the same spelling; the prior sibling-path alias is
reconciled. See §Decisions.

---

## Movement table

Every current `server/providers/*` unit → its orbweaver home → rationale → enforcement tier. (Units
that dissolve INTO `connection` are cross-referenced to `domains/connection.md` which owns their
landing detail; this table records the providers-side departure + its enforcer.)

| Unit                                                                                                                                                            | Outcome                                | Target                                                                                 | Rationale                                                                                                                                                                                                                                                                                                                                                                                      | Enforcement tier                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `providers/contract/*` (22 files, **NO barrel**)                                                                                                                | add front-door barrel                  | `infra/providers/contract/index.ts`                                                    | 25 of 32 provider deep-reaches are loose contract files (§8.1). One barrel seals the executor's typed surface; deep imports into `contract/<file>` from outside providers become RED.                                                                                                                                                                                                          | lint-time: dep-cruiser `providers-public-surface-only` — outside callers import the barrel, never `contract/<file>`               |
| `contract/embed-result.ts · rerank-result.ts · image-embed-result.ts · summarize-result.ts` (`EmbedResult`/`RerankResult`/`ImageEmbedResult`/`SummarizeResult`) | → `contracts`                          | `@orb/contracts/providers` (result namespace)                                          | Cross-boundary result shapes; `RoleClients` (→ contracts) depends on them, so they must land **first** (boot order, `Core-Legacy-Migration-and-Gaps.md §8`). Both the providers runners AND the domain consumers flow DOWN from contracts.                                                                                                                                                     | resolve-time: package dep; `@orb/contracts` is the declared home                                                                  |
| `contract/credential.ts` (`ResolvedCredential` brand, `ProviderFamily`, `ProviderRole`)                                                                         | → `contracts`                          | `@orb/contracts/credentials`                                                           | The brand is produced by `domain/credentials` and consumed by providers runners; living in `providers/contract/` makes an infra→domain conceptual edge. In `@orb/contracts` both tiers are consumers flowing down. `ProviderFamily`/`ProviderRole` are sealed-vocab unions that move with it.                                                                                                  | resolve-time: package dep (cross-ref `domains/credentials.md`)                                                                    |
| `contract/health.ts` (`CredentialHealth`)                                                                                                                       | → `contracts`                          | `@orb/contracts/credentials`                                                           | Cross-boundary: providers `probe()` subset AND domain `testHealth` superset.                                                                                                                                                                                                                                                                                                                   | resolve-time: package dep                                                                                                         |
| `contract/chat-model.ts` (`ChatModel`, `ChatModelSampling.agentSdkHonorsTemperature`, etc.)                                                                     | dissolved                              | `@orb/contracts/connection` — `ModelCapability`                                        | `ChatModel` is the precursor to the ONE capability descriptor; `agentSdkHonorsTemperature` bakes runner-vocab into the model shape (its sole reader is `resolve-chat.ts`'s temperature warning). Distinct per-knob `sampling` ranges replace it.                                                                                                                                               | compile-time: `ChatModel` deleted; any surviving ref fails `tsc` (cross-ref `domains/connection.md`)                              |
| `_shared/chat-models.ts` (`CHAT_MODELS`, `ChatModelId`, `getChatModel`, `DEFAULT_CHAT_MODEL_ID`, `getChatModelByTier`)                                          | → `connection`                         | `domain/connection/catalog/chat-models.ts`                                             | The curated Claude catalog is a selection resource, not an execution impl. The 3-stage prefix-match lookup is load-bearing (Esoteric §6). `DEFAULT_CHAT_MODEL_ID` also re-exports from `@orb/contracts/connection` for client use.                                                                                                                                                             | resolve-time: off the providers barrel; callers import from connection / contracts                                                |
| `_shared/model-family.ts` — `detectModelFamily` (regex)                                                                                                         | → `connection`                         | `domain/connection/catalog/model-family.ts`                                            | Family detection feeds `resolveModelCapability`. The `^(anthropic/)?claude[-/]` anchor is load-bearing (Esoteric §7).                                                                                                                                                                                                                                                                          | resolve-time: package/import move                                                                                                 |
| `_shared/model-family.ts` — `FAMILY_CAPS`                                                                                                                       | dissolved                              | `domain/connection/catalog/resolve-model-capability.ts`                                | `FAMILY_CAPS` is a partial precursor to `ModelCapability`; `hasFastMode` is dead (zero consumers outside the definition). The facts merge into `resolveModelCapability`.                                                                                                                                                                                                                       | compile-time: `FAMILY_CAPS` deleted; any ref fails `tsc`                                                                          |
| `openrouter/profile.ts` — `deriveOrChatProfile`                                                                                                                 | dissolved into connection              | `domain/connection/catalog/resolve-model-capability.ts`                                | The OR profile deriver reads `FAMILY_CAPS` + the catalog `supportedParameters` to build a `ChatModel`. The synthesis (supportedParameters → reasoning/sampling/verbosity axes) moves to `resolveModelCapability('openrouter-chat')`; connection holds the OR snapshot so it can synthesize without provider internals.                                                                         | compile-time: `deriveOrChatProfile` deleted from the barrel; the replacement is `connection.getModelCapability` wired at the root |
| `vllm/profile.ts` — `deriveVllmChatProfile` (+ `VLLM_GEN_CONTEXT_WINDOW`)                                                                                       | dissolved into connection              | `domain/connection/catalog/resolve-model-capability.ts`                                | A static profile; the window is env-served. Becomes the static vLLM arm of `resolveModelCapability`.                                                                                                                                                                                                                                                                                           | compile-time: same deletion                                                                                                       |
| `custom-openai/profile.ts` — `deriveCustomOpenAiChatProfile` (+ `CUSTOM_OPENAI_DEFAULT_WINDOW`)                                                                 | dissolved into a USER-DECLARED profile | `domain/connection/catalog/resolve-model-capability.ts` (`'custom-byo'` arm, user-fed) | The hardcoded 128k window + `tier:'sonnet'` + no-thinking contradicts the "user owns the truth" comment (§1a). Nothing baked: the profile comes from `providerMetadataSchema.modelProfile` (the credential metadata — ledger §2 / `credentials.md`) or the inspector probe.                                                                                                                    | compile-time: `CUSTOM_OPENAI_DEFAULT_WINDOW` deleted; any ref fails `tsc`                                                         |
| `resolve-chat.ts` (`resolveChat`)                                                                                                                               | **stays infra**                        | `infra/providers/resolve-chat.ts`                                                      | The `(UserIntent × ModelCapability) → wire knobs` funnel needs wire-quirk knowledge (the Opus 4.8 adaptive/budget guard, the XOR). It READS `ModelCapability` (injected) instead of calling `FAMILY_CAPS`. Right-sized; moves to the correct tier, not further.                                                                                                                                | resolve-time: connection imports the providers barrel (down), never the reverse                                                   |
| `_shared/reasoning-budget.ts` — `effortToResponsesReasoning`, `effortToOpenAIReasoning`, `OPENAI_EFFORT_LEVELS`                                                 | stays infra                            | `infra/providers/backends/kit/reasoning-budget.ts`                                     | Wire-level XOR constraint (OR responses rejects `effort`+`max_tokens`) — a backend quirk, not a capability gap. `resolve-chat`/the runners enforce it; connection never sees it.                                                                                                                                                                                                               | test-time: unit asserts `effortToResponsesReasoning` never emits both fields                                                      |
| `_shared/cache-control.ts` (`ANTHROPIC_CACHE_5M`, `isAnthropicModel`, `effectiveProviderRouting`)                                                               | stays infra                            | `infra/providers/backends/kit/cache-control.ts`                                        | Anthropic-only `cache_control` + OR provider-routing pin are pure backend wire concerns.                                                                                                                                                                                                                                                                                                       | lint-time: stays inside `infra/providers`; no domain import                                                                       |
| `openrouter/runners/chat/chat-completions.ts` — `placeHistoryCacheBreakpoint`                                                                                   | stays infra                            | `infra/providers/backends/openrouter/runners/chat/`                                    | The runner PLACES the rolling-tail breakpoint at the offset the chat domain computes; placement is wire-shaping (Esoteric §5).                                                                                                                                                                                                                                                                 | test-time: carry `pipeline-breakpoint`-equivalent + a cache-token assertion                                                       |
| `_shared/vector-math.ts` (`cosineSim`/`cosineDistance`/`l2Normalize`/`mean`/`pairwiseCosine`/`cosineToMany`)                                                    | → `kit`                                | `@orb/kit/vector-math`                                                                 | Pure, isomorphic, **six domain consumers, zero provider consumers** (chat/memory ×2, corpus ×4). Mis-homed in infra. The dim-mismatch throw is load-bearing (silent half-dot on embedder swap).                                                                                                                                                                                                | resolve-time: `@orb/kit` is the declared dep; `kit-purity` gate passes (no node:/domain/IO)                                       |
| `_shared/openai-compat/{body,stream}.ts`                                                                                                                        | stays infra                            | `infra/providers/backends/kit/openai-compat/`                                          | The shared OpenAI SSE reducer/mapper — the ISOLATION seam: openrouter + custom-byo both import it DOWN, so neither family imports the other. Today chat-completions.ts re-exports them for a test path; in orbweaver the canonical home is `backends/kit`.                                                                                                                                     | lint-time: dep-cruiser `strategy-isolation` — no `backends/<a>` import of `backends/<b>`                                          |
| `_shared/{error-classify,retry,idle-timeout,sanitize,wire-schemas}.ts`                                                                                          | stays infra                            | `infra/providers/backends/kit/`                                                        | Pure wire/transport helpers (HTTP-status table, pre-commit retry, idle abort, error sanitize-branding, lenient wire schemas). Backend-internal; no domain reach.                                                                                                                                                                                                                               | lint-time: stays inside `infra/providers`                                                                                         |
| `claude-sdk/env.ts` (3 env builders, `RESERVED_CLAUDE_ENV_KEYS`, config-dir isolation)                                                                          | stays infra, backend-internal          | `infra/providers/backends/agent-sdk/env.ts`                                            | THE credential firewall — security-load-bearing, rebuilt every turn (Esoteric §1). `core/AGENTS.md §7.2(c)` names it "the homeless nature": a backend-internal config of the agent-sdk strategy, NOT a settings tier. Must stay unleakable.                                                                                                                                                    | test-time: the env-firewall test (mode-2 OR skin can NEVER see the sub OAuth token) carries forward verbatim                      |
| `claude-sdk/runner.ts · translate.ts · agent-runner.ts · types.ts · verify.ts`                                                                                  | stays infra, sealed                    | `infra/providers/backends/agent-sdk/`                                                  | The agent-sdk runtime mechanics (stream reducer, options builder, agent-mode). `disciplineOptions` (tools:[] + cowork denylist + strictMcpConfig) IS the firewall base — keep sealed.                                                                                                                                                                                                          | lint-time: `providers-public-surface-only`; the `@internal` helpers never on the barrel                                           |
| chat-domain SDK session/seed (`chat/persistence/frames.ts · store.ts · session.ts`)                                                                             | → infra (backend-internal)             | `infra/providers/backends/agent-sdk/session/`                                          | The SDK `SessionStore` + seed-frame synthesis + reseed is the agent-sdk's canon-derived CACHE; today it leaks UP into chat (the domain passes `req.sessionStore`). Orbweaver: stateless-first domain; the backend owns the session internally (`participants-agents-identity.md §0/§7.1`). The empirically-validated seed-frame shape (user-first, timestamped) is load-bearing (Esoteric §3). | compile-time: `ChatRequest` for agent-sdk no longer carries `sessionStore`/`resume`; the domain has no session type               |
| `vllm/supervisor.ts · engine-control.ts · engine-status.ts · engines.ts · client.ts`                                                                            | stays infra, regrouped                 | `infra/providers/vllm/engine/`                                                         | The one-owner lifecycle subsystem. `decideTick`/`breakerAllows`/`findOrphanedEngineCores` are pure decision cores (unit-tested, no IO). The death-couple pipe-watchdog + orphan-reap are load-bearing (Esoteric §4).                                                                                                                                                                           | lint-time: `engine/` is the lifecycle owner; surfaces register, don't drive it                                                    |
| `vllm/runners/{chat,chat-completion,embed,rerank,image-embed,summarize}.ts`                                                                                     | stays infra, regrouped                 | `infra/providers/vllm/surfaces/`                                                       | The five INDEPENDENT role surfaces; summarize is a request shaper over `chat-completion`. Changing one surface doesn't touch another or the remote backends.                                                                                                                                                                                                                                   | lint-time: surfaces import `engine/` down; no surface imports another                                                             |
| `domain/_shared/role-clients.ts` — `RoleClients` interface                                                                                                      | → `contracts`                          | `@orb/contracts/role-clients`                                                          | The cross-boundary composition seam (19 type-only importers, `core/AGENTS.md §8.1`). Depends on the result contracts (above), so lands after them. Both the domain consumers + the infra binder flow down from contracts.                                                                                                                                                                      | resolve-time: package dep (cross-ref `Core-Legacy-Migration-and-Gaps.md §4`)                                                      |
| `domain/_shared/role-clients-binder.ts` — `createVllmRoleClients`                                                                                               | → infra/entry (the one-site rebind)    | `infra/providers` builder, wired by `entry/`                                           | The binder mints credentials + wires role dispatchers. TODAY it ALWAYS mints a vLLM credential regardless of `UserSettings` (the lock). The one-site fix: read `connection.resolveRole(role)` per role at boot (Esoteric §2). NOT a dispatcher rewrite.                                                                                                                                        | resolve-time: `entry/` wires the binder; domain never reaches it                                                                  |
| `domain/_shared/role-clients-binder.ts` — `createDefaultRoleClients`                                                                                            | **DELETED**                            | —                                                                                      | Contexts receive `roleClients` as a required `entry/`-wired dep; a missing wire is a `tsc` error, not a silent default (`Core-Legacy-Migration-and-Gaps.md §6`).                                                                                                                                                                                                                               | compile-time: required dep; missing → `tsc` red                                                                                   |
| `providers/index.ts` — `DEFAULT_CHAT_MODEL_ID`, `DEFAULT_OR_CHAT_MODEL_ID` re-exports                                                                           | removed from barrel                    | `@orb/contracts/connection` (catalog)                                                  | The two `DEFAULT_*_MODEL_ID` constants on the providers barrel are the **lone foundation→infra edge** (`core/AGENTS.md §8.1`). Moving them to contracts kills it; the barrel exports only execution surfaces + the catalog-fetch verb.                                                                                                                                                         | resolve-time: callers of the removed barrel exports fail the resolver                                                             |
| `providers/catalog.ts` (`catalog.rawModels/providers/endpoints`)                                                                                                | stays infra (the I/O verb)             | `infra/providers` (catalog fetch)                                                      | The live OR `/models` HTTP fetch is an I/O adapter; `connection.refreshCatalog` calls it through injection and owns the snapshot + TTL cache.                                                                                                                                                                                                                                                  | resolve-time: connection injects `providers.fetchOrCatalog`                                                                       |
| `openrouter/catalog.ts` — `seedOpenRouterModelsCache` / `getCachedOpenRouterModels` (in-memory TTL cache)                                                       | → `connection`                         | `domain/connection/substrate/or-model-cache.ts`                                        | The sync TTL cache is the routing-guard seam (warm-on-read); it serves `pickOrModel`, a selection concern. The live fetch stays infra; the cache moves to connection.                                                                                                                                                                                                                          | resolve-time (cross-ref `domains/connection.md` Esoteric §3/§4)                                                                   |
| `account.ts` · `probe.ts` (diagnostic role surfaces)                                                                                                            | stays infra                            | `infra/providers` (diagnostics)                                                        | Family-agnostic credential-shaped surfaces; `credentials.testHealth` / `account` verbs call them through injection. `probe` returns the raw `ProbeResult`; the domain layers `checkedAt` + throttle state.                                                                                                                                                                                     | resolve-time: domain injects `providers.probe` / `providers.account`                                                              |
| `run-chat.ts` · `run-agent.ts` · the role files                                                                                                                 | stays infra, regrouped                 | `infra/providers/roles/`                                                               | The role dispatchers — the firewall. `run-chat` switches on `req.runner` (sealed); the rest on `credential.source`.                                                                                                                                                                                                                                                                            | compile-time: dispatch is `assertNever`-exhaustive over the sealed backend/source union                                           |
| `scripted-override.ts` (`buildScriptedOverrideRunner`)                                                                                                          | stays infra                            | `infra/providers/scripted-override.ts`                                                 | The RUNNER_OVERRIDE dev seam (credit-free `runChat` replay). Unwired-in-prod ≠ worthless — it's the e2e harness's production analogue.                                                                                                                                                                                                                                                         | resolve-time: env-gated; injected at the root only when `RUNNER_OVERRIDE` is set                                                  |

---

## Cross-tier composition (how `connection` and the domains call it)

`infra/providers` is below `domain/` in the tier list, so **domains import the providers barrel
directly (downward)** — there is no injection-back-up. The injection model applies to the few things
providers needs FROM domains (a credential, a capability), which arrive **on the request** rather than
as a sideways import: connection/credentials resolve them and pass them in.

**The thin role contract (the seam a backend varies behind):**

```
runChatTurn(req) → result | stream
  req = { backend,      // sealed key → the dispatcher maps to a runner (runner/family never leak)
          model,        // resolved model id for THIS backend
          credential,   // ResolvedCredential — resolved by credentials, handed in
          params,       // provider-agnostic UserIntent (resolveChat turns it into wire knobs)
          capability,   // ModelCapability — resolved by connection, handed in (resolve-chat reads it)
          view/history, // the assembled per-participant view of canon
          tools?,       // present ONLY for agent mode (opt-in)
          onDelta }     // streaming
```

The domain builds `req` ONCE and calls the role. It never sees sessions, seed frames, env vars, or
name-stamping — those are backend-internal. **Adding a backend = a new sealed impl in `backends/` + (if
new auth) a new `ResolvedCredential` arm; consumers do not change.**

**`connection` → providers (downward import + injection both):**

| What                                                    | Direction               | Used for                                                                                            |
| ------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `connection` imports the providers barrel               | down (domain→infra)     | hands the role a resolved `{backend, model, credential, capability}` request                        |
| `connection.context` injects `providers.fetchOrCatalog` | composition-root        | `refreshCatalog` calls the live OR `/models` fetch (connection owns the snapshot)                   |
| providers `resolve-chat` reads `ModelCapability`        | injected on the request | the funnel reads the descriptor connection produced; it never calls `resolveModelCapability` itself |

**The boot binder (the one-site rebind, wired in `entry/`):**

| What                                    | Provided by        | Used for                                                                                                                               |
| --------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `connection.resolveRole(role)` per role | connection domain  | the binder asks connection which `{backend, credential}` each role uses at boot, instead of unconditionally minting vLLM (Esoteric §2) |
| `credentials.mintVllmCredential`        | credentials domain | minting the loopback vLLM credential for a role that resolves to the local engine                                                      |

**The domain role consumers (all downward imports of the barrel, request-shaped):**
`chat` (the `chat` + `agent` roles), `buddy` (the `agent` role with its own connection + tools),
`workloads` (embed/rerank/summarize via the `RoleClients` bundle), `embeddings`/`search`/`discovery`
(embed/imageEmbed/rerank), `credentials` (`probe`/`account`/`inspect` via injection).

---

## Spine intersections

### §7.1 Identity / auth / permission — the credential firewall

The agent-sdk env firewall is the tier's load-bearing security seam. The Max-sub path (`max-pro-sub`
credential) symlinks ONLY `.credentials.json` into an ephemeral `CLAUDE_CONFIG_DIR` and nulls the
OR-skin trio; the OR-skin path uses an EMPTY ephemeral dir + a paid base URL + the OR key, with every
host credential source nulled — so the sub OAuth token is **structurally unreachable** from a paid
spawn regardless of the runtime's internal credential precedence. This asymmetry IS the firewall.
`RESERVED_CLAUDE_ENV_KEYS` is applied AFTER the preset escape hatch (`advanced.claudeEnv`) so a preset
can never repoint auth/routing (the st-claude-proxy ban shape). The `max-pro-sub` owner gate is a
**credentials concern** — the brand is unconstructable except after `requireOwner` (owner-only, ledger
D17 — the box belongs to the `owner`, not any `admin`); providers receives a `ResolvedCredential` and
never re-checks. Buddy's non-owner local turn uses the vLLM env
builder (loopback, keyless), which is why the local agent path exists at all. _Enforcement: test-time
— the firewall test (a mode-2 OR-skin spawn can never see the sub token) is carried forward; it lives
with `env.ts` because the firewall is built around env._

### §7.2 Settings / config — the homeless fourth nature

The agent-sdk runtime config (~13 isolation pins + the 11-key reserved denylist + the 3-mode firewall)
is `core/AGENTS.md §7.2(c)`'s "homeless nature": it is called "env" only because it EMITS env vars,
but it is **backend-internal config of the agent-sdk strategy**, NOT a settings tier. It stays in
`backends/agent-sdk/env.ts` (per Core-Laws-and-Precedents.md §7 D8 — the `infra/providers/claude-sdk` name is DROPPED). Generation params (`UserIntent`) are nature (d) — they ride in on the
request and `resolve-chat` projects them per-backend; `maxOutputTokens`/`maxContextTokens`/compaction
are env-shaped only at the wire. The vLLM engine reads `VLLM_*_PORT`/`VLLM_*_MODEL`/`VLLM_*_CONCURRENCY`
from `foundation/env` (true env / runtime toggles); `VLLM_*_CONCURRENCY` is flagged in §7.2(b) as
stranded env that should become an AppSettings toggle — a settings-tier concern, not a providers one.

### §7.3 Serialization / serde — the wire-schema seam

The OR catalog parse (`ModelCatalogSchema` with `.loose()`) and the chat/responses wire schemas
(`wire-schemas.ts`) are lenient zod parses at the HTTP boundary — the §7.3 "zod-parse-at-the-wire"
pattern, the model to generalize. They stay infra (they describe vendor wire shapes). The `.loose()`
blind-cast on the catalog snapshot is fixed on the CONNECTION side (it owns the snapshot now); the
providers fetch verb returns the parsed `RawModel[]`.

### §7.4 Types & schemas — one home, one direction

- Cross-boundary results (`EmbedResult`/`RerankResult`/`ImageEmbedResult`/`SummarizeResult`) →
  `@orb/contracts/providers`. `ResolvedCredential`/`CredentialHealth` → `@orb/contracts/credentials`.
  `ModelCapability` → `@orb/contracts/connection`. `RoleClients` → `@orb/contracts/role-clients`.
- Infra-internal request shapes (`ChatRequest` variants, `AgentTurnRequest`, `ChatEvent`,
  `ChatError`, `NormalizedFinishReason`, the wire vocab) → `infra/providers/contract/` behind the NEW
  barrel. They are NOT cross-boundary (only providers builds/consumes them).
- `ProviderFamily` / `ProviderRole` (sealed vocab) → `@orb/contracts` only as far as needed; the
  `runner` axis stays infra-internal entirely.

### §7.5 String-union dispatch discipline

Two dispatch axes are infra-sealed and stay so, gated:

- **`runner` (`agent-sdk | openrouter | vllm | custom-openai`)** — `run-chat.ts` switches on it
  (already `assertNever`-gated, including the nested `api` switch). `runner = f(api, source)` is
  derived INSIDE providers from the resolved `{backend}` and **never leaves the tier**. _Gate:
  `exhaustive-dispatch` + a grep that `runner`/`family` never appear in `domain/connection/**`._
- **`credential.source` (`max-pro-sub | openrouter | vllm | local-light | custom_openai`, D39)** — the
  non-chat role dispatchers switch on it; each unsupported pairing throws a typed `ChatError`. `local-light`
  (keyless in-process transformers.js/ONNX) serves `embed`/`rerank`/`imageEmbed` only — no chat surface
  (`deriveRunner` throws for it), so it is in this 5-member source axis but NOT the 4-member `runner` axis
  above; it also joins `ROLE_SOURCE_POLICY`'s embed/rerank/imageEmbed arms (NOT summarize/generateImage).
  Adding a backend = add the source arm + the runner arm + the
  credential arm simultaneously. _Gate: `exhaustive-dispatch` (the `assertNever` default arm)._

---

## Esoteric / load-bearing details (preserve exactly)

1. **The agent-sdk credential firewall is rebuilt EVERY turn and ordered for safety.** In
   `buildClaudeSdkEnv`/`buildClaudeOpenRouterEnv`/`buildClaudeVllmEnv` the layering is: host baseline
   (minus secrets) → runtime knobs → user escape hatch → **auth firewall LAST**. The reserved-keys
   filter runs on the escape hatch BEFORE the auth firewall overlay, so a preset can neither set auth
   env nor strip the firewall. The mode-1 (sub) path symlinks only `.credentials.json`; the mode-2
   (OR-skin) path uses an EMPTY ephemeral dir. Reorder these and the sub token can leak to a paid
   endpoint. The ~11 `CLAUDE_CODE_DISABLE_*` pins were each verified against the bundled runtime binary
   (`DISCOVER=… sdk:play`) — they are NOT grep-able in the JS wrapper; do not "clean up" by removing
   names that look unused. `disallowedTools: [DesignSync, Monitor, PushNotification, RemoteTrigger]`
   removes the cowork bundle that `tools:[]` does NOT (drove the `error_max_turns(1)` failures).

2. **The vLLM lock is a boot-binder default, NOT a dispatcher hard-pin (corrected).** The role
   dispatchers (`embed`/`rerank`/`summarize`/`image-embed`) already `switch (credential.source)` and
   route OpenRouter as readily as vLLM. The lock is `createVllmRoleClients` minting a vLLM credential
   at boot regardless of `UserSettings.routing.roleDefaults` (only the `chat` role reads roleDefaults
   today). The orbweaver fix is a **one-site rebind** (the binder reads `connection.resolveRole(role)`
   per role), not a dispatcher rewrite.

3. **The agent-sdk seed-frame shape is empirically validated and load-bearing.** A fresh `SessionStore`
   seeded from canon must use full frames (`type`/`uuid`/`parentUuid`/message + timestamp) — bare
   frames get "No conversation found"; an ASSISTANT-FIRST seed (a greeting with no preceding user turn)
   does NOT resume (handle greetings raw-mode, not by seeding an assistant-only session). The
   `init` frame carries a SHAPE GUARD: a missing `session_id`/`apiKeySource` throws loudly at boot
   rather than silently corrupting every later `session_id`-keyed lookup. This whole concern moves
   backend-internal (into `agent-sdk/session/`) but the shape rules survive verbatim.

4. **The vLLM supervisor lifecycle is a measured matrix, not boilerplate.** Death-coupling is a
   pipe-watchdog wrapper (`setsid … & cat; kill -TERM/-KILL`) holding a stdin pipe from the server —
   ANY server death (incl. SIGKILL no handler can see) closes the pipe, `cat` exits, the engine's
   process GROUP is killed. Orphan-reap finds EngineCore workers by `/proc/<pid>/cwd === repoRoot` (the
   ONLY marker that survived: argv is rewritten, /proc/exe is a uv symlink, /proc/environ is sanitized).
   ONE spawn mutex serializes boot + restarts (vLLM's memory profiler reads device-wide free-memory
   deltas; concurrent boots gave embed a NEGATIVE KV budget). The breaker (3 restarts / 10m window →
   `failed`, half-open at 15m) and `pendingSpawn` flag (stops re-queueing behind a cold compile that
   burns the breaker budget) are both load-bearing. `decideTick`/`breakerAllows`/
   `findOrphanedEngineCores` are PURE cores — keep them unit-testable.

5. **`cache_control` placement is split: the runner PLACES, the chat domain COMPUTES.** The
   chat-completions runner's `placeHistoryCacheBreakpoint` converts the message at
   `historyCacheBreakpointFromEnd` (an offset-from-end the chat pipeline's `computeHistoryBreakpoint`
   produced) into the structured-block form carrying `cache_control`, gated on `cacheMinTokens`. The
   offset-from-end is robust to the runner's empty-filter + the pipeline's front-drop fit. PER-BLOCK on
   the static system block pins the cache at the stable prefix (the top-level directive pins it at the
   volatile newest message → 0 cache writes, measured). The responses runner's top-level `cacheControl`
   is a measured no-op (stripped by the Responses→Messages wrapper) but kept for forward-compat;
   guaranteed Anthropic caching uses chat-completions. `domains/chat.md §8` upgrades the single breakpoint to
   ST's rolling PAIR — the PLACEMENT stays in the runner, the offset computation stays in the chat
   domain.

6. **`getChatModel` 3-stage prefix-match (moves to connection, preserve exactly).** OR uses
   version-only ids (`claude-haiku-4-5`); the curated catalog uses dated form
   (`claude-haiku-4-5-20251001`). Stage 3 prefix-matches with a boundary check (next char must be `-`).
   Simplifying to exact-match silently falls Haiku through to synthesis with the wrong profile
   (`adaptiveBuiltIn=false`, wrong `effortLevels`, wrong `cacheMinTokens`).

7. **`detectModelFamily` anchors reject third-party forks (moves to connection, preserve).** The
   regex matches bare + `anthropic/`-prefixed Claude but rejects `some-org/claude-fork` → `other`, so
   an alien backend containing "claude" never receives Anthropic-only `cache_control`. The same anchor
   is duplicated in `cache-control.ts`'s `isAnthropicModel` (which STAYS infra — it gates the wire
   send). Both must keep the `^(?:anthropic\/)?claude[-/]` shape.

8. **The Opus 4.8 adaptive/budget conflict + the OR-responses XOR are API-level, enforced in the
   funnel.** Sending `type:'enabled' + budget_tokens` to Opus 4.8 → live 400; `resolve-chat` reads
   `capability.reasoning.mode === 'adaptive'` and drops the budget (emits adaptive + a warning). OR
   responses rejects `effort`+`max_tokens` together → `effortToResponsesReasoning` emits exactly one
   (budget wins when explicit). The mandatory-reasoning endpoints (DeepSeek-R1) 400 on
   `reasoning.effort:'none'` at request-open → the runners strip the block and replay ONCE
   (pre-commit-safe: the 400 fires before any delta streams).

9. **`summarize` is a request shaper over `chat`, not a separate engine.** The vLLM summarize surface
   maps the batch contract onto `chat-completion` with bounded workers feeding vLLM's continuous
   batcher; the OR summarize runs sequential (per-key rate limits). "Summarize via OpenRouter" is just
   a chat turn — keep it a thin shaper so it never duplicates chat logic.

10. **`custom-byo` must become fully user-declared (§1a — the half-built regret).** Today endpoint +
    request transforms are configurable but the model profile is hardcoded (128k/sonnet/no-thinking)
    and the response shape is assumed standard-OpenAI. Orbweaver: the user declares the model profile
    (→ `resolveModelCapability('custom-byo')`) AND the response mappings. The "Test endpoint" inspector
    stays — it sends the ACTUAL shaped request and shows a redacted request + raw response. The backend
    stays a sealed strategy whose entire behavior is the user's config, so it ripples into nothing.

11. **The embedding-space invariant lives ABOVE providers but constrains the embed surfaces.** A
    backend DEFINES the vector space `(model, dim)`; same-model-different-backend is a free switch only
    with (a) a pinned OR `provider` (no silent reroute to a different quant) + (b) a one-time cosine≈1.0
    probe. The embed/imageEmbed surfaces carry `dimensions` + `model` through so `embeddings` can tag
    the space; providers never compares vectors (the dim-mismatch throw in `vector-math`, now in `kit`,
    is the tripwire if a swap slips through).

---

## Invariants (gate candidates)

1. **The domain calls a role, never a backend.** No per-backend dispatch arm in any domain; the chat
   domain has ONE turn path. _Enforcement: lint-time — dep-cruiser: a domain may import
   `infra/providers/index.ts` ONLY; any import of `infra/providers/backends/<family>/**` or
   `infra/providers/vllm/**` from `domain/**` is RED._

2. **Backends are sealed — no backend imports another (strategy isolation).** Cross-backend work goes
   through the role contract or `backends/kit/` (the shared OpenAI reducer), never a direct reach. The
   firewall must not leak through a helper. _Enforcement: lint-time — dep-cruiser `strategy-isolation`:
   `backends/<a>/**` may not import `backends/<b>/**`; `vllm/surfaces/<a>` may not import
   `vllm/surfaces/<b>`._

3. **`runner`/`family`/`protocol` never leave `infra/providers`.** They are derived inside from the
   resolved `{backend}`. _Enforcement: compile-time + lint — `ResolvedConnection` carries `backend`
   (opaque), never `runner`/`family`; a grep for `runner`/`family` in `domain/**` goes RED._

4. **`providers/contract/*` is reachable only through the NEW barrel.** No outside deep-reach into a
   contract file. _Enforcement: lint-time — `providers-public-surface-only` cruiser rule._

5. **The agent-sdk firewall is unleakable + unconstructable-around.** The reserved-keys filter runs
   before the auth overlay; the auth firewall is applied last; `max-pro-sub` is owner-gated upstream (D17).
   _Enforcement: test-time — the carried-forward firewall test asserts the OR-skin spawn cannot see the
   sub token AND a preset escape hatch cannot set/strip a reserved key._

6. **All role connections honor `routing.roleDefaults.<role>` — no hard-pin.** The binder reads
   `connection.resolveRole(role)` per role at boot. _Enforcement: test-time — set
   `roleDefaults.embed = openrouter` and assert the embed role uses an OpenRouter credential, not vLLM._

7. **vLLM is its own multi-role engine, not a chat-backend peer.** Its surfaces are independent; its
   lifecycle is one owner; it REGISTERS a chat impl among five. _Enforcement: lint-time — `vllm/` is
   not in the `backends/` chat strategy list; surfaces import `engine/` down, never each other._

8. **The chat-turn contract is thin + stable.** Adding a backend = a new sealed impl + (if new auth) a
   new credential arm; no consumer changes. _Enforcement: compile-time — the role dispatch is
   `assertNever`-exhaustive over the sealed backend/source union; a new arm without an impl fails `tsc`._

9. **`resolve-chat` reads the descriptor, never authors it.** No `ChatModel`/`FAMILY_CAPS` read inside
   any runner or the funnel. _Enforcement: compile-time — `ChatModel`/`FAMILY_CAPS` deleted; the funnel
   takes an injected `ModelCapability`._

10. **`vector-math` is `kit`, not infra.** No provider file imports it (it has none); it lives in
    `@orb/kit/vector-math` with the dim-mismatch throw intact. _Enforcement: resolve-time +
    `kit-purity` (no node:/domain/contracts/db/IO import)._

11. **The DEFAULT\_\*\_MODEL_ID constants are off the providers barrel.** The lone foundation→infra edge
    is gone. _Enforcement: resolve-time — the constants live in `@orb/contracts/connection`; a barrel
    re-export fails the resolver._

---

## Decisions (resolved / deferred)

- **Tree location — RESOLVED (per Core-Laws-and-Precedents.md §7 D7): vllm nested under `infra/providers/vllm/`**
  (the layout above, with `engine/` + `surfaces/`; the `infra/vllm` sibling alternative is DROPPED). Both
  consumer refs are satisfied: `connection` references `infra/providers/resolve-chat.ts` (exact); the
  vLLM role-clients builder is `infra/providers/vllm/role-clients` and `credentials.md` now uses that
  same nested spelling (the prior sibling-path alias is reconciled). Nesting is chosen for cohesion (the
  vLLM engine + its surfaces are one subsystem). No
  `infra/inference/` parent.

- **Where `resolveModelCapability` executes vs `resolve-chat` — RESOLVED.** Connection's `catalog/`
  produces the descriptor (curated lookup + static vLLM + user-declared custom/BYO + OR synthesis from
  the snapshot connection holds); the infra funnel (`resolve-chat`) reads the `ModelCapability`
  **handed in on the request** and never re-resolves or imports the factory (infra→domain is illegal
  upward). Consistent with `domains/connection.md §7` + `domains/connection.md`.

- **The `RoleClients` bundle vs per-role injection — RESOLVED: keep the bundle.** `RoleClients`
  (→ contracts) is the GOLD-STANDARD composition seam (19 importers); `workloads/contract/runner-env.ts`
  is the one true cross-feature hub modeling it. Keep the bundle; the boot binder FILLS it via
  `connection.resolveRole(role)` per role (Esoteric §2). No per-role-op injection scatter.

- **`summarize` as a vLLM surface vs a pure chat-role shaper — RESOLVED: a thin shaper, everywhere.**
  It is a request-shaper over the chat role so it never duplicates chat logic (the vLLM surface already
  is one). The OR summarize converges on the same shaper shape (today a distinct runner — collapse it).

- **rerank-hosted — WIRED (PD-11, 2026-06-28; the prior "no endpoint" premise was stale).** `@openrouter/sdk`
  ships `client.rerank.rerank`, so the `rerank` role's **hosted arm IS a real call** (text-only: the wire
  `query` is a string, documents are scored on their text; an image-only query is a typed
  `ProviderError({kind:"invalid"})`, never a crash). The local (vLLM / ONNX cross-encoder) backends remain
  the **default keyless** rerank path; the OpenRouter arm serves when a role resolves to it. OpenRouter's
  index-based results map back to each document's **caller id** (documents carry caller ids; hits preserve
  them — never the raw array index). No silent fallback — a rerank rejection still propagates.

- **Multimodal image input — IN SCOPE (D45); the chat translators map image content-parts.**
  `ChatHistoryMessage.content` (`infra/providers/contract/chat.ts`) is a content-part array (`text` |
  `image`), not a bare string; each sealed chat translator (agent-sdk · openrouter-chat-completions ·
  custom-byo + the vLLM chat surface) maps `image` parts to its backend's wire (Anthropic image blocks ·
  OpenAI `image_url` · …). Gated by `ModelCapability.vision` (read off the request per the
  connection→infra descriptor-on-request rule) — for a non-vision model the **runner** drops image parts and emits a
  `warning` ChatEvent with a NEW 5th `WARNING_CODE` **`image_dropped`** (D45 adds it to D41's tuple — a real
  emit site at the runner, not speculative), never a hard throw. The reshape is born-compliant before Phase 5 (it touches
  all three translators + the assembly seam).

- **Custom/BYO response-mapping schema — DEFERRED (schema shape only).** §1a's user-declared response
  mappings (how to read content/usage/finish/stream from a non-standard response) = a subset of the
  wire-reducer config the user fills in; uninspected fields default conservative. Fix the exact field
  list when the custom-byo form is built (mirrors `domains/connection.md §7`).

- **agent-sdk session cache vs stateless-first — RESOLVED: backend owns it, no upward leak.** The
  canon-derived session cache (backend-internal in `agent-sdk/session/`) keeps the Max-sub path cheap
  (prompt-cache survival); the backend owns reseed-from-canon-when-stale entirely. The domain turn is
  stateless-first and never sees a session concept (`participants-agents-identity.md §6`). This is in the
  locked set — not re-opened.

---

# Part II — Roles, sealed backends & the local engine (the authoritative design)

> Merged from the former top-level `providers-and-backends.md` (2026-06-25 de-duplication — one home per topic).

> **Status: planning (authoritative detail).** The execution layer: how a chat turn (or any inference
> role) actually runs, decoupled so **no single mode ripples into the rest of the app**. Pairs with
> `connection` (selection — which backend a turn uses) and `participants-agents-identity.md` (the
> stateless-chat-turn foundation; agent mode opt-in). `domains.md` carries the summary.

## 0. The principle — unified by a thin contract, NOT entangled

The goal is **one contract, many independent implementations** — _not_ one big shared code path. The
failure mode to avoid (neo-tavern's): the chat pipeline knows each backend's guts (`dispatchAgentSdk`,
seed-frames, per-runner name-stamping, per-runner cache logic), so touching one backend risks all.

> **Roles are the firewall. Backends are sealed strategies. The domain calls a role, never a backend.**

- **Public surface = ROLES:** `chat` · `agent` · `embed` · `rerank` · `imageEmbed` · `summarize` ·
  `generateImage` (the 7 roles `connection.resolveRole` resolves). Each is a thin contract.
  `agent` is the chat turn **plus tools + a multi-turn loop** (opt-in, agent-sdk-only today — its
  contract `runAgentTurn(req)` rides the same firewall base as `runChatTurn`); a plain chat turn carries
  no `tools`. See §1 (the `tools?` field) and `participants-agents-identity.md §0`.
- **Behind each role = sealed implementations.** No implementation imports another (enforced by the
  strategy-isolation rule). Cross-backend work, if any, goes through the role contract or a shared
  `contract/`/pure helper — never a direct reach.
- **The chat domain has ONE turn path** — build a request once, call the `chat` role. No per-backend
  dispatch arms; no per-backend knowledge in the domain.
- **Each backend internalizes ALL its own quirks** — statefulness, env config, name handling, caching.
  Editing one backend cannot touch another; they meet only at the thin contract.

## 1. The `chat` role — one thin contract, N sealed backends

**The contract (the narrow seam):**

```
runChatTurn(req) -> result|stream
  req = { view,            // this participant's view of canon (messages), already assembled
          model,           // resolved model id for THIS backend
          params,          // provider-agnostic UserIntent (temp/tokens/effort/stop/…)
          credential,      // resolved by connection/credentials, handed in
          tools?,          // present only for agent mode (opt-in)
          onDelta }        // streaming
```

The chat domain builds `req` ONCE and calls the role. It never sees sessions, seed frames, env vars, or
name-stamping — those are backend-internal.

**The sealed chat backends:**

| Backend             | What it is                                                                                     | Internalizes                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **openrouter-chat** | stateless `chat.send` / `beta.responses` (broad catalog incl. Claude-via-OR)                   | `cache_control` breakpoints, OR provider-routing prefs                                                                |
| **agent-sdk**       | stateful; serves the **sub** + the **OpenRouter Anthropic skin**; **agent mode** (tools/loops) | **ALL** seed/session/reseed/env-knobs/name-handling/SDK-caching — the imitation that lived in the pipeline moves HERE |
| **custom / BYO**    | stateless raw-fetch to a user-wired endpoint; **fully config-driven** (see §1a)                | the user-declared profile + request mappings + response mappings — nothing baked                                      |
| **vllm-chat**       | the local engine's chat surface (see §2)                                                       | local-engine specifics; one model heals from env                                                                      |

**agent-sdk ↔ openrouter-chat are fully decoupled.** They may both _consume an OpenRouter credential_
(the agent-sdk OR-skin points the SDK at OpenRouter), but the credential is resolved by
`connection`/`credentials` and passed in — **neither backend imports the other.** The agent-sdk backend
owns its session-as-canon-derived-cache internally; the domain stays stateless (see
`participants-agents-identity.md`).

### 1a. The custom / BYO backend — fully user-declared, nothing baked

The intent: a **frontend-friendly "wire up your own provider, you control the wire"** surface. neo-tavern
half-built it — request transforms were configurable, but the **model profile was hardcoded**
(`CUSTOM_OPENAI_DEFAULT_WINDOW = 128_000`, `tier:"sonnet"`, `thinking:absent`) despite a comment claiming
"the user owns the truth," and the **response shape was assumed** standard-OpenAI. Orbweaver makes the
backend **entirely config-driven** — the user declares all four:

| What the user declares                                                                                | Today                                      | Orbweaver                                                                       |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| **endpoint + auth** (baseUrl, key, custom headers)                                                    | ✅                                         | keep                                                                            |
| **request mappings** (body include/exclude/rename, headers — what gets SENT)                          | ✅ (`includeBody`/`excludeBody`/`headers`) | keep                                                                            |
| **model profile** (context window, max output, reasons?, sampling honored?)                           | ❌ **hardcoded**                           | **user-declared (or probed via the inspector)** — no baked window/tier/thinking |
| **response mappings** (how to read content/usage/finish/stream from a possibly-non-standard response) | ❌ assumes OpenAI shape                    | **user-controlled**                                                             |

The **"Test endpoint" inspector** stays — it already sends the _actual_ shaped request (with the user's
transforms) and shows a redacted request + raw response, so the user verifies the real wire. The backend
stays a sealed strategy; its _entire behavior_ is the user's config, so it ripples into nothing.

## 2. vLLM — its own multi-role local engine (NOT a chat-backend peer)

vLLM is **not** a chat backend sitting next to openrouter. It is the **supervised local inference
engine** that serves **multiple roles**:

```
vllm (the local engine)
├── engine/        supervisor · lifecycle (adopt/spawn/death-couple) · breaker · health  (one owner)
└── surfaces/      INDEPENDENT role surfaces, one per role it serves:
    ├── chat        → registers the chat-role impl  (vllm-chat above)
    ├── embed       → registers the embed-role impl
    ├── rerank      → registers the rerank-role impl
    ├── imageEmbed  → registers the imageEmbed-role impl
    └── summarize   → registers the summarize-role impl  (a request shaper over chat)
```

- The **remote backends serve only `chat`**; **vLLM serves five roles.** That asymmetry is why vLLM is
  its own thing, not a peer in the chat-backend list.
- **Each surface is independent.** Changing vLLM's `chat` surface doesn't touch its `embed` surface;
  changing vLLM doesn't touch the remote chat backends. The engine lifecycle (supervisor) is one owner;
  the surfaces are separate registrations.
- The role dispatchers pick vLLM for a role when the connection / role-default points at it.

## 2b. The inference roles are multi-backend & hardware-tiered (the unified system)

`embed` / `rerank` / `imageEmbed` / `summarize` must be selectable per role. **Correction (verified):
the role DISPATCHERS are NOT hard-pinned** — `embed.ts`/`rerank.ts`/`summarize.ts`/`image-embed.ts`
already `switch (req.credential.source)` and route OpenRouter just as readily as vLLM (imageEmbed is the
lone vLLM-only role, by capability). The vLLM lock is a **boot-binder default** one layer up
(`role-clients-binder.ts` → `createVllmRoleClients` mints a vLLM credential at boot), and `roleDefaults`
is read today ONLY for the `chat` role. So the gap is small and surgical: **make the binder read
`routing.roleDefaults.<role>` per role (a one-site rebind the code already anticipates) + add the
local-light backend** — NOT a dispatcher rewrite. Each role stays a thin contract with **multiple
sealed backends across three hardware tiers**, picked **per role** by `resolveRole` from the
user's setup:

| Role              | local-light (transformers.js / ONNX, **CPU or CUDA**)                                | local-heavy (vLLM)                                 | hosted (key)                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **embed**         | small models (BGE/MiniLM/…) — the "any box" tier (ST parity) _(own space)_           | **Qwen3-VL** (multimodal, dual-lens avatar embeds) | **OpenRouter Qwen-embed (SAME space as vLLM)** · OpenAI · Cohere · Voyage                   |
| **rerank**        | ONNX cross-encoder _(own space)_                                                     | vLLM Qwen reranker                                 | **OpenRouter `rerank.rerank` (WIRED, PD-11)** · Cohere/Jina/Voyage (via OR's rerank router) |
| **imageEmbed**    | CLIP / SigLIP ONNX _(own space)_                                                     | Qwen3-VL                                           | **OpenRouter Qwen-VL (SAME space as vLLM)**                                                 |
| **generateImage** | —                                                                                    | —                                                  | **OpenRouter image models** (hosted-primary; don't pigeonhole)                              |
| **summarize**     | — _(not a model — it's a `chat` turn shaped, on whatever chat backend the user has)_ |                                                    |                                                                                             |

Don't pigeonhole hosted: OpenRouter hosts the **same Qwen family** (VL / embeddings / likely reranker)
plus image-gen — so every role has a hosted option, and the local-heavy and hosted Qwen paths are
**space-compatible** (next).

- **Re-add the lightweight in-process backend** (transformers.js/ONNX, CPU **and** CUDA) — the "works on
  any box" tier, so a no-GPU user never has to stand up vLLM. (neo-tavern removed it 2026-06-11; that
  removal is the regret.) **DECIDED (council 2026-06-25): this is a v1 scaffold PREREQUISITE, not a
  later item** — without it a GPU-less, **cloud-key-less** user gets no working memory search + no rerank
  (hosted rerank needs an OpenRouter key), and the "strict superset" claim fails for the "any box" crowd
  (product seat's one real risk). Build it in the same wave as the other embed/rerank backends. (ledger §5.)
- **`summarize` runs the `chat` role with a summarize prompt** on the user's chat backend — no separate
  engine. ("Summarize via OpenRouter" = just chat.)
- **rerank-hosted is WIRED (PD-11)** — `@openrouter/sdk` ships `client.rerank.rerank` (text-only); the
  hosted arm is a real call when a role resolves to OpenRouter. The local cross-encoder remains the
  default keyless path. (The earlier "OpenRouter has no generic rerank" note was stale.)
- **Local compute is the OWNER's box resource — the second class of "whose box it is" (ledger D17).** Both
  local backends (vLLM + the in-process transformers.js/ONNX light tier) run on the **owner's hardware**;
  the vLLM role-client credential is keyless/loopback ("open to every authenticated user",
  `role-clients-binder.ts`) — i.e. **shared with authenticated principals by design** (the multi-human /
  "any box" reality). Unlike the hosted credential class (`max-pro-sub` — owner-only, consent-default-OFF,
  ban-prone + $), local compute carries **no ban/wallet risk, only finite-hardware contention**, so
  non-owner (admin/member) use is **allowed by default** but governed by: a **per-member turn/request COUNT
  budget** (the protected resource is shared compute, NOT dollars — a dollar budget never debits for a
  keyless local turn), the **supervisor concurrency limits** (`VLLM_*_CONCURRENCY` + the spawn mutex), and
  an **owner throttle/disable knob**. NOT a credential gate. (The count budget + the owner knobs are
  transport/settings concerns — `core/Tier-4-Transport.md §7.1`, `core/Spine-Config-and-Serialization.md`.)

### The embedding-space invariant (why "unified embed" was hard — and the fix)

**The embed backend _defines the vector space._** vLLM-Qwen (1024-dim), a transformers.js BGE (768-dim),
OpenAI (1536-dim) are **incomparable** — different dims, different spaces; cosine across them is
meaningless. So a backend-flexible embed system MUST treat the space as a variable:

> **The space is tied to the MODEL, not the backend.** `embeddings` tags every vector with its space
> `(model, dim)`. `search`/`memory` compare ONLY within one space.
>
> - **Same model, different backend = SAME space = FREE switch — _verified, with a guard_.** The
>   `@openrouter/sdk` embeddings API DOES accept a `dimensions` param (MRL models like Qwen3-Embedding /
>   OpenAI v3), so hosted Qwen can be asked for **1024 to match vLLM's MRL-truncated 1024.** Necessary
>   but not auto-sufficient: MRL truncation + L2 normalization must be identical across stacks. So to
>   treat them as one space — **(a) pin the OR `provider`** (no silent reroute to a different quant) and
>   **(b) a one-time probe** (embed the same text both ways, assert cosine ≈ 1.0). Matches → free
>   local↔hosted switch, no re-index. Doesn't → hosted is its own space. (OR embed input is multimodal —
>   `image_url` etc. — so hosted imageEmbed is real, not rare.)
> - **Different model/dim = its own space = dump + re-index workload.** Choosing a fundamentally
>   different embedder (e.g. a small transformers.js BGE) re-embeds the corpus into the new space;
>   old-space vectors are advisory-stale until rebuilt. This is a **rare, deliberate, set-and-leave**
>   choice — NOT a per-turn knob.

This generalizes neo-tavern's "never mix spaces / pin one model" to **"tag spaces, compare within,
free-switch same-model backends, re-index only on a model/dim change"** — the rule that lets embed be
backend-flexible without corrupting similarity. (rerank/imageEmbed inherit it: a reranker pairs with the
embed space; image↔image cosine works only inside a joint multimodal space — Qwen on vLLM _or_ OpenRouter
share it; a CPU CLIP image embed is its OWN space.) The `embeddings.store(kind, lens, key, content,
model)` API carries `model`; add `dim` + make the active embed-model (the space) an explicit,
rarely-changed setting whose change triggers the re-index workload.

## 3. How `connection` relates (selection vs execution)

`connection` (domain) **selects** — which backend a chat turn uses, the per-agent connection, the model,
and (via `credentials`) the credential — then hands the `chat` role a `req`. It contains **zero backend
logic**. Providers **execute**. (The selection/execution split from `domains.md`.) Per-agent connection
(a character/buddy can run on its own backend/model) is a `connection` concern; the backends don't know
about agents, only `req`.

## 4. Invariants (the "no ripple" guarantees — gate candidates)

1. **The domain calls a role, never a backend.** One chat-turn path; no per-backend dispatch arms in the
   chat domain. (Gate: chat domain imports the role contract, never a backend folder.)
2. **Backends/engines are sealed** — no implementation imports another (strategy-isolation, enforced
   reachably so the agent-sdk credential firewall can't leak through a helper).
3. **Each backend internalizes its own quirks** — no agent-sdk seed/session/env/name logic in the shared
   pipeline; no per-runner branches in assembly.
4. **vLLM is its own multi-role engine** — its role surfaces are independent; its lifecycle is one owner;
   it is not in the chat-backend strategy list (it _registers_ a chat impl, among others).
5. **The chat-turn contract is thin + stable** — the seam a backend varies behind without the domain
   bending. Adding a backend = a new sealed impl + (if new auth) a new credential arm; consumers don't
   change.

## 5. Decisions (resolved / deferred)

- **Where the layer lives in the tree — RESOLVED: `infra/providers/` with vllm nested at
  `infra/providers/vllm/`** (roles + remote chat backends + contract at the top; the local engine as a
  self-owned subsystem under it — see §2 below). No `infra/inference/` parent. (`credentials.md` uses the
  same nested `infra/providers/vllm/role-clients` spelling — reconciled, per §7 D7.)
- **Role-default vs per-agent connection resolution — RESOLVED.** Resolution lives entirely in
  `connection`; the role dispatcher takes the already-resolved `{backend, model, credential, capability}`
  and **never re-resolves** (the selection/execution split). Per-agent override is applied in
  `connection.resolveRole`, not in the backend.
- **summarize as a vLLM surface vs a request-shaper over the chat role — RESOLVED: a thin shaper.** It
  runs the chat role with a summarize prompt; it never duplicates chat logic (both the vLLM and OR paths
  converge on the shaper).
