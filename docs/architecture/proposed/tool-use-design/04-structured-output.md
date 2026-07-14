---
kind: spec
status: active
updated: 2026-07-03
---

# 04 — The Structured-Output Axis (`responseFormat`) End-to-End

> **Status: COMMITTED (D48) — prescriptive design; the ledger D-entry, then
> [`tool-use.md`](tool-use.md), win on any conflict.** Structured output is
> the SECOND axis of this domain — a separate `responseFormat` contract that never rides
> `tool_choice` (D48). Its consumers are already committed: every chat-crew member is "pure
> structured output + one bounded retry" (D59, chat-crew-design/03 §0), and rpg's async crew
> workloads converge on the same helper (chat-crew-design/05 §e).

---

## 1. The contract (restated at its home, with the projection rule bound)

```ts
// infra/providers/contract/chat.ts — on ALL wire arms (chat-completions · responses · the
// custom-byo/vLLM surfaces). NOT on the agent-sdk arm in v1: no committed agent-sdk consumer
// requests responseFormat (crew/rpg workloads run agentTurn with it — see §5's note), and the
// SDK wire realizes it differently; the field lands on that arm WITH its first consumer.
export interface ResponseFormat {
  readonly name: string;                          // schema name (OpenAI json_schema.name; Anthropic tool name)
  readonly schema: Record<string, unknown>;       // JSON Schema — projected by the SAME rule as tools (01 §2)
  readonly strict?: boolean | undefined;          // default true
  readonly description?: string | undefined;
}
```

The caller builds `ResponseFormat.schema` from its zod payload schema through the SAME
`projectArgSchema` rule as tool args (zod v4 `z.toJSONSchema` + `additionalProperties:false` +
descriptions survive) — one projection rule for both axes, one golden test. The zod schema
remains the caller's runtime validator (§4): one source of truth serving both the wire constraint
and the parse.

## 2. The lifecycle (normative sequence)

```
caller (crew runner / rpg workload / future chat consumer)
  1. builds zod payloadSchema → ResponseFormat via projectArgSchema
  2. requests a turn with responseFormat set
domain gate (the request builder — chat engine or the agentTurn caller)
  3. capability.output.structured true  → responseFormat rides the request
     absent/false                       → DROP the field + warn "structured_output_unsupported"
                                          (CHAT_WARNING_CODES, 02 §5) — the turn proceeds free-text
translator (per backend, §3)
  4. maps responseFormat to the backend's wire realization
stream (unchanged)
  5. STREAMING STAYS ON — the reducer assembles the full text exactly as any turn (§5)
caller again (validation — §4)
  6. JSON.parse + zod safeParse the assembled text
  7. on failure: ONE bounded retry with the validation errors appended; second failure = the
     caller's failure surface (workload `failed` + retry-from-UI for crew; error result for verbs)
```

## 3. Per-translator realization (the Tier-3b mapping table)

| Backend | Wire realization | Notes |
|---|---|---|
| openrouter `chat-completions` (incl. OR-Anthropic) | `response_format: { type:"json_schema", json_schema: { name, description?, schema, strict } }` | OR normalizes downstream-provider dialects |
| openrouter `responses` | `text: { format: { type:"json_schema", name, schema, strict } }` | responses-dialect spelling |
| custom-byo / vLLM chat surface | `response_format: { type:"json_schema", json_schema: { name, schema } }` | the neo vLLM runner already did exactly this with `cleanJsonSchema` (one-line cite: `vllm/runners/chat-completion.ts`) — the projection rule (01 §2) absorbs the cleaning |
| direct-Anthropic (D47 source, when built) | a FORCED TOOL: `tool_choice:{type:"tool", name}` + one tool whose `input_schema` = the schema | **translator-internal** — the contract stays responseFormat-shaped; this is the D48-blessed "Anthropic realizes it internally as a forced tool; a translator detail, not a contract coupling" (ST does the same server-side — one-line cite: `chat-completions.js:284`) |

Exhaustive dispatch per translator (spine §7.5), same as the tools mapping (02 §4).

## 4. Validation ownership — the DECISION the committed §8 Q5 flagged

**DECISION: schema validation of the returned JSON is the CALLER's job, standardized in ONE
shared kit helper — `runStructuredAgentTurn` (`@orb/server/kit/agent-payload.ts`). tool-use owns
the AXIS (gate + wire field + projection + translator mapping); it never validates payloads.**

The helper's contract is already committed law on the crew side (chat-crew-design/03 §0,
binding): build messages → one completion with `responseFormat` → `JSON.parse` +
`payloadSchema.safeParse` → on failure retry ONCE with the validation errors appended to the
messages → typed payload, or throw (→ workload `failed`, retryable from the workloads UI). rpg's
crew runners converge on the same helper (chat-crew-design/05 §e — "shared with the rpg crew";
a note for the R6 builder). Chat-side structured consumers (none committed yet) use the same
helper against `runChatTurn`.

WHY caller-side: the caller OWNS the zod schema (the payload's meaning) and the recovery policy —
crew retries once then fails the workload; a future interactive consumer might surface a
regenerate button instead; tool-use can't know either without absorbing every caller's policy
(an upward coupling). WHY one helper anyway: 12+ runners across two crews would otherwise
copy-paste the parse-retry dance (the stated reason the helper exists, chat-crew-design/05 §e) —
policy stays at the caller, MECHANICS live once in kit. *(Rejected: registry/engine-side
validation + a `warning` on invalid — a warning can't drive a retry, and the engine would need
the caller's zod schema, inverting ownership. Rejected: ST's `returnInvalid` flag as the model —
that is a knob for "give me garbage anyway"; the bounded-retry-then-fail posture replaces it, and
the JSON-repair modal it fed is dead by design (rpg-design/09 §+).)*

## 5. Streaming — DECIDED (was the committed §8 Q5 lean; now a decision)

**Streaming stays ON for structured turns.** The reducer assembles the full text (nothing
tool-specific about it); the caller parses at the end (§4). ST verified this is safe — it does
NOT globally disable streaming for structured output (one-line cite: only Workers-AI
special-cases it off, `openai.js:2730`); a backend that genuinely refuses to stream under strict
schemas is that translator's quirk, handled inside it, never a contract bit. WHY: a global
streaming-off rule would visibly degrade every crew/rpg workload progress surface for a
constraint only one fringe backend has. *(Rejected: buffer-then-deliver for structured turns —
punishes all backends for one's quirk.)*

Note on the agent-sdk arm: crew members think via the sealed `agentTurn` with `responseFormat`
(chat-crew-design/03 §0). The `agentTurn` request contract (`infra/providers/contract/agent.ts`)
therefore gains `responseFormat?` WITH the crew build (its first consumer — the D48 "no dead
branches" rule); the realization inside the agent-sdk backend follows §3's Anthropic row.

## 6. tools × responseFormat on ONE request — LEAN

**LEAN: mutually exclusive per request, by construction of the committed consumers** — the chat
loop sets `tools` and never `responseFormat`; structured callers (crew, workloads) set
`responseFormat` and register no tools (D59). No code enforces the exclusivity in v1 because no
call site can express the combination (the loop and the structured helper are different entry
points). **Resolution criterion:** the first consumer that wants BOTH on one turn (e.g. "call
tools, then answer in schema") forces the real decision — likely a final-turn-only
responseFormat once `finishReason != "tool"` — and THAT design lands with that consumer.
*(Default documented rather than a hard runtime guard because a guard would be dead code with no
reachable trigger — the same no-speculative-seams discipline as the warning-code emit-site
rule.)*
