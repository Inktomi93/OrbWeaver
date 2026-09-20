---
kind: law
status: active
updated: 2026-09-20
---

# Orbweaver — `infra/providers`: the sealed execution tier (roles · backends · the local engine)

> **⚠ BUILD-STATE RIDER:** `BACKEND_KEYS` is FIVE members (`agent-sdk · openrouter · vllm · local-light · custom-openai`); `PROVIDER_ROLES` is EIGHT members, including `structured`. D67/D68 are the design record for a future `anth-direct` backend.

The infra **execution layer** — the sealed inference backends behind the role contracts. It **executes**; it never **selects**. `domain/connection` selects (backend/model/credential/capability) and hands in a resolved request; providers runs it. `runner`/`family`/`protocol` are derived INSIDE providers and never leak upward.

> **Roles are the firewall. Backends are sealed strategies. The domain calls a role, never a backend.**

- **Public surface = ROLES:** `chat · agent · embed · rerank · imageEmbed · summarize · structured · generateImage` (`PROVIDER_ROLES`, `contract/backend.ts`; `structured` added D109-4). Each is a thin contract; the domain builds a request ONCE and calls the role — it never sees sessions, seed frames, env vars, or name-stamping.
- **Behind each role = sealed implementations.** No backend imports another; cross-backend work goes through the role contract or the pure `backends/kit/` (the shared OpenAI-compat reducer both `openrouter` and `custom-byo` import DOWN).
- **Each backend internalizes ALL its own quirks** — statefulness, env config, name handling, caching. Editing one backend cannot touch another.
- **Adding a backend** = a new sealed impl in `backends/` + (if new auth) a new credential arm; consumers do not change.

## What this tier owns

- **The role dispatchers** (`roles/`) — one thin dispatcher per role + `dispatch.ts` (`deriveRunner(api, source)` → `BackendKey`; `requireBackend`/`requireRoleImpl`) + `firewall.ts` (`assertCredentialAllowed` — role×source×consent policy). Chat/agent derive the backend from `{api, source}`; the non-chat roles dispatch on `credential.source`. Every switch is `assertNever`-exhaustive; invalid pairings fail-closed with a typed `ProviderError`.
- **The sealed backends** (`backends/`) — `openrouter` (stateless chat-completions/responses + embed/rerank/image runners + catalog/account/probe), `agent-sdk` (STATEFUL — the Max sub + the OR-Anthropic skin + agent mode; owns its session-as-canon-derived-cache internally in `session/`), `custom-byo` (raw-fetch to a user-wired endpoint, FULLY user-declared — see Esoteric §10), `local-light` (D39 — keyless in-process transformers.js/ONNX, CPU+CUDA; serves ONLY embed/rerank/imageEmbed), and the shared pure `backends/kit/` (openai-compat reducer/mapper, cache-control, reasoning-budget, wire-schemas, error-classify, retry, idle-timeout, sanitize, history).
- **The agent-sdk credential firewall** (`backends/agent-sdk/env.ts`) — the per-turn env builders, the `RESERVED_CLAUDE_ENV_KEYS` denylist, the ephemeral `CLAUDE_CONFIG_DIR` symlink-isolation, the isolation/cost pins. Security-load-bearing, rebuilt every turn (Esoteric §1).
- **The vLLM local engine** (`vllm/`) — its own multi-role subsystem: `engine/` (supervisor lifecycle: adopt/spawn/death-couple/breaker/health/orphan-reap; status + control registries; the loopback client; gpu detect) + `surfaces/` (independent chat/embed/rerank/image-embed/summarize registrations). The remote backends serve chat; vLLM serves five roles — that asymmetry is why it is its own engine, not a chat-backend peer.
- **`resolve-chat.ts`** — the `(UserIntent × ModelCapability) → wire knobs` funnel. Needs the wire-quirk knowledge (the XORs, the adaptive/budget guard) so it stays infra; it READS the injected `ModelCapability` (connection produced it) and never authors it.
- **The diagnostic surfaces** (`diagnostics.ts` + per-family `account`/`probe`/`catalog` fetch) — family-agnostic, credential-shaped; `credentials`/`connection` call them through injection. The catalog SNAPSHOT + TTL cache are connection's; providers keeps only the live HTTP fetch verb (`fetchOrCatalog`).
- **`contract/`** — the ONE typed front door for infra-internal request shapes (`ChatRequest` variants, `AgentTurnRequest`, `ChatEvent`/`ChatError`/wire vocab, `BackendKey`, `BackendRegistry`). Cross-boundary shapes are re-exports from `@orb/contracts` (see Contract homes).

NOT owned: **selection/routing/policy** (which backend a role uses, per-agent connection, model pick, role defaults → `connection.resolveRole`); the **capability descriptor** (`resolveModelCapability` + the curated Claude catalog + family detection → `domain/connection/catalog/`); **credential resolve/CRUD/health-state** (→ `credentials`; providers receives a brand-protected `ResolvedCredential` and returns raw `ProbeResult`s); **vector math** (→ `@orb/kit/vector-math`); **the embedding store / vector-space setting** (→ `embeddings` / `connection`).

## Layout

```
infra/providers/
├── index.ts            FRONT DOOR — createProviderExecutor / createBackendRegistry + role factories +
│                       diagnostics + fetchOrCatalog + the contract re-exports. NO catalog, NO profiles,
│                       NO DEFAULT_*_MODEL_ID (those are connection/contracts).
├── contract/           the sealed typed surface (barrel; outside deep-reach is RED)
├── roles/              the firewall — chat · agent · embed · rerank · image-embed · summarize ·
│                       generate-image + dispatch.ts + firewall.ts
├── backends/
│   ├── openrouter/     runners/{chat,embed,rerank,image} · client · catalog · account · probe · credential-guard
│   ├── agent-sdk/      env.ts (THE credential firewall) · runner · agent-runner · translate · types ·
│   │                   verify · verify-auth · session/ (SessionStore + seed/reseed frames — backend-internal)
│   ├── custom-byo/     runners/chat · inspect (the "Test endpoint" inspector)
│   ├── local-light/    embed · rerank · image-embed · model-cache (D39; no chat surface)
│   └── kit/            shared infra-pure wire helpers (the strategy-isolation seam)
├── vllm/               engine/ (supervisor · engine-control · engine-status · engines · client ·
│                       chat-completion · embedding · image · gpu) + surfaces/ (5 role registrations)
├── resolve-chat.ts     the UserIntent × ModelCapability → wire-knobs funnel
├── diagnostics.ts      account / probe dispatch on credential.source
```

## Contract homes (one home, one direction)

| Shape | Home |
| - | - |
| `EmbedResult` / `RerankResult` / `ImageEmbedResult` / `SummarizeResult` | `@orb/contracts/providers` (DAG Layer 0 — lands BEFORE `role-clients`, which depends on them) |
| `ResolvedCredential` (brand) / `CredentialHealth` / `CredentialSource` | `@orb/contracts/credentials` |
| `ModelCapability` / `ChatApi` / `DEFAULT_*_MODEL_ID` | `@orb/contracts/connection` |
| `RoleClients` (the bundle — pre-bound thunks, type-only, no credential in any signature) | `@orb/contracts/role-clients` |
| Request shapes (`ChatRequest`, `AgentTurnRequest`, `ChatEvent`, `ChatError`, wire vocab, `BackendKey`) | `infra/providers/contract/` — infra-internal, behind the barrel; they carry `AbortSignal` + branded credentials and are NOT wire shapes |

## The boot binder (the composition seam)

`entry/compose/role-clients.ts` mints the `RoleClients` bundle — **keep the bundle** (the gold-standard cross-feature hub), never per-role-op injection scatter. `bindRoleClientsForUser` resolves `connection.resolveRole({role})` PER ROLE (honoring `routing.roleDefaults.<role>` incl. the local-light arm) and binds each callable through the wired `ProviderExecutor`. There is NO vLLM-floor default and no `createDefaultRoleClients` — every context receives `roleClients` as a required entry-wired dep (a missing wire is a `tsc` error).

## The inference roles are multi-backend & hardware-tiered

Each role is a thin contract with sealed backends across three hardware tiers, picked per role by `resolveRole`:

| Role | local-light (transformers.js/ONNX, CPU or CUDA) | local-heavy (vLLM) | hosted (key) |
| - | - | - | - |
| embed | small models (BGE/MiniLM/…) — the "any box" tier *(own space)* | Qwen3-VL (multimodal, dual-lens) | OpenRouter Qwen-embed (SAME space as vLLM, guarded) · others |
| rerank | ONNX cross-encoder *(own space)* | vLLM Qwen reranker | OpenRouter `rerank.rerank` (text-only; caller ids preserved, never raw indexes) |
| imageEmbed | CLIP/SigLIP ONNX *(own space)* | Qwen3-VL | OpenRouter Qwen-VL (SAME space as vLLM) |
| generateImage | — | — | OpenRouter image models |
| summarize | *(not a model — a `chat` turn shaped, on whatever chat backend resolves)* | | |

- `summarize` is a request shaper over the `chat` role everywhere — never a separate engine.
- **Local compute is the OWNER's box resource (D17's second class).** The vLLM role credential is keyless/loopback — shared with authenticated principals by design. Unlike `max-pro-sub` (owner-only, consent-default-OFF, ban-prone + $), local compute carries no ban/wallet risk, only finite-hardware contention: non-owner use is allowed by default, governed by a per-member turn/request COUNT budget (transport), the supervisor concurrency limits + spawn mutex, and an owner throttle/disable knob — NOT a credential gate.

### The embedding-space invariant (lives ABOVE providers; constrains the embed surfaces)

**The embed model DEFINES the vector space `(model, dim)`.** `embeddings` tags every vector with its space; `search`/memory compare ONLY within one space. Same model, different backend = the SAME space = free local↔hosted switch **only with the guard**: (a) pin the OR `provider` (no silent reroute to a different quant) and (b) a one-time probe (embed the same text both ways, assert cosine ≈ 1.0) — MRL truncation + L2 normalization must match. Different model/dim = its own space = a deliberate, rare re-index workload, never a per-turn knob. rerank/imageEmbed inherit it (a reranker pairs with the embed space; image↔image cosine works only inside a joint multimodal space). The embed/imageEmbed surfaces carry `model` + `dimensions` through so embeddings can tag the space; providers never compares vectors (the `@orb/kit/vector-math` dim-mismatch throw is the tripwire).

## Spine intersections

### §7.1 — the credential firewall

The Max-sub path symlinks ONLY `.credentials.json` into an ephemeral `CLAUDE_CONFIG_DIR` and nulls the OR-skin trio; the OR-skin path uses an EMPTY ephemeral dir + the OR key with every host credential source nulled — the sub OAuth token is **structurally unreachable** from a paid spawn regardless of runtime credential precedence. `RESERVED_CLAUDE_ENV_KEYS` is applied AFTER the preset escape hatch, so a preset can never repoint auth/routing. The `max-pro-sub` owner gate is a credentials concern (the brand is unconstructable except after `requireOwner`, D17); providers never re-checks. The transitive hole is also closed: dep-cruiser `credential-firewall-openrouter-not-agent-sdk` (`reachable:true`) forbids any openrouter module reaching agent-sdk through ANY chain.

### §7.2 — the homeless fourth nature

The agent-sdk runtime config (isolation pins + reserved denylist + 3-mode firewall) is nature (c): backend-internal config of the agent-sdk strategy, called "env" only because it EMITS env vars. It stays in `backends/agent-sdk/env.ts` (D8). Generation params (`UserIntent`) are nature (d) — they ride the request and `resolve-chat` projects them per backend. The vLLM engine reads `VLLM_*` from `foundation/env`.

### §7.3 — the wire-schema seam

The OR catalog parse and the chat/responses wire schemas (`backends/kit/wire-schemas.ts`) are lenient zod parses at the HTTP boundary — the zod-parse-at-the-wire pattern. They stay infra (vendor wire shapes); connection owns the parsed snapshot.

### §7.5 — the sealed dispatch axes

- **`BackendKey` (`agent-sdk | openrouter | vllm | local-light | custom-openai` — five members since the anth-direct purge; the `BACKEND_KEYS` tuple is the truth)** — derived inside via `deriveRunner(api, source)` / `backendForSource`; never leaves the tier (`ResolvedConnection` carries `backend`-opaque vocab, never `runner`/`family`).
- **`credential.source`** — the non-chat dispatchers switch on it; unsupported pairings throw typed. `local-light` serves the three derive roles only (its backend simply lacks the other methods; `requireRoleImpl` throws typed not-supported).
- Adding a backend = the source arm + the runner arm + the credential arm simultaneously; `assertNever` makes a missed arm a `tsc` error. *Gates: NONE — all four gates this line once named (`providers-runner-seal`, `infra-strategy-isolation`, `vllm-surface-isolation`, `providers-public-surface-only`) are gone; the last, `providers-runner-seal`, was RETIRED 2026-09-20 with the `@orb/inference` §12 extraction audit because its four sealed symbols and their declaration home no longer exist. The seal is RESOLVE-TIME now: the backend-dispatch vocabulary lives in `packages/inference/src/registry/backends.ts`, which `@orb/inference`'s exports map does not expose, so a server-tier import of it fails to resolve at `tsc` AND at dependency-cruiser. Nothing in the rest of this §7.5 bullet survives the extraction either — see the BUILD-STATE RIDER above.*

## Esoteric / load-bearing details (preserve exactly)

1. **The agent-sdk credential firewall is rebuilt EVERY turn and ordered for safety.** Layering: host baseline (minus secrets) → runtime knobs → user escape hatch → **auth firewall LAST**; the reserved-keys filter runs on the escape hatch BEFORE the auth overlay. Reorder these and the sub token can leak to a paid endpoint. The `CLAUDE_CODE_DISABLE_*` pins were each verified against the bundled runtime binary — they are NOT grep-able in the JS wrapper; do not "clean up" names that look unused. `disallowedTools` removes the cowork bundle that `tools:[]` does NOT. (`backends/agent-sdk/env.ts` is the authority.)

2. **The binder honors `routing.roleDefaults.<role>` per role — no vLLM floor.** `bindRoleClientsForUser` resolves each role via `connection.resolveRole` at bind time; a sync vLLM-floor default (neo's bug) silently routed workload roles to vLLM even when the user pinned OpenRouter. Invariant #6 is the gate.

3. **The agent-sdk seed-frame shape is load-bearing — the canon feed is WIRED.** A fresh `SessionStore` seeded from canon must use full frames (`type`/`uuid`/`parentUuid`/message + timestamp) — bare frames get "No conversation found"; an ASSISTANT-FIRST seed does not resume (greetings get the user-stub prefix). The `init` frame carries a SHAPE GUARD (missing `session_id`/`apiKeySource` throws loudly at boot). The live wiring: the agent-sdk request arm carries `seed` (the model-visible pre-turn transcript, split from shaped history by the entry bridge — TOTAL since #1607: a history with no trailing user row seeds WHOLE and the prompt is the host-authored `AGENT_CONTINUATION_PROMPT_STUB`, so no turn on this wire is ever a flattened transcript string); `SessionCache.ensureSeededSession` RESUMES the recorded session only while its stored transcript still matches the seed (merged role-runs: assistant runs concatenate — the SDK splits one reply per block; user runs join with the contract `AGENT_PROMPT_TAIL_JOINER`) and otherwise reseeds a fresh DETERMINISTIC session (`seedSessionId(chatId, seed, salt)`) — a swipe/edit can never resume a transcript holding the rejected text, and byte-identical rebuilds keep the API-side prefix cache warm across reseeds AND process restarts (a durable store is an optimization, not a correctness need). The store is keyed by `sessionId` ONLY — the SDK derives `SessionKey.projectKey` from its sanitized spawn cwd, so honoring it would orphan our pre-spawn seeds; session uuids are globally unique, making the key safe. Backend-internal (`agent-sdk/session/`); the domain never sees a session concept — the request seed is chat-domain vocabulary (role + content BLOCKS derived from `ChatContentPart`; a tool exchange rides as a real `tool_use`/`tool_result` pair when both halves are present, adjacent and parseable, and degrades to announced text when they are not — #1605, and the SDK spelling is minted only in `session/frames.ts`).

4. **The vLLM supervisor lifecycle is a measured matrix.** Death-coupling is a pipe-watchdog (`setsid … & cat; kill`) holding a stdin pipe — ANY server death (incl. SIGKILL) kills the engine's process GROUP. Orphan-reap finds EngineCore workers by `/proc/<pid>/cwd === repoRoot` (the only surviving marker). ONE spawn mutex serializes boot + restarts (concurrent boots gave embed a NEGATIVE KV budget). The breaker (3 restarts / 10m → `failed`, half-open 15m) and `pendingSpawn` flag are load-bearing. `decideTick`/`breakerAllows`/`findOrphanedEngineCores` are PURE cores — keep them unit-testable.

5. **`cache_control` placement is split: the runner PLACES, the chat domain COMPUTES.** `placeHistoryCacheBreakpoint` converts the message at `historyCacheBreakpointFromEnd` (the offset the chat pipeline computed) into the structured-block form, gated on `cacheMinTokens`. Offset-from-end is robust to the runner's empty-filter + front-drop fit. PER-BLOCK on the static system block pins the cache at the stable prefix (a top-level directive pins it at the volatile newest message → 0 cache writes, measured). Guaranteed Anthropic caching uses chat-completions; the responses runner's top-level `cacheControl` is a measured no-op kept for forward-compat.

   **The agent-sdk path caches DIFFERENTLY — the SDK owns the wire body, so the runner can't place breakpoints on it.** Dynamic system context instead routes per a resolved `dynamicContextChannel` (`routeDynamicContext`, `backends/agent-sdk/runner.ts`): `system-block` joins static+dynamic into ONE `systemPrompt` string (re-writes the whole ~12.7k system block every scene change); `message-tail` (LIVE) sends only the static half as `systemPrompt` and injects the dynamic half through a `UserPromptSubmit` hook's `additionalContext` (`dynamicContextOptions`) — cache-safe by construction, it never touches the prefix. `message-tail` is gated on the model's `midConversationSystem` capability; an off-capability `dynamicContext:'hook'` request demotes to `system-block`. The SDK caching is CONTENT-keyed, not session-keyed — a byte-identical fresh session or deterministic reseed cache-reads the prior prefix (what makes per-speaker reseeds + cross-restart resume affordable with no durable store). The measured probe matrix (per-channel cacheRead/Write, the dead `[static,dynamic]`-array and raw-`api_system`-frame channels, pinned to SDK/model versions) is frozen in `history/tier-3-archaeology-record.md`; reproduce with the hand-run `scripts/probes/sdk-cache-probe.ts` (`pnpm sdk:cache-probe`, re-run after every SDK bump — it prints per-turn cacheRead/cacheWrite).

6. **`getChatModel` 3-stage prefix-match (in `domain/connection/catalog/`, preserve).** OR uses version-only ids; the curated catalog dated form. Stage 3 prefix-matches with a boundary check (next char `-`). Exact-match-only silently falls Haiku through to synthesis with the wrong profile.

7. **`detectModelFamily` anchors reject third-party forks.** `^(?:anthropic\/)?claude[-/]` matches bare + `anthropic/`-prefixed Claude but rejects `some-org/claude-fork` → an alien backend containing "claude" never receives Anthropic-only `cache_control`. The same anchor is deliberately duplicated in `backends/kit/cache-control.ts`'s `isAnthropicModel` (it gates the wire send).

8. **The Opus 4.8 adaptive/budget conflict is API-level, enforced in the funnel.** `enabled + budget_tokens` to an adaptive model → live 400; `resolve-chat` drops the budget (emits adaptive + a warning). Mandatory-reasoning endpoints 400 on `effort:'none'` at request-open → the runners strip and replay ONCE (pre-commit-safe). *(The OR-responses `effort`/`max_tokens` XOR that used to sit beside these has NO enforcement point any more and needs none: `responses` was retired from `CHAT_APIS` by owner ruling 2026-09-20 and its builder `effortToResponsesReasoning` deleted with the rest of `backends/kit/reasoning-budget.ts`. Reviving the api means wiring `@ai-sdk/openai`'s `.responses()` transport, and the XOR comes back with it.)*

9. **`summarize` is a request shaper over `chat`, not a separate engine.** The vLLM surface maps the batch contract onto `chat-completion` with bounded workers feeding vLLM's continuous batcher; OR summarize runs sequential (per-key rate limits).

10. **`custom-byo` is FULLY user-declared — nothing baked.** The user declares all four: endpoint+auth, request mappings, the **model profile** (via `ModelCapability` — the runner reads `req.capability`, never a baked window/tier/thinking constant), and the **response mappings**. The "Test endpoint" inspector sends the ACTUAL shaped request and shows a redacted request + raw response. The backend's entire behavior is the user's config, so it ripples into nothing.

11. **The embedding-space invariant constrains the embed surfaces** (see the section above): surfaces carry `model` + `dimensions` through; providers never compares vectors; the vector-math dim-mismatch throw is the tripwire if a space swap slips through.

## Invariants (gated)

1. **The domain calls a role, never a backend.** No per-backend dispatch arm in any domain; the chat domain has ONE turn path. *(dep-cruiser: domains import the providers barrel only; `backends/**`/`vllm/**` deep imports are RED.)*
2. **Backends are sealed — no backend imports another.** Cross-backend work only via the contract or `backends/kit/`. *(`infra-strategy-isolation` + the transitive `credential-firewall-openrouter-not-agent-sdk` reachability rule.)*
3. **`runner`/`family`/`protocol` never leave `infra/providers`.** *(compile-time + grep gate: `runner`/`family` never appear in `domain/connection/**`.)*
4. **`providers/contract/*` is reachable only through the barrel.** *(`providers-public-surface-only`.)*
5. **The agent-sdk firewall is unleakable + unconstructable-around.** Reserved-keys before the auth overlay; auth firewall last; `max-pro-sub` owner-gated upstream. *(test-time: the OR-skin spawn can never see the sub token; a preset cannot set/strip a reserved key.)*
6. **All role connections honor `routing.roleDefaults.<role>` — no hard-pin.** The binder resolves per role. *(test-time.)*
7. **vLLM is its own multi-role engine, not a chat-backend peer.** Surfaces independent; lifecycle one owner. *(`vllm-surface-isolation`.)*
8. **The chat-turn contract is thin + stable.** Adding a backend changes no consumer. *(`assertNever`-exhaustive dispatch.)*
9. **`resolve-chat` reads the descriptor, never authors it.** No capability synthesis inside any runner or the funnel. *(compile-time: the funnel takes an injected `ModelCapability`.)*
10. **`vector-math` is `kit`, not infra.** *(resolve-time + `kit-purity`.)*
11. **`DEFAULT_*_MODEL_ID` constants are off the providers barrel** (they live in `@orb/contracts/connection` — the foundation→infra edge stays dead). *(resolve-time.)*
