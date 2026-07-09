---
kind: spec
status: active
updated: 2026-07-03
---

# 02 — The Wire Seams + the Two Projections + the Translators

> **Status: COMMITTED (D48) — prescriptive design; the ledger D-entry, then
> [`tool-use.md`](tool-use.md), win on any conflict.** This doc lands the
> committed doc's §6 contract shapes at their POST-D51 homes (the committed §1/§6 pre-date D51's
> re-homing of `ChatContentPart` and the warning-code split — see §5 + the review flag in 05),
> and specifies both projections + every translator's mapping obligation.

---

## 1. The wire seams, at their actual homes

The committed doc §2 (the `tool` role is WIRE-only, never `MESSAGE_ROLES`) and §6.1–6.2 stand
unchanged in substance. The homes, corrected to the landed D51 world:

| Shape | Home | Why there |
|---|---|---|
| `HISTORY_ROLES = ["user","assistant","tool"]` + `ChatHistoryMessage.role` widening | `infra/providers/contract/chat.ts` | infra-internal wire axis (excludes `system`); the committed §2's three reasons |
| `tool-call` / `tool-result` `ChatContentPart` members | **`@orb/contracts/chat`** (`packages/contracts/src/chat/index.ts:367`) | D51 re-homed `ChatContentPart` there (the committed §1's "infra contract" wording pre-dates D51); the infra `ChatHistoryMessage` imports it DOWN |
| `WireTool`, `ToolChoice`, `ResponseFormat` + the `tools?`/`toolChoice?`/`responseFormat?` request fields | `infra/providers/contract/chat.ts` (`ChatRequest` arms) | infra-internal request vocabulary; the domain builds them via the projections, never hand-rolls |
| `ToolCallRecord` DTO | `@orb/contracts/chat` | cross-boundary: db `$type<>`, server writes, client chips read |
| `tools_unsupported` / `structured_output_unsupported` | **`CHAT_WARNING_CODES`** in `@orb/contracts/chat` — NOT infra `WARNING_CODES` (§5) | the emit sites are domain-side gates (D51 precedent) |

The part-union addition (extends the landed `text | image` union — same no-`if`-branch
composition):

```ts
// @orb/contracts/chat — ChatContentPart gains:
  | {
      readonly type: "tool-call";        // assistant emits — one per model-requested call
      readonly toolCallId: string;
      readonly name: string;
      readonly arguments: string;        // RAW model-emitted JSON string (parsed once, at execute)
    }
  | {
      readonly type: "tool-result";      // the `tool` role carries — one per executed call
      readonly toolCallId: string;       // joins back to the originating tool-call
      readonly content: string;          // the record's `result` JSON document
      readonly isError?: boolean | undefined;
    };
```

**D51 coherence — tool parts are NEVER in the message body string.** D51's law: a message body is
a `string` through RESOLVE/GATHER/BUILD/SHAPE; `ChatContentPart[]` is produced exactly once at the
engine REQUEST seam. Tool parts obey the same law from the other direction: their persisted form
is `ToolCallRecord[]` on the variant (never markdown in the body, never a slot row), and assembly
MATERIALIZES them into wire messages at the REQUEST seam when it expands a recorded exchange —
`assistant(tool-call parts)` then one `tool(tool-result parts)` message per record (the ST
expand-at-assembly model the evidence base verified: ST persists `extra.tool_invocations` and
rebuilds wire messages per request — one-line cite, `openai.js:1049`). So the string-shaped
assemble/SHAPE transforms stay parts-blind, exactly as D51 built them. *(Rejected: embedding a
tool-exchange marker in the body string like images — images are CONTENT the author placed; tool
exchanges are protocol the loop recorded, with a typed home already reserved (D37).)*

## 2. `project-wire` — registry → OpenAI-wire `tools[]`

```ts
// verbs/project-wire.ts
/** Pure projection over a resolved set: entry → { name, description, parameters } using the
 *  JSON-schema projection cached at registration (01 §2). Order = resolve order (deterministic —
 *  the request body is byte-stable for a given attachment list; the prompt-cache cares). */
toWireTools(set: ResolvedToolSet): readonly WireTool[];
```

```ts
// infra/providers/contract/chat.ts
export interface WireTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>; // JSON Schema (projected, additionalProperties:false)
}

export type ToolChoice =
  | { readonly mode: "auto" }
  | { readonly mode: "none" }
  | { readonly mode: "required" }
  | { readonly mode: "tool"; readonly name: string };

// Added to the chat-completions + responses arms:
//   readonly tools?: readonly WireTool[] | undefined;
//   readonly toolChoice?: ToolChoice | undefined;
// Added to ALL wire arms (incl. agent-sdk? NO — see §3; chat-completions + responses + the
// custom-byo/vLLM surfaces that share them):
//   readonly responseFormat?: ResponseFormat | undefined;   // 04 §1
```

**Absence discipline:** a turn with no attached tools sets NO `tools` field (absent, not `[]`) —
the request is byte-identical to a pre-D48 request. This is the pin the
byte-identical-without-tools contract test enforces (05 §T4; the rpg-design/05 §0 no-game
byte-identity test is the same pin from the consumer side). The loop's default `toolChoice` when
tools ARE attached is `{mode:"auto"}` — as a DEFAULT of the caller, not a hardwired constant in a
translator (the committed §9 rejection of ST's hardwired `'auto'`).

## 3. `project-mcp` — registry → the D47 `AgentToolServer`

```ts
// verbs/project-mcp.ts
/** Wrap each entry in the SAME execute pipeline (01 §5) and hand the wrapped set to the agent-sdk
 *  backend's factory. The SDK owns the loop and invokes our wrapped handlers in-process; every
 *  invocation STILL flows lookup→parse→gate→invoke→serialize→record — one execute path, two
 *  projections. `onRecord` fires per completed invocation so the caller can persist the same
 *  ToolCallRecord[] the wire path persists (the D48 unification: same record, same column). */
toAgentToolServer(
  set: ResolvedToolSet,
  exec: ToolExecutionContext,
  deps: { readonly createAgentToolServer: CreateAgentToolServer },
  onRecord: (record: ToolCallRecord) => void,
): AgentToolServer;
```

- `CreateAgentToolServer` is the agent-sdk backend's exposed factory type (the D47 barrel seam,
  `infra/providers/contract/agent.ts`) — tool-use depends DOWN on infra (legal) and receives the
  factory injected so tests stub it without an SDK dependency.
- `AgentToolServer` stays the opaque `unknown` from the D47 contract (a plain `unknown` alias,
  not a brand — `infra/providers/contract/agent.ts:18`; SDK-decoupled, D8); tool-use never narrows it.
- **Buddy is the first consumer** (Phase 7): buddy's `ask` resolves its curated tool names,
  calls `toAgentToolServer`, passes the server on `AgentTurnRequest.mcpServer`, and persists the
  collected records with its turn row. Buddy's tools keep their propose-don't-execute posture at
  the HANDLER level (they return proposals; `buddy.confirm` is the sole executor — buddy.md
  invariant #3); the registry ceiling for them is `null` (owner-scoped by closure, no privileged
  can() action). RESOLVED (2026-07-01): buddy.md's buddy-local `createBuddyMcpServer` framing has
  been purged doc-wide — it now describes tool DEFINITIONS + handlers registered into this ONE
  registry, reached via `project-mcp`. The full source roster (mirrored from 01 §4): **rpg**
  (23 tools, OpenAI-wire path) · **buddy** (this projection) · **crew** (registers NOTHING —
  structured-output axis only, D59) · **plugins** (reserved D46 `source`).

*(Rejected: letting buddy keep a private MCP server beside the registry — the committed §9's
"parallel registry" rejection verbatim. Rejected: tool-use importing the SDK to build the server
itself — the backend is sealed; only its exposed factory crosses the barrel, per D47.)*

## 4. Per-translator mapping obligations (the Tier-3b table)

The sealed translators consume the request fields; each maps or the field never reaches it
(the domain gate, §5, guarantees a translator only ever sees fields its capability declared).

| Backend / arm | `tools[]` | `toolChoice` | tool-call parts (history in) | tool-result parts / `tool` role (history in) | tool-call deltas (stream out) |
|---|---|---|---|---|---|
| openrouter `chat-completions` | `tools:[{type:"function", function:{name,description,parameters}}]` | `"auto"`/`"none"`/`"required"`/`{type:"function", function:{name}}` | assistant msg `tool_calls:[{id,type:"function",function:{name,arguments}}]` | `{role:"tool", tool_call_id, content}` — one message per result | accumulate `delta.tool_calls[]` (§6) |
| openrouter `responses` | `tools:[{type:"function", name, description, parameters}]` (flat — responses-dialect) | same vocab, responses spelling | `function_call` items | `function_call_output` items | `response.function_call_arguments.delta` events |
| custom-byo / vLLM chat surface | same as chat-completions (they share the openai-compat kit) | same | same | same | same reducer (§6) |
| agent-sdk | **NOT wire-projected** — tools ride `mcpServers` via `project-mcp` (§3); the `tools?` request field does not exist on the `agent-sdk` arm | n/a (SDK `allowedTools`) | n/a — history is backend-internal session state (D8) | n/a | n/a — the SDK surfaces tool activity through our wrapped handlers |

(`responseFormat` mapping is the 04 §3 table — separate axis, separate doc.)

Each translator's dispatch over `ChatContentPart.type` and `HistoryRole` MUST be exhaustive
(`assertNever` / mapped-type Record — spine §7.5): adding a part kind is a compile error in every
translator, which is exactly how the D45 image parts landed and the discipline this rides.

## 5. Warning codes — the home DECISION (D51 applied to D48's text)

**DECISION: `tools_unsupported` + `structured_output_unsupported` land in `CHAT_WARNING_CODES`
(`@orb/contracts/chat`), emitted as the domain `warning` bus event from the chat engine's gate
sites; the infra `WARNING_CODES` tuple is untouched.**

WHY: the emit sites are DOMAIN-side. The gates are read where the request is built: chat's engine
attaches `tools[]` only when `capability.tools` is present (else drop + warn) and attaches
`responseFormat` only when `capability.output.structured` is true (else drop + warn) — a runner
never receives what capability didn't declare, so there is no runner-side emit site at all. D51
settled this exact question for `image_dropped` and wrote the rule down: "the domain owns
capability policy, infra only shapes wire; `image_dropped` is therefore NOT added to the infra
`WARNING_CODES`, which stays the strict resolve/runner-emit tuple." The D48 ledger text (written
2026-06-28, the day BEFORE D51) names infra `WARNING_CODES` — this design follows the later
precedent, exactly as D51 superseded D45 pt-3's identical "drops at the runner" wording. Raised as
a review flag for a one-line ledger patch (05 §review-flags), not silently.

```ts
// @orb/contracts/chat
export const CHAT_WARNING_CODES = [
  "image_dropped",                  // D45/D51 (landed)
  "tools_unsupported",              // tools attached but capability.tools absent → dropped, turn proceeds tool-less
  "structured_output_unsupported",  // responseFormat requested but output.structured absent → dropped, free-text turn
] as const;
```

Drop-and-warn, never a hard throw (the D41/D45 membrane) — with ONE carve-out that lives in the
CONSUMER, not here: rpg refuses to CREATE a game on a non-tool-capable connection
(rpg-design/05 §3 — a clear creation-time error beats a silently tool-less GM), and crew surfaces
a failed structured run on the workload row (chat-crew-design/05 §b). The warning codes cover the
mid-life degradation case (a chat's model got swapped under an existing game/format request).
*(Rejected: infra `WARNING_CODES` per D48's literal text — it would put a code with no real infra
emit site into the tuple whose documented law is "EXACTLY the real emit sites".)*

## 6. The stream delta accumulator (the openai-compat kit)

Home: `infra/providers/backends/kit/openai-compat/stream.ts` — the ONE reducer openrouter +
custom-byo share (its line-129 comment "chat-completions path has no tool-call reporting" is the
TODO this fills). The mechanism is ST's proven model (one-line cite: `#applyToolCallDelta`
string-concat keyed by `choice.index` → `toolCallDelta.index`, `tool-calling.js:565`):

- each `delta.tool_calls[i]` carries `{index, id?, function:{name?, arguments?}}` fragments;
- the reducer keys an accumulator by `index`, latches `id`/`name` on first sight, and
  **string-concatenates** `arguments` fragments (the JSON arrives sliced mid-token — only
  concatenation is correct; never attempt incremental JSON parse);
- terminal: the assembled view exposes `toolCalls: readonly ToolCallInput[]` alongside
  reply/reasoning; `finishReason` normalizes to `"tool"` via the landed `FINISH_REASON_MAP`
  (`tool_calls`/`tool_use`/`function_call` → `"tool"` — already in the contract, no change).
- `ChatResult` gains `toolCalls?: readonly ToolCallInput[]` so the loop reads calls off the
  normal turn result (03 §2) — absent on tool-less turns.
- **No per-fragment delta events stream to the client** in v1 (03 §5) — the reducer's existing
  `onDelta` stays text/reasoning-only; tool-call fragments are protocol, not prose.

*(Rejected: per-runner accumulators — the openai-compat kit exists precisely so openrouter and
custom-byo never fork stream logic; the D45 image mapping followed the same one-kit rule.)*

## 7. Parallel calls — the v1 DECISION (was a lean; now decided)

**DECISION: v1 executes SEQUENTIALLY, in the model's emission order — even when the model emits
several tool-calls in one assistant turn, and even when `capability.tools.parallel` is true.**

Two axes, kept distinct:

- **`capability.tools.parallel`** describes what the MODEL may emit (several calls in one turn) —
  a wire/descriptor fact. A model without it emits one call at a time; nothing for us to do.
- **Execution concurrency** is OUR choice. Sequential is correct-by-construction for the actual
  registrants: rpg's tool writes stage onto per-turn snapshot state in order (`apply-tool-call`'s
  pendingEffects — rpg-design/05 §2), where interleaving `tick_clock` with `skill_check`
  consequences is a race; and errors-as-data ordering ("call 2 failed because call 1 moved the
  party") only reads coherently in sequence. ST is sequential too (one-line cite:
  `invokeFunctionTools`' `for…of`, `tool-calling.js:787`).

WHY not parallel now: no registrant is I/O-bound (rpg handlers are local db writes; buddy tools
return proposals), so parallelism buys latency nobody measured while costing deterministic
replay of the golden loop tests (05 §T4). The flip criterion: a registered tool whose handler
awaits real external I/O AND profiling shows the sequential batch dominating turn latency — then
concurrency lands INSIDE `executeToolCalls` (records still emitted in call order) with zero
contract change. *(Rejected: `Promise.all` now — speculative speed for a determinism cost;
rejected: forbidding multi-call turns via `parallel:false` everywhere — it fights models that
naturally batch reads and wastes real capability.)*
