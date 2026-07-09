---
kind: spec
status: active
updated: 2026-07-03
---

# 05 — Open-Question Resolutions, Build Chunks, Test Plans, Review Flags

> **Status: COMMITTED (D48) — prescriptive design; the ledger D-entry, then
> [`tool-use.md`](../tool-use.md), win on any conflict.**

---

## 1. The committed doc's §8 open questions — every one closed or leaned

| §8 Q | Verdict | Where argued |
|---|---|---|
| Q1 — leaf vs chat subsystem | **DECIDED: its own leaf.** Settled by the committed doc's own structure (`domain/tool-use`, an 8-slot leaf — §4) + the Feature-Slot-Map row. The deciding fact is the consumer set: chat, buddy, and (reserved) D46 plugins — a chat subsystem would force buddy to reach INTO chat for its MCP projection, an upward/sideways reach. The recurse loop stays in chat either way (D48). | recorded here |
| Q2 — `ToolDefinition` cross-boundary? | **LEAN: domain-internal** (`domain/tool-use/contract/params.ts`, NOT `@orb/contracts/tool-use`). No committed client surface enumerates tools: the Phase-6 params panel toggles ride `ModelCapability` (capability keys, not tool lists), and chips read `ToolCallRecord` (already cross-boundary in `@orb/contracts/chat`). **Flip criterion:** a committed tool-picker UI (per-chat tool enable/disable list) — then `ToolDefinition` minus `handler` promotes to `@orb/contracts` as a view shape. *(Rejected now: promoting speculatively — a cross-boundary shape with zero client consumers is exactly the over-export AGENTS-2 §8.2 catalogs.)* | 01 §6 |
| Q3 — parallel tool calls | **DECIDED: v1 sequential, in emission order; `capability.tools.parallel` is a model-emission descriptor, not an execution knob.** Flip criterion: a real I/O-bound tool + measured latency. | 02 §7 |
| Q4 — recurse-limit home | **DECIDED: a per-chat setting `toolRecurseLimit`, seed 5, host-editable** (the host funds the loop, D19). | 03 §2.1 |
| Q5 — forced-JSON × streaming; server-side validation? | **DECIDED: streaming stays on; validation is the CALLER's, standardized in `runStructuredAgentTurn` with ONE bounded retry** (the D59-committed crew posture). ST's `returnInvalid` is not ported. | 04 §4–5 |

## 2. Build chunks

Sizing: S ≈ ≤1 day, M ≈ 2–3 days, L ≈ 4+ days of one agent's focused work, tests included
(comprehensive coverage is the bar — AGENTS-1 testing law).

### T1 — the wire seams (contracts pass) — **S/M**

The deferred-blessed D48 shapes, at their D51-corrected homes (02 §1):

- `infra/providers/contract/chat.ts`: `HISTORY_ROLES` tuple; `ChatHistoryMessage.role` →
  `HistoryRole`; `WireTool` + `ToolChoice` + `ResponseFormat`; `tools?`/`toolChoice?` on the
  `chat-completions`+`responses` arms; `responseFormat?` on the wire arms (04 §1 scope note).
- `@orb/contracts/chat`: `tool-call` + `tool-result` `ChatContentPart` members;
  `ToolCallRecord` + `toolCallRecordSchema`; `CHAT_WARNING_CODES` += the two codes (02 §5).
- `@orb/db` `schema/chat.ts`: `toolCalls` → `.$type<readonly ToolCallRecord[]>()` (additive
  retype of the D37 reserved column — no migration; confirmed by D48).

**Dependencies:** none (pure contracts). **This chunk UNBLOCKS the PD-54 loop work — land it
first, coordinated with the live chat P5 agent** (the fields are optional, so the built
translators compile untouched until T2 maps them).
**Checkpoint:** `pnpm check` green; zero translator edits needed; the committed doc §7 checklist
items tick except the emit sites (T2/T4's job — a code without its emit site never lands alone,
so the two `CHAT_WARNING_CODES` members land in the SAME PR as their first emit site if T1 ships
standalone; otherwise T1 merges with T4's gate work).
**Tests:** tuple-mirror tests (`HISTORY_ROLES`, `CHAT_WARNING_CODES` — the D41 pattern);
`toolCallRecordSchema` round-trip incl. `result:null`/`isError`; `ChatContentPart` exhaustive
`satisfies`-guard so every translator dispatch goes red until T2; a type-level test that the
`agent-sdk` arm has NO `tools` field.

### T2 — stream accumulator + translator mapping — **M**

- `openai-compat/stream.ts`: the tool-call delta accumulator (02 §6); `ChatResult.toolCalls?`.
- Per-translator mapping of `tools[]`/`toolChoice`/tool parts/`tool` role +
  `responseFormat` (02 §4, 04 §3) in openrouter chat-completions, responses, custom-byo/vLLM.

**Dependencies:** T1. **Checkpoint:** golden wire-body fixtures per translator; the reducer
assembles a multi-fragment call correctly.
**Tests:** accumulator fixtures — arguments split mid-token across deltas, multiple calls
interleaved by `index`, missing-id latch, terminal `finishReason:"tool"` normalization (pins the
landed `FINISH_REASON_MAP`); per-translator golden bodies for: tools attached, toolChoice
variants (all four arms of the union), a history containing a full tool exchange, responseFormat
per dialect; the byte-identity fixture — request WITHOUT tools byte-equals a pre-T1 golden.

### T3 — the `domain/tool-use` leaf — **M**

The 8 slots (01 §0): register/resolve/execute/project-wire, the capability substrate, the
JSON-schema projection substrate, contract + errors. `project-mcp` is T5 (its dependency is the
D47 factory).

**Dependencies:** T1 (contracts). Independent of T2/T4 — buildable in parallel with the chat
work (disjoint file sets, the dispatch law).
**Checkpoint:** the service passes its contract suite with a synthetic registrant; dep-cruiser
shows zero domain→domain edges.
**Tests:** collision → `ToolNameCollisionError`; resolve unknown-name → throw vs execute
unknown-name → errors-as-data (the 01 §4/§5 split, both pinned); zod-parse failure →
errors-as-data carrying issue text; handler throw → errors-as-data, batch continues;
capability denial (`can` throwing `DomainForbiddenError`) → errors-as-data; `null` roster ×
`scope:"chat"` → denial; sequential-order pin (handlers record invocation order; a deliberately
slow first handler still completes first); the ONE-stringify-site pin (`result` always
`JSON.parse`able, incl. string-returning handlers); `projectArgSchema` goldens
(`additionalProperties:false` on nested objects, descriptions survive, deterministic output);
`durationMs` via injected clock (determinism gate).

### T4 — the chat recurse loop + persistence — **L** (chat P5 — the PD-54 work)

The `ChatToolOps` injection seam, attachment from GATHER contributions, the loop (03 §2),
`appendToolExchange` materialization, flush-per-depth persistence, limit/abort semantics, the
`tools_unsupported` gate + emit site, `toolRecurseLimit` setting.

**Dependencies:** T1 + T2 + T3, and the chat P5 engine (`engine/pipeline.ts` exists — this rides
it). **This chunk IS the PD-54 line item the live implementation agent owns** — this doc set
specifies its tool-use-facing contract; the loop internals answer to the D48 entry + chat.md.
**Checkpoint:** PD-54 flips to done; a mocked-model scripted turn drives tools end-to-end.
**Tests:** loop goldens with a scripted mock model (the rpg-design/05 §8 "loop goldens" pattern,
minus rpg): emits N calls → executes → recurses → finishes; limit boundary (limit-th depth
records-unexecuted, `result:null` — 03 §2.2); errors-as-data feedback visible to the recursed
model (the appended tool message carries the error document); abort mid-loop persists completed
records; the byte-identical-without-tools pin (ops `null` vs wired-unattached — 03 §1); the
capability gate: `capability.tools` absent + names attached → no `tools` field + ONE
`tools_unsupported` warning event; `ToolCallRecord[]` persistence shape + read-seam zod parse;
usage aggregation across depths lands one stats row.

### T5 — `project-mcp` + buddy consumption — **S** (Phase 7, with buddy)

The wrapper (02 §3) + buddy's `buddyToolDefinitions()` refactor onto the registry +
`onRecord` persistence into buddy's turn rows.

**Dependencies:** T3 + the D47 `createAgentToolServer` factory (agent-sdk backend — built with
buddy's phase). **Checkpoint:** buddy `ask` runs its tool turn through the ONE registry; the
buddy firewall probe still passes (roleplay turns get `mcpServers:{}`).
**Tests:** the wrapped handler routes through the SAME execute path (spy on execute — gate +
parse + record all fire); record parity (a call via MCP wrapper produces a byte-equal
`ToolCallRecord` to the same call via `executeToolCalls`); collision between a buddy tool and an
rpg tool name is boot-fatal (the compose-time inventory test).

### T6 — the structured-output axis end-to-end — **S** (lands with its first consumer)

`runStructuredAgentTurn` in `@orb/server/kit/agent-payload.ts` (04 §4 — the crew-committed
contract), the `structured_output_unsupported` gate + emit site, `agentTurn`'s `responseFormat?`
(04 §5 note).

**Dependencies:** T1 + T2 (translator mapping). The first consumer is crew CW-chunks or an rpg
workload — whichever builds first pulls this in.
**Checkpoint:** one real member/workload round-trips a zod payload through a live translator
fixture.
**Tests:** retry-once semantics (first response invalid → ONE retry with issues appended →
second invalid → throw); valid-first-try never retries; gate absent → drop + warning + free-text
proceeds; the projection golden shared with T3's (same rule, same fixture).

### T7 — Phase-6 client: the generic tool block + the renderer seam — **S**

The D48 `<details>` tool-invocation block (name, parsed-or-raw args, result document, error
styling, "requested, not run" for `result:null`) + the `TOOL_RENDERERS: toolName → renderer`
registry seam rpg's chips plug into (rpg-design/11 §1).

**Dependencies:** T1 (the DTO) + T4 (something persists records). **Tests:** Playwright CT —
malformed-arguments fallback (03 §4 MAY-NOT #2), isError styling, null-result state, order
preserved; a registered custom renderer overrides the generic block; an unregistered tool falls
back.

### Phase placement (honest)

T1 → NOW/with chat P5 contracts alignment (it unblocks PD-54). T2–T4 → chat P5 (T4 IS PD-54).
T3 → P5-parallel or early P7 — it has no chat dependency; the committed doc's banner ("Phase 7 —
ships with the recurse loop") reads as "the DOMAIN ships when something consumes it": the loop
(P5) consumes it via injection the moment rpg/character tools exist, buddy (P7) is the first
committed registrant. Build T3 when T4 needs the injected ops to be real rather than stubbed —
that is the practical trigger, and it is the T4 builder's call to pull it forward.
T5 → P7 (buddy). T6 → with the first structured consumer. T7 → Phase 6 client pass.

## 3. Review flags

Raised per the hardening rules — each argues AGAINST or AROUND committed text, none is silently
applied anywhere in this set without its argument:

1. **Warning-code home: D48's text vs D51's precedent (02 §5).** D48 (2026-06-28) says infra
   `WARNING_CODES` gains the two codes; D51 (2026-06-29) established that domain-side capability
   drops live in `CHAT_WARNING_CODES` and explicitly kept the infra tuple "the strict
   resolve/runner-emit tuple" — and the landed code followed D51 for `image_dropped`. This design
   follows D51 (the emit sites ARE domain-side). **Ask: a one-line D48 ledger patch** ("the two
   codes land in `CHAT_WARNING_CODES` per D51's domain-side-gate rule") so the ledger and the
   code stop disagreeing.
2. **The committed doc's §1/§6 homes pre-date D51.** §1 item 1 + §6.1 place `ChatContentPart` in
   `infra/providers/contract/chat.ts`; D51 re-homed it to `@orb/contracts/chat` (landed). §6.5's
   sketch shows `image_dropped` inside infra `WARNING_CODES`; it landed in `CHAT_WARNING_CODES`.
   Not re-decided here — 02 §1 lands the same shapes at the landed homes. **Ask: a patch pass on
   `../tool-use.md` §1/§6** when the lead next touches it (this set already carries the
   corrected homes, so nothing blocks).
3. **The committed §4 parenthetical "registry is in-memory per request"** conflicts with
   rpg-design/05 §3's committed "registered once at compose". This design is compose-time /
   process-lifetime (01 §0's argument). **Ask: confirm the parenthetical meant "no DB
   persistence".**
4. **The committed §4 context sketch `{ db, executeHandler, clock }`** — 01 §0 builds
   `{ can, clock }` instead (no tables ⇒ no `db`; executing is the domain's own verb, not an
   injected op; `can` is the injection the gate actually needs). Argued in place; flagged because
   it diverges from the committed sketch's letter while serving its intent.
5. **RESOLVED (2026-07-01, Nate directive) — buddy.md's buddy-LOCAL MCP framing purged doc-wide.**
   buddy.md now reads: `agent/tools.ts` = tool DEFINITIONS + handlers (closed over `(db, userId)`)
   registered into the ONE registry at compose; `ask` resolves its tool set via `project-mcp`
   (02 §3); the firewall = agent-mode attaches only this agent's registered projection, non-agent
   turns attach none (the neo `mcpServers` literals survive as a provenance cite only). Same tools,
   same closures, same firewall — one plumbing.
6. **Landed-state discrepancy in circulating summaries.** At least one task brief in flight
   claims `HISTORY_ROLES`/`ToolCallRecord`/the warning codes/the `toolCalls` retype "landed in
   `1d18f17`". They did NOT — that commit's own message says only the `ModelCapability` gates
   landed and the rest is reserved via ledger + doc ("no dead branches"). Verified against the
   tree 2026-07-01 (README truth table). Any agent building from that summary should re-read the
   README table first.
