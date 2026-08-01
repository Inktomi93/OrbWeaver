// R4b VERIFICATION — does the PRODUCTION reminder steer? (steer-probe.mjs, real-pipeline variant)
//
// steer-probe.mjs proved (§4d): a bare tracked number does NOT steer (Δ −0.12) while a hand-rolled
// glossed line does (Δ −1.00 / −2.33 last-3). R4b then fixed `castFieldSegs` to emit the gloss. THIS
// probe closes the loop the workboard demanded: the reminder text here is built by the REAL
// `buildLiteReminder` (imported from the server source, whole pipeline — cast line, seg grammar,
// license and all), delivered the way production delivers it (its own system-role message at depth 0).
// Two arms only — HIGH (Wits pinned 95) vs REAL-DECAY (95→10, production gloss) — the bare-number arm
// was already proven noise and is not re-bought.
//
// Run: node_modules/.bin/tsx scripts/probes/rpg-extraction/steer-probe-real.ts   (~$0.15-0.20, OR key)

import fs from "node:fs";
import type { RpgSnapshotState, RpgTrackerDef, RpgTrackerView } from "@orb/contracts/rpg";
import { RPG_PROFILE_FREEFORM, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { LiteReminderInput } from "../../../packages/server/src/domain/rpg/contract/params";
import { buildLiteReminder } from "../../../packages/server/src/domain/rpg/substrate/reminder";

const KEY = (() => {
  const line = fs
    .readFileSync("/home/inktomi/inktomi-stack/development/orbweaver/.env", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("OPENROUTER_API_KEY="));
  if (line === undefined) throw new Error("no OPENROUTER_API_KEY in .env");
  let v = line.slice("OPENROUTER_API_KEY=".length).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
})();
const MODEL = "anthropic/claude-sonnet-5";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM =
  "You are the game master of an immersive tabletop role-play. Narrate the world in vivid second person for the player character, Kestrel. Voice the present cast in dialogue. Keep replies to 2-3 short paragraphs.";

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
const BEAT_NOUNS = ["lockbox", "seal", "ledger", "missing wagon", "leak", "betrayal", "roads", "plan"];

const WITS_HIGH = [95, 95, 95, 95, 95, 95, 95, 95];
const WITS_DECAY = [95, 82, 68, 55, 42, 30, 19, 10];

function emptyState(): RpgSnapshotState {
  return {
    clock: null,
    calendarDate: null,
    location: "",
    weather: null,
    presentCharacters: [],
    recentEvents: [],
    actorState: [],
    trackerValues: {},
    quests: [],
    plot: null,
    fieldLocks: null,
  };
}

/** Wren's tracked fields as TRACKER defs — the hinted `Wits` is the probe's independent variable (R4b: a
 *  bare tracked number moves narration by noise, the same number glossed moves it by a full point). */
const WREN_TRACKERS = [
  rpgTrackerDefSchema.parse({ key: "trust", label: "Trust", shape: "meter", write: "set", subject: "actor", appliesTo: "npcs", max: 100 }),
  rpgTrackerDefSchema.parse({
    key: "wits",
    label: "Wits",
    shape: "meter",
    write: "set",
    subject: "actor",
    appliesTo: "npcs",
    max: 100,
    hint: "how sharp and quick-thinking she is right now",
  }),
  rpgTrackerDefSchema.parse({ key: "role", label: "Role", shape: "text", write: "set", subject: "actor", appliesTo: "npcs" }),
];

/** The REAL reminder for one turn — the production builder over a view carrying Wren's tracked Wits
 *  (meter, max 100, host hint) exactly as a host-defined tracker renders post-R4b. */
function realReminder(wits: number, beats: readonly string[]): string {
  const view: RpgTrackerView = {
    ambient: { location: "the ford road", calendarDate: null, clock: { day: 1, hour: 19, minute: 0 }, weather: { type: "rain", label: "" } },
    lockedPaths: [],
    actors: [
      {
        actorRef: { kind: "cast", castKey: "kestrel" },
        name: "Kestrel",
        // `flavor: ""` (RV-11's new sheet field) — empty renders no line, so the probe's prompt is unchanged.
        sheet: { className: "courier", attributes: {}, maxHp: null, flavor: "", level: 3, trackerGrants: [], trackerRevokes: [] },
        trackers: [rpgTrackerDefSchema.parse({ key: "Stamina", label: "Stamina", shape: "meter", write: "delta", subject: "actor", max: 14 })],
        volatile: {
          actorRef: { kind: "cast", castKey: "kestrel" },
          hp: { value: 22, max: 30 },
          trackerValues: { Stamina: { value: 9, items: null, max: null } },
          conditions: [],
          inventory: [
            { id: "i1", name: "lockbox", description: "", quantity: 1, location: "", type: "" },
            { id: "i2", name: "ledger", description: "", quantity: 1, location: "", type: "" },
            { id: "i3", name: "lantern", description: "", quantity: 1, location: "", type: "" },
          ],
          wallet: [],
          status: "",
        },
      },
    ],
    cast: [{ key: "Wren", name: "Wren", emoji: "🗝️", mood: "alert", relationship: { kind: "custom", label: "travelling companion" } }],
    trackerDefs: [...WREN_TRACKERS],
    castTrackers: {
      Wren: [
        { def: WREN_TRACKERS[0] as RpgTrackerDef, value: { value: 70, items: null, max: null } },
        { def: WREN_TRACKERS[1] as RpgTrackerDef, value: { value: wits, items: null, max: null } },
        { def: WREN_TRACKERS[2] as RpgTrackerDef, value: { value: "fixer", items: null, max: null } },
      ],
    },
    castConditions: {},
    gameTrackers: [],
    quests: [],
    plot: null,
    recentBeats: beats.slice(-3),
    trackersReadOnly: false,
    trackerOrbs: [],
  };
  const input: LiteReminderInput = {
    view,
    steeringNote: "",
    curSnapshot: emptyState(),
    prevSnapshot: emptyState(),
    statProfile: RPG_PROFILE_FREEFORM,
    features: {
      relationshipHints: {},
      journalTypeHints: {},
      deception: false,
      omniscience: false,
      hiddenContentReveal: true,
      recentBeatsKeepLast: 8,
      immersiveHtml: false,
      immersiveHtmlInteractive: true,
      cardKeepLastX: 0,
      cyoa: false,
      cyoaChoiceBehavior: "compose",
      plotProgression: true,
    },
    rosterNames: {},
    deception: false,
    omniscience: false,
    dateMode: "narrated",
  };
  return buildLiteReminder(input);
}

type Msg = { role: string; content: string };

async function call(messages: Msg[], maxTokens = 700): Promise<{ text: string; cost: number }> {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      stream: false,
      usage: { include: true },
      provider: { order: ["Anthropic"], allow_fallbacks: false },
      reasoning: { effort: "none" },
      messages,
    }),
  });
  const j = (await r.json()) as { choices?: { message: { content: string | null } }[]; usage?: { cost?: number }; error?: unknown };
  if (!j.choices) throw new Error(JSON.stringify(j.error ?? j).slice(0, 200));
  return { text: j.choices[0]?.message.content ?? "", cost: j.usage?.cost ?? 0 };
}

let spent = 0;

async function runArm(label: string, witsSeries: readonly number[]) {
  const history: { u: string; a: string }[] = [];
  const beats: string[] = [];
  const turns: { turn: number; wits: number; text: string; score?: number }[] = [];
  for (let t = 0; t < ACTIONS.length; t++) {
    const msgs: Msg[] = [{ role: "system", content: SYSTEM }];
    for (const h of history) {
      msgs.push({ role: "user", content: h.u });
      msgs.push({ role: "assistant", content: h.a });
    }
    // Delivery: the reminder rides the user turn (the D109-3 ephemeral-append knob) — the Anthropic-pinned
    // wire rejects a mid-history system role, and the original §4d probe delivered exactly this way.
    msgs.push({ role: "user", content: `${realReminder(witsSeries[t] ?? 0, beats)}\n\n${ACTIONS[t] ?? ""}` });
    const { text, cost } = await call(msgs);
    spent += cost;
    history.push({ u: ACTIONS[t] ?? "", a: text });
    beats.push(`Kestrel pressed Wren on the ${BEAT_NOUNS[t]}`);
    turns.push({ turn: t + 1, wits: witsSeries[t] ?? 0, text });
    process.stdout.write(`  ${label} t${t + 1} (Wits ${witsSeries[t]}) ${text.length}ch\n`);
  }
  return turns;
}

async function judgeOne(text: string): Promise<number> {
  const { text: out, cost } = await call(
    [
      { role: "system", content: "You rate fictional characters. Reply with ONLY a single integer 1-10, nothing else." },
      {
        role: "user",
        content: `In the passage below, rate the character WREN on how mentally sharp, insightful and capable she comes across — 1 (slow, confused, unhelpful) to 10 (brilliant, incisive).\n\n---\n${text}\n---\n\nInteger only:`,
      },
    ],
    8,
  );
  spent += cost;
  const n = Number.parseInt(String(out).match(/\d+/)?.[0] ?? "0", 10);
  return Number.isFinite(n) ? n : 0;
}

console.log("\n=== R4b verify: does the PRODUCTION reminder steer? (real buildLiteReminder) ===\n");
console.log("sample cast line @95:", realReminder(95, []).split("\n").find((l) => l.includes("Wren")));
console.log("sample cast line @10:", realReminder(10, []).split("\n").find((l) => l.includes("Wren")));
console.log("\nHIGH arm (Wits pinned 95, real reminder):");
const high = await runArm("HIGH ", WITS_HIGH);
console.log("\nREAL-DECAY arm (Wits 95 -> 10, real reminder — production gloss):");
const real = await runArm("REAL ", WITS_DECAY);

console.log("\nscoring (blind judge)...\n");
for (const r of high) r.score = await judgeOne(r.text);
for (const r of real) r.score = await judgeOne(r.text);

console.log("turn   Wits   HIGH   REAL-DECAY");
console.log("-".repeat(36));
for (let i = 0; i < high.length; i++) {
  console.log(`  ${String(i + 1).padEnd(6)}${String(real[i]?.wits).padEnd(7)}${String(high[i]?.score).padEnd(7)}${real[i]?.score}`);
}
const mean = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
const hs = high.map((r) => r.score ?? 0);
const rs = real.map((r) => r.score ?? 0);
console.log("-".repeat(36));
console.log(`mean    HIGH ${mean(hs)}   REAL ${mean(rs)}   Δ ${(Number(mean(rs)) - Number(mean(hs))).toFixed(2)}`);
console.log(`last-3  HIGH ${mean(hs.slice(-3))}   REAL ${mean(rs.slice(-3))}   Δ ${(Number(mean(rs.slice(-3))) - Number(mean(hs.slice(-3)))).toFixed(2)}`);
fs.writeFileSync("scripts/probes/rpg-extraction/steer-real-out.json", JSON.stringify({ high, real }, null, 2));
console.log(`\nfull transcripts -> steer-real-out.json · total $${spent.toFixed(4)}\n`);
