# 03 — The Recurse Loop (chat-owned), Persistence, and the Client Contract

> **Status: COMMITTED (D48) — prescriptive design; the ledger D-entry, then
> [`domains/tool-use.md`](../../domains/tool-use.md), win on any conflict.**
> **COORDINATION: PD-54 (the loop) is in flight with chat Phase 5.** This doc describes THE loop
> the D48 ledger entry + `chat.md` authorize — the same one the chat implementation builds. It is
> a specification of that loop's contract with tool-use, not a second design; where the chat
> implementation must make a micro-call this doc doesn't fix, the D48 entry + chat.md win.

---

## 1. The seam: chat consumes tool-use by INJECTION

`domain/chat` and `domain/tool-use` never import each other. Chat's `ChatContext` (its explicit
DI interface) gains ONE optional op bundle, typed in chat's own `contract/context.ts` (the
cross-feature-op law: the verb declares the TYPE; entry wires the runtime op):

```ts
// domain/chat/contract/context.ts — the injected tool ops (entry wires them to ToolUseService)
export interface ChatToolOps {
  /** Attach-time resolve (01 §4). Throws ToolNotFoundError on an unknown name (wiring bug). */
  readonly resolveTools: (names: readonly string[]) => ResolvedToolSet;
  /** Registry → WireTool[] (02 §2). */
  readonly toWireTools: (set: ResolvedToolSet) => readonly WireTool[];
  /** The one execute path (01 §5). Never throws per-call; returns records. */
  readonly executeToolCalls: (
    set: ResolvedToolSet,
    calls: readonly ToolCallInput[],
    exec: ToolExecutionContext,
  ) => Promise<readonly ToolCallRecord[]>;
}
// ChatContext gains:  readonly tools: ChatToolOps | null;
```

`null` = tool-use not wired (tests, minimal deploys): GATHER contributions of tool names on a
null op are a compose-time impossibility (whoever wired rpg's gather op also wired tool ops — an
entry-seam invariant, asserted at compose), and a plain chat attaches nothing, so the request
never carries `tools` and `finishReason:"tool"` cannot occur — the loop degenerates to exactly
one `runChatTurn` call. **The byte-identical pin:** with `tools: null` vs wired-but-unattached,
the assembled request is byte-equal (05 §T4; the rpg no-game byte-identity test is the same pin
one level up). *(Rejected: chat importing the tool-use front door — sideways import, the one
constitutional sin; rejected: a mandatory op — every chat test would need a stub for a feature
most turns never touch, violating the rpg "absent op is the no-op" precedent.)*

## 2. The loop (normative pseudocode — expands the committed §5, changes nothing)

```
runTurnWithTools(assembled, attachedNames, exec, settings):
  set    = attachedNames.length ? tools.resolveTools(attachedNames) : null
  req    = set ? { ...assembled, tools: toWireTools(set), toolChoice: {mode:"auto"} } : assembled
  depth  = 0
  records = []                                   // the variant's cumulative ToolCallRecord[]
  loop:
    result = runChatTurn(req)                    // ONE role call; deltas stream to the client throughout
    if result.finishReason != "tool" or set == null: break
    if depth >= settings.toolRecurseLimit:       // seed 5 (§2.1)
      records += asUnexecuted(result.toolCalls)  // result:null, isError:false — recorded, not run (§2.2)
      break
    calls    = result.toolCalls                  // the reducer-assembled ToolCallInput[] (02 §6)
    batch    = await tools.executeToolCalls(set, calls, exec)   // sequential, errors-as-data
    records += batch
    persistVariantToolCalls(variantId, records)  // §3 — flushed per depth, not once at the end
    req      = appendToolExchange(req, batch)    // history += assistant(tool-call parts)
                                                 //          + tool(tool-result parts) per record
    depth += 1
  persist final variant (content, records, finishReason, usage aggregate)
```

The load-bearing rules, each with its WHY:

- **`finishReason:"tool"` is the ONLY pivot** — already normalized by the landed
  `FINISH_REASON_MAP`; the loop never sniffs text. *(Rejected: also recursing on tool-call parts
  with `finishReason:"stop"` — a provider that says stop is done; trust the normalized signal.)*
- **`appendToolExchange` materializes wire messages from the RECORDS** (arguments verbatim,
  result document verbatim) — the model reads exactly what was persisted, so a swipe-replay
  reassembles the identical wire history (provenance = replay, one mechanism). Tool parts exist
  only at this wire seam (02 §1's D51 coherence).
- **Streaming is continuous across depths on the ONE variant**: each recursed `runChatTurn`
  streams deltas into the same assistant variant; text accumulates in arrival order (the model's
  pre-tool-call prose, then post-result narration — ST's model, and exactly what rpg's worked
  sequence shows: "brief tension beat … emits skill_check … recursed model narrates",
  rpg-design/05 §4). *(Rejected: one variant per recursion depth — swipes/variants mean
  ALTERNATIVES (D26), not stages of one generation; N variants per turn breaks the
  swipe-pointer model and the rpg snapshot keying.)*
- **Abort**: `exec.signal` threads into both `runChatTurn` and `executeToolCalls`; an abort
  between depths persists what completed (records already flushed per depth) and terminates the
  turn with the standard abort surface.
- **`usage` aggregates across depths** (one turn = one economics row; each recursion's
  tokens/cost sum into the variant's stats — the stats contract sees one turn, matching the
  "ONE user-visible turn" product shape).

### 2.1 The recurse limit — home DECIDED

**`toolRecurseLimit` is a chat-level setting, seed 5, host-editable** — it rides the same
per-chat settings surface as chat's other turn knobs (not `UserSettings`: in a multi-human room
the loop spends the HOST's money — D19 `runAsUserId` — so the funder tunes it; not per-tool: no
consumer differentiates, and rpg's chains are cross-tool). Mirrors ST's
`tool_call_recurse_limit` default (one-line cite: `RECURSE_LIMIT`, `tool-calling.js:255`).
*(Rejected: hardcoded constant — the committed §5 already says "a chat-setting, not hardcoded";
rejected: per-tool caps — speculative granularity with no requesting consumer; the criterion
that revisits this is a runaway single tool observed in practice.)*

### 2.2 At the limit: pending calls are RECORDED, NOT EXECUTED — decision

When depth hits the limit and the model still wants tools, the loop records the requested calls
as unexecuted (`result: null`, `isError: false` — the DTO's `null` means exactly "not yet
executed") and ends the turn. WHY: executing side effects the model can never narrate is worse
than not executing them — an rpg `tick_clock` that fires without narration desynchronizes the
fiction from the HUD; unexecuted records keep full provenance (the client shows "requested, not
run") and the host can regenerate. *(Rejected: execute-then-stop — silent side effects;
rejected: dropping the calls unrecorded — hides that the limit bit, making "why did it stop?"
undebuggable.)*

### 2.3 Where attachment comes from (recap of the one flow)

GATHER contributions only: today rpg's `gatherTurnContext` returns `tools: readonly string[]`
(rpg-design/05 §1) and chat unions all gather-op contributions into `attachedNames`. Plain chats
contribute nothing. This keeps chat rpg-blind (`no-if(isGame)`) and makes "which tools ride" a
GATHER-phase fact like WI — one pipeline, no side channel.

## 3. Persistence — `message_variants.toolCalls`, the typed seam

```ts
// @orb/contracts/chat (unchanged from the committed §6.4 — restated for self-containment)
export interface ToolCallRecord {
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: string;      // raw model-emitted JSON string (provenance-faithful)
  readonly result: string | null;  // JSON document serialized by execute; null = not executed (§2.2)
  readonly isError: boolean;
  readonly durationMs: number | null; // null when unexecuted
}
// @orb/db schema/chat.ts: toolCalls: text("tool_calls", { mode: "json" }).$type<readonly ToolCallRecord[]>()
```

- **Write path:** ONLY chat persistence (the loop, §2) and buddy's turn persistence (via
  `project-mcp`'s `onRecord`, 02 §3). tool-use itself persists nothing (01 §0).
- **Ordering:** array order = emission/execution order across all depths (depth boundaries are
  NOT marked in v1 — no consumer reads them; reserved-additive as an optional `depth` field if a
  debugging surface ever wants it, criterion: someone asks "which recursion did this").
- **Read seam:** parsed with a zod `toolCallRecordSchema` at the DB read boundary (the
  `parseProviderMetadata` pattern — the generalize-this model AGENTS-2 §8.4 names), never cast.
- **Flush-per-depth** (§2): a crash mid-loop loses at most the in-flight generation, never
  executed side effects' provenance.

## 4. The client contract — what tool chips MAY and MAY NOT rely on

The client's ONLY tool read surface is the persisted `ToolCallRecord[]` on the variant
(rpg-design/11 §4 renders game chips from it; the D48 generic `<details>` block is the fallback
renderer in chat's `TOOL_RENDERERS` seam). The contract, binding both directions:

**MAY rely on (we pin these with contract tests, 05 §T4):**

1. `toolCalls` array order = the order calls were emitted/executed (chips render in-order).
2. `arguments` is the model's raw JSON STRING — chips `JSON.parse` + zod-`safeParse` it through
   their own schemas (rpg: the `@orb/contracts/rpg` tool-result schemas).
3. `result`, when non-null, is ALWAYS a parseable JSON document (execute's one stringify site,
   01 §5.5): the handler's value on success, `{ error: string }` when `isError` is true.
4. `isError` is authoritative for error styling — never inferred from result shape.
5. `result === null` ⇔ recorded-but-unexecuted (§2.2) — render as "requested, not run".
6. `durationMs` non-null ⇔ executed; display-grade only.
7. `toolCallId` is unique within a variant (join key to nothing else client-side).

**MAY NOT (each is a named anti-pattern):**

1. **Parse prose for game/tool markers** — marinara's dead tag parser (rpg-design/11 §4's
   explicit rejection).
2. **`JSON.parse(arguments)` without safeParse-fallback** — the model may emit malformed JSON
   (a parse-failed call is still recorded, 01 §5); a chip that can't parse falls back to the
   generic `<details>` block, never blanks the message.
3. **Derive/replay STATE from records** — records are provenance; live state comes from domain
   reads over their own bus (rpg HUD refetches on `rpg.stream` events — "chips do NOT ride this
   bus; they render from persisted records", rpg-design/11 §3–4). Diffing records to infer
   tracker state is the second explicitly rejected alternative in 11 §4.
4. **Assume a per-call streamed event exists** — there is none in v1 (§5).

## 5. Streamed events — the v1 posture (decision)

**DECISION: NO per-tool-call stream event in v1.** During generation the client sees the normal
delta stream (prose keeps flowing across recursion depths); tool chips appear when the variant's
records land/refresh through the EXISTING message-update surface. A `toolCallPerformed`
`ChatBusEvent` is reserved-additive — pre-adjudicated by the D50 gap audit ("D48 owns the loop
and persists on the variant, so an 'on tool call' trigger is reserved-additive, not pre-Phase-5",
`Core-Legacy-Migration-and-Gaps.md` ST-parity table) — and lands, id-only per D38 discipline,
when its first consumer exists (a D46 Tier-1 "on tool call" automation trigger, or a
mid-generation chip UX if turn-length feedback proves too laggy — those are the flip criteria).

WHY: the durable `chat_events` CHECK is frozen per D50 (widening the union is a real cost, paid
only against a real consumer), the flush-per-depth persistence (§3) already bounds chip latency
to a recursion depth, and rpg — the heaviest tool consumer — explicitly renders chips from
persisted records, not a stream. *(Rejected: a rich streaming tool-event channel now — building
the delta plumbing, replay-ring semantics, and client wiring for a consumer nobody has; the
exact speculative-seam class D48's own "no dead branches" rule bans.)*
