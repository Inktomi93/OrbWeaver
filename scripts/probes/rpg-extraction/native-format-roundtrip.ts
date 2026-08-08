// ARCHIVED 2026-08-02 — pre-R2R3 vocabulary (hpDelta et al., retired by the actor-state reshape); kept as
// historical measurement records; do NOT run against the current contracts — mint fresh corpora instead.
//
// Follow-up to native-wire-probe.mjs. The docs say output_config.format and tools DO compose, with the
// schema applying to the FINAL TEXT TURN after the tool loop resolves:
//   "Claude may call tools first ... then respond with structured JSON matching your format schema."
//
// The earlier probe stopped at stop_reason:"tool_use" and read text.length===0 as "composition broken".
// That conflated "the turn isn't finished" with "the narrative was dropped". This closes the loop: send
// the tool_result back and see whether the schema-constrained text actually arrives on round 2.
//
// Decides whether the doc should say "tools+schema is impossible" (wrong) or "tools+schema needs >=2
// rounds, which the terminal-tool fold never reaches" (the real constraint).

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-sonnet-5";

const TOOLS = [{
  name: "update_party",
  description: "Record changes to an actor's body/condition. hpDelta, addCondition, removeCondition, status.",
  input_schema: {
    type: "object",
    properties: {
      targetRef: { type: "string" },
      hpDelta: { type: "number" },
      removeCondition: { type: "string" },
      status: { type: "string" },
    },
    required: ["targetRef"],
    additionalProperties: false,
  },
}];

const NARRATIVE_FORMAT = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      narrative: { type: "string", description: "The GM prose shown to the player." },
      beat: { type: "string", enum: ["action", "dialogue", "discovery", "combat"] },
    },
    required: ["narrative", "beat"],
    additionalProperties: false,
  },
};

const SYSTEM = "You are the GM of a dark-fantasy RPG. Narrate vividly in second person, then record ALL state that changed using the tools. The player is `player`.\n\n## CURRENT STATE\nplayer — HP 22/30\n  conditions: Bleeding (-1), Exhausted (-1)";
const USER = "I press the cauterizing iron to the wound. The bleeding stops, but it costs me — searing pain, and I nearly black out.";

const price = (u: { input_tokens?: number; output_tokens?: number }) => ((u.input_tokens ?? 0) * 2 + (u.output_tokens ?? 0) * 10) / 1e6;
let spent = 0;

const show = (tag: string, res: Anthropic.Messages.Message) => {
  const text = res.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === "text").map((b) => b.text).join("");
  const tools = res.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
  const cost = price(res.usage);
  spent += cost;
  let schemaOk: boolean | null = null;
  if (text) { try { schemaOk = typeof (JSON.parse(text) as { narrative?: unknown }).narrative === "string"; } catch { schemaOk = false; } }
  console.log(`  ${tag}: stop=${res.stop_reason} text=${text.length} tools=${tools.length} schemaValid=${schemaOk} $${cost.toFixed(5)}`);
  if (tools.length) for (const t of tools) console.log(`      → ${t.name}(${JSON.stringify(t.input).slice(0, 120)})`);
  if (text) console.log(`      text[0:160]: ${text.slice(0, 160).replace(/\n/g, " ")}`);
  return { res, text, tools, schemaOk };
};

console.log(`\n=== tools + output_config.format, TWO ROUNDS (native ${MODEL}) ===\n`);

const messages: Array<{ role: string; content: unknown }> = [{ role: "user", content: USER }];
const common = { model: MODEL, max_tokens: 1500, system: SYSTEM, tools: TOOLS, thinking: { type: "disabled" }, output_config: { effort: "low", format: NARRATIVE_FORMAT } };

console.log("ROUND 1 — the call the earlier probe stopped at:");
// `output_config` is a beta param not in the SDK 0.106 create types; the wire accepts it.
const r1 = show("r1", await client.messages.create({ ...common, messages } as Anthropic.Messages.MessageCreateParamsNonStreaming));

if (r1.tools.length === 0) {
  console.log("\n  (no tool call — nothing to round-trip)");
} else {
  messages.push({ role: "assistant", content: r1.res.content });
  messages.push({
    role: "user",
    content: r1.tools.map((t) => ({ type: "tool_result", tool_use_id: t.id, content: "ok, state updated" })),
  });
  console.log("\nROUND 2 — tool_result fed back; does the schema-constrained narrative arrive?");
  const r2 = show("r2", await client.messages.create({ ...common, messages } as Anthropic.Messages.MessageCreateParamsNonStreaming));

  console.log("\n=== VERDICT ===");
  if (r2.schemaOk) {
    console.log("  COMPOSES — schema-valid narrative arrives on round 2, exactly as documented.");
    console.log("  => 'tools + schema is impossible' is WRONG. The real constraint is that it needs >=2");
    console.log("     rounds, which a TERMINAL-tool fold (R1) never performs.");
  } else {
    console.log(`  Round 2 did NOT yield schema-valid text (text=${r2.text.length}, schemaValid=${r2.schemaOk}).`);
  }
}
console.log(`\ntotal $${spent.toFixed(5)}\n`);
