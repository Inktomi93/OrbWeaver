// Is OpenRouter's `reasoning:{effort}` actually driving Anthropic's effort ladder?
//
// Suspicion: on our workload the OR ladder produced 53 / 57-72 / 64-145 reasoning tokens for
// low / medium / high — essentially FLAT. The docs describe effort as a real behavioral lever
// ("at higher effort levels Claude thinks on most requests and at greater length"), and Sonnet 5
// supports low..max. A flat curve suggests the knob isn't reaching the model.
//
// Test: identical messages + identical tools, once through the NATIVE Messages API
// (`output_config.effort`, the documented parameter) and once through OpenRouter
// (`reasoning:{effort}`, the OpenAI-compat shim), across the full ladder. Compare thinking tokens.
//   native  -> usage.output_tokens_details.thinking_tokens
//   OR      -> usage.completion_tokens_details.reasoning_tokens
//
// If native spreads and OR stays flat, OR is under-driving effort and every effort-based conclusion
// in the spike is measuring something other than what it claims.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

// Raw OpenRouter chat-completions wire (snake_case; the OR arm hits the HTTP endpoint directly).
interface OrResp {
  choices?: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
  usage?: { cost?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  error?: unknown;
}
interface OrToolTemplate {
  tools: Array<{ function: { name: string; description: string; parameters: unknown } }>;
}

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ENV = fs.readFileSync("/home/inktomi/inktomi-stack/development/orbweaver/.env", "utf8").split(/\r?\n/);
const readEnv = (k: string): string => {
  let v = (ENV.find((l) => l.startsWith(`${k}=`)) || "").slice(k.length + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
};
const OR_KEY = readEnv("OPENROUTER_API_KEY");
const anthropic = new Anthropic({ apiKey: readEnv("ANTHROPIC_API_KEY") });

// Real tools, but converted to native shape for the Anthropic call.
const ORT = (JSON.parse(fs.readFileSync(path.join(DIR, "real-cheap-toolround.json"), "utf8")) as OrToolTemplate).tools;
const NATIVE_TOOLS = ORT.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));

const SYSTEM = "You are the game master of an immersive tabletop role-play. Narrate vividly in second person, then keep tracked state in sync using the tools.";
// Deliberately reasoning-heavy: several interacting state changes to work out, so a working effort
// ladder has something to spend more thinking on at higher rungs.
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

const LEVELS = ["low", "medium", "high", "xhigh", "max"];
const rows: Array<Record<string, unknown>> = [];

async function native(effort: string): Promise<number> {
  const t0 = Date.now();
  try {
    // `output_config` is a beta param not in the SDK 0.106 create types; the wire accepts it.
    const r = await anthropic.messages.create({
      model: "claude-sonnet-5", max_tokens: 8000, system: SYSTEM,
      messages: [{ role: "user", content: USER }],
      tools: NATIVE_TOOLS, output_config: { effort },
    } as Anthropic.Messages.MessageCreateParamsNonStreaming);
    const think = r.usage.output_tokens_details?.thinking_tokens ?? 0;
    const calls = r.content.filter((b) => b.type === "tool_use").length;
    const cost = (r.usage.input_tokens * 2 + r.usage.output_tokens * 10) / 1e6;
    rows.push({ wire: "native", effort, thinking: think, output: r.usage.output_tokens, calls, cost: +cost.toFixed(5) });
  } catch (e) {
    rows.push({ wire: "native", effort, thinking: "ERR", output: String(e instanceof Error ? e.message : e).slice(0, 60), calls: 0, cost: 0 });
  }
  return Date.now() - t0;
}

async function or_(effort: string) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OR_KEY}` },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-5", max_tokens: 8000, stream: false,
      usage: { include: true }, provider: { order: ["Anthropic"], allow_fallbacks: false },
      reasoning: { effort },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: USER }],
      tools: ORT, tool_choice: "auto",
    }),
  });
  const j = (await r.json()) as OrResp;
  if (!j.choices) { rows.push({ wire: "openrouter", effort, thinking: "ERR", output: JSON.stringify(j.error ?? {}).slice(0, 60), calls: 0, cost: 0 }); return; }
  const u = j.usage ?? {};
  rows.push({
    wire: "openrouter", effort,
    thinking: u.completion_tokens_details?.reasoning_tokens ?? 0,
    // biome-ignore lint/style/noNonNullAssertion: a 2xx OpenRouter response with `choices` always carries choices[0].
    output: u.completion_tokens, calls: (j.choices[0]!.message.tool_calls ?? []).length,
    cost: +(u.cost ?? 0).toFixed(5),
  });
}

console.log("\n=== effort ladder: NATIVE output_config.effort vs OPENROUTER reasoning.effort ===");
console.log("    identical messages + tools · claude-sonnet-5 · thinking tokens are the signal\n");
for (const e of LEVELS) { await native(e); await or_(e); }

console.table(rows);
const spread = (w: string) => {
  const v = rows.filter((r) => r["wire"] === w && typeof r["thinking"] === "number").map((r) => r["thinking"] as number);
  return v.length ? `${Math.min(...v)} .. ${Math.max(...v)}  (${(Math.max(...v) / Math.max(1, Math.min(...v))).toFixed(1)}x)` : "n/a";
};
console.log(`\nthinking-token spread across the ladder:`);
console.log(`  native     : ${spread("native")}`);
console.log(`  openrouter : ${spread("openrouter")}`);
console.log(`\ntotal $${rows.reduce((a, r) => a + (Number(r["cost"]) || 0), 0).toFixed(4)}\n`);
