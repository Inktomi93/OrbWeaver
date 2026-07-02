# Marinara Engine: Agent System — Verified Architecture

Verified against source with `ast-grep` (structural queries: class search, call-pattern search) and direct reads. Every claim below is anchored to a real file/line; anywhere the original recon doc was wrong or hand-waved, it's called out explicitly.

## 1. The subsystem is NOT one directory

The original doc claimed everything lives under `packages/server/src/services/agents/`. It doesn't. The logic is split across three places, and that split matters — it's the difference between "generic pipeline agent" and "special-cased agent":

| Directory | What's actually there |
|---|---|
| `services/agents/` | The generic engine: `agent-pipeline.ts`, `agent-executor.ts`, `agent-concurrency.ts`. Plus `knowledge-retrieval.ts` / `knowledge-router.ts` — which live here but, as covered in §4, are *not* run through the pipeline. |
| `services/generation/` | Everything that decides *which* agents run and wires them up: `agent-resolution.ts`, `agent-cadence.ts`, `agent-event-dispatcher.ts`, `tool-resolution-runtime.ts`, `spotify-agent-runtime.ts`, `haptic-runtime.ts`, `prose-guardian-settings.ts`, `knowledge-agent-settings.ts`. |
| `routes/generate/` | `expression-agent-utils.ts`, `agent-connection-guards.ts`, `retry-agents-route.ts` — route-level helpers, plus the ~2,500-line `generate.routes.ts` handler that actually calls all of the above in sequence. |

Confirmed no classes exist anywhere in this code (`ast-grep -p 'class $NAME { $$$ }'` across both `services/agents/` and `services/generation/` → zero matches). It's pure functions throughout, consistent with the "not monolithic stateful classes" framing — that part of the original doc holds up.

## 2. Core data contracts (verified verbatim)

### `AgentExecConfig` — `agent-executor.ts:59`
```typescript
export interface AgentExecConfig {
  id: string;
  type: string;
  name: string;
  phase: string;
  promptTemplate: string;
  connectionId: string | null;
  settings: Record<string, unknown>;
  customParameters?: Record<string, unknown>;
  maxOutputTokens?: number | null;
}
```

### `ResolvedAgent` — `agent-pipeline.ts:21`
```typescript
export interface ResolvedAgent extends AgentExecConfig {
  provider: BaseLLMProvider;
  model: string;
  maxParallelJobs?: number;
  toolContext?: AgentToolContext;
}
```

### `AgentToolContext` — `agent-executor.ts:72`
```typescript
export interface AgentToolContext {
  tools: LLMToolDefinition[];
  executeToolCall: (call: LLMToolCall) => Promise<string>;
}
```

### `AgentPipelineResult` — `agent-pipeline.ts:385`
```typescript
export interface AgentPipelineResult {
  contextInjections: string[];
  allResults: AgentResult[];
}
```

### `AgentResult` — `packages/shared/src/types/agent.ts`
```typescript
export interface AgentResult {
  agentId: string;
  agentType: string;
  type: AgentResultType;
  data: unknown;
  tokensUsed: number;
  durationMs: number;
  success: boolean;
  error: string | null;
}
```

`AgentPhase` is a closed 3-value union — `"pre_generation" | "parallel" | "post_processing"` — defined in shared types, not something each file invents independently.

## 3. Execution flow — confirmed by call site, not just by reading the pipeline code

Traced actual call order in `generate.routes.ts`:

```
pipeline.preGenerate(...)   → line 5393 / 5702
pipeline.runParallel()      → line 7239
pipeline.postGenerate(...)  → line 7748
```

So the 3-phase shape (pre-gen → parallel-alongside-main → post-processing) is real and matches the original doc. Within each phase, `agent-pipeline.ts` groups agents by `(provider instance, model)` and batches same-group agents into one LLM call via `executeAgentBatch` — this is the actual reason the "batched" framing in the original doc is correct, not just a stylistic claim.

Concurrency: `settleAgentJobsWithConcurrencyLimit` (`agent-concurrency.ts`) is a bounded worker pool — not a type called `AgentConcurrency` (that name doesn't exist anywhere in the codebase). The cap-normalizing helper `normalizeAgentMaxParallelJobs` actually lives in `agent-pipeline.ts:53`, not in the concurrency file.

## 4. The part the original doc got backwards: not everything runs through the pipeline

`generate.routes.ts:5294` defines:

```typescript
const EXCLUDED_FROM_PIPELINE = new Set(["knowledge-retrieval", "knowledge-router"]);
const SEPARATE_INJECTION_AGENTS = new Set(["director", "knowledge-retrieval", "knowledge-router"]);
```

The original doc guessed knowledge agents are "likely handled in the pre-generation phase" — as if they're just pipeline agents like any other. They're not. They're **filtered out of every `preGenerate()` call** and run through their own bespoke code paths in the route handler, with their own promise (`krPromise`, router equivalent), their own try/catch-isolation (a knowledge-retrieval failure must never abort the generation), and their own injection wrapping (`appendSeparateAgentInjectionMessage`).

`director` gets the same "separate injection" treatment but for a different reason: the secret-plot variant of the director agent (`runDirectorSecretPlotMaintenance`, `generate.routes.ts:5310`) maintains cross-turn persisted memory (`_secretPlotState` via `agentsStore.setMemory`) and can **run twice in one turn** — it fires once, checks if the story arc it returned is marked complete, and if so immediately runs again with fresh state. Nothing in the generic pipeline works this way; this is turn-local, stateful, hand-rolled control flow that lives only in the route handler.

Net effect: of the ~21 built-in agent types, at least 3 (`knowledge-retrieval`, `knowledge-router`, `director`) never go through `createAgentPipeline` at all for their pre-generation work.

## 5. Phase assignment is forced in two different, non-identical places

This is real and not mentioned in the original doc at all — worth knowing before touching phase config:

**Storage/API layer** — `normalizeAgentPhaseForType` (`packages/shared/src/types/agent.ts:25`), applied whenever an agent config is read or written (routes, storage):
```typescript
if (agentType === "prose-guardian" || agentType === "continuity" ||
    agentType === "expression" || agentType === "spotify") {
  return "post_processing";
}
```

**Runtime resolution layer** — `resolveAgentRuntimePhase` (`services/generation/agent-resolution.ts:108`), applied again when building `ResolvedAgent`s for the pipeline:
```typescript
if (agentType === "prose-guardian" || agentType === "continuity") return "post_processing";
if (agentType === "echo-chamber") return "parallel";
return configuredPhase;
```

`prose-guardian`/`continuity` are forced twice (redundant but harmless). `expression` and `spotify` are only forced at the storage layer. `echo-chamber` is only forced at the runtime layer. If you're debugging why an agent's phase doesn't match its stored config, check both functions — a mismatch between what the UI shows and what actually runs is expected behavior here, not a bug.

## 6. Specialized sub-systems (accurate examples, but a small slice)

- **Knowledge/RAG**: `knowledge-router.ts` (candidate lorebook entries → LLM picks relevant ones) and `knowledge-retrieval.ts`. Both excluded from the generic pipeline (§4).
- **Music/Haptics**: `spotify-agent-runtime.ts` and `haptic-runtime.ts` (the original doc mentioned Spotify but not haptics' own runtime file). Both use `AgentToolContext` for function-calling. Dispatch back to the client goes through `createAgentEventDispatcher` (`agent-event-dispatcher.ts`) — a factory function, not a class, despite the original doc's `AgentEventDispatcher`-as-noun phrasing. It also has built-in event deferral: Spotify and expression (sprite-change) results are held back from the SSE stream until "finalized" so the client doesn't flicker on intermediate agent output.
- **Cadence**: `agent-cadence.ts` gates on assistant-turn interval (`shouldSkipAgentByAssistantInterval`) — confirmed real, used at `generate.routes.ts:4724` and `:5087`.
- **Prose Guardian / Continuity**: these two agent types are what the shared `REWRITE_AGENT_TYPES` set covers — "Text Rewrite" isn't a third category, it's the label for these two. `shouldHoldForTextRewrite` / `getTextRewritePendingState` (`prose-guardian-settings.ts`) can make generation *wait* for these agents before finishing a turn, which none of the other phases do.

Full built-in agent registry (21 types, `agent-registry.generated.ts`): `prose-guardian`, `continuity`, `director`, `echo-chamber`, `world-state`, `expression`, `quest`, `background`, `character-tracker`, `persona-stats`, `custom-tracker`, `illustrator`, `lorebook-keeper`, `card-evolution-auditor`, `combat`, `html`, `spotify`, `knowledge-retrieval`, `knowledge-router`, `haptic`, `cyoa`.

## 7. What agents actually see: `AgentContext` (full shape)

This is the object every agent — pipeline or bespoke — gets handed. It's the real integration surface; everything above is just plumbing to build and consume this.

```typescript
export interface AgentContext {
  chatId: string;
  chatMode: string;
  wrapFormat?: WrapFormat;                    // how injected text gets wrapped (xml/markdown/none)
  recentMessages: Array<{ id?: string; role: string; content: string; characterId?: string; gameState?: GameState | null }>;
  mainResponse: string | null;                 // null until post-processing phase
  gameState: GameState | null;
  characters: Array<{ id: string; name: string; description: string; personality?: string; scenario?: string; /* ...card fields */ }>;
  persona: { name: string; description: string; personaStats?: {...}; rpgStats?: {...} } | null;
  memory: Record<string, unknown>;             // THIS agent's own persistent key-value store
  activatedLorebookEntries: Array<{ id: string; name: string; content: string; tag: string }> | null;
  writableLorebookIds: string[] | null;        // which lorebooks this agent is allowed to write to
  chatSummary: string | null;
  preGenInjections?: Array<{ agentType: string; agentName?: string; text: string }>;  // only if agent opted in via settings
  parallelResults?: AgentResult[];             // only if agent opted in via settings
  streaming?: boolean;
  agentDebug?: (event: AgentCallDebugEvent) => void;
  signal?: any;                                // abort signal
}
```

Key things this reveals that weren't obvious from the pipeline code alone:
- **Per-agent memory** (`context.memory`) is how an agent persists state turn-to-turn (this is what `director`'s secret-plot mode uses for `_secretPlotState`). It's read in, mutated, and explicitly written back via a storage call (`agentsStore.setMemory`) — the pipeline itself is stateless; persistence is the caller's job.
- **`preGenInjections`/`parallelResults` are opt-in per agent**, gated by that agent's own `settings` (`includePreGenInjections`/`includeParallelResults`, checked in `buildAgentContext` in `agent-pipeline.ts:127`). Most agents never see other agents' output — cross-agent visibility is the exception, not the default.
- **`writableLorebookIds`** is a scoped write permission list, separate from `activatedLorebookEntries` (read scope). Read and write scope for the same resource are configured independently.

## 8. How `promptTemplate` + `AgentContext` become an actual LLM call

`renderAgentPromptTemplate(template, settings, context)` (`agent-executor.ts:216`) does two passes:
1. `renderAgentSettingsMacros` — substitutes agent-settings-specific placeholders.
2. `resolveMacros(text, buildAgentPromptMacroContext(context))` — a general macro engine (`{{user}}`, `{{char}}`, `{{lastInput}}`, `{{characterProfiles}}`, `{{personaFields}}`, etc. — SillyTavern-style macro syntax) that flattens `AgentContext` into template variables.

So an agent's "prompt" is never just a static string — it's a template stored in the agent's config, rendered against the current turn's `AgentContext` at execution time. Adopting this pattern means deciding early whether you want a macro/template system at all, or whether agents get fully-composed prompts built in code (simpler, less flexible, no user-authorable templates).

## 9. Per-agent LLM connection resolution

Each agent can target a **different provider/model than the main chat**. `resolveAgentConnectionId` (`routes/generate/agent-connection-guards.ts`) picks, in order: the agent's explicitly configured connection → the chat's default-for-agents connection → local sidecar (if available) → a warning surfaced to the user (`AgentConnectionWarning`) if nothing resolves. This resolution happens in `agent-resolution.ts` before an agent becomes a `ResolvedAgent` — by the time the pipeline sees it, `provider`/`model` are already bound and it never has to think about connections again.

## 10. Where results actually go — the missing other half

`postGenerate()` returns `AgentResult[]`, but the pipeline **does not apply any of them**. All application logic lives in `generate.routes.ts`, as a long sequence of `if (result.success && result.type === "...")` blocks (roughly lines 7900–9300) — one per `AgentResultType`: `game_state_update`, `text_rewrite`, `sprite_change`, `lorebook_update`, `character_tracker_update`, `persona_stats_update`, `quest_update`, `haptic_command`, `background_change`, `image_prompt`, `cyoa_choices`, etc. Each block does its own persistence call (e.g. `gameStateStore`) and its own defensive parsing.

Two things worth carrying into any adoption plan:
- **A capability gate exists for user-authored agents.** `customAgentCanApplyResult(result, agents, builtInAgentTypes, capability)` (`generate.routes.ts:530`): built-in agent types are always trusted to apply their result; a *custom* (user-defined) agent must have the matching capability flag set in its settings (e.g. `"edit_trackers"`) or its result is silently ignored. This is the actual security boundary between "the engine's own agents" and "agents a user configured themselves."
- **Cross-contamination handling is hand-written, not structural.** E.g. the `game_state_update` handler explicitly carries forward `presentCharacters`/`personaStats`/`playerStats` from the previous snapshot rather than trusting the current result, because batched LLM calls sometimes bleed fields from one agent's JSON schema into another's output. If you adopt batching-by-provider/model like this, budget for this kind of defensive-parsing tax at the consumption layer.

## 11. The trigger point — where this all hangs off

Nothing above is self-triggering. It all lives inside one large POST handler in `generate.routes.ts` (a single chat-generation request):
1. `resolveAgentPipelineAgents(...)` — `generate.routes.ts:3893` — builds `resolvedAgents` from stored config + live connection state.
2. `createAgentPipeline(pipelineAgents, agentContext, sendAgentEvent)` — `generate.routes.ts:5268`.
3. `pipeline.preGenerate()` → main chat generation (SSE-streamed) happens in between, with `pipeline.runParallel()` fired alongside it → `pipeline.postGenerate()` once the main response text is final.
4. Every agent result is pushed to the client in real time via SSE (`sendAgentEvent`), independent of whether/when its side effects get applied server-side.

There is no separate "agent service" process or queue — it's synchronous-within-a-request, phase-gated, SSE-streamed as it goes.

## 12. Call graph, verified with `ts-morph` (not just grep)

Ran a `ts-morph` `Project` against `packages/server/tsconfig.json`, using `findReferencesAsNodes()` on each exported entry point (real symbol resolution, not text matching) plus an import-graph walk. This surfaced hook-in points the file-by-file reading missed:

**`executeAgent` is called directly from `generate.routes.ts` in 4 places that have nothing to do with `createAgentPipeline`:**
- Line 7768 — a **`lorebook-keeper`** agent run, against a specially-built "historical" context (`buildHistoricalLorebookKeeperContext`) that processes *older* messages, not the current turn. This is a **5th agent type** (alongside `director`, `knowledge-retrieval`, `knowledge-router`) that bypasses the phase pipeline entirely.
- Line 7820 — an inline **single-agent retry** (`phaseRetryContext`/`agentCfg`) — re-executing one already-resolved agent without touching the rest of the pipeline.
- Line 9233 — a **text-rewrite editor pass** that injects a synthetic summary of every other agent's output this turn directly into `memory._agentResults` before calling the rewrite agent — a side-channel into context that isn't `preGenInjections` or `parallelResults`.

**There's a whole second entry point for agents that isn't part of a chat turn at all**: `retry-agents-route.ts` registers its own Fastify route (imports `FastifyInstance`) and re-implements batching (`executeAgentBatch`) and single-exec (`executeAgent`) logic to let the client **re-run one specific agent's output after the fact**, independent of generating a new message. It's the single largest consumer of `AgentResult`/`AgentContext` in the codebase (21 and 13 references respectively) — bigger than the pipeline file itself — because it duplicates a meaningful slice of the grouping/batching logic rather than reusing `agent-pipeline.ts`'s internals (those are private to that module).

**Injection review/splicing is its own layer**: `runtime-agent-sections.ts` (imports `agent-pipeline.ts` for `AgentInjection`) defines `REVIEWABLE_WRITER_AGENT_TYPES` and functions to splice pre-generation injections into already-rendered message text by marker (`replaceRuntimeAgentSection`), and ties back to `reviewedAgentInjections`/`reviewedAgentTypes` seen in §4 — some agent injections go through a user-review/approval step before being committed, which is a UI-level gate this doc hadn't accounted for.

**Reverse import graph confirms the 3-directory split from §1 is real** and shows exactly who depends on what:
```
agent-pipeline.ts   <- generate.routes.ts, agent-normalizers.ts, retry-agents-route.ts,
                       agent-event-dispatcher.ts, agent-resolution.ts, prose-guardian-settings.ts,
                       runtime-agent-sections.ts, spotify-agent-runtime.ts, tool-resolution-runtime.ts
agent-executor.ts   <- generate.routes.ts, retry-agents-route.ts, agent-pipeline.ts,
                       knowledge-retrieval.ts, knowledge-router.ts, runtime-agent-sections.ts,
                       spotify-agent-runtime.ts
agent-resolution.ts <- generate.routes.ts   (only — nothing else resolves agents; it's a single chokepoint)
```
`agent-resolution.ts` having exactly one importer is worth calling out for an adoption plan: there is exactly one place agent configs get turned into runnable `ResolvedAgent`s. That's a clean seam to replicate — everything downstream (pipeline, retry route, bespoke calls) consumes its output, nothing else produces it.

## Summary of what changed from the original doc

1. Directory attribution corrected — subsystem spans 3 directories, not 1.
2. `AgentConcurrency` (as a type) doesn't exist; corrected to the real export names and their real file locations.
3. Added the `EXCLUDED_FROM_PIPELINE` / `SEPARATE_INJECTION_AGENTS` carve-out — the single most important thing missing before: not all agents go through the pipeline.
4. Added the director agent's double-run, stateful secret-plot behavior — entirely absent before.
5. Added the dual phase-forcing functions and their non-overlapping override sets — a real footgun for anyone editing agent phase config, not previously documented.
6. Corrected "Text Rewrite agents" from looking like a third example into what it actually is: the label for prose-guardian + continuity.
7. Named `agent-event-dispatcher.ts` and its event-deferral behavior, which the original doc gestured at (`AgentEventDispatcher`) without ever finding the file.
8. Added the full `AgentContext` shape (§7) — what data an agent actually receives, including per-agent persistent memory and opt-in cross-agent visibility. The original doc never showed this at all.
9. Added the prompt-templating/macro layer (§8) — how a stored template string plus `AgentContext` becomes an actual LLM prompt.
10. Added per-agent connection/model resolution (§9) — agents aren't locked to the main chat's provider.
11. Added the result-consumption side (§10) — where `AgentResult`s actually get applied, including the custom-agent capability gate, which the original doc didn't mention at all despite it being the real trust boundary.
12. Added the request-lifecycle trigger point (§11) — this is not a background service; it's synchronous, phase-gated logic inside one chat-generation HTTP request.
13. Added a `ts-morph`-verified call graph (§12) — found a 5th bypass agent (`lorebook-keeper`), a wholly separate "retry one agent after the fact" HTTP route that duplicates pipeline-adjacent logic, an injection-review/approval layer, and confirmed `agent-resolution.ts` is a single chokepoint with exactly one importer.
