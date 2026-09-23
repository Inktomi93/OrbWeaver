---
kind: law
status: active
updated: 2026-09-23
---

# Orbweaver — `@orb/inference`: the provider runtime (wires · providers · resolution · execution)

> The infra/providers directory under `packages/server/src/` does not exist. The execution tier lives in the `@orb/inference` workspace package. The layer order is `kit ← contracts ← db ← inference ← server` (`.dependency-cruiser.cjs` rule `inference-cake`). The tree is the authority; the code's file headers are the per-module law.

The closed backend-key tuple, the deriveRunner (api, source) matrix, the provider-roles tuple, the roles firewall and its role-source policy, the credential-source dispatch axis, the in-server vLLM engine plane, the OpenRouter agent-sdk skin, and the custom-byo backend do not exist in the tree. They are spelled here without code formatting on purpose: they have no referent, and a backticked cite would claim one. Do not carry a sentence forward from a doc that names them.

## 1. The axes (code vs data vs a user's row)

| Axis | What it decides | Kind | Home |
| - | - | - | - |
| **wire** | how bytes are spelled and parsed | **CODE** — one sealed backend per member; a plugin can never add one | `packages/contracts/src/inference/wires.ts` (`WIRES`, `WIRE_DEFS`) |
| **provider** | who serves the bytes | **DATA** — registry rows through ONE zod schema (built-in · plugin manifest · admin) | `packages/contracts/src/inference/provider-schema.ts` + `builtin-providers.ts` |
| **api** | the chat PROTOCOL a turn is addressed by | closed tuple | `packages/contracts/src/inference/apis.ts` (`CHAT_APIS`) |
| **connection** | the user's row: provider + model + credential + overrides | **A USER TABLE** (`user_connections`) | `packages/contracts/src/inference/connection.ts` |
| **binding** | which connection an actor's task resolves to | **A USER TABLE** (`connection_bindings`) | same file (`connectionBindingSchema`) |
| **task** | what a caller asks for, NAMED AT THE CALL SITE | closed tuple + `TASK_DEFS` | `packages/contracts/src/inference/tasks.ts` (`TASKS`) |
| **kind** | what the model IS (`generation` · `embedding` · `rerank`) | closed tuple | `packages/contracts/src/inference/kinds.ts` |
| **modality** | `text` · `image` · `video` · `audio` · `file` · `vector` | closed tuple | `packages/contracts/src/inference/modalities.ts` |

**The tuples are the truth, not this prose.** Wires today: `openai-compat` · `anthropic-messages` · `agent-sdk` · `local-light`. Tasks today: `chat` · `agent` · `summarize` · `structured` · `generateImage` · `embed` · `imageEmbed` · `rerank`. Read the tuple, never a list in a doc.

**`vllm` is a PROVIDER ROW, not a module** (D7): an `auth: endpoint` row on the `openai-compat` wire whose `features` carry the prefill/sleep/rerank knobs. The only surviving runtime slice is `packages/inference/src/backends/openai-compat/reachability.ts`, keyed on the folded `features.sleep` and never on a provider id. LM Studio, Ollama and the BYO row are the same shape — a server's quirks are `features`, never a code path (`packages/contracts/src/inference/features.ts`).

## 2. Dispatch

`backend = registry.get(connection.wire)` — one map lookup, no matrix (`packages/inference/src/registry/dispatch.ts`). The supporting rules:

- **One backend per wire.** `BACKEND_DEFS: Record<Wire, BackendDef>` (`packages/inference/src/registry/backends.ts`); `buildBackends(deps)` constructs only the wires whose `needs` are present (the `agent-sdk` wire needs the bundled `claude` executable). A wire that is not built is ABSENT from the registry, availability reads `unavailable`/`runtime-missing`, and the picker never offers it.
- **`apis ⊆ WIRE_DEFS[wire].apis`** and **`serves ⊆ WIRE_DEFS[wire].serves`**, refused at the provider-row parse (`provider-schema.ts::wireIssues`) and re-checked at resolve (`packages/inference/src/resolve/coherence.ts`). A row NARROWS a wire; it never widens it.
- **`serves` is pinned against the implemented methods** by a table test — `tests/inference/registry/backends.test.ts` walks every `WIRES` member and asserts the built backend's present methods equal `WIRE_DEFS[wire].serves`.
- **Fail-closed by absence.** An unwired wire and an unimplemented method both throw a typed `ProviderError`, never a silent default (`requireBackend` / `requireMethod`).
- **Adding a provider is a ROW + the table test** — a `satisfies`-checked entry in `packages/contracts/src/inference/builtin-providers.ts`, or a plugin-manifest / admin row through the same schema at runtime. Zero code. Adding a WIRE is a new sealed backend + a `BACKEND_DEFS` entry + a `WIRE_DEFS` entry; every consumer is unchanged because `Record<Wire, …>` makes a missed case a `tsc` error.

## 3. The boundary (re-derived — the old "it executes; it never selects" no longer describes the package)

The package now owns RESOLUTION as well as execution, deliberately: selection is a fold over the user's OWN DATA, not policy, and "the connection IS the pick" (`packages/inference/src/contract/resolved.ts`). The three lines that are actually true:

1. **`@orb/inference` resolves and executes; `domain/connection` is the DOOR, not the decider.** The domain writes its three tables and gates the principal; every read verb is a thin delegation to `runtime.*` (`packages/server/src/domain/connection/verbs/resolve.ts`). It decides exactly one thing: the PROJECTION — a client or a bus payload gets the credential-free `ResolvedConnectionView`, never the secret-bearing `Resolved` (`packages/server/src/domain/connection/substrate/resolved-view.ts`).
2. **Inside the package the executor still never selects.** `createProviderExecutor` dispatches on the ALREADY-RESOLVED wire; `canFund`, `requirementMet` and `connectionTasks` were decided at resolve (`packages/inference/src/roles/executor.ts`).
3. **The package knows no domain and no persistence.** Connections, bindings, provider rows and catalog snapshots are four PORTS the server wires to drizzle; observability is injected as `span`/`log` plus the supervised-detach port; the provider transport is a required injected `fetch` (`packages/inference/src/deps.ts`). No `@orb/db`, no `@orb/server`, no `@orb/client`.

**Resolution, in one line:** `(task, principal, actor?) → Resolved` = the binding fold over the funder's own rows → the connection row (must be the funder's) → the provider row → the model's kind → `connectionTasks` → api coherence → the credential by id → the catalog warm → the evidence synthesis → the feature fold → the `requirement`/`canFund` VERDICTS (`packages/inference/src/resolve/resolve-task.ts`). There is **no born default**: the fold ends at the funder's own rows and answers `no-connection` (`packages/inference/src/resolve/precedence.ts`).

## 4. The tell that it is right (run these)

```bash
# 1. The package has ONE public entry: `exports` is `{".": "./src/index.ts"}`.
#    So no server file can reach a backend, the registry, or the wire→backend map — a deep
#    import fails to RESOLVE (tsc TS2307) before dependency-cruiser ever sees it.
jq '.exports' packages/inference/package.json          # => { ".": "./src/index.ts" }
rg -n '"@orb/inference/' packages tooling tests scripts   # => 0 hits (control: the same
rg -c '"@orb/contracts/' packages                          #     pattern on contracts hits many)

# 2. The browser never imports it (node-only: subprocess, ONNX runtime, guarded fetch).
rg -n '@orb/inference' packages/client packages/ui      # => 0 hits

# 3. The cake direction and the browser fence are the tier-3 backstop.
pnpm depcruise                                          # rules: inference-cake, browser-no-inference

# 4. `serves` is data, and the table test is what keeps it honest.
pnpm test:scoped tests/inference/registry/backends.test.ts
```

A bare zero from step 1 or 2 is only a measurement because step 1 carries its own positive control on the same pattern; report the control count, never a lone zero.

## 5. Layout

```
packages/inference/src/
├── index.ts          createInferenceRuntime(deps) — THE ONE surface: resolve · availability · executor ·
│                     capabilities · funnel · roleClientsFor · catalogs · diagnostics · providers · localLight
├── deps.ts           exact D15 composition seam — re-exports InferenceDeps from contract/runtime.ts
├── contract/         the typed internal surface (backend · chat · agent · roles · events · errors ·
│                     resolve · resolved · diagnostics), re-exported through index.ts
├── registry/         backends.ts (BACKEND_DEFS + buildBackends) · providers.ts (built-ins ∪ runtime rows) ·
│                     dispatch.ts (the lookup, the provider span, the abort flatten)
├── resolve/          resolve-task.ts · precedence.ts (the binding fold) · availability.ts · coherence.ts · heal.ts
├── capability/       synthesize.ts (the evidence fold) · families.ts · floor.ts · sources/{advertised,
│                     curated, measured} — the `declared` tier comes off the connection row, not a source dir
├── catalog/          listing.ts (the one model-list read, saved row or draft) · openrouter.ts · endpoint.ts ·
│                     mirror.ts (the snapshot + TTL mirror)
├── funnel/           resolve-chat.ts · resolve-embed.ts — (intent × capability) → wire knobs
├── roles/            executor.ts · role-clients.ts · diagnostics.ts
└── backends/         openai-compat/ · anthropic-messages/ · agent-sdk/ (+ session/) · local-light/ ·
                      v4/ (the Vercel-AI-SDK v4 seam) · kit/ (the shared pure wire helpers)
```

## 6. Contract homes (one home, one direction)

| Shape | Home |
| - | - |
| every axis tuple (§1) + the capability schemas + the evidence ladder + derived policy | `@orb/contracts/inference` — ISOMORPHIC; the client renders the picker from it |
| `EmbedResult` / `RerankResult` / `ImageEmbedResult` / `SummarizeResult` / `AccountCredits` / `EndpointInspection` | `@orb/contracts/providers` |
| `ResolvedSecret` / `CredentialHealth` | `@orb/contracts/credentials` |
| `RoleClients` (the pre-bound derive bundle, no credential in any signature) | `@orb/contracts/role-clients` |
| `Resolved<Task>` (carries the SECRET), `ChatRequest`, `AgentTurnRequest`, `ChatEvent`, `ProviderError`, composition/runtime port shapes | `packages/inference/src/contract/` — the package's sanctioned type home, behind the single entry |
| `ResolvedConnectionView` (the credential-FREE projection a client or a bus may see) | `packages/contracts/src/inference/resolved.ts` |

This split matters: `ResolvedConnectionView` must stay importable by a bus contract, and the secret-bearing half must not (D16 confines secret-bearing shapes to `#credentials`).

`packages/inference/src/deps.ts` is the exact D15 package-root composition seam. It re-exports the port shapes owned by `contract/runtime.ts`; it is not permission for another root module or another type home. `package-layout` and `no-inline-types` enforce both halves.

## 7. The composition seam

`packages/server/src/entry/compose/services.ts` constructs the runtime once and exposes `roleClientsFor(funderUserId)` — a PER-CALL bundle, not a boot-time binding. Each callable folds its task at call time, so a re-pointed binding governs the very next call with no restart and no invalidation hook to forget (`packages/inference/src/roles/role-clients.ts`). There is no `createDefaultRoleClients` and no floor default; a missing wire is a `tsc` error.

The caller that owns a workload supplies `funderUserId`. Chat turns derive it from the room host seat and freeze it with `runAsUserId` at the turn boundary (D18/D19); `triggeredBy` never selects a connection. Owner-scoped background workloads keep their explicit owner funder.

## 8. Capability synthesis

ONE fold in `EVIDENCE_TIERS` order — `declared → measured → advertised → curated → family-floor → kind-floor` (`packages/contracts/src/inference/evidence.ts`, folded by `packages/inference/src/capability/synthesize.ts`). Each tier is a PARTIAL that overrides only the fields it states; `family-floor` ORs in and never subtracts; `sampling` REPLACES because it is the stated SET a tier vouches for and a patch grammar cannot express a measured absence. `declared` wins over a dated measurement with a `declared_overrides_measured` warning naming the field — the user's box is the truth about the user's box.

## 9. The embedding-space invariant (lives ABOVE the package; constrains the embed surfaces)

**The embed model DEFINES the vector space `(model, dim)`.** `embeddings` tags every vector with its space; `search`/memory compare ONLY within one space. The deployment's width is a task REQUIREMENT (`EMBED_SPACE_DIMS`, `TASK_DEFS.embed.requires.dims`), so a row that cannot produce it reads `requirement-unmet` instead of poisoning the space. Same model, different backend = the same space = a free local↔hosted switch only with the guard: pin the provider (no silent reroute to a different quant) and probe once (embed the same text both ways, assert cosine ≈ 1.0) — MRL truncation and L2 normalization must match. Different model/dim = its own space = a deliberate re-index workload, never a per-turn knob. The embed/imageEmbed surfaces carry `model` + `dimensions` through so `embeddings` can tag the space; this package never compares vectors (`@orb/kit/vector-math`'s dim-mismatch throw is the tripwire). Cluster boundary: [`Knowledge-Cluster.md`](Knowledge-Cluster.md).

## 10. Esoteric / detailed rules (preserve exactly — the numbering is cited from code and from the inference program doc; do not renumber)

1. **The agent-sdk credential firewall is rebuilt every turn and ordered for safety** (`packages/inference/src/backends/agent-sdk/env.ts`). There is one path: the user's pasted `claude setup-token` rides `CLAUDE_CODE_OAUTH_TOKEN`, writable state lives in the user's own runtime dir (`CLAUDE_CONFIG_DIR = <USER_RUNTIME_DIR>/<owner>/claude`, never `~/.claude`), and every other auth/identity knob is pinned `undefined`. Layering is the security: host baseline (Claude/Anthropic namespace stripped, app secrets stripped) → runtime knobs → the user escape hatch (allowlisted to the Claude runtime knob namespace, then reserved-filtered) → **the auth pins last**, so nothing above can override them. Reorder these and a preset can repoint auth. There is no host-file path, no OpenRouter skin and no first-party-key path — the subprocess is the subscription's alone.

2. **There is no born default and no floor: every resolution is a fold over the funder's own rows.** `binding(actor, task) → binding(actor, ridesOn) → binding(funder, task) → binding(funder, ridesOn) → none`, one indexed lookup per hop (`packages/inference/src/resolve/precedence.ts`). `scope: "owner"` tasks (the vector space) ignore the actor ref — an owner has one space. A binding whose connection was deleted reads `no-connection` (SET NULL), never a dangling id.

3. **The agent-sdk seed-frame shape matters — the canon feed is wired.** A fresh `SessionStore` seeded from canon must use full frames (`type`/`uuid`/`parentUuid`/message + timestamp) — bare frames get "No conversation found"; an ASSISTANT-FIRST seed does not resume. The `init` frame carries a SHAPE GUARD that throws loudly at boot (`packages/inference/src/backends/agent-sdk/verify.ts`). The request carries `seed` (the model-visible pre-turn transcript, split from the neutral turn's history by `backends/agent-sdk/turn-input.ts` behind `toChatRequest` (D177), and the split is total: a history with no trailing user row seeds whole, and the prompt is the host-authored `AGENT_CONTINUATION_PROMPT_STUB`). `ensureSeededSession` RESUMES a recorded session only while its stored transcript still matches the seed (assistant runs concatenate — the SDK splits one reply per block; user runs join with `AGENT_PROMPT_TAIL_JOINER`) and otherwise reseeds a fresh DETERMINISTIC session (`seedSessionId(chatId, seed, salt)`), so a swipe or edit can never resume a transcript holding the rejected text, and byte-identical rebuilds keep the API-side prefix cache warm across reseeds AND process restarts (a durable store is an optimization, not a correctness need). The store is keyed by `sessionId` ONLY — the SDK derives `SessionKey.projectKey` from its sanitized spawn cwd, so honoring it would orphan our pre-spawn seeds. Backend-internal (`packages/inference/src/backends/agent-sdk/session/`); the domain never sees a session concept.

4. **Absence fails CLOSED, in both directions, and says which absence.** A wire whose `needs` were unmet is not in the registry → `requireBackend` throws typed and availability reads the ACTIONABLE cause (`runtime-missing` for the agent-sdk wire with no `claude` executable, `unavailable` otherwise — `packages/inference/src/resolve/availability.ts`). A wire that IS built but lacks a method → `requireMethod` throws typed rather than a `TypeError` on an undefined call. Neither path has a default.

5. **`cache_control` placement is split: the runner PLACES, the chat domain COMPUTES.** `computeCacheBreakpointPlacements` (`packages/inference/src/backends/kit/cache-control.ts`) turns a CONVERSATIONAL depth-from-end — counted in role groups over the delivered history by `domain/chat/assembly/shape.ts::computeHistoryBreakpoint` with the placer's own counter (`cacheDepthCovering`), never in wire-array offsets — into the structured-block form, gated on `cacheMinTokens`, and places a PAIR (`depth`, `depth+2`) so a hit survives Anthropic's 20-block lookback on a long conversation. A requested depth the conversation cannot reach places nothing and says so loudly (`provider.cache_depth_unreachable`) — D41, no silent degrade. Two wire facts matter: an unknown ttl makes OpenRouter answer 200 and silently drop the whole block (~10x the cost of a cached turn), so the ttl allowlist is a guard; and `order` alone does not pin a provider (`allow_fallbacks` defaults TRUE, and a probe caught a turn walking Anthropic → Bedrock → Azure → Google, re-billing the prefix at every non-caching hop), so `effectiveProviderRouting` pins `order` + `allow_fallbacks: false`. **The agent-sdk path caches DIFFERENTLY** — the SDK owns the wire body, so the runner cannot place breakpoints on it. The system-region halves (static and dynamic) join ONE `systemPrompt`, where the prompt order put them. System rows below the history, which the chat engine keeps only on a `midConversationSystem` model at a level that keeps system rows, are lifted off the transcript into `tailSystem` and ride a `UserPromptSubmit` hook's `additionalContext` (`tailSystemOptions` in `packages/inference/src/backends/agent-sdk/translate.ts`) beside the prompt, their own position. SDK caching is CONTENT-keyed, not session-keyed — which is what makes deterministic reseeds and cross-restart resume affordable with no durable store. The measured per-channel matrix is in git history; **the hand-run probe that produced it was deleted with the package extraction and has no successor on the tree** — re-running it after an SDK bump means rebuilding it first.

**The agent-sdk path never uses the array `systemPrompt` form** (`[static, dynamic]`) to fix cache busting. The array form keeps the static half cached, but the bundled CLI gates it off, and it leaks the dynamic-boundary sentinel (`[Scene note …]`) into context the model can see and quote back. Volatile context goes through the `message-tail` channel instead. `buildSystemPrompt` in `packages/inference/src/backends/agent-sdk/translate.ts` joins the halves into one string and strips `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` from both. Re-measure the array form with a live probe before adopting it after an SDK upgrade.

6. **A foreign connection id and a missing one are ONE indistinguishable refusal — kind AND text.** `connectionNotFoundMessage` is a single literal shared by the resolver's owner check and the runtime root's id-taking reads (`packages/inference/src/resolve/resolve-task.ts`), because `invalid` is the one error case the transport lets carry its own message to the caller, so two distinguishable refusals would be an existence oracle for any id a caller can type. The distinction survives inward: the owner-mismatch case records a `securityEvent` (a binding naming a stranger's row is a domain bug no caller can provoke); the caller-supplied-id guard records nothing, or an authenticated stranger could fill the security log by typing ids. The domain door pre-gates with the same refusal (`domain/connection/contract/errors.ts::ConnectionNotFoundError`); this guard must never answer more precisely than the door it backs.

7. **`detectModelFamily` anchors reject third-party forks, and the anchor is DELIBERATELY duplicated.** `/^(anthropic\/)?claude[-/]/i` matches bare and `anthropic/`-prefixed Claude but rejects `some-org/claude-fork`, so an alien endpoint whose id merely contains "claude" never receives Anthropic-only `cache_control` or the Claude family floor. The same anchor is duplicated on purpose in `isAnthropicModel` (`packages/inference/src/backends/kit/cache-control.ts`) (it gates the WIRE send) beside the synthesis copy in `packages/inference/src/capability/families.ts` — two homes, both file headers naming the other. **No gate enforces this pair**: the `inference-model-regex-fence` those two headers cite does not exist on the tree, so the honesty mechanism is the header cross-reference and nothing else.

8. **The reasoning guard is API-level and lives ONLY in the funnel.** `packages/inference/src/funnel/resolve-chat.ts` owns reasoning gating, the effort clamp, the adaptive/budget guard, sampling capability-gating, the output clamp, the dynamic-context channel and the reply-images decision — never re-derived per backend, and its second consumer is `preset.resolveEffective` so the editor projects exactly what the next turn sends. Every drop is LOUD (D41): a budget handed to an `adaptive` or `effort` model 400s live, so the funnel drops it and emits `adaptive_budget_dropped` / the effort-mode warning. Downstream, an endpoint that rejects `reasoning.effort:"none"` gets a strip-and-replay ONCE, pre-commit-safe (`packages/inference/src/backends/openai-compat/chat.ts`), and the APPLIED effort is read back off the options the LAST attempt built, never recomputed from the knobs (`packages/inference/src/backends/kit/applied-effort.ts`). ADR 0112's fold keeps the extraction tools attached with `tool_choice:"auto"` on every hosted wire, unchanged by reasoning. With reasoning ON, a hosted model regularly treats emitting those tool calls as discharging the beat and writes no prose; the recovery pass (`packages/server/src/domain/chat/engine/recover-narrative.ts`) reruns a tool-less prompt instead of discarding the turn.

9. **`summarize` and `structured` are request SHAPERS over a chat-capable wire, never separate engines.** Both are ordinary tasks on `WIRE_DEFS[wire].serves`, implemented by the same backends that serve `chat` (`packages/inference/src/backends/openai-compat/batch.ts`, `packages/inference/src/backends/anthropic-messages/batch.ts`, `packages/inference/src/backends/agent-sdk/summarize.ts`); `structured` returns the SAME `SummarizeResult` with schema-conforming JSON in each item's `text`. `structured` is a METHOD on the bundle, never sniffed off an option, and its wire VEHICLE is decided where both the ask and the resolved capability are in hand — `auto` ⇒ the enforcing `response-format` when the model advertises structured output, else the servable-everywhere forced tool (`packages/inference/src/roles/role-clients.ts`).

10. **An `auth: endpoint` row is FULLY user-declared — nothing is baked.** The user supplies the base URL and auth, the `features` overrides (prefill switch, strict-JSON posture, effort field, sleep/wake paths, rerank path, reasoning keys), the model profile via `declared` capability, the extra body fields (`extras`), and the request/response transforms (`ConnectionTransport`: headers, an include/exclude body pair applied as the endpoint's final word, and a dot-path `responseMap` that reshapes a non-OpenAI reply into one the shared reducer can read). Folded once at resolve — `wire default ← provider row ← connection.declared.features`. `extras` is open by definition; a denylist guards it on write and read, and a modelled param wins every collision (D143(b)/D156). The endpoint's whole behavior is the user's config, so it ripples into nothing.

11. **The embedding-space invariant constrains the embed surfaces, and the local-light dtype is EXECUTION truth.** §9 states the invariant. Its sharp edge in this package: a `local-light` embedding connection inherits the deployment's served dtype, and an explicit `declared.embedding.dtype` that disagrees is REFUSED at resolve before any writer, reader or purge can act on a space tag the encoder does not produce (`withLocalLightEmbedDtype`, `packages/inference/src/resolve/resolve-task.ts`). The dtype is part of the space tag (`localLightEmbedSpaceTag`).

## 11. Invariants (each names its enforcer)

1. **A domain calls the runtime front door, never a backend.** No per-wire dispatch case in any domain. *(resolve-time: `packages/inference/package.json` exports exactly `"."`, so a deep import fails `tsc` TS2307 — plus the `inference-cake` dep-cruiser rule.)*
2. **Backends are sealed — no backend imports another.** Cross-backend work goes through `contract/` or the two shared pure seams, `backends/kit/` and `backends/v4/`. *(lint-time: the `infra-strategy-isolation` dep-cruiser rule, pointed at `packages/inference/src/backends/<wire>/` — see §12. **Its name is historical only**: it governs `@orb/inference`, not server infra, and stays because this row and `Core-Enforcement-Active-Gates.md` cite it by name — a rename strands both citations. The exempt-dir pair is derived from `WIRES`, so a fifth wire inherits the seal for free.)*
3. **The backend-dispatch vocabulary never leaves the package.** `BACKEND_DEFS`, `ProviderBackend`, `requireBackend` are unreachable from `server`. `wire` itself is public (it is on `ResolvedConnectionView` and the client renders the picker from it) — the seal is on the map, not the word. *(resolve-time, same mechanism as invariant 1.)*
4. **The package's public surface is the single `.` entry.** Everything a consumer may use is re-exported by `packages/inference/src/index.ts`. *(resolve-time.)*
5. **The agent-sdk firewall is unleakable and unconstructable-around.** Reserved keys filtered before the auth overlay; the auth pins last; the pasted token is the only credential the spawn can see. *(test-time: `tests/inference/backends/agent-sdk/env.test.ts`.)*
6. **No born default — every task resolves through the funder's own bindings or answers `no-connection`.** *(test-time: `tests/inference/resolve/resolve-task.suite.test.ts`, `tests/inference/roles/role-clients.suite.test.ts`.)*
7. **One backend per wire, and `serves` is DATA pinned against the implemented methods.** *(test-time: `tests/inference/registry/backends.test.ts` — it also pins that a skipped wire is absent and named.)*
8. **The task contract is thin and stable — adding a wire changes no consumer.** *(compile-time: `Record<Wire, …>` and `assertNever` make a missed case a `tsc` error.)*
9. **The funnel READS the capability and never authors it.** No capability synthesis inside any runner or the funnel; synthesis has one home. *(compile-time: `resolveChat(intent, capability)` takes the descriptor as an argument.)*
10. **`vector-math` is `kit`, not this package.** *(resolve-time + the `kit-purity` dep-cruiser rule.)*
11. **The isomorphic vocabulary is `@orb/contracts/inference`; `@orb/inference` is NODE-ONLY.** The browser renders the picker from contracts. *(dep-cruiser `browser-no-inference`.)*
12. **A plugin provider row serves only the owners of the enabled installs that contribute it (D147).** The row pins its author's `baseUrl`, so every registry read names its viewer (`ProviderRegistry.get`/`list`), the store reads each contributor's owner through the contribution FK (`domain/connection/persistence/provider-rows.ts`), and the domain door refuses any other caller with `ProviderUnknownError` (`domain/connection/substrate/admission.ts`). Resolve reads as the connection's owner, so a saved row stops resolving when its owner holds no enabled contributing install. An admin distribution works through each recipient enabling their own copy. The picker names the plugin (`providerDisplayLabel`). *(test-time: `tests/server/domain/plugin/activation/provider-contributions.suite.int.test.ts`, `tests/inference/registry/providers.test.ts`, the cross-tenant sweep.)*

## 12. Known gaps (stated, not invented)

- **The agent-sdk behavioral probe fleet is GONE.** `scripts/probes/sdk-*.ts` (cache, session, hook-wire, tool-seed, …) and their `pnpm sdk:*-probe` aliases were deleted in the extraction commit `146f71cd5`; the measured matrices they produced are in git history. Any claim in §10 item 3 or 5 that says "re-run after an SDK bump" currently has no runnable instrument.
- **Four dep-cruiser rules once scoped to the deleted server infra/providers tree now govern the package instead.** They are spelled here without code formatting, per the note above, because that tree does not exist. What each governs now:
  - `providers-public-surface-only` — everything outside `@orb/inference` may import only the package front door (`packages/inference/src/index.ts`); a deep reach into a family, the funnel, the registry or `contract/` is RED. `tests/support` and `tooling/` are exempt, the latter to its own narrower half.
  - `infra-strategy-isolation` — a module in `packages/inference/src/backends/<wire>/` may not import a sibling backend's internals; `backends/kit/` and `backends/v4/` are the two derived shared seams. Enforces invariant 2 above; the `infra` in its name is historical only (see that row).
  - `credential-firewall-openrouter-not-agent-sdk` — WIDENED, not merely re-pointed: `reachable: true` from EVERY backend except `agent-sdk` itself (plus the surviving openrouter-named catalog/capability modules) to `backends/agent-sdk/`, so no sibling reaches the subscription plane through any chain. The old rule fenced one directory; OpenRouter no longer HAS one — it is a provider row's `dialect` on the shared `openai-compat` transport — so fencing the name would have left the real leak surface open. The name is historical for the same citation reason. The planted-violation proof that it FIRES is `tests/tooling/dependency-cruiser.int.test.ts`.
  - `tooling-no-provider-families` — the tooling half: a tool may import the front door but not `packages/inference/src/(backends|contract)/`, except `contract/index.ts`. Its vLLM shared-builder carve-out died with its subject (nothing in the package builds an engine argv).
  - `vllm-surface-isolation` was **DELETED**, not re-pointed: there is no vllm module left to isolate — vLLM is a provider ROW on the `openai-compat` wire and the fleet moved whole to `tooling/src/stack/lib/engine-fleet/`.
- **`inference-model-regex-fence` does not exist.** Two code headers cite it (`packages/inference/src/capability/families.ts`, `packages/contracts/src/inference/capability/reads.ts`); no gate of that name is on the tree. The two-homes rule for the Anthropic anchor is review-enforced only.
