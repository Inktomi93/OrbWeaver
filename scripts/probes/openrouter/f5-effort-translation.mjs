// F5 — how does OpenRouter translate `reasoning:{effort}`, and is native thinking depth reachable at all
// on this wire?
//
// Prior measurement (openrouter-provider-findings §6): OR delivers 3-6x less thinking than the native
// Messages API at the same nominal effort; OR's `high` thinks less than native's `medium`. That scoped
// every effort-based conclusion, but left the actionable question open: is the cap a TRANSLATION artifact
// we can route around, or a ceiling? Two candidate levers, both measured here:
//
//   (a) does OR derive a thinking budget from `max_tokens`?  -> same effort, max_tokens 4k vs 16k
//   (b) does OR's explicit `reasoning:{max_tokens:N}` form reach deeper than `effort`? -> N = 8000
//
// against the native ceiling (`output_config.effort` high/max) on the SAME messages + SAME tools.
// Signal: OR `usage.completion_tokens_details.reasoning_tokens` vs native
// `usage.output_tokens_details.thinking_tokens`. Everything but the named knob is held constant.
//
// If neither lever reaches native depth, deliberation depth is capped BY THE WIRE — which re-opens the
// Anthropic-skin / native-migration question that §7a of the rpg spike dismissed.

import { NATIVE_MODEL, OR_MODEL, jsonl, orCall, printTable, readEnvKey } from "./_kit.mjs";

export const id = "f5";
export const title = "OR effort translation / native-depth reachability";

const SYSTEM = "You are the game master of an immersive tabletop role-play. Narrate vividly in second person, then keep tracked state in sync using the tools.";

// Deliberately reasoning-heavy: several interacting state changes to work out, so a working effort ladder
// has something to spend extra thinking on.
const USER = `## CURRENT STATE
player — HP 22/30 · Stamina 6/14 · Mana 3/12
  conditions: Bleeding (-1), Exhausted (-1), Blessed (+2)
  items: Worn Shortsword, Vial of Sanctified Oil, Traveler's Cloak
  wallet: 40 gold
NPCs present: Sister Vesna (ally, trust 40), Corvin Ashe (hostile)
Quest "Reach the Vault of Ash": objectives — [Find the road north] [Enter the vault]
Suspicion meter: 35/100

## LATEST BEAT
I cauterize the wound with the hot iron — the bleeding stops but it costs me. I drink the stamina
draught, hand Vesna the Vial of Sanctified Oil as payment for the road north, and she tells me the
vault road at last. Corvin, seeing the exchange, backs out of the chapel entirely. The blessing fades
as the last of its light goes out of my blade.`;

const TOOLS = [
  { name: "set_hp", description: "Set a character's HP.", parameters: { type: "object", properties: { target: { type: "string" }, hp: { type: "number" } }, required: ["target", "hp"] } },
  { name: "adjust_meter", description: "Adjust a numeric meter.", parameters: { type: "object", properties: { meter: { type: "string" }, delta: { type: "number" } }, required: ["meter", "delta"] } },
  { name: "remove_condition", description: "Remove a condition from a character.", parameters: { type: "object", properties: { target: { type: "string" }, condition: { type: "string" } }, required: ["target", "condition"] } },
  { name: "transfer_item", description: "Move an item between holders.", parameters: { type: "object", properties: { item: { type: "string" }, from: { type: "string" }, to: { type: "string" } }, required: ["item", "from", "to"] } },
];

const OR_TOOLS = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
const NATIVE_TOOLS = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

async function nativeCall(key, outputConfig, maxTokens) {
  const started = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: NATIVE_MODEL,
      max_tokens: maxTokens,
      system: SYSTEM,
      messages: [{ role: "user", content: USER }],
      tools: NATIVE_TOOLS,
      output_config: outputConfig,
    }),
  });
  const json = await response.json();
  return {
    status: response.status,
    ms: Date.now() - started,
    thinking: json?.usage?.output_tokens_details?.thinking_tokens ?? null,
    outputTokens: json?.usage?.output_tokens ?? null,
    toolCalls: Array.isArray(json?.content) ? json.content.filter((b) => b.type === "tool_use").length : 0,
    error: json?.error ? JSON.stringify(json.error).slice(0, 400) : null,
  };
}

export async function run() {
  const orKey = readEnvKey("OPENROUTER_API_KEY");
  const nativeKey = readEnvKey("ANTHROPIC_API_KEY");
  const out = jsonl(id);
  const rows = [];

  const orArms = [
    ["or-effort-low-mt4000", { effort: "low" }, 4000],
    ["or-effort-high-mt4000", { effort: "high" }, 4000],
    ["or-effort-high-mt16000", { effort: "high" }, 16000],
    ["or-reasoning-maxtokens-8000", { max_tokens: 8000 }, 16000],
  ];
  for (const [arm, reasoning, maxTokens] of orArms) {
    const result = await orCall(
      {
        model: OR_MODEL,
        max_tokens: maxTokens,
        reasoning,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: USER },
        ],
        tools: OR_TOOLS,
        tool_choice: "auto",
      },
      orKey,
    );
    const row = {
      kind: "arm",
      probe: id,
      wire: "openrouter",
      arm,
      knob: JSON.stringify(reasoning),
      maxTokens,
      status: result.status,
      thinking: result.usage.reasoningTokens,
      outputTokens: result.usage.completionTokens,
      toolCalls: (result.message?.tool_calls ?? []).length,
      cost: result.usage.cost,
      error: result.error,
      ms: result.ms,
    };
    out.append(row);
    rows.push(row);
  }

  if (nativeKey.length > 0) {
    for (const [arm, outputConfig] of [
      ["native-effort-high", { effort: "high" }],
      ["native-effort-max", { effort: "max" }],
    ]) {
      const result = await nativeCall(nativeKey, outputConfig, 16000);
      const row = {
        kind: "arm",
        probe: id,
        wire: "native",
        arm,
        knob: JSON.stringify(outputConfig),
        maxTokens: 16000,
        status: result.status,
        thinking: result.thinking,
        outputTokens: result.outputTokens,
        toolCalls: result.toolCalls,
        cost: null,
        error: result.error,
        ms: result.ms,
      };
      out.append(row);
      rows.push(row);
    }
  }

  const think = (arm) => rows.find((r) => r.arm === arm)?.thinking ?? null;
  const orHigh4k = think("or-effort-high-mt4000");
  const orHigh16k = think("or-effort-high-mt16000");
  const orExplicit = think("or-reasoning-maxtokens-8000");
  const nativeCeiling = Math.max(think("native-effort-high") ?? 0, think("native-effort-max") ?? 0);
  const orBest = Math.max(orHigh4k ?? 0, orHigh16k ?? 0, orExplicit ?? 0);
  const verdict = {
    kind: "verdict",
    probe: id,
    at: new Date().toISOString(),
    orEffortHighAt4k: orHigh4k,
    orEffortHighAt16k: orHigh16k,
    budgetScalesWithMaxTokens: orHigh4k !== null && orHigh16k !== null ? orHigh16k > orHigh4k * 1.5 : null,
    orExplicitReasoningMaxTokens: orExplicit,
    explicitBeatsEffort: orExplicit !== null && orHigh16k !== null ? orExplicit > orHigh16k * 1.5 : null,
    nativeCeiling: nativeCeiling > 0 ? nativeCeiling : null,
    orBest,
    nativeDepthReachable: nativeCeiling > 0 ? orBest >= nativeCeiling * 0.8 : null,
  };
  out.append(verdict);
  printTable(rows.map(({ kind: _k, probe: _p, error: _e, ...rest }) => rest));
  console.log(`F5: OR best thinking=${orBest} · native ceiling=${verdict.nativeCeiling} · native depth reachable through OR=${verdict.nativeDepthReachable}`);
  return verdict;
}
