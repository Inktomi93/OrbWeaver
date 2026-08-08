// ARCHIVED 2026-08-02 — pre-R2R3 vocabulary (hpDelta et al., retired by the actor-state reshape); kept as
// historical measurement records; do NOT run against the current contracts — mint fresh corpora instead.
//
// Does the ANTHROPIC-NATIVE Messages API behave differently from OpenRouter's OpenAI-compat shim?
//
// Two things the OR wire cannot express, both load-bearing for the doc:
//   1. output_config.format + tools TOGETHER. On OR this returned 200 with an EMPTY narrative (doc §2).
//      Native has them as separate top-level fields — if they compose here, §2's "structurally
//      unavailable" is wrong and should be scoped to the OR wire.
//   2. thinking:{type:"adaptive"} — the real interleaved-thinking lever. OR only exposes reasoning:{effort}.
//      Doc §2 rules interleaved out; this checks whether native adaptive changes tool/narrative behavior.
//
// Same GM framing + the same two trimmed rpg tools as the OR composition probe, so results are comparable.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const MODEL = "claude-sonnet-5";

const TOOLS = [
  {
    name: "update_party",
    description:
      "Record changes to an actor's body/condition. hpDelta: damage (negative) or healing (positive). addCondition: a new status effect. removeCondition: when an effect ends. status: a short current-state line.",
    input_schema: {
      type: "object",
      properties: {
        targetRef: { type: "string" },
        hpDelta: { type: "number" },
        addCondition: { type: "object", properties: { name: { type: "string" }, modifier: { type: "number" } }, required: ["name"], additionalProperties: false },
        removeCondition: { type: "string" },
        status: { type: "string" },
      },
      required: ["targetRef"],
      additionalProperties: false,
    },
  },
  {
    name: "add_journal_entry",
    description: "Log a notable beat with the right type + a short title + content.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["location", "npc", "combat", "quest", "item", "event", "note"] },
        title: { type: "string" },
        content: { type: "string" },
      },
      required: ["type", "title", "content"],
      additionalProperties: false,
    },
  },
];

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

const SYSTEM =
  "You are the GM of a dark-fantasy RPG. Narrate vividly in second person, then record ALL state that changed using the tools. The player is `player`.";
// Same beat as the OR probe: a condition ENDS and damage lands, so removeCondition + hpDelta are both due.
const USER =
  "I press the cauterizing iron to the wound. The bleeding stops, but it costs me — searing pain, and I nearly black out.";
const STATE = "\n\n## CURRENT STATE\nplayer — HP 22/30\n  conditions: Bleeding (-1), Exhausted (-1)\n  status: wounded, running on fumes";

// Sonnet 5 pricing (intro rates through 2026-08-31): $2 / $10 per MTok.
const price = (u: { input_tokens?: number; output_tokens?: number }) => ((u.input_tokens ?? 0) * 2 + (u.output_tokens ?? 0) * 10) / 1e6;
let spent = 0;
const rows: Array<Record<string, unknown>> = [];

// The tool inputs the model returns (ToolUseBlock.input is `unknown` in the SDK).
interface PartyToolInput {
  removeCondition?: string;
  hpDelta?: number;
}

async function arm(label: string, params: Record<string, unknown>) {
  const started = Date.now();
  let res: Anthropic.Messages.Message | undefined;
  let err: string | null = null;
  try {
    // `output_config` / adaptive-thinking are beta params not in the SDK 0.106 create types; the wire accepts them.
    res = await client.messages.create({ model: MODEL, max_tokens: 1500, system: SYSTEM + STATE, messages: [{ role: "user", content: USER }], ...params } as Anthropic.Messages.MessageCreateParamsNonStreaming);
  } catch (e) {
    err = (e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)).slice(0, 220);
  }
  const ms = Date.now() - started;

  if (err) {
    rows.push({ label, ok: false, err });
    console.log(`[ERR] ${label.padEnd(40)} ${String(ms + "ms").padEnd(8)} ${err}`);
    console.log();
    return;
  }
  if (!res) return;

  const text = res.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === "text").map((b) => b.text).join("");
  const tools = res.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
  const think = res.content.filter((b) => b.type === "thinking");
  const cost = price(res.usage);
  spent += cost;

  let schemaOk: boolean | null = null;
  if (text) { try { const p = JSON.parse(text) as { narrative?: unknown }; schemaOk = typeof p.narrative === "string"; } catch { schemaOk = false; } }

  const args = tools.map((t) => t.input as PartyToolInput);
  const removed = args.map((a) => a.removeCondition).filter(Boolean);
  const hp = args.map((a) => a.hpDelta).filter((v) => typeof v === "number");

  rows.push({ label, stop: res.stop_reason, text: text.length, tools: tools.length, thinking: think.length, schemaOk, removeCondition: removed.join(",") || "—", hpDelta: hp.join(",") || "—", cost: +cost.toFixed(5) });
  console.log(
    `[ok ] ${label.padEnd(40)} ${String(ms + "ms").padEnd(8)} stop=${String(res.stop_reason).padEnd(10)} ` +
    `text=${String(text.length).padEnd(5)} tools=${tools.length} think=${think.length} schema=${String(schemaOk).padEnd(5)} ` +
    `rmCond=${(removed.join(",") || "—").padEnd(10)} hp=${(hp.join(",") || "—").padEnd(4)} $${cost.toFixed(5)}`
  );
  if (res.usage.output_tokens_details) console.log(`      thinking_tokens=${res.usage.output_tokens_details.thinking_tokens} of ${res.usage.output_tokens} output`);
  for (const t of tools) console.log(`      → ${t.name}(${JSON.stringify(t.input).slice(0, 140)})`);
  if (text) console.log(`      text[0:120]: ${text.slice(0, 120).replace(/\n/g, " ")}`);
  console.log();
}

console.log(`\n=== Anthropic NATIVE (${MODEL}) — the two things the OR wire can't express ===\n`);

// Baseline: tools alone, thinking off. Should mirror the OR winner.
await arm("N1 tools only, thinking disabled", { tools: TOOLS, thinking: { type: "disabled" }, output_config: { effort: "low" } });

// THE COMPOSITION QUESTION — does native keep the narrative where OR silently dropped it?
await arm("N2 tools + output_config.format", { tools: TOOLS, thinking: { type: "disabled" }, output_config: { effort: "low", format: NARRATIVE_FORMAT } });

// Control: schema alone on native.
await arm("N3 output_config.format only", { thinking: { type: "disabled" }, output_config: { effort: "low", format: NARRATIVE_FORMAT } });

// THE INTERLEAVED LEVER — adaptive thinking, unavailable through OR's chat-completions.
await arm("N4 tools + thinking adaptive", { tools: TOOLS, thinking: { type: "adaptive" }, output_config: { effort: "low" } });

// Adaptive + summarized display, to see whether reasoning is actually produced.
await arm("N5 tools + adaptive, summarized", { tools: TOOLS, thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "low" } });

// Does the composition failure change once thinking is on?
await arm("N6 tools + format + adaptive", { tools: TOOLS, thinking: { type: "adaptive" }, output_config: { effort: "low", format: NARRATIVE_FORMAT } });

console.log("=== summary ===");
console.table(rows);
console.log(`total $${spent.toFixed(5)}\n`);
