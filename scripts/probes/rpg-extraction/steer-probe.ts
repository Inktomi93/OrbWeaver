// DOES THE TRACKED STATE ACTUALLY STEER THE STORY?
//
// Every prior spike measured whether the model WRITES state (field coverage, retirement recall). None
// measured the other half of the loop — whether the state it reads back CHANGES what it narrates. That
// loop is the entire reason rpg-lite exists ("steer the story, not roll dice"), and it was unverified.
//
// Method: an NPC carries a tracked meter, `Wits`, rendered in the reminder exactly like `Trust` is today.
//   arm HIGH  — Wits pinned at 95/100 for all 8 turns
//   arm DECAY — Wits walks 95 → 10 across the same 8 turns
// Identical system prompt, identical player actions, identical everything else. **Nothing anywhere tells
// the model what `Wits` means or that it should change how it plays Wren.** If the panel steers, Wren's
// dialogue should degrade in DECAY and hold in HIGH. If it doesn't, the reminder is decoration.
//
// Scored by a separate BLIND judge call: it sees only Wren's dialogue for one turn, with no state, no arm
// label, no turn index, and no mention of the manipulation.
//
// Deliberately TOOLLESS. Production attaches the 7 tools, but tools are the WRITE path; this measures the
// READ path, so leaving them off removes a confound rather than adding one.

import fs from "node:fs";
import { REPO_ROOT } from "../_kit/artifacts.ts";

interface WireMsg {
  role: string;
  content: string;
}
interface HistoryEntry {
  u: string;
  a: string;
}
interface SteerTurn {
  turn: number;
  wits: number;
  text: string;
  score?: number;
}
interface RawResp {
  choices?: Array<{ message: { content?: string | null } }>;
  usage?: { cost?: number };
  error?: unknown;
}

const KEY = (() => {
  const line = fs.readFileSync(`${REPO_ROOT}/.env`, "utf8")
    .split(/\r?\n/).find((l) => l.startsWith("OPENROUTER_API_KEY="));
  // biome-ignore lint/style/noNonNullAssertion: this probe assumes the key line is present (crashes if not, as before).
  let v = line!.slice("OPENROUTER_API_KEY=".length).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
})();
const MODEL = "anthropic/claude-sonnet-5";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"; // NB: don't name this URL — it shadows the global

const SYSTEM =
  "You are the game master of an immersive tabletop role-play. Narrate the world in vivid second person for the player character, Kestrel. Voice the present cast in dialogue. Keep replies to 2-3 short paragraphs.";

// Eight beats that each hand Wren something to reason about, so her capability is observable every turn.
const ACTIONS = [
  "I show Wren the lockbox we pulled from the wreck. 'You're the clever one. How do we get into it?'",
  "'The seal has three rings and a maker's mark. What does that tell you?'",
  "I lay the courier's ledger open beside it. 'The numbers don't add up. Work it out for me.'",
  "'There were four wagons on the manifest and three at the ford. Where's the fourth?'",
  "'Someone tipped off the ambush. Walk me through who knew our route.'",
  "'If you were the one who sold us out, how would you have done it?'",
  "'We've got one lantern's worth of oil and two roads. Which one, and why?'",
  "'Last chance to talk me out of it. What am I missing?'",
];

const WITS_HIGH = [95, 95, 95, 95, 95, 95, 95, 95];
const WITS_DECAY = [95, 82, 68, 55, 42, 30, 19, 10];

// The reminder block, shaped like run-coverage's renderReminder (present cast + inline customFields).
// `Wits` sits beside `Trust` with no gloss — a bare number, exactly as a host-defined castField renders.
function reminder(action: string, wits: number, beats: string[], gloss = ""): string {
  const lines = [
    "[System note — current tracked game state:",
    "Scene: the ford road · evening · light rain",
    "Story: The Ford Road — act 1/3",
    "Party:",
    "- Kestrel — (courier) — Lv 3 — HP 22/30 — Stamina 9/14 — carrying: lockbox, ledger, lantern",
    "Present cast:",
    `- 🗝️ Wren — alert — travelling companion — Trust 70/100 — Wits ${wits}/100${gloss} — Role: fixer`,
    "Active quests: (none)",
  ];
  if (beats.length) { lines.push("Recent beats:"); for (const b of beats.slice(-3)) lines.push(`- ${b}`); }
  lines.push("]");
  lines.push("");
  lines.push(action);
  return lines.join("\n");
}

async function call(messages: WireMsg[], maxTokens = 700) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, stream: false, usage: { include: true },
      provider: { order: ["Anthropic"], allow_fallbacks: false },
      reasoning: { effort: "none" }, messages,
    }),
  });
  const j = (await r.json()) as RawResp;
  if (!j.choices) throw new Error(JSON.stringify(j.error ?? j).slice(0, 200));
  // biome-ignore lint/style/noNonNullAssertion: a 2xx OpenRouter response with `choices` always carries choices[0].
  return { text: j.choices[0]!.message.content ?? "", cost: j.usage?.cost ?? 0 };
}

let spent = 0;

async function runArm(label: string, witsSeries: number[], gloss = ""): Promise<SteerTurn[]> {
  const history: HistoryEntry[] = [];
  const beats: string[] = [];
  const turns: SteerTurn[] = [];
  for (let t = 0; t < ACTIONS.length; t++) {
    const msgs: WireMsg[] = [{ role: "system", content: SYSTEM }];
    for (const h of history) { msgs.push({ role: "user", content: h.u }); msgs.push({ role: "assistant", content: h.a }); }
    // biome-ignore lint/style/noNonNullAssertion: t < ACTIONS.length, and witsSeries is the same length.
    msgs.push({ role: "user", content: reminder(ACTIONS[t]!, witsSeries[t]!, beats, gloss) });
    const { text, cost } = await call(msgs);
    spent += cost;
    // biome-ignore lint/style/noNonNullAssertion: t < ACTIONS.length.
    history.push({ u: ACTIONS[t]!, a: text });
    beats.push(`Kestrel pressed Wren on the ${["lockbox", "seal", "ledger", "missing wagon", "leak", "betrayal", "roads", "plan"][t]}`);
    // biome-ignore lint/style/noNonNullAssertion: t < witsSeries.length.
    turns.push({ turn: t + 1, wits: witsSeries[t]!, text });
    process.stdout.write(`  ${label} t${t + 1} (Wits ${witsSeries[t]}) ${text.length}ch\n`);
  }
  return turns;
}

// Blind judge: one turn's prose, no state, no arm, no turn number, no mention of any manipulation.
async function judge(text: string): Promise<number> {
  const { text: out, cost } = await call([
    { role: "system", content: "You rate fictional characters. Reply with ONLY a single integer 1-10, nothing else." },
    { role: "user", content: `In the passage below, rate the character WREN on how mentally sharp, insightful and capable she comes across — 1 (slow, confused, unhelpful) to 10 (brilliant, incisive).\n\n---\n${text}\n---\n\nInteger only:` },
  ], 8);
  spent += cost;
  const n = parseInt(String(out).match(/\d+/)?.[0] ?? "0", 10);
  return Number.isFinite(n) ? n : 0;
}

console.log("\n=== does tracked state steer the narration? (silent Wits decay, no instruction) ===\n");
console.log("HIGH arm (Wits pinned 95):");
const high = await runArm("HIGH ", WITS_HIGH);
console.log("\nDECAY arm (Wits 95 -> 10, bare number):");
const decay = await runArm("DECAY", WITS_DECAY);

// The arm that matters: `rpgCastFieldSchema` already carries an optional `hint`. This renders it, so the
// number stops being an uninterpreted integer. Still NO instruction to play her differently.
const GLOSS = " (how sharp and quick-thinking she is right now)";
console.log("\nDECAY+GLOSS arm (same numbers, castField hint rendered):");
const glossed = await runArm("GLOSS", WITS_DECAY, GLOSS);

console.log("\nscoring (blind judge, one turn at a time)...\n");
for (const r of high) r.score = await judge(r.text);
for (const r of decay) r.score = await judge(r.text);
for (const r of glossed) r.score = await judge(r.text);

console.log("turn   Wits   HIGH   DECAY(bare)   DECAY+GLOSS");
console.log("-".repeat(52));
for (let i = 0; i < high.length; i++) {
  // biome-ignore lint/style/noNonNullAssertion: i < high.length, and all arms are the same length.
  console.log(`  ${String(i + 1).padEnd(6)}${String(decay[i]!.wits).padEnd(7)}${String(high[i]!.score).padEnd(7)}${String(decay[i]!.score).padEnd(14)}${glossed[i]!.score}`);
}
const mean = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
const hs = high.map((r) => r.score ?? 0), ds = decay.map((r) => r.score ?? 0), gs = glossed.map((r) => r.score ?? 0);
console.log("-".repeat(56));
console.log(`mean    HIGH ${mean(hs)}   DECAY ${mean(ds)}   GLOSS ${mean(gs)}`);
console.log(`last-3  HIGH ${mean(hs.slice(-3))}   DECAY ${mean(ds.slice(-3))}   GLOSS ${mean(gs.slice(-3))}`);
console.log(`\ndelta vs HIGH:  bare ${(Number(mean(ds)) - Number(mean(hs))).toFixed(2)}   glossed ${(Number(mean(gs)) - Number(mean(hs))).toFixed(2)}`);
fs.writeFileSync("scripts/probes/rpg-extraction/steer-out.json", JSON.stringify({ high, decay, glossed }, null, 2));
console.log(`\nfull transcripts -> steer-out.json · total $${spent.toFixed(4)}\n`);
