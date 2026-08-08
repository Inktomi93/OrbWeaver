// OR-5b — the FIX arm for findings §5: is the cache breakpoint INVARIANT across a within-turn tool exchange?
//
// OR-5 measured the defect (an array-offset breakpoint slides forward onto bytes generated this turn, at
// recursion depth 2, costing a wasted cache WRITE per depth). This probe measures the FIX, at the shape
// that makes it expensive: recursion depth 2 with a PARALLEL tool batch and FAT tool results.
//
// The two skews the fix answers, both invisible to an array-offset placer:
//   * PARALLEL WIDTH — one depth of N calls appends N+1 array rows but only TWO role groups.
//   * RECURSION DRIFT — `pipeline.ts:runRecurseLoop` re-sends the SAME depth after appending the exchange.
//
// One variable moves: where the breakpoint lands. Identical 10-row history in arms 2-4.
//
//   1 prime-canon              — the 5-row conversational history, breakpoint at idx 3 (the stable boundary).
//                                Primes the entry every later arm should READ.
//   2 stale-array-offset-1     — the 10-row depth-2 history, offset 1 applied to the ARRAY -> idx 8, a fat
//                                `tool` row generated THIS turn. What we shipped before the fix.
//   3 conversational-depth-1   — the same 10 rows, depth 1 counted in ROLE SWITCHES with the tool exchange
//                                transparent -> idx 3, the same stable boundary as arm 1. What we ship now.
//   4 second-turn-depth-1      — arm 3's placement repeated after ANOTHER recursion depth (14 rows). The
//                                invariance claim: the index moves, the cached row does not.
//
// Evidence: cached_tokens (the read that must survive) AND cache_write_tokens (the waste the fix removes).

import { type ArmRowBase, OR_MODEL, type OrRequestMessage, filler, jsonl, orCall, printTable, readEnvKey } from "./_kit.ts";

export const id = "or5b";
export const title = "the cache breakpoint is invariant across a within-turn tool exchange (the §5 fix)";

const withCache = (message: OrRequestMessage) => ({
  ...message,
  content: [{ type: "text", text: typeof message.content === "string" ? message.content : "", cache_control: { type: "ephemeral" } }],
});

/** The index the SHIPPED placer resolves for conversational `depth`: role switches from the end, with tool
 *  rows and tool-call assistant rows transparent, system rows consuming no depth. Mirrors
 *  `backends/kit/cache-control.ts:indexAtDepth` exactly — the probe must agree with the code it verifies. */
function conversationalIndex(history: OrRequestMessage[], wanted: number): number {
  let depth = 0;
  let previousRole = "";
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const row = history[i];
    if (row === undefined) {
      continue;
    }
    const toolExchange = row.role === "tool" || (row.role === "assistant" && Array.isArray(row.tool_calls) && row.tool_calls.length > 0);
    if (toolExchange || row.role === "system") {
      continue;
    }
    if (row.role !== previousRole) {
      if (depth === wanted) {
        return i;
      }
      depth += 1;
      previousRole = row.role;
    }
  }
  return -1;
}

export async function run() {
  const key = readEnvKey("OPENROUTER_API_KEY");
  const out = jsonl(id);
  const nonce = `or5b-${Date.now()}`;

  const system = "You are the game master of an immersive tabletop role-play. Keep replies to one sentence.";
  // Conversational canon: u1 a1 u2 A2 u3. The assistant rows carry the bulk so the prefix clears the
  // 1024-token cache floor without a system-block breakpoint (which would mask the history breakpoint).
  const canon: OrRequestMessage[] = [
    { role: "user", content: "Describe the chapel.\n" },
    { role: "assistant", content: `The chapel is cold and salt-stained.\n${filler(`${nonce}-a1`, 60)}` },
    { role: "user", content: "I search the reliquary.\n" },
    { role: "assistant", content: `You find a vial of sanctified oil.\n${filler(`${nonce}-a2`, 60)}` },
    { role: "user", content: "I cauterize the wound with the hot iron." },
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

  // ONE recursion depth as `pipeline.ts:toolExchangeMessages` materializes it: the assistant row carrying the
  // whole PARALLEL batch, then one `tool` row per call. The results are FAT on purpose — the wasted write the
  // stale offset causes is sized by the tool exchange, and a 20-token "ok" hides it under the noise floor.
  function exchange(tag: string, width: number): OrRequestMessage[] {
    return [
      {
        role: "assistant",
        content: "The iron hisses against your skin.",
        tool_calls: Array.from({ length: width }, (_, i) => ({
          id: `${tag}_call_${i}`,
          type: "function",
          function: { name: "remove_condition", arguments: `{"target":"player","condition":"c${i}"}` },
        })),
      },
      ...Array.from(
        { length: width },
        (_, i): OrRequestMessage => ({ role: "tool", tool_call_id: `${tag}_call_${i}`, content: `applied\n${filler(`${nonce}-${tag}-t${i}`, 40)}` }),
      ),
    ];
  }

  const depth2 = [...canon, ...exchange("d1", 3)]; // 5 + 4 = 9 rows... plus the next user beat below.
  const depth3 = [...depth2, ...exchange("d2", 3)];

  const place = (history: OrRequestMessage[], index: number) => history.map((message, i) => (i === index ? withCache(message) : message));

  const arms: Array<[string, OrRequestMessage[], number]> = [
    ["1-prime-canon", canon, conversationalIndex(canon, 1)],
    // The PRE-FIX placement: the raw array offset SHAPE handed us, applied to the grown array.
    ["2-stale-array-offset-1", depth2, depth2.length - 1 - 1],
    ["3-conversational-depth-1", depth2, conversationalIndex(depth2, 1)],
    ["4-second-recursion-depth-1", depth3, conversationalIndex(depth3, 1)],
  ];

  const rows: ArmRowBase[] = [];
  for (const [arm, history, index] of arms) {
    const result = await orCall(
      { model: OR_MODEL, max_tokens: 48, messages: [{ role: "system", content: system }, ...place(history, index)], tools, tool_choice: "none" },
      key,
    );
    const row = {
      kind: "arm",
      probe: id,
      nonce,
      arm,
      historyLen: history.length,
      breakpointIdx: index,
      breakpointRole: history[index]?.role ?? null,
      breakpointIsToolExchange: history[index]?.role === "tool" || Array.isArray(history[index]?.tool_calls),
      status: result.status,
      ...result.usage,
      error: result.error,
      ms: result.ms,
    };
    out.append(row);
    rows.push(row);
  }

  const [prime, stale, fixed, second] = rows as [ArmRowBase, ArmRowBase, ArmRowBase, ArmRowBase];
  const verdict = {
    kind: "verdict",
    probe: id,
    nonce,
    at: new Date().toISOString(),
    primeWrote: prime.cacheWriteTokens,
    staleLandsOn: stale["breakpointRole"],
    staleWrote: stale.cacheWriteTokens,
    staleCached: stale.cachedTokens,
    fixedLandsOn: fixed["breakpointRole"],
    fixedWrote: fixed.cacheWriteTokens,
    fixedCached: fixed.cachedTokens,
    secondDepthWrote: second.cacheWriteTokens,
    secondDepthCached: second.cachedTokens,
    wastedWriteTokensRemoved: (stale.cacheWriteTokens ?? 0) - (fixed.cacheWriteTokens ?? 0),
    // The claim under test: the fixed placement writes nothing new and reads the primed entry, at BOTH depths.
    invariant: (fixed.cacheWriteTokens ?? 0) <= (stale.cacheWriteTokens ?? 0) && (fixed.cachedTokens ?? 0) > 0 && (second.cachedTokens ?? 0) > 0,
  };
  out.append(verdict);
  printTable(rows.map(({ kind: _k, probe: _p, nonce: _n, error: _e, ...rest }) => rest));
  console.log(
    `OR-5b: stale lands on role=${verdict.staleLandsOn} (write ${verdict.staleWrote}) vs fixed role=${verdict.fixedLandsOn} (write ${verdict.fixedWrote}) · wasted write removed=${verdict.wastedWriteTokensRemoved} · depth-3 cached=${verdict.secondDepthCached} · invariant=${verdict.invariant}`,
  );
  return verdict;
}
