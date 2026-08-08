// Replay the REAL captured cheap tool-round body against OR, non-streaming, to see whether the model
// emits assistant message.content ALONGSIDE tool_calls (the message production currently discards).
import { readFileSync } from "node:fs";

const DIR = new URL(".", import.meta.url).pathname;
const REPO = "~/dev/orbweaver";

// --- read OPENROUTER_API_KEY from .env (never printed) ---
const env = readFileSync(`${REPO}/.env`, "utf8");
const m = env.match(/^OPENROUTER_API_KEY=(.*)$/m);
if (!m) { console.error("no OPENROUTER_API_KEY in .env"); process.exit(1); }
const KEY = m[1].trim().replace(/^["']|["']$/g, "");

const base = JSON.parse(readFileSync(`${DIR}/real-cheap-toolround.json`, "utf8"));

async function run(label, mutate) {
  const body = JSON.parse(JSON.stringify(base));
  body.stream = false;
  body.usage = { include: true };
  delete body.stream_options;
  mutate(body);
  const started = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - started;
  const j = await res.json();
  console.log(`\n════ ${label}  tool_choice=${JSON.stringify(body.tool_choice)} ════`);
  if (!res.ok || j.error) { console.log("HTTP", res.status, JSON.stringify(j.error ?? j).slice(0, 400)); return; }
  const msg = j.choices?.[0]?.message ?? {};
  const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
  const toolCalls = msg.tool_calls ?? [];
  console.log(`finish_reason=${j.choices?.[0]?.finish_reason}  latency=${ms}ms`);
  console.log(`message.content: present=${!!content && content !== "null"}  length=${content.length}`);
  if (content && content !== "null") console.log("  »", content.slice(0, 700).replace(/\n/g, "\n  » "));
  console.log(`tool_calls: count=${toolCalls.length} → ${toolCalls.map(t => t.function?.name).join(", ")}`);
  console.log(`cost=$${j.usage?.cost}  prompt=${j.usage?.prompt_tokens} completion=${j.usage?.completion_tokens}`);
}

await run("A) REQUIRED (production cheap config)", () => {});
await run("B) AUTO (can it narrate + call tools?)", (b) => { b.tool_choice = "auto"; b.max_tokens = 4096; });
