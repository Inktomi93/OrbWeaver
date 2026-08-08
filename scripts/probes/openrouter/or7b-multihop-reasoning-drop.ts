// OR-7b — is DROPPING reasoning still safe on a MULTI-HOP tool chain?
//
// OR-7 established the shapes on a SINGLE trivial hop: drop 200, verbatim-signed 200, unsigned 400, ST
// `reasoning.encrypted` 200. The deferral ruling (keep dropping) rests on that single hop, and a single hop
// is the case least likely to expose a continuity loss — the model has nothing to have forgotten yet.
//
// This probe re-asks it at the shape the ruling is actually about: a 2-3 hop chain where each replayed
// assistant turn arrives WITHOUT its thinking block, and hop N's correctness depends on a fact the model
// established at hop 1. Continuity is measured, not asserted: hop 1 is told a secret ONLY inside the
// reasoning-bearing turn's own tool arguments, and the final hop is asked to use it.
//
// PROBE AND RECORD ONLY — no product code rides on this. The finding-7 deferral stands unless an arm shows
// a real degradation (a non-200, or the chain losing a fact it had).
//
//   1 chain-drop-hop1 / 2 / 3  — the shipped posture: every replayed assistant turn carries content +
//                                tool_calls and NO `reasoning_details`. Status + reasoning_tokens + cost per
//                                hop, plus whether the final answer still carries hop 1's established fact.
//   4 unsigned-replay          — the SAME chain, but hop 3 replays hop 1's reasoning with `signature` deleted.
//                                Re-confirmation of the hard 400.
//   5 st-encrypted-replay      — the SAME chain, hop 3 replays ST's rebuilt `reasoning.encrypted` + `data`.
//                                Re-confirmation that the cheap shape is accepted.

import { type ArmRowBase, OR_MODEL, type OrMessage, type OrRequestMessage, jsonl, orCall, printTable, readEnvKey } from "./_kit.ts";

export const id = "or7b";
export const title = "multi-hop reasoning drop — is the deferral premise still true past one hop?";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_ward_sigil",
      description: "Read the sigil carved into a ward stone. Returns the sigil's rune word.",
      parameters: { type: "object", properties: { stone: { type: "string" } }, required: ["stone"] },
    },
  },
  {
    type: "function",
    function: {
      name: "test_rune",
      description: "Speak a rune word at a door and report whether it opened.",
      parameters: { type: "object", properties: { rune: { type: "string" } }, required: ["rune"] },
    },
  },
];

const SYSTEM = "You are the game master of an immersive tabletop role-play. Use the tools when the fiction needs a fact. Keep prose to one sentence.";
// The arithmetic preamble is load-bearing, not scenery: a beat the model can answer by firing tools produces
// ZERO thinking on this wire (measured — the first run of this probe captured `reasoning.text` with 0
// reasoning tokens and NO signature, which made the replay arms vacuous and read as a false 200). OR-7's
// proven-thinking framing (explicit multi-step state arithmetic) is reused here to guarantee hop 1 returns a
// SIGNED reasoning block for arms 4-5 to replay.
const USER = `HP 22/30 · conditions: Bleeding (-1), Exhausted (-1), Blessed (+2).
I cauterize the wound with the hot iron — the bleeding stops but it costs me 3 HP — I drink the stamina
draught, and the blessing fades as the last of its light goes out of my blade. Work out my exact remaining HP
and my exact surviving conditions, step by step.
Then: three ward stones ring the sealed door. Read all three sigils, work out which single rune the door
wants, test it, and tell me in one sentence what happened, naming the rune you used.`;

/** The rune only the tool results know — the fact the chain must carry across hops with no reasoning replay.
 *  A nonsense word so the model cannot guess it from priors. */
const SECRET_RUNE = "vhalthenmir";

function toolResultFor(name: string, args: string): string {
  if (name === "read_ward_sigil") {
    const stone = /"stone"\s*:\s*"([^"]*)"/.exec(args)?.[1] ?? "";
    // Only the THIRD stone carries the real rune; the others are decoys, so a correct final answer proves the
    // model kept a fact it learned mid-chain rather than echoing the last thing it saw.
    return stone.toLowerCase().includes("third") || stone.toLowerCase().includes("3")
      ? `The sigil reads: ${SECRET_RUNE}. It is the only stone whose carving is unweathered.`
      : "The sigil is weathered past reading; only a fragment remains.";
  }
  const rune = /"rune"\s*:\s*"([^"]*)"/.exec(args)?.[1] ?? "";
  return rune.toLowerCase().includes(SECRET_RUNE) ? "The door grinds open." : "Nothing happens. The door stays sealed.";
}

/** Re-opens the conversation for the replay arms — Anthropic rejects a history ending on an assistant row. */
const FOLLOW_UP = "I step through the door. Narrate one sentence.";

const MAX_HOPS = 3;

export async function run() {
  const key = readEnvKey("OPENROUTER_API_KEY");
  const out = jsonl(id);
  const nonce = `or7b-${Date.now()}`;
  const rows: ArmRowBase[] = [];

  // ── Arms 1-3: the shipped DROP posture, run as a real recursion loop ────────────────────────────────────
  const messages: OrRequestMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: USER },
  ];
  /** Hop 1's captured reasoning_details, kept for arms 4-5 (they replay it, the chain itself never does). */
  let firstReasoning: OrMessage["reasoning_details"];
  let firstAssistantIndex = -1;
  let finalText = "";
  let hopsRun = 0;

  for (let hop = 1; hop <= MAX_HOPS; hop += 1) {
    const result = await orCall(
      { model: OR_MODEL, max_tokens: 700, reasoning: { effort: "high" }, messages: [...messages], tools: TOOLS, tool_choice: "auto" },
      key,
    );
    const assistant: OrMessage = result.message ?? {};
    const calls = assistant.tool_calls ?? [];
    const row = {
      kind: "arm",
      probe: id,
      nonce,
      arm: `${hop}-chain-drop-hop${hop}`,
      hop,
      status: result.status,
      toolCallCount: calls.length,
      // THE DROP: what we replay carries content + tool_calls and nothing else. `reasoning_details` is
      // captured for the later arms and never sent back on this chain.
      replayedReasoning: false,
      reasoningDetailTypes: (assistant.reasoning_details ?? []).map((d) => d.type).join(","),
      // Without this the replay arms are unfalsifiable: an UNSIGNED detail strips to itself and the ST shape
      // filters to an EMPTY array, so both arms degrade into "drop" and answer 200 for the wrong reason.
      hasSignature: (assistant.reasoning_details ?? []).some((d) => typeof d.signature === "string" && d.signature.length > 0),
      ...result.usage,
      error: result.error,
      ms: result.ms,
    };
    out.append(row);
    rows.push(row);
    hopsRun = hop;

    if (result.status !== 200) {
      break;
    }
    if (hop === 1) {
      firstReasoning = assistant.reasoning_details;
      firstAssistantIndex = messages.length;
    }
    messages.push({ role: "assistant", content: assistant.content ?? "", tool_calls: calls.length > 0 ? assistant.tool_calls : undefined });
    if (calls.length === 0) {
      finalText = assistant.content ?? "";
      break;
    }
    for (const call of calls) {
      messages.push({ role: "tool", tool_call_id: call.id, content: toolResultFor(call.function?.name ?? "", call.function?.arguments ?? "") });
    }
  }

  // The continuity signal: did the chain still NAME the rune only a mid-chain tool result ever revealed?
  const carriedTheFact = finalText.toLowerCase().includes(SECRET_RUNE);

  // ── Arms 4-7: replay shapes × SPLICE POSITION ──────────────────────────────────────────────────────────
  // Position is its own variable, and it turned out to be the load-bearing one: OR-7 replayed onto the LAST
  // assistant turn (the row immediately before the tool result + follow-up) and measured a hard 400 on an
  // unsigned block. Splicing the identical unsigned block DEEP in a multi-hop chain measured 200 — so the
  // arms below run BOTH positions with the same two shapes, and the verdict reports them separately.
  const details = firstReasoning ?? [];
  const stripped = details.map(({ signature: _s, ...rest }) => rest);
  const stEncrypted = details
    .filter((d) => typeof d.signature === "string" && d.signature.length > 0)
    .map((d) => ({ type: "reasoning.encrypted", data: d.signature, id: d.id ?? null, format: d.format ?? "anthropic-claude-v1", index: d.index ?? 0 }));
  const lastAssistantIndex = messages.reduce((found, message, i) => (message.role === "assistant" ? i : found), -1);

  const replayArms: Array<[string, OrRequestMessage["reasoning_details"], number]> = [
    ["4-unsigned-replay-deep", stripped, firstAssistantIndex],
    ["5-st-encrypted-replay-deep", stEncrypted, firstAssistantIndex],
    ["6-unsigned-replay-last-assistant", stripped, lastAssistantIndex],
    ["7-st-encrypted-replay-last-assistant", stEncrypted, lastAssistantIndex],
  ];

  const capturedSignature = details.some((d) => typeof d.signature === "string" && d.signature.length > 0);
  for (const [arm, replayed, spliceIndex] of replayArms) {
    // A replay arm with nothing SIGNED to replay is not a measurement — it is the drop arm wearing a label.
    if (!capturedSignature || (replayed ?? []).length === 0 || spliceIndex < 0) {
      const blocked = {
        kind: "arm",
        probe: id,
        nonce,
        arm,
        status: 0,
        blocked: `nothing signed to replay (details=${details.length} signed=${capturedSignature} replayed=${(replayed ?? []).length})`,
        error: null,
        ms: 0,
      };
      out.append(blocked);
      continue;
    }
    // The chain ends on an ASSISTANT row (hop 3 answered without calling a tool). Anthropic refuses that as
    // an unsupported prefill — a 400 that says nothing about signatures — so the replay arms MUST re-open the
    // conversation with a user turn. (Measured the hard way: the first run of this probe 400'd both replay
    // arms on the prefill error and would have read as a false "both shapes rejected".)
    const spliced = [
      ...messages.map((message, i) => (i === spliceIndex ? { ...message, reasoning_details: replayed } : message)),
      { role: "user", content: FOLLOW_UP },
    ];
    const result = await orCall({ model: OR_MODEL, max_tokens: 256, reasoning: { effort: "high" }, messages: spliced, tools: TOOLS, tool_choice: "auto" }, key);
    const row = {
      kind: "arm",
      probe: id,
      nonce,
      arm,
      hop: MAX_HOPS,
      spliceIndex,
      splicePosition: spliceIndex === lastAssistantIndex ? "last-assistant" : "deep",
      status: result.status,
      replayedReasoning: true,
      replayedDetailTypes: (replayed ?? []).map((d) => d.type).join(","),
      ...result.usage,
      error: result.error,
      ms: result.ms,
    };
    out.append(row);
    rows.push(row);
  }

  const byArm = (arm: string): Partial<ArmRowBase> => rows.find((r) => r["arm"] === arm) ?? {};
  const chainRows = rows.filter((r) => typeof r["arm"] === "string" && (r["arm"] as string).includes("chain-drop"));
  const verdict = {
    kind: "verdict",
    probe: id,
    nonce,
    at: new Date().toISOString(),
    hopsRun,
    chainStatuses: chainRows.map((r) => r.status),
    chainReasoningTokens: chainRows.map((r) => r.reasoningTokens),
    chainCost: chainRows.reduce((sum, r) => sum + (r.cost ?? 0), 0),
    finalText,
    // THE DEFERRAL PREMISE: dropping is safe past one hop iff every hop answered 200 AND the chain still
    // carried the fact only a mid-chain tool result revealed.
    dropIsSafeMultiHop: chainRows.every((r) => r.status === 200) && carriedTheFact,
    carriedMidChainFact: carriedTheFact,
    // The replay arms only mean anything if hop 1 came back SIGNED — say so in the verdict rather than
    // letting a vacuous 200 read as "unsigned replay is fine now".
    capturedSignature,
    deepUnsignedStatus: byArm("4-unsigned-replay-deep").status,
    deepUnsignedError: byArm("4-unsigned-replay-deep").error,
    deepStEncryptedStatus: byArm("5-st-encrypted-replay-deep").status,
    lastAssistantUnsignedStatus: byArm("6-unsigned-replay-last-assistant").status,
    lastAssistantUnsignedError: byArm("6-unsigned-replay-last-assistant").error,
    lastAssistantStEncryptedStatus: byArm("7-st-encrypted-replay-last-assistant").status,
    ...(capturedSignature ? {} : { blocked: "hop 1 returned no signed reasoning block — the replay arms did not measure" }),
  };
  out.append(verdict);
  printTable(rows.map(({ kind: _k, probe: _p, nonce: _n, error: _e, ...rest }) => rest));
  console.log(
    `OR-7b: hops=${verdict.hopsRun} statuses=${verdict.chainStatuses.join("/")} · carried the mid-chain fact=${verdict.carriedMidChainFact} · DEEP unsigned=${verdict.deepUnsignedStatus} st-enc=${verdict.deepStEncryptedStatus} · LAST-ASSISTANT unsigned=${verdict.lastAssistantUnsignedStatus} st-enc=${verdict.lastAssistantStEncryptedStatus}`,
  );
  return verdict;
}
