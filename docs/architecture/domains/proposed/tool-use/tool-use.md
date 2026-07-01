# Orbweaver — `tool-use`: tool/function calling + structured output (the unified tool model)

> **Status: PROPOSED FLAG[PD-54] (domain proposal — not yet ledgered).** Scope: (1) tool/function calling on the
> **OpenAI-wire** path (`chat-completions` + `responses`, plus custom-byo/vLLM which share the
> openai-compat reducer) AND the landing of the wire `tool` role; (2) structured / JSON-schema output
> (`response_format`/`json_schema`). It **reconciles** the OpenAI-wire path with the agent-sdk
> tool-calling already committed in **D47** (`runAgentTurn` + the opaque `AgentToolServer` MCP seam +
> the reserved `message_variants.toolCalls` column, D37) into **ONE tool model, two wire projections** —
> not two parallel universes. Upstream law this obeys: `tiers/providers.md` (sealed backends; the
> domain calls a role, never a backend; the D41/D45 drop-with-`warning` pattern), `domains/chat.md`
> (the turn pipeline owns orchestration / the recurse loop, NOT infra), `spine/string-union-dispatch.md`
> (§7.5 — how a closed role/kind axis is widened), `domains/connection.md` (the `ModelCapability`
> descriptor), D45 (the content-part `ChatHistoryMessage` reshape this composes with), D46
> (`scripting-automation-extensibility.md` — the plugin `can()` capability surface the registry
> reconciles with).

---

## 1. Status banner + the born-compliant callout

### ⚠️ BORN-COMPLIANT BEFORE PHASE 5 — the contract bits that MUST land in the contracts pass

These are the cross-cutting shapes that are **painful to retrofit after chat is built whole** (D16) —
the exact class as D45's vision content-parts. They touch the already-built `infra/providers`
translators + the assembly seam, so they must be shaped NOW, in the contracts pass, before Phase-5 chat:

1. **The wire `tool` role + the tool content-parts land on `ChatHistoryMessage`**
   (`packages/server/src/infra/providers/contract/chat.ts`). `role` widens `"user" | "assistant"` →
   `"user" | "assistant" | "tool"`; `ChatContentPart` gains `tool-call` (assistant emits) and
   `tool-result` (the `tool` role carries) variants — **composing with the D45 `text|image` union, same
   no-`if`-branch discipline**. This is where the `tool` role actually "lands" (see §5.1 for why it is
   NOT a `MESSAGE_ROLES` widening — a flag-worthy reconciliation).

2. **The typed tool-exchange DTO in `@orb/contracts/chat`** that replaces the **untyped** reserved
   `message_variants.toolCalls` JSON column (D37). `ToolCallRecord` / `ToolResultRecord` (one home;
   `messages.role` stays `system|user|assistant` — tool exchanges persist on the variant, NOT as a slot
   role). Born-compliant because the column already exists untyped and chat persistence must read/write
   it through one typed seam from day one.

3. **The `ModelCapability` tools + structured-output axes** (`@orb/contracts/connection`) — exactly the
   D45 vision-axis pattern: `tools?: { parallel: boolean }` (absent ⇒ no tool support) and
   `output.structured?: boolean`. These are the **GATES** that decide whether `tools`/`response_format`
   may be sent; assembly/runner drops-and-warns when absent.

4. **The request fields on the chat `ChatRequest` arms** (infra `contract/chat.ts`): `tools` /
   `toolChoice` on `chat-completions` + `responses`; `responseFormat` on all wire arms. Shaped now so the
   three sealed translators have a stable target.

5. **The 2 new `WARNING_CODES`** (`infra/providers/contract/resolve.ts`) — `tools_unsupported` +
   `structured_output_unsupported` — extending D41's tuple (4→6, after D45's `image_dropped` makes it 5).
   Real emit sites at the runner/assembly, not speculative (the D41/D45 discipline).

> `NormalizedFinishReason` already carries `"tool"` and `FINISH_REASON_MAP` already maps
> `tool_use`/`tool_calls`/`function_call` → `"tool"` (`infra/providers/contract/chat.ts:96-115`). **No
> change needed there** — the terminal signal the recurse loop pivots on already exists.

### What is PHASE-5 DOMAIN work (not now)
- The **recurse loop** (chat domain orchestration) — execute tool calls → append `tool` message →
  re-call `runChatTurn`, bounded.
- The **`domain/tool-use` registry leaf** (tool defs + handlers + capability gating) and its two
  projections (JSON-schema array for the wire path; MCP server for the agent-sdk path).
- The **per-translator wire mapping** of the tool content-parts (agent-sdk · openrouter-chat-completions
  · responses · custom-byo · vLLM) — code, lands with the translators in Phase 5.
- **Persistence wiring** into `message_variants.toolCalls` through the typed seam.

### What is PHASE-6 CLIENT work
- Rendering tool invocations in the message (a `<details>`-style tool-call/result block — the D44
  `MessageContentBlock` render model gains a tool-invocation block or reuses `html-card`).
- The structured-output / tool-enable toggles in the params panel (iterate the `ModelCapability`
  descriptor — `tools`/`output.structured` keys present ⇒ render the control).

---

## 2. How SillyTavern does it (source-grounded)

Two files own it: `public/scripts/tool-calling.js` (the `ToolManager` static god-class — registry +
parse + execute) and `public/scripts/openai.js` (request-body assembly + tool-result message
reconstruction). **The recurse driver is `public/script.js:Generate` calling itself** — not in either.
JSON-schema→`response_format` translation is **server-side** in `src/endpoints/backends/chat-completions.js`.

**Registration.** `ToolManager.registerFunctionTool({ name, displayName, description, parameters, action,
formatMessage, shouldRegister, stealth })` (`tool-calling.js:269`) builds a private `ToolDefinition`
(`:115`) and stores it in `static #tools = new Map()` (`:247`) — a **process-global static map**.
`parameters` is a raw **JSON-Schema object**, emitted verbatim by `ToolDefinition.toFunctionOpenAI()`
(`:190`) as `{type:'function', function:{name, description, parameters}}`. `shouldRegister()` (`:224`)
is an async **per-request** gate; `stealth` (`:234`) hides the result and **suppresses the recurse**.

**Request.** `ToolManager.registerFunctionToolsOpenAI(data)` (`:400`) pushes each registered tool and
sets `data.tools = tools; data.tool_choice = 'auto'` (`:415-416`) — **`tool_choice` is hardwired to
`'auto'`; ST never forces a tool on the OpenAI path.** Call site `createGenerationParameters`
(`openai.js:2786`), gated by `ToolManager.canPerformToolCalls`. Note **`n>1` multiswipe and tools are
mutually exclusive**. The capability gate `isToolCallingSupported` (`tool-calling.js:608`) is a sprawling
per-source switch (`:623-672`) reading a **different magic field per provider** (OpenRouter
`supported_parameters.includes('tools')`, Mistral `capabilities.function_calling`, Fireworks
`supports_tools`, …) plus a hardcoded fallback whitelist — exactly the per-provider respelling a
born-compliant capability descriptor collapses into ONE derived flag.

**Stream parse.** `ToolManager.parseToolCalls(toolCalls, parsed, toolSignatures)` (`:427`) runs per SSE
chunk (called from `openai.js:3102`). The OpenAI branch (`:431-471`) keys the accumulator by
`choice.index` then `toolCallDelta.index`, and merges via `#applyToolCallDelta` (`:565`) which
**concatenates strings** (`target[key] = targetValue + deltaValue`, `:585`) — that is what stitches the
partial `function.arguments` JSON fragments across deltas (prototype-pollution keys skipped, `:568`).

**Execution.** `ToolManager.invokeFunctionTools` (`:774`) → a **sequential `for…of`** (`:787`, not
parallel) → `invokeFunctionTool(name, parameters)` (`:325`) which `JSON.parse`s args, `await`s the
handler, **stringifies non-string results** (`:334`), and **returns thrown errors as data**
(`error.cause = name`, `:335-344`) so the model sees failures. **All execution is client-side in the
browser.** Results collect into `ToolInvocationResult {invocations[], errors[], stealthCalls[]}`.

**Feedback / the `tool` role.** During prompt assembly (`openai.js:1049-1056`): an **assistant message
carries `tool_calls`** via `Message.setToolCalls` (`:3491`) →
`{id, type:'function', function:{arguments, name}}`; then **one `tool` message per result** —
`Message.createAsync('tool', invocation.result, invocation.id)` (`:1050`). The wire JSON is emitted by
`ChatCompletion.getChat` (`:3748`): `{role:'tool', content, tool_call_id: identifier}` (`:3756`) — the
**`tool_call_id` is the original call id**. The whole tool turn is budget-gated (`canAffordAll`, `:1052`)
and dropped wholesale if it won't fit. Persistence: `saveFunctionToolInvocations` (`:887`) stores the
invocations on a chat message's `extra.tool_invocations`, re-read next request to rebuild the wire
messages. So ST does **not** persist a `tool` row — it persists invocations on the assistant message and
**expands them to wire `tool` messages at assembly time** (the model orbweaver should copy, server-side).

**Recurse.** The loop is `Generate` self-re-invoking (`script.js`), bounded by
`ToolManager.RECURSE_LIMIT` (default 5, `tool-calling.js:255`). The gate
`canPerformToolCalls(type) && depth < RECURSE_LIMIT` (`script.js:4469`); after tools run, `depth+1` →
`return Generate('normal', {…, depth})` (streaming `:5407`, non-streaming `:5530`). Termination: no
invocations, or any stealth call fired (`shouldStopGeneration`, `:5395`).

**Structured output.** **A separate path — does NOT ride `tool_choice`** on the OpenAI path. The client
attaches a top-level `json_schema` (`{name, value, description?, strict?, returnInvalid?}`,
`openai.js:3039`); the **server** translates per provider in `chat-completions.js`: OpenAI form
`response_format:{type:'json_schema', json_schema:{name, description, schema, strict}}` (`:876`); **Claude
maps it to a forced tool** `tool_choice:{type:'tool', name}` + `input_schema` (`:284-291`); Google uses
`responseMimeType+responseSchema` (`:467`); old providers fall back to `{type:'json_object'}` + a schema
system message. Extraction short-circuits to `extractJsonFromData` (`script.js:5454`). **Forced-JSON does
NOT globally disable streaming** (only Workers-AI special-cases it off, `openai.js:2730`).

**Architecture critique (why we follow the spine, not ST).** `ToolManager` is a static singleton
god-object that owns registry + per-provider parse + execution + toast UI + chat persistence + slash
commands, and it **reaches UP into `script.js`** (an inverted dependency). Execution is browser-side. The
recurse loop is tangled into a ~1000-line UI function, duplicated streaming vs non-streaming. `tool_choice`
is hardwired `'auto'`. The capability gate is ~25 per-source magic fields. Structured output is ~15
near-identical inline `response_format` blocks. **Every one of these is a thing the orbweaver spine
forbids**: server-side execution, a domain-owned testable loop, a first-class `tool_choice` union, ONE
derived capability axis, one `response_format` contract with per-backend translators.

---

## 3. What neo-tavern kept / cut

neo **kept tool-calling only via the Claude Agent SDK's MCP mechanism** (the buddy assistant), and **cut
the entire OpenAI hand-rolled function-calling apparatus**. Findings:

- **No `ToolManager`, no `registerFunctionTool`, no `tools`/`tool_choice`/`tool_calls` request shaping,
  no stream-parse/recurse on the chat path** — searches return zero hits. neo delegates the whole protocol
  to `@anthropic-ai/claude-agent-sdk`: `run-agent.ts:runAgentTurn` → `claude-sdk/agent-runner.ts`
  (`mcpServers`, `allowedTools:["mcp__neo-tavern__*"]`, `maxTurns:8`), tools registered via the SDK
  `tool(...)` in `domain/buddy/agent/tools.ts:createBuddyMcpServer`. **The SDK owns the loop.**
- **The roleplay chat path has NO tools** — and that is deliberate: the roleplay sdk runner hardcodes
  `maxTurns:1` + `mcpServers:{}` + `tools:[]` (`claude-sdk/runner.ts:115`) — *"that asymmetry IS the
  firewall."* The openrouter chat-completions runner builds `model/messages/sampling/reasoning/provider/
  plugins` only; `parallel_tool_calls` appears solely as a `customParameters` passthrough example.
- **Structured output: kept only on the local vLLM ancillary roles** (summarize/caption) —
  `vllm/runners/chat-completion.ts` sends `response_format:{type:'json_schema', json_schema:{name,
  schema}}` with `cleanJsonSchema` (strips annotations, pins `additionalProperties:false`). The OpenRouter
  family does **not** enforce it (prompt-instruction only — a noted pending follow-up). **Absent on the
  chat path.**
- **Message-role union has NO `tool`/`function` role** — `db/schema/chat.ts:144` is exactly
  `enum:["user","assistant","system"]`. neo carries the **vestigial unused `toolCalls` JSON column**
  (`:171`) but **nothing populates it** (the orbweaver D37 column inherits this — reserved, unwired).
- **No tool capability flag** on `FamilyCapabilities` (`model-family.ts:41` has only reasoning/caching/
  hasFastMode); `SOURCE_CAPABILITIES` is source→role, not tool support.

**Net:** orbweaver inherits neo's agent-sdk MCP path (now D47-committed) and its empty `toolCalls`
column, but the **OpenAI-wire tool path + the `tool` role + structured output are GREENFIELD** — this
proposal is the first time they are shaped, which is exactly why the contract shape must be airtight now.

---

## 4. The orbweaver substrate to lean on + the D47 agent-sdk path (and how they unify)

**Already built (the wire-shaping seam):**
- `ChatHistoryMessage` / `ChatContentPart` — `infra/providers/contract/chat.ts:26-36`. **Just widened
  `string`→content-parts for D45.** This is the file the `tool` role + tool parts widen. Note
  `ChatHistoryMessage.role` is `"user" | "assistant"` — it **already excludes `system`**, so it is its
  OWN axis, distinct from `MESSAGE_ROLES` (critical — see §5.1).
- `ChatRequest` (discriminated by `api`) — same file, `:69-91`. The `chat-completions`/`responses` arms
  are where `tools`/`toolChoice`/`responseFormat` land.
- The openai-compat stream reducer — `backends/kit/openai-compat/stream.ts` (`reduceChatCompletionStream`).
  Today it accumulates `delta.content`→reply and `delta.reasoning`→CoT; line 129 even notes *"chat-
  completions path has no tool-call reporting"*. This reducer is the **isolation seam** both openrouter
  and custom-byo import down — the tool-call delta accumulator (ST's `#applyToolCallDelta` string-concat
  over `delta.tool_calls[].function.arguments`) is added HERE, once, shared.
- `runChatCompletionTurn` — `backends/openrouter/runners/chat/chat-completions.ts`. `buildChatBody`
  (`:87`) is where the `tools`/`tool_choice`/`response_format` fields are spread onto the wire body, and
  `resolveChat`-style gating (`resolve-chat.ts`) is where the capability drop-and-warn fires.
- `ModelCapability` — `@orb/contracts/connection` (`packages/contracts/src/connection/index.ts:129-163`).
  Add `tools` + `output.structured` alongside the D45 `input.vision` axis, **same constructor pattern**.
- `WARNING_CODES` — `infra/providers/contract/resolve.ts:15-26` (the D41 one-home tuple; D45 adds
  `image_dropped`). The drop-and-warn `warning` `ChatEvent` machinery already flows through `onEvent` +
  `ChatResult.events` (`events.ts`).
- `message_variants.toolCalls` — `packages/db/src/schema/chat.ts:247`, **reserved untyped JSON, comment
  literally "Reserved for tool-call records … no contract type exists yet — parsed at the read seam when
  it lands."** This proposal lands that contract type.

**The D47 agent-sdk path (already committed + partially built):**
- `agent` role — `infra/providers/roles/agent.ts` → `runAgentTurn`. Firewall: agent mode is always the
  `agent-sdk` backend; `assertCredentialAllowed` rejects `custom_openai`.
- `runAgentTurn` — `backends/agent-sdk/agent-runner.ts`. The SDK runs the loop:
  `mcpServers:{orbweaver: req.mcpServer}`, `allowedTools:["mcp__orbweaver__*"]`, `maxTurns:req.maxTurns??8`.
  **The loop is internal to the backend** (the SDK executes tools against the in-process MCP server).
- `AgentTurnRequest` + the opaque `AgentToolServer` seam — `infra/providers/contract/agent.ts`.
  `mcpServer: AgentToolServer` (`= unknown`, SDK-decoupled per D8; narrowed to
  `McpSdkServerConfigWithInstance` only at the backend boundary). The header notes the caller builds the
  tool server via *"the agent-sdk backend's exposed factory (a barrel seam)"* — i.e. `createAgentToolServer`
  (named in D47 / the agent-runner comment), **not yet built**.

### How the OpenAI path UNIFIES with the agent-sdk path — ONE tool model, two projections

The two paths are not two universes; they are **two wire projections of one domain tool-registry**:

| | agent-sdk path (D47) | OpenAI-wire path (this proposal) |
|---|---|---|
| **Tool source** | the SAME `domain/tool-use` registry | the SAME `domain/tool-use` registry |
| **Projection** | registry → in-process **MCP server** (`createAgentToolServer`) | registry → **JSON-schema `tools[]`** on the request + a server-side **executor** |
| **Who runs the loop** | the **SDK**, internally (backend), bounded by `maxTurns` | the **chat domain** recurse loop, bounded by a recurse limit |
| **Who executes tools** | the SDK invokes the MCP handlers (in-process, our code) | the chat recurse loop calls the registry handlers directly |
| **Tool exchange visible to domain?** | No — domain gets the final `ChatResult` | Yes — `finishReason:"tool"` + tool-call parts, domain executes + re-calls |
| **Persistence** | `message_variants.toolCalls` (typed seam) | `message_variants.toolCalls` (same typed seam) |

The asymmetry is intrinsic and correct: the stateless OpenAI backends **cannot** own a loop (they are
one-shot — `participants-agents-identity.md` statelessness; chat.md "domain owns orchestration"), so the
loop is the domain's; the agent-sdk backend **already** owns a stateful loop the firewall is built around,
so re-implementing it domain-side would be the wrong fight. **The unification point is the registry +
the handler signature + the persisted `ToolCallRecord` shape** — identical across both — not the loop
location. One registry, one handler contract, one persisted record, two wire projections.

---

## 5. Proposed home in the cake

### 5.1 The wire `tool` role — where it lands, and why NOT `MESSAGE_ROLES` (flag)

**The `tool` role lands on the infra wire axis `ChatHistoryMessage.role`, NOT on the canonical
`MESSAGE_ROLES` tuple in `@orb/kit/message-role`.** This is a deliberate reconciliation that **corrects
the open-watch note in `spine/string-union-dispatch.md §8`**, which anticipated *"a future
`tool`/`developer` role would widen the [MESSAGE_ROLES] tuple in the one place."* Three reasons that note
is wrong for `tool` specifically:

1. **`ChatHistoryMessage.role` is already a distinct axis.** It is `"user" | "assistant"` — it deliberately
   **excludes `system`** (system rides `ChatRequest.systemPrompt`, not history). So the history-role axis
   is **not** `MESSAGE_ROLES` and never was; widening it to add `tool` doesn't touch the kit tuple.
2. **`tool` is not a valid injection role.** `MESSAGE_ROLES` is shared by the persisted message slot AND
   every at-depth **injection** (world-info, author's note, depth-prompt, persona, memory, guided —
   chat.md / string-union-dispatch §5). You cannot inject a world-info entry "as `tool`". Widening
   `MESSAGE_ROLES` would pollute six injection consumers with an illegal member.
3. **The ST numeric bimap is total over `MESSAGE_ROLES`** (`ST_NUM_BY_ROLE: Record<MessageRole, number>`,
   `kit/message-role`). ST has **no numeric encoding for `tool`** (it is a string-only OpenAI role).
   Adding `tool` would force a fake number into a bimap whose whole job is ST card serde.

**Therefore:** `messages.role` (DB enum) + `MessageSlot.role`/`MessageView.role` stay `system|user|
assistant` (tool exchanges persist on the **variant**, not as a slot row — the ST model). The `tool` role
is **wire-only**, on `ChatHistoryMessage.role`, materialized by assembly when it expands a recorded tool
exchange into wire messages. To satisfy §7.5 one-home, promote the inline history-role union to a tuple
**in the infra contract** (it is infra-internal, not cross-boundary): `HISTORY_ROLES = ["user",
"assistant", "tool"] as const` in `infra/providers/contract/chat.ts`, with `assertNever` dispatch in each
translator. **→ Needs a ledger decision ("`tool` is a wire-history role, not a `MESSAGE_ROLES` member").**

### 5.2 The contract shapes — homes by the cake

| Piece | Package / file | Notes |
|---|---|---|
| wire `tool` role + `tool-call`/`tool-result` content parts | `infra/providers/contract/chat.ts` | extends the D45 `ChatContentPart` union; `HISTORY_ROLES` tuple |
| `tools` / `toolChoice` request fields | `infra/providers/contract/chat.ts` (`ChatRequest` `chat-completions`+`responses` arms) | infra-internal; built by the domain via the registry projection |
| `responseFormat` request field | `infra/providers/contract/chat.ts` (all wire arms) | structured output; per-backend translator maps it |
| typed persisted tool-exchange DTO (`ToolCallRecord`/`ToolResultRecord`/`ToolInvocation`) | `@orb/contracts/chat` | replaces untyped `message_variants.toolCalls` `$type<>`; cross-boundary (db + client read it) |
| `ToolDefinition` (name/description/JSON-schema params) | `@orb/contracts/tool-use` (NEW contracts node) OR `domain/tool-use/contract` | cross-boundary IF the client lists available tools; else domain-internal |
| `ModelCapability.tools` + `output.structured` axes | `@orb/contracts/connection` | D45-vision pattern; the GATE |
| `tools_unsupported` + `structured_output_unsupported` warning codes | `infra/providers/contract/resolve.ts` | extends D41/D45 `WARNING_CODES` |
| the **tool registry** + handlers + capability gating | `domain/tool-use/` (NEW leaf) | one home; injected into chat + buddy |
| the JSON-schema **projection** (registry → `tools[]`) | `domain/tool-use/` | feeds the wire request |
| the **MCP projection** (registry → `AgentToolServer`) | `domain/tool-use/` calling the agent-sdk backend's `createAgentToolServer` barrel seam | reconciles with D47 |
| the **recurse loop** | `domain/chat/engine/` (orchestration) | chat owns it; calls `tool-use` to execute |
| tool-call **delta accumulator** | `infra/providers/backends/kit/openai-compat/stream.ts` | shared by openrouter + custom-byo; ST `#applyToolCallDelta` string-concat |
| persistence into `message_variants.toolCalls` | `domain/chat/persistence` | via the typed seam |

### 5.3 The tool registry — a `domain/tool-use` leaf, reconciled with D46

A **`domain/tool-use` leaf** owns the ONE registry: `{ definition: ToolDefinition, handler:
(args) => Promise<ToolResult>, capability: <can()-gate> }` keyed by tool name. It is injected (composition
root) into **chat** (the recurse loop calls `executeToolCalls`) and **buddy** (builds the MCP server for
the agent turn). Two pure projections live here: `toToolsArray(registry)` → the JSON-schema `tools[]`;
`toAgentToolServer(registry)` → the opaque `AgentToolServer` (delegating to the agent-sdk backend factory).

**Reconciliation with D46 (`scripting-automation-extensibility.md`):** D46 defines the plugin `can()`
capability seam (`resource` union + actions, FLAG[PD-1], shaped at Phase 5) and plugin-authored
extensions running *"under the same `can()` capability gates."* **Do not duplicate a registry.** The
`domain/tool-use` registry is the ONE registry; tools have **two sources** — (a) host/builtin tools
(registered directly), and (b) plugin-authored tools (registered through the D46 plugin host, each gated
by `can()`). The registry's `capability` field IS a `can()` check — so a plugin tool cannot be invoked
beyond its principal's authority. This keeps tool-calling and the plugin capability surface as **one
capability model**, per D46's explicit "one runtime, one capability model" intent. **→ Flag for Nate: is
`tool-use` its own leaf, or a subsystem of `chat`?** It is cross-feature (chat + buddy + plugins consume
it), which argues for its own leaf; but the recurse loop stays in chat regardless.

### 5.4 The recurse loop — chat domain owns it

Per chat.md (*"the per-backend dispatch arms COLLAPSE to one `runChatTurn(req)`"* + the domain owns
orchestration), the OpenAI-path loop lives in `domain/chat/engine` (sketch):

```
runTurnWithTools(req, registry, limit):
  depth = 0
  loop:
    result = runChatTurn(req)            // the ONE role call (stateless backend)
    if result.finishReason != "tool" or depth >= limit: return result
    calls = extractToolCalls(result)     // the assistant variant's tool-call parts
    results = await toolUse.executeToolCalls(calls)   // domain registry; sequential, errors-as-data (ST)
    persist(variant.toolCalls = recordOf(calls, results))   // typed seam → message_variants.toolCalls
    req = appendToolExchange(req, calls, results)     // assistant(tool-call parts) + tool(tool-result parts)
    depth += 1
```

Bounded by a recurse limit (ST's default 5 is a reasonable seed — a chat-setting, not hardcoded). The
agent-sdk path bypasses this entirely (the SDK loops; the domain gets one `ChatResult`). **One coherent
model:** both persist the same `ToolCallRecord` to the same column; the loop location differs because the
backend statefulness differs.

---

## 6. Contract shapes — the concrete TS/Zod sketch

### 6.1 Wire `ChatHistoryMessage` + content parts (`infra/providers/contract/chat.ts`)
```ts
// One-home wire-history role tuple (infra-internal; distinct from MESSAGE_ROLES — excludes system,
// includes tool). §7.5: assertNever dispatch in each translator.
export const HISTORY_ROLES = ["user", "assistant", "tool"] as const;
export type HistoryRole = (typeof HISTORY_ROLES)[number];

// Extends the D45 union — same no-`if(hasX)` discipline. A text turn is still [{type:"text"}].
export type ChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly url: string }
  // Assistant emits these when it calls tools. `arguments` is the RAW JSON string the model produced
  // (parsed once at the registry boundary — we do NOT carry a parsed object on the wire; ST keeps it a
  // string end-to-end and so do we, parsing exactly once at execute).
  | { readonly type: "tool-call"; readonly toolCallId: string; readonly name: string; readonly arguments: string }
  // The `tool` role message carries these — one per result, referencing the originating call id.
  | { readonly type: "tool-result"; readonly toolCallId: string; readonly content: string; readonly isError?: boolean };

export interface ChatHistoryMessage {
  readonly role: HistoryRole;                  // was "user" | "assistant"
  readonly content: readonly ChatContentPart[];
  readonly name?: string | undefined;
}
```

### 6.2 Request fields (`ChatRequest` `chat-completions` + `responses` arms) + structured output
```ts
// First-class tool_choice — NOT ST's hardwired "auto". Forced-tool is the named arm.
export type ToolChoice =
  | { readonly mode: "auto" }
  | { readonly mode: "none" }
  | { readonly mode: "required" }
  | { readonly mode: "tool"; readonly name: string };

// The wire-shaped tool definition the request carries (the registry projects to this).
export interface WireTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;   // JSON Schema object (lenient — vendor-owned shape)
}

// Structured output — its OWN axis, NOT riding tool_choice (ST keeps them separate; per-backend a
// translator MAY implement it as a forced tool, e.g. Anthropic — that's a wire-mapping detail, the
// contract stays response_format-shaped).
export interface ResponseFormat {
  readonly name: string;
  readonly schema: Record<string, unknown>;       // JSON Schema
  readonly strict?: boolean | undefined;          // default true
  readonly description?: string | undefined;
}

// added to BOTH the chat-completions and responses arms:
//   readonly tools?: readonly WireTool[] | undefined;
//   readonly toolChoice?: ToolChoice | undefined;
//   readonly responseFormat?: ResponseFormat | undefined;   // all wire arms incl. custom-byo
```

### 6.3 `ModelCapability` axes (`@orb/contracts/connection`) — the gates
```ts
// alongside input:{vision} (D45), output:{maxTokens}:
tools: z.object({
  // Whether the model supports >1 tool call in a single assistant turn (OpenAI parallel_tool_calls).
  parallel: z.boolean(),
}).optional(),               // ABSENT ⇒ no tool support (the gate; assembly drops tools + warns)
output: z.object({
  maxTokens: rangeSchema,
  // The model honors response_format json_schema (or its backend's equivalent). Absent/false ⇒ drop+warn.
  structured: z.boolean().optional(),
}),
```
Synthesized per `(model, backend)` in `domain/connection/catalog/resolve-model-capability.ts` — for
OpenRouter from `ModelCatalogEntry.supportedParameters.includes("tools")` /
`...includes("structured_outputs")` (the field already exists, `connection/index.ts:188`); curated for
Claude; static for vLLM (`--enable-auto-tool-choice`); user-declared for custom-byo.

### 6.4 The persisted typed DTO (`@orb/contracts/chat`) — replaces untyped `toolCalls`
```ts
export interface ToolCallRecord {
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: string;        // raw JSON string (provenance-faithful)
  readonly result: string | null;    // stringified result; null if not yet executed
  readonly isError: boolean;
  readonly durationMs: number | null;
}
// message_variants.toolCalls: text(json).$type<readonly ToolCallRecord[]>()  (replaces the untyped column)
```

### 6.5 `WARNING_CODES` (`infra/providers/contract/resolve.ts`)
```ts
export const WARNING_CODES = [
  "sampling_knob_dropped", "effort_dropped", "adaptive_budget_dropped", "display_dropped",
  "image_dropped",                  // D45
  "tools_unsupported",              // NEW — tools requested but capability.tools absent → dropped
  "structured_output_unsupported",  // NEW — responseFormat requested but output.structured absent → dropped
] as const;
```

---

## 7. Born-compliant checklist (THE NOW-LIST — implement in the contracts pass)

- [ ] **`infra/providers/contract/chat.ts`**: add `HISTORY_ROLES` tuple; widen `ChatHistoryMessage.role`
      → `HistoryRole`; add `tool-call` + `tool-result` to `ChatContentPart`.
- [ ] **`infra/providers/contract/chat.ts`**: add `ToolChoice`, `WireTool`, `ResponseFormat`; add
      `tools?`/`toolChoice?` to the `chat-completions`+`responses` arms; add `responseFormat?` to all wire
      arms (incl. custom-byo).
- [ ] **`@orb/contracts/connection`** (`packages/contracts/src/connection/index.ts`,
      `modelCapabilitySchema`): add `tools?: {parallel:boolean}`; add `output.structured?: boolean`.
- [ ] **`@orb/contracts/chat`** (`packages/contracts/src/chat/index.ts`): add `ToolCallRecord` (+
      `ToolResultRecord` if split); export it.
- [ ] **`@orb/db`** (`packages/db/src/schema/chat.ts:247`): change `toolCalls` to
      `.$type<readonly ToolCallRecord[]>()` (no column add — D37 reserved it; the typed seam lands).
- [ ] **`infra/providers/contract/resolve.ts`**: add `tools_unsupported` +
      `structured_output_unsupported` to `WARNING_CODES`.
- [ ] **`@orb/contracts/tool-use`** (or `domain/tool-use/contract`): `ToolDefinition` shape (decide
      cross-boundary vs domain-internal by whether the client lists tools).
- [ ] **Confirm no `MESSAGE_ROLES` change** — `tool` is wire-only (the §5.1 reconciliation). Verify the ST
      bimap + the six injection consumers stay untouched.
- [ ] **Ledger decision** capturing: (a) `tool` = wire-history role not a `MESSAGE_ROLES` member; (b) tool
      exchanges persist on `message_variants` not as a slot role; (c) ONE registry / two projections; (d)
      the loop split (domain for OpenAI-wire, SDK for agent-sdk).
- [ ] **Contract tests** (born-compliant invariants): `ChatContentPart` tool variants round-trip; the
      `tools`/`responseFormat` fields are type-level absent when capability is absent (drop-and-warn is the
      only path, no hard throw); `WARNING_CODES` mirror test; `ToolCallRecord` ⇆ `toolCalls` column type.

---

## 8. Difficulty, sequencing, open questions

**Difficulty.** Contracts pass (the now-list): **LOW–MODERATE** — additive type changes mirroring D45's
already-landed pattern; the one subtle call is §5.1 (`tool` role home), which is a decision not code.
Phase-5 domain: **MODERATE** — the recurse loop is genuinely new orchestration but small and testable; the
delta accumulator is a direct ST port into one shared reducer; the registry + two projections are
mechanical. The gap register rates the chat-completions tool path **PAINFUL** mainly because of the loop
vs stateless-turn tension — this proposal resolves that tension by **homing the loop in the domain** (the
spine-correct answer), which de-risks it.

**Sequencing.** (1) contracts pass — the now-list (this is the time-sensitive ask: "tool role is needed
now"). (2) Phase-5: the shared delta accumulator + the per-translator wire mapping (rides the existing
translators). (3) Phase-5: `domain/tool-use` registry + projections. (4) Phase-5: the chat recurse loop +
persistence. (5) Phase-5: structured output (smaller — one request field + per-translator map, no loop).
(6) Phase-6: client render + toggles. The agent-sdk path (D47) and this share the registry, so build the
registry once and both consume it.

**Open questions.**
1. **Structured output: same `tool_choice` mechanism or a separate `response_format` axis? — RESOLVED in
   this proposal: separate axis.** ST keeps them separate on the OpenAI path; only *internally* does the
   Anthropic translator implement json-schema as a forced tool. So the **contract** is a distinct
   `responseFormat` field with its own `output.structured` capability gate; per-backend, a translator may
   realize it via a forced tool — a wire-mapping detail, not a contract coupling. (Confirm with Nate.)
2. **Forced-JSON × streaming.** ST does NOT globally disable streaming for structured output (only
   Workers-AI). Recommend: keep streaming on; the reducer assembles the full text and the domain parses at
   the end (the `extractJsonFromData` equivalent). A strict-schema backend that refuses to stream is a
   per-backend quirk handled in its translator, not the contract. **Open: do we validate the returned JSON
   against the schema server-side (and emit a `warning`/retry on invalid), or trust the model?** ST has a
   `returnInvalid` flag — propose mirroring it.
3. **`tool-use` leaf vs chat subsystem.** Cross-feature consumption (chat + buddy + D46 plugins) argues for
   its own leaf; the recurse loop stays in chat either way. (Nate's call.)
4. **`ToolDefinition` cross-boundary?** Only if the client enumerates available tools (a tool-picker UI).
   If tools are host/plugin-config only, it stays domain-internal. Defer to the client spec.
5. **Parallel tool calls.** `capability.tools.parallel` is shaped; the recurse loop executes sequentially
   (ST's model — simplest, deterministic). Parallel execution is a later optimization, not a contract change.
6. **Recurse limit home.** A chat-setting (seed 5) vs a per-tool/per-chat cap. Propose a chat-level setting
   mirroring ST's `tool_call_recurse_limit`.

---

## 9. Cross-references

- **D47** (DECISIONS-LEDGER §7) — agent-sdk tool-calling committed; `createAgentToolServer` seam + the
  reserved `toolCalls` column; *"the chat-completions path stays DEFERRED/PAINFUL"* (this proposal is that
  path).
- **D37** — `message_variants.toolCalls` reserved column (born-whole precedent).
- **D45** — the `ChatHistoryMessage` content-part reshape + the `ModelCapability` vision axis + the
  `image_dropped` `WARNING_CODE` — **this proposal is the same pattern for tools**.
- **D41** — `WARNING_CODES` as a one-home tuple + the structured `warning` `ChatEvent` delivery channel.
- **D32** — `MESSAGE_ROLES` home (`kit/message-role`) + the ST bimap (the reason `tool` does NOT widen it).
- **D46** — `proposals/scripting-automation-extensibility.md` — the plugin `can()` capability surface the
  tool registry reconciles with (one capability model).
- `tiers/providers.md` — sealed backends, the role contract, the drop-with-`warning` membrane, the agent
  role (Part II §1 `tools?`).
- `domains/chat.md` — the turn pipeline owns orchestration; the per-backend dispatch collapses to one
  `runChatTurn`; the loop is the domain's.
- `spine/string-union-dispatch.md` §5/§8 — the role-axis discipline + the (here-corrected) `tool`-role
  open-watch note.
- `reports/sillytavern-feature-gap.md` §5 — the gap rows this closes (tool-calling chat-completions path;
  structured output; structured-output-via-tools).
