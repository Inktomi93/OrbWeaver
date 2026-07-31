// Does `reasoning: {effort}` actually produce reasoning on OUR workload shape (GM prompt + the 7 real
// tools), and at which rungs? This is the CAUSAL evidence §4a asserted but never measured: run-coverage.mjs
// did not record reasoning_tokens, so "low fixed removeCondition because it deliberated" was inferred from
// the request parameter alone.
//
// Why the shape matters: a toolless puzzle prompt returned reasoning_tokens=0 at every rung including
// xhigh, while run.mjs's tools+GM `+reasoning` arm reported 64-247. Adaptive thinking decides per request,
// so the workload has to match to draw any conclusion.
//
// Sonnet 5 specifics that make this subtle (per the per-model table in the thinking docs):
//   - thinking defaults ON (adaptive); it rejects "enabled" but accepts "disabled"
//   - `display` defaults to "omitted" — thinking blocks come back with EMPTY text
// so a zero here may mean "did not think" OR "thought invisibly". Read the token count, not the text.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const KEY = (() => {
  const line = fs.readFileSync("/home/inktomi/inktomi-stack/development/orbweaver/.env", "utf8")
    .split(/\r?\n/).find((l) => l.startsWith("OPENROUTER_API_KEY="));
  let v = line.slice("OPENROUTER_API_KEY=".length).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
})();

const TOOLS = JSON.parse(fs.readFileSync(path.join(DIR, "real-cheap-toolround.json"), "utf8")).tools;
const SYSTEM = "You are the game master of an immersive tabletop role-play. Narrate the world in vivid second person, staying in character and in the fiction. You ALSO keep the game's tracked state in sync using the provided tools — call the tools each turn to record what changed in the story you just told. Narrate first, then make the tool calls that reflect your narration.";
const USER = `## CURRENT STATE
player — HP 22/30
  conditions: Bleeding (-1), Exhausted (-1)
  status: wounded, running on fumes

## LATEST BEAT
I press the cauterizing iron to the wound. The bleeding stops, but it costs me — searing pain, and I nearly black out.`;

async function probe(effort, extra = {}, label = null) {
  const body = {
    model: "anthropic/claude-sonnet-5", stream: false, max_tokens: 4096,
    usage: { include: true },
    provider: { order: ["Anthropic"], allow_fallbacks: false },
    plugins: [{ id: "context-compression", enabled: false }],
    reasoning: { effort, ...extra },
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: USER }],
    tools: TOOLS, tool_choice: "auto",
  };
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.choices) return console.log(`${(label ?? effort).padEnd(26)} ERROR ${JSON.stringify(j.error ?? j).slice(0, 150)}`);
  const u = j.usage ?? {};
  const ctd = u.completion_tokens_details ?? {};
  const m = j.choices[0].message;
  const calls = m.tool_calls ?? [];
  const args = calls.map((c) => { try { return JSON.parse(c.function.arguments); } catch { return {}; } });
  const rm = args.map((a) => a.removeCondition).filter(Boolean);
  console.log(
    `${(label ?? effort).padEnd(26)} reasoning_tokens=${String(ctd.reasoning_tokens ?? "n/a").padEnd(6)} ` +
    `reasoning_field=${(m.reasoning ? `${String(m.reasoning).length}ch` : "none").padEnd(7)} ` +
    `completion=${String(u.completion_tokens).padEnd(5)} calls=${String(calls.length).padEnd(2)} ` +
    `rmCond=${(rm.join(",") || "—").padEnd(12)} $${(u.cost ?? 0).toFixed(5)}`
  );
}

console.log("\n=== does `reasoning:{effort}` produce reasoning on the GM+tools shape? ===\n");
for (const e of ["none", "low", "medium", "high"]) await probe(e);

console.log("\n=== same, but asking OpenRouter to RETURN the reasoning (exclude:false) ===");
console.log("    (Sonnet 5 defaults display:'omitted'; if OR derives reasoning_tokens from returned text,");
console.log("     these rows will differ from the ones above — that distinguishes 'did not think' from");
console.log("     'thought invisibly'.)\n");
for (const e of ["none", "low", "medium", "high"]) await probe(e, { exclude: false }, `${e} +exclude:false`);
console.log();
