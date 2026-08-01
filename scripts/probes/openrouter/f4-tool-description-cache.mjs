// F4 — do enriched tool descriptions break the prompt-cache PREFIX?
//
// The rpg spike ships enriched ("when to use + example") tool descriptions. They cost input tokens on
// every turn, which is trivial IF the prefix still caches. On the Anthropic wire the cached prefix is
// ordered tools -> system -> messages, so ANY tool-description edit sits UPSTREAM of the system
// breakpoint and should invalidate everything. Unverified through OpenRouter's OpenAI-compat shim,
// where `tools` is a sibling top-level field rather than part of the prompt.
//
// One variable moves: the description text of ONE tool. Everything else (system block, user message,
// tool names, tool schemas, sampling) is byte-identical across all four arms.
//
//   1 prime-terse       — first sight of the prefix            -> expect write, cached 0
//   2 replay-terse      — byte-identical repeat                -> CONTROL: expect cached > 0
//   3 enriched-tail     — LAST tool's description swapped      -> the measurement
//   4 replay-enriched   — byte-identical repeat of arm 3       -> CONTROL: proves arm 3 was a miss, not a fluke
//
// Also records the prompt_tokens delta terse->enriched (the "cost of enrichment at scale" half of F4).

import { OR_MODEL, filler, jsonl, orCall, printTable, readEnvKey } from "./_kit.mjs";

const TERSE = {
  set_hp: "Set a character's HP.",
  add_condition: "Add a condition to a character.",
  remove_condition: "Remove a condition from a character.",
};

const ENRICHED_TAIL =
  "Remove a condition from a character. Call this the moment the narration retires an affliction — a wound cauterized, a poison purged, a blessing burning out, a fever broken by rest. Do not wait for the player to ask. Example: the text says 'the bleeding stops', so call remove_condition({ target: 'player', condition: 'Bleeding' }). Removing a condition that is not present is a no-op and is safe.";

const tools = (removeDescription) => [
  {
    type: "function",
    function: {
      name: "set_hp",
      description: TERSE.set_hp,
      parameters: { type: "object", properties: { target: { type: "string" }, hp: { type: "number" } }, required: ["target", "hp"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_condition",
      description: TERSE.add_condition,
      parameters: { type: "object", properties: { target: { type: "string" }, condition: { type: "string" } }, required: ["target", "condition"] },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_condition",
      description: removeDescription,
      parameters: { type: "object", properties: { target: { type: "string" }, condition: { type: "string" } }, required: ["target", "condition"] },
    },
  },
];

export const id = "f4";
export const title = "enriched tool descriptions vs the prompt-cache prefix";

export async function run() {
  const key = readEnvKey("OPENROUTER_API_KEY");
  const out = jsonl(id);
  const nonce = `f4-${Date.now()}`;
  const system = `You are the game master of an immersive tabletop role-play. Keep tracked state in sync using the tools.\n\n## WORLD LORE (stable prefix)\n${filler(nonce, 40)}`;
  const user = "The bleeding stops as I cauterize the wound with the hot iron. Narrate one sentence, then sync state.";

  const body = (removeDescription) => ({
    model: OR_MODEL,
    max_tokens: 64,
    messages: [
      { role: "system", content: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] },
      { role: "user", content: user },
    ],
    tools: tools(removeDescription),
    tool_choice: "auto",
  });

  const arms = [
    ["1-prime-terse", TERSE.remove_condition],
    ["2-replay-terse", TERSE.remove_condition],
    ["3-enriched-tail", ENRICHED_TAIL],
    ["4-replay-enriched", ENRICHED_TAIL],
  ];

  const rows = [];
  for (const [arm, description] of arms) {
    const result = await orCall(body(description), key);
    const row = {
      kind: "arm",
      probe: id,
      nonce,
      arm,
      toolDescriptionsBytes: description.length,
      status: result.status,
      ...result.usage,
      error: result.error,
      ms: result.ms,
    };
    out.append(row);
    rows.push(row);
  }

  const [primeTerse, replayTerse, enriched, replayEnriched] = rows;
  const prefixCaches = (replayTerse.cachedTokens ?? 0) > 0;
  const enrichedRead = enriched.cachedTokens ?? 0;
  const verdict = {
    kind: "verdict",
    probe: id,
    nonce,
    at: new Date().toISOString(),
    controlPrefixCaches: prefixCaches,
    cachedOnDescriptionChange: enrichedRead,
    cachedOnControlReplay: replayTerse.cachedTokens,
    enrichedReplayCaches: (replayEnriched.cachedTokens ?? 0) > 0,
    promptTokenDeltaTerseToEnriched: (enriched.promptTokens ?? 0) - (primeTerse.promptTokens ?? 0),
    busts: prefixCaches && enrichedRead === 0,
  };
  out.append(verdict);
  printTable(rows.map(({ kind: _k, probe: _p, nonce: _n, error: _e, ...rest }) => rest));
  console.log(
    `F4: control caches=${prefixCaches} · cached_tokens on a tool-description change=${enrichedRead} · verdict=${verdict.busts ? "BUSTS THE WHOLE PREFIX" : "prefix survives"} · +${verdict.promptTokenDeltaTerseToEnriched} prompt tokens for the enriched arm`,
  );
  return verdict;
}
