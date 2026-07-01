# Orbweaver — `tool-use` domain

> **Status: COMMITTED (D48). Promoted from `proposed/tool-use/`. Phase 7 — ships with the recurse loop.**
> Authoritative expansion of D48. The ledger D-entry wins on any conflict with this doc.
> Source proposal: `proposed/tool-use/tool-use.md`.

---

## 0. What this domain is

A **leaf domain** (`domain/tool-use`) owning the ONE tool registry, projecting to two wire surfaces:

- **agent-sdk path** (D47): registry → in-process MCP server (`createAgentToolServer`); SDK owns the loop
- **OpenAI-wire path** (this domain): registry → JSON-schema `tools[]` on the request; `domain/chat` owns the recurse loop

ONE tool model, TWO wire projections. Not two parallel universes. The registry is the unification point —
identical handler contract and persisted `ToolCallRecord` shape across both paths.

**Structured output** (`response_format` / JSON-schema constrained output) is a SEPARATE axis on this
same domain — it does NOT ride `tool_choice`. Anthropic implements it internally as a forced tool; that is
a translator detail, not a contract coupling.

---

## 1. The born-compliant callout — MUST land in contracts pass

These cross-cutting shapes are painful to retrofit after chat is built whole (D16). Same class as D45
vision content-parts. They touch already-built `infra/providers` translators:

1. **Wire `tool` role + tool content-parts on `ChatHistoryMessage`** (`infra/providers/contract/chat.ts`)
   - `role` widens to include `"tool"` (but see §4.1 — this is the WIRE axis, NOT `MESSAGE_ROLES`)
   - `ChatContentPart` gains `tool-call` (assistant emits) and `tool-result` (the `tool` role carries)
   - Composes with D45 `text|image` union — same no-`if`-branch discipline

2. **Typed tool-exchange DTO** (`@orb/contracts/chat`): `ToolCallRecord` / `ToolResultRecord` replaces the
   untyped reserved `message_variants.toolCalls` JSON column (D37)

3. **`ModelCapability` gates** (`@orb/contracts/connection`):
   - `tools?: { parallel: boolean }` — absent ⇒ no tool support (drop + warn)
   - `output.structured?: boolean` — absent ⇒ no structured output (drop + warn)

4. **Request fields on `ChatRequest`** (`infra/providers/contract/chat.ts`): `tools?`/`toolChoice?` on
   `chat-completions` + `responses` arms; `responseFormat?` on all wire arms

5. **Two new `WARNING_CODES`** (`infra/providers/contract/resolve.ts`):
   `tools_unsupported` + `structured_output_unsupported` (extend D41/D45; real emit sites, not speculative)

> `NormalizedFinishReason` already carries `"tool"` — the loop's pivot signal needs no change.

**Phase-5 domain work (not born-compliant):** the recurse loop, the `domain/tool-use` registry + projections,
per-translator wire mapping, persistence wiring.

**Phase-6 client work:** tool invocation render (a `<details>`-style block), structured-output/tool-enable
toggles in the params panel (iterate `ModelCapability` descriptor).

---

## 2. The wire `tool` role — where it lands, and why NOT `MESSAGE_ROLES` (§8 correction)

**The `tool` role lands on the infra wire axis `ChatHistoryMessage.role`, NOT on `MESSAGE_ROLES`.**
This corrects the open-watch note in `core/Spine-TypeScript-and-Patterns.md §8`.

Three reasons:

1. `ChatHistoryMessage.role` is already a distinct axis — it **excludes `system`** (system rides
   `ChatRequest.systemPrompt`). Widening it to add `tool` doesn't touch the kit tuple.
2. `tool` is not a valid injection role. `MESSAGE_ROLES` is shared by persisted message slot AND every
   at-depth injection (world-info, author's note, depth-prompt, persona, memory, guided). You cannot inject
   a world-info entry "as `tool`". Widening `MESSAGE_ROLES` pollutes six injection consumers.
3. The ST numeric bimap is total over `MESSAGE_ROLES`. ST has no numeric encoding for `tool` — adding it
   would force a fake number into the ST card serde bimap.

**Therefore:** `messages.role` (DB enum) + `MessageSlot.role` stay `system|user|assistant`. `tool` is
**wire-only**, materialized by assembly when it expands a recorded tool exchange into wire messages.

Promote the inline history-role union to a tuple in the infra contract:

```ts
export const HISTORY_ROLES = ["user", "assistant", "tool"] as const;
export type HistoryRole = (typeof HISTORY_ROLES)[number];
```

---

## 3. ONE registry, TWO projections — the unification

|                        | agent-sdk path (D47)                      | OpenAI-wire path (this)                    |
| ---------------------- | ----------------------------------------- | ------------------------------------------ |
| **Tool source**        | SAME `domain/tool-use` registry           | SAME `domain/tool-use` registry            |
| **Projection**         | registry → in-process MCP server          | registry → JSON-schema `tools[]`           |
| **Who runs the loop**  | SDK, internally (bounded by `maxTurns`)   | `domain/chat` recurse loop                 |
| **Who executes tools** | SDK invokes MCP handlers                  | chat loop calls registry handlers directly |
| **Persistence**        | `message_variants.toolCalls` (typed seam) | same column, same seam                     |

The asymmetry is intrinsic and correct: stateless OpenAI backends cannot own a loop; the agent-sdk
backend already owns a stateful loop its firewall is built around. Unification = ONE registry + ONE handler
contract + ONE `ToolCallRecord` shape, not the loop location.

---

## 4. Home in the cake — `domain/tool-use/` (8-slot leaf)

```
domain/tool-use/
├── index.ts          FRONT DOOR — ToolUseService interface + factory
├── service.ts        COMPOSITION ROOT — zero logic
├── context.ts        DI BUNDLE — { db, executeHandler, clock }
├── contract/
│   ├── service.ts    ToolUseService interface
│   ├── params.ts     RegisterToolParams, ExecuteToolParams, ToolDefinition
│   ├── results.ts    ToolInvocationResult (invocations, errors)
│   └── errors.ts     ToolNotFoundError, ToolExecutionError
├── verbs/
│   ├── register.ts   register a ToolDefinition + handler in the registry
│   ├── execute.ts    executeToolCalls(calls[]) → sequential, errors-as-data (ST model)
│   ├── project-wire.ts   toToolsArray(registry) → JSON-schema WireTool[] (OpenAI projection)
│   └── project-mcp.ts    toAgentToolServer(registry) → AgentToolServer (agent-sdk projection)
├── persistence/      (minimal — registry is in-memory per request; tool-call records via chat persistence)
└── substrate/
    └── capability.ts  resolveToolCapability(principal) → can() check (D46 reconciliation)
```

**Reconciliation with D46:** `domain/tool-use` is the ONE registry; tools have two sources:

- (a) host/builtin tools (registered directly)
- (b) plugin-authored tools (registered through the D46 plugin host, each gated by `can()`)

The registry's `capability` field IS a `can()` check — a plugin tool cannot be invoked beyond its principal's
authority. One capability model.

---

## 5. The recurse loop — `domain/chat` owns it

Per `chat.md` ("the domain owns orchestration; infra runners only shape wire"):

```
runTurnWithTools(req, registry, limit):
  depth = 0
  loop:
    result = runChatTurn(req)                  // ONE role call (stateless backend)
    if result.finishReason != "tool" or depth >= limit: return result
    calls = extractToolCalls(result)           // assistant variant's tool-call parts
    results = await toolUse.executeToolCalls(calls)   // domain registry; sequential, errors-as-data
    persist(variant.toolCalls = recordOf(calls, results))  // typed seam → message_variants.toolCalls
    req = appendToolExchange(req, calls, results)    // assistant(tool-call parts) + tool(tool-result parts)
    depth += 1
```

Bounded by a recurse limit (seed: 5, mirroring ST's `tool_call_recurse_limit` — a chat-setting, not hardcoded).

---

## 6. Contract shapes

### 6.1 Wire `ChatHistoryMessage` + content parts

```ts
export const HISTORY_ROLES = ["user", "assistant", "tool"] as const;
export type HistoryRole = (typeof HISTORY_ROLES)[number];

export type ChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly url: string }
  | {
      readonly type: "tool-call";
      readonly toolCallId: string;
      readonly name: string;
      readonly arguments: string;
    }
  | {
      readonly type: "tool-result";
      readonly toolCallId: string;
      readonly content: string;
      readonly isError?: boolean;
    };

export interface ChatHistoryMessage {
  readonly role: HistoryRole;
  readonly content: readonly ChatContentPart[];
  readonly name?: string | undefined;
}
```

### 6.2 Request fields + structured output

```ts
export type ToolChoice =
  | { readonly mode: "auto" }
  | { readonly mode: "none" }
  | { readonly mode: "required" }
  | { readonly mode: "tool"; readonly name: string };

export interface WireTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>; // JSON Schema
}

// Structured output — SEPARATE axis, NOT riding tool_choice
export interface ResponseFormat {
  readonly name: string;
  readonly schema: Record<string, unknown>;
  readonly strict?: boolean | undefined;
  readonly description?: string | undefined;
}
// Added to chat-completions + responses arms:
//   readonly tools?: readonly WireTool[] | undefined;
//   readonly toolChoice?: ToolChoice | undefined;
//   readonly responseFormat?: ResponseFormat | undefined;  // all wire arms
```

### 6.3 `ModelCapability` gates

```ts
tools: z.object({ parallel: z.boolean() }).optional(),   // absent ⇒ no tool support
output: z.object({
  maxTokens: rangeSchema,
  structured: z.boolean().optional(),                    // absent ⇒ no structured output
}),
```

Synthesized from `domain/connection/catalog/resolve-model-capability.ts`:
OpenRouter → `supportedParameters.includes("tools")` / `"structured_outputs"`;
Claude → curated; vLLM → `--enable-auto-tool-choice`; custom-byo → user-declared.

### 6.4 Persisted DTO

```ts
export interface ToolCallRecord {
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: string; // raw JSON string (provenance-faithful)
  readonly result: string | null; // stringified result; null if not yet executed
  readonly isError: boolean;
  readonly durationMs: number | null;
}
// message_variants.toolCalls: text(json).$type<readonly ToolCallRecord[]>()
```

### 6.5 `WARNING_CODES`

```ts
export const WARNING_CODES = [
  "sampling_knob_dropped",
  "effort_dropped",
  "adaptive_budget_dropped",
  "display_dropped",
  "image_dropped", // D45
  "tools_unsupported", // tool call requested but capability.tools absent → dropped
  "structured_output_unsupported", // responseFormat requested but output.structured absent → dropped
] as const;
```

---

## 7. Born-compliant checklist

- [ ] `infra/providers/contract/chat.ts`: add `HISTORY_ROLES` tuple; widen `ChatHistoryMessage.role`;
      add `tool-call` + `tool-result` to `ChatContentPart`
- [ ] `infra/providers/contract/chat.ts`: add `ToolChoice`, `WireTool`, `ResponseFormat`; add `tools?`/
      `toolChoice?` to `chat-completions`+`responses` arms; add `responseFormat?` to all wire arms
- [ ] `@orb/contracts/connection`: add `tools?: {parallel:boolean}`; add `output.structured?: boolean`
- [ ] `@orb/contracts/chat`: add `ToolCallRecord` (+ `ToolResultRecord`); export it
- [ ] `@orb/db` `schema/chat.ts`: change `toolCalls` to `.$type<readonly ToolCallRecord[]>()`
- [ ] `infra/providers/contract/resolve.ts`: add `tools_unsupported` + `structured_output_unsupported` to `WARNING_CODES`
- [ ] Confirm no `MESSAGE_ROLES` change — `tool` is wire-only (§2 reconciliation)
- [ ] Ledger decision capturing: (a) `tool` = wire-history role not a `MESSAGE_ROLES` member; (b) tool exchanges persist on `message_variants` not as a slot role; (c) ONE registry / two projections; (d) loop split

---

## 8. Open questions

1. **`tool-use` leaf vs chat subsystem?** Cross-feature consumption (chat + buddy + D46 plugins) argues for its own leaf; recurse loop stays in chat either way. (Nate's call.)
2. **`ToolDefinition` cross-boundary?** Only if the client enumerates available tools (a tool-picker UI). If host/plugin-config only, it stays domain-internal.
3. **Parallel tool calls.** `capability.tools.parallel` is shaped; v1 executes sequentially (ST's model — simplest, deterministic). Parallel is a later optimization.
4. **Recurse limit home.** Chat-setting (seed 5) vs per-tool/per-chat cap.
5. **Forced-JSON × streaming.** ST does NOT globally disable streaming for structured output. Recommend: keep streaming; the reducer assembles and the domain parses at end. Flag: do we validate JSON against schema server-side and emit a warning/retry on invalid?

---

## 9. Constitution-fighting things to REJECT

- **A separate structured-output domain.** It is an axis on this domain's `responseFormat` field.
- **`tool` as a `MESSAGE_ROLES` member** — it pollutes 6 injection consumers and breaks the ST bimap.
- **Tool execution in the browser** — execution is server-side in the domain registry.
- **A hardwired `tool_choice: 'auto'`** — first-class `ToolChoice` union with `auto|none|required|tool`.
- **A parallel OpenAI-wire registry** alongside the agent-sdk registry — ONE registry, two projections.

---

## 10. Cross-refs

- **D47** — agent-sdk tool-calling committed; `createAgentToolServer` seam; `toolCalls` column reserved
- **D48** — tool/function calling + structured output IN SCOPE; capability gates landed; wire shape blessed
- **D37** — `message_variants.toolCalls` reserved column
- **D45** — `ChatHistoryMessage` content-parts + `ModelCapability` vision axis — this proposal is the same pattern
- **D41** — `WARNING_CODES` one-home tuple
- **D32** — `MESSAGE_ROLES` home + ST bimap (reason `tool` does NOT widen it)
- **D46** — plugin `can()` surface the tool registry reconciles with
- `core/Tier-3b-Providers.md` — sealed backends; the drop-with-warning membrane; the agent role
- `domains/chat.md` — the turn pipeline owns orchestration; the loop is the domain's
- `core/Spine-TypeScript-and-Patterns.md §8` — the `tool`-role open-watch note (RESOLVED here)
- `proposed/tool-use/tool-use.md` — the full evidence base (ST source audit, neo findings, ST architecture critique)
