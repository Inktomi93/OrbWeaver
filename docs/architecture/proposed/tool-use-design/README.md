# Tool-Use Design — the prescriptive plan for `domain/tool-use` (doc-set index)

> **Status: COMMITTED (D48, 2026-06-28).** Tool/function calling + structured output ARE in scope;
> `Core-Laws-and-Precedents.md` D48 is the decision record and wins on any conflict, then
> [`../../domains/tool-use.md`](../../domains/tool-use.md) (the committed decision doc this set
> expands — its decisions are LAW here, never re-decided). This doc set is the build-grade design:
> a builder with ONLY this set + the orbweaver law docs (AGENTS-1/2/3, `domains/chat.md`,
> `domains/buddy.md`, `core/Tier-3b-Providers.md`) can build the whole domain. Every decision
> carries its WHY + the rejected alternative. The ST/neo evidence base is the archived proposal
> (`domains/proposed/tool-use/tool-use.md`, pre-`982fd99` git history) — cited one-line, never
> required reading.

## The one-paragraph design

ONE `domain/tool-use` leaf owns the ONE tool registry — every entry a `name + description + zod
arg schema + can()-capability ceiling + handler` closing over its owning domain's service —
populated once at `entry/compose` (collision = boot-fatal), read per turn through a
resolve-by-name surface (rpg's GATHER returns tool NAMES; chat resolves them), and projected onto
two wires: `project-wire` (registry → JSON-schema `tools[]`; `domain/chat` owns the recurse loop —
PD-54, being built with chat P5) and `project-mcp` (registry → the D47 `createAgentToolServer`
seam; the SDK owns the loop; buddy is the first consumer). Both projections funnel every
invocation through the SAME execute path — parse-with-zod, `can()` gate, sequential run,
errors-as-data — and persist the SAME `ToolCallRecord[]` on `message_variants.toolCalls`, which is
the client's ONLY read surface for tool chips (rpg-design/11 §4). Structured output
(`responseFormat`) is a SEPARATE axis on the same domain — capability-gated, translator-mapped,
streamed-then-parsed — with validation + ONE bounded retry owned by the CALLER through the shared
`runStructuredAgentTurn` kit helper (chat-crew-design/03 §0). Crew members register NO tools (D59)
— they consume only the structured-output axis.

## Reading order

| Doc | What it locks |
|---|---|
| [`01-registry-and-execution.md`](01-registry-and-execution.md) | the registry entry contract (zod → JSON-schema rule, handler signature, errors-as-data result), the execute path, `can()` gating + `runAsUserId`, registration-at-compose (collision posture), attachment vs registration, the registrant roster (rpg / buddy / crew-none / plugins-reserved) |
| [`02-wire-and-projections.md`](02-wire-and-projections.md) | the wire seams as they actually land (D51-corrected homes), `project-wire` + `project-mcp` signatures, the per-translator mapping table, the stream delta accumulator, warning-code home, parallel-call posture |
| [`03-loop-persistence-and-client.md`](03-loop-persistence-and-client.md) | the chat-owned recurse loop in full (injected-op interface, attachment, limit/abort/streaming semantics, persistence timing), the `ToolCallRecord` client contract (what chips MAY and MAY NOT rely on), the streamed-event posture |
| [`04-structured-output.md`](04-structured-output.md) | the `responseFormat` lifecycle end-to-end, validation ownership (caller + `runStructuredAgentTurn`), streaming-stays-on, per-backend realization, the tools × responseFormat exclusivity LEAN |
| [`05-build-plan-and-resolutions.md`](05-build-plan-and-resolutions.md) | the committed doc's §8 open questions → verdicts/LEANs, build chunks T1–T7 (sizes, dependencies, checkpoints, per-chunk test plans), review flags |

## Landed vs remaining (verified against the tree, 2026-07-01)

The committed doc's §1 "born-compliant callout" is a MIXED list — part landed, part
deferred-blessed. The truth (PD-54's row is accurate; commit `1d18f17`'s message is explicit that
ONLY the gates landed):

| §1 item | State | Where |
|---|---|---|
| `ModelCapability.tools?: {parallel}` + `output.structured?` gates | **LANDED** (`1d18f17`) | `packages/contracts/src/connection/index.ts` |
| `HISTORY_ROLES` tuple + the wire `tool` role | **NOT landed** — deferred-blessed, ships with the loop (PD-54) | target: `infra/providers/contract/chat.ts` (role is still `"user" \| "assistant"`) |
| `tool-call` / `tool-result` `ChatContentPart` members | **NOT landed** | target: `@orb/contracts/chat` (NOT the infra contract — D51 re-homed `ChatContentPart` there; the committed doc's §1 pre-dates D51) |
| `ToolCallRecord` DTO + `message_variants.toolCalls` retype | **NOT landed** — column exists untyped-open (D37) | `packages/db/src/schema/chat.ts` `toolCalls` |
| `tools?`/`toolChoice?`/`responseFormat?` request fields | **NOT landed** | `infra/providers/contract/chat.ts` `ChatRequest` arms |
| `tools_unsupported` + `structured_output_unsupported` warning codes | **NOT landed**; home corrected to `CHAT_WARNING_CODES` per D51 (02 §5) | `@orb/contracts/chat` |
| `NormalizedFinishReason` `"tool"` + `FINISH_REASON_MAP` | **LANDED** (pre-existing) | `infra/providers/contract/chat.ts` |
| The recurse loop | **ABSENT** (PD-54 "ready"; being scoped/built with chat P5 RIGHT NOW — this set describes THAT loop, not a second one) | `domain/chat/engine/` |

## Standing decisions a cold agent must not re-litigate

ONE registry, TWO projections — never a parallel OpenAI-wire registry (D48) · the recurse loop is
`domain/chat`'s; `domain/tool-use` never loops (D48; the SDK loops on the agent-sdk path, D47) ·
`tool` is a WIRE history role, never a `MESSAGE_ROLES` member (D48/D32 — the committed doc §2's
three reasons) · tool exchanges persist on the VARIANT (`message_variants.toolCalls`), never as a
message slot row (D37/D48) · structured output is a separate `responseFormat` axis, never riding
`tool_choice` (D48; Anthropic's forced-tool realization is a translator detail) · execution is
server-side in the domain registry, never the browser (the ST anti-pattern) · `tool_choice` is a
first-class union, never hardwired `"auto"` · crew members get NO tools (D59, chat-crew-design/05
§b) · the 26 rpg tools (23 overworld + 3 encounter) are rpg-design/05 §3's vocabulary — ONE vocabulary, cited not restated ·
game chats REQUIRE tool-capable models until the Tier-3b textual-tool-call polyfill ships
(rpg-design/09 §+ — the polyfill is backend-internal, invisible to this domain).
