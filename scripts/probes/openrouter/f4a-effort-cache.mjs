// F4a — does changing `reasoning: {effort}` bust the OpenRouter prompt cache?
//
// Anthropic documents that the resolved effort value is rendered INTO the prompt, so changing it moves
// cached bytes. We send effort through OpenRouter's OpenAI-compat shim, so whether that holds here is
// unverified — and it decides whether per-turn effort variation (a preset knob today) is merely
// inadvisable or actively ruinous.
//
// One variable moves: the effort string. No tools, byte-identical system prefix + user message
// throughout, so nothing else can explain a miss.
//
//   1 prime-low     — first sight of the prefix at effort low   -> expect write
//   2 replay-low     — identical                                 -> CONTROL: expect cached > 0
//   3 switch-high    — same prefix, effort high                  -> the measurement
//   4 replay-high    — identical to arm 3                        -> CONTROL for the high prefix
//   5 back-to-low    — same as arms 1-2                          -> does the low entry SURVIVE the switch?
//
// Arm 5 separates the two possible worlds: per-effort cache ENTRIES (arm 5 hits, cost is one extra write
// per distinct effort) vs invalidation (arm 5 misses, every effort flip re-bills the whole prefix).

import { OR_MODEL, filler, jsonl, orCall, printTable, readEnvKey } from "./_kit.mjs";

export const id = "f4a";
export const title = "does an `effort` change bust the OR prompt cache";

export async function run() {
  const key = readEnvKey("OPENROUTER_API_KEY");
  const out = jsonl(id);
  const nonce = `f4a-${Date.now()}`;
  const system = `You are a terse assistant answering questions about a fictional ledger.\n\n## LEDGER (stable prefix)\n${filler(nonce, 200)}`;
  const user = "Name one toll recorded in the ledger. One short sentence.";

  const body = (effort) => ({
    model: OR_MODEL,
    max_tokens: 64,
    reasoning: { effort },
    messages: [
      { role: "system", content: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] },
      { role: "user", content: user },
    ],
  });

  const arms = [
    ["1-prime-low", "low"],
    ["2-replay-low", "low"],
    ["3-switch-high", "high"],
    ["4-replay-high", "high"],
    ["5-back-to-low", "low"],
  ];

  const rows = [];
  for (const [arm, effort] of arms) {
    const result = await orCall(body(effort), key);
    const row = { kind: "arm", probe: id, nonce, arm, effort, status: result.status, ...result.usage, error: result.error, ms: result.ms };
    out.append(row);
    rows.push(row);
  }

  const [, replayLow, switchHigh, replayHigh, backToLow] = rows;
  const controlCaches = (replayLow.cachedTokens ?? 0) > 0;
  const busts = controlCaches && (switchHigh.cachedTokens ?? 0) === 0;
  const verdict = {
    kind: "verdict",
    probe: id,
    nonce,
    at: new Date().toISOString(),
    controlPrefixCaches: controlCaches,
    cachedOnEffortSwitch: switchHigh.cachedTokens,
    highPrefixCachesOnItsOwn: (replayHigh.cachedTokens ?? 0) > 0,
    lowEntrySurvivesTheSwitch: (backToLow.cachedTokens ?? 0) > 0,
    busts,
  };
  out.append(verdict);
  printTable(rows.map(({ kind: _k, probe: _p, nonce: _n, error: _e, ...rest }) => rest));
  console.log(
    `F4a: control caches=${controlCaches} · cached on effort switch=${switchHigh.cachedTokens} · low entry survives=${verdict.lowEntrySurvivesTheSwitch} · verdict=${busts ? "EFFORT CHANGE MISSES THE CACHE" : "effort is not part of the cache key"}`,
  );
  return verdict;
}
