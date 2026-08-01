// OR-5 — cache breakpoints are counted in ARRAY OFFSETS, not conversational turns.
//
// Production mechanism (the reason this matters, not a synthetic worry):
//   * `chat/assembly/shape.ts:computeHistoryBreakpoint` computes `cacheBreakpointFromEnd` over CANON rows
//     (no tool rows exist yet at assembly time).
//   * `chat/engine/pipeline.ts:runRecurseLoop` re-sends `{ ...request, history }` with the SAME
//     `cacheBreakpointFromEnd` after appending `toolExchangeMessages` — one assistant row + N tool rows
//     per depth.
//   * `openrouter/runners/chat/chat-completions.ts:placeHistoryCacheBreakpoint` applies that offset to the
//     WIRE array (`len - 1 - offset`).
// So on tool depth 2+ the array grew at the tail while the offset did not: the breakpoint slides FORWARD,
// off the stable conversational boundary and onto bytes generated THIS turn.
//
// One variable moves: the breakpoint index. Identical messages, identical content, identical everything
// else in arms 2-4.
//
//   1 turn1-offset1                 — 5-row history, offset 1 -> idx 3 (the stable boundary). Primes.
//   2 depth2-stale-offset1          — 7-row history (a tool exchange appended), offset UNCHANGED -> idx 5,
//                                     the assistant tool-call row generated this turn. What we ship today.
//   3 depth2-corrected-offset3      — same 7 rows, offset 1 + fanout(2) = 3 -> idx 3, back on the boundary.
//   4 depth2-breakpoint-on-tool-row — offset 0 -> idx 6, a `role:"tool"` message. Does the wire take it?
//
// Evidence: cached_tokens (read) AND cache_write_tokens (the waste). Arm 2's write is the per-depth
// re-bill of a prefix that can never be read again; arm 3 should write ~nothing.

import { OR_MODEL, filler, jsonl, orCall, printTable, readEnvKey } from "./_kit.mjs";

export const id = "or5";
export const title = "cache breakpoints count array offsets, not conversational turns";

const withCache = (message) => ({ ...message, content: [{ type: "text", text: typeof message.content === "string" ? message.content : "", cache_control: { type: "ephemeral" } }] });

export async function run() {
  const key = readEnvKey("OPENROUTER_API_KEY");
  const out = jsonl(id);
  const nonce = `or5-${Date.now()}`;

  const system = "You are the game master of an immersive tabletop role-play. Keep replies to one sentence.";
  // Conversational canon: u1 a1 u2 a2 u3 — the assistant rows carry the bulk so the prefix clears the
  // 1024-token cache floor without a system-block breakpoint (which would mask the history breakpoint).
  const canon = [
    { role: "user", content: "Describe the chapel.\n" },
    { role: "assistant", content: `The chapel is cold and salt-stained.\n${filler(`${nonce}-a1`, 25)}` },
    { role: "user", content: "I search the reliquary.\n" },
    { role: "assistant", content: `You find a vial of sanctified oil.\n${filler(`${nonce}-a2`, 25)}` },
    { role: "user", content: "I cauterize the wound with the hot iron." },
  ];
  // What `runRecurseLoop` appends before the depth-2 request: the assistant's tool-call row + one tool row.
  const toolExchange = [
    {
      role: "assistant",
      content: "The iron hisses against your skin.",
      tool_calls: [{ id: "call_1", type: "function", function: { name: "remove_condition", arguments: '{"target":"player","condition":"Bleeding"}' } }],
    },
    { role: "tool", tool_call_id: "call_1", content: "ok" },
  ];
  const tools = [
    {
      type: "function",
      function: {
        name: "remove_condition",
        description: "Remove a condition from a character.",
        parameters: { type: "object", properties: { target: { type: "string" }, condition: { type: "string" } }, required: ["target", "condition"] },
      },
    },
  ];

  // Mirrors `placeHistoryCacheBreakpoint`: idx = len - 1 - offset, over the HISTORY array (system excluded).
  const place = (history, offsetFromEnd) => {
    const idx = history.length - 1 - offsetFromEnd;
    return history.map((message, i) => (i === idx ? withCache(message) : message));
  };

  const arms = [
    ["1-turn1-offset1", canon, 1],
    ["2-depth2-stale-offset1", [...canon, ...toolExchange], 1],
    ["3-depth2-corrected-offset3", [...canon, ...toolExchange], 3],
    ["4-depth2-breakpoint-on-tool-row", [...canon, ...toolExchange], 0],
  ];

  const rows = [];
  for (const [arm, history, offset] of arms) {
    const placed = place(history, offset);
    const result = await orCall(
      {
        model: OR_MODEL,
        max_tokens: 48,
        messages: [{ role: "system", content: system }, ...placed],
        tools,
        tool_choice: "none",
      },
      key,
    );
    const row = {
      kind: "arm",
      probe: id,
      nonce,
      arm,
      historyLen: history.length,
      offsetFromEnd: offset,
      breakpointIdx: history.length - 1 - offset,
      breakpointRole: history[history.length - 1 - offset]?.role ?? null,
      status: result.status,
      ...result.usage,
      error: result.error,
      ms: result.ms,
    };
    out.append(row);
    rows.push(row);
  }

  const [prime, stale, corrected, onToolRow] = rows;
  const verdict = {
    kind: "verdict",
    probe: id,
    nonce,
    at: new Date().toISOString(),
    primeWrote: prime.cacheWriteTokens,
    staleOffsetLandsOn: stale.breakpointRole,
    staleCached: stale.cachedTokens,
    staleWrote: stale.cacheWriteTokens,
    correctedCached: corrected.cachedTokens,
    correctedWrote: corrected.cacheWriteTokens,
    wastedWriteTokensPerDepth: (stale.cacheWriteTokens ?? 0) - (corrected.cacheWriteTokens ?? 0),
    toolRowBreakpointStatus: onToolRow.status,
    toolRowBreakpointWrote: onToolRow.cacheWriteTokens,
    underCaches: (stale.cacheWriteTokens ?? 0) > (corrected.cacheWriteTokens ?? 0),
  };
  out.append(verdict);
  printTable(rows.map(({ kind: _k, probe: _p, nonce: _n, error: _e, ...rest }) => rest));
  console.log(
    `OR-5: stale offset lands on role=${verdict.staleOffsetLandsOn} · write stale=${verdict.staleWrote} vs corrected=${verdict.correctedWrote} · wasted/depth=${verdict.wastedWriteTokensPerDepth} tokens · tool-row breakpoint HTTP ${verdict.toolRowBreakpointStatus}`,
  );
  return verdict;
}
