// F2 — why is hosted Sonnet so reluctant to emit `:::card`, and which teach copy fixes it?
//
// The spike measured `:::card` at 0/6 across EVERY method (including the pure narrative call), which points
// at the TEACH COPY, not at the tool vehicle. This probe isolates the copy: one scripted 10-turn scene in
// which EVERY player action explicitly puts a visual artifact in focus (a sign, a taped note, a vending
// screen, a receipt, a hand-drawn map, a terminal login, a poster, an ID badge, a directory plate, a
// ledger page) — so the denominator is OPPORTUNITIES (§4b), not turns: 10 opportunities per arm.
//
// The reminder is built by the REAL `buildLiteReminder` (the steer-probe-real.ts pattern — whole pipeline,
// state block + license + card teach, delivered the way production delivers it) and then the CARD TEACH
// BLOCK ALONE is swapped for the arm's variant. Everything else in the injection is byte-identical to
// production, so the only independent variable is the teach copy.
//
// Arms:
//   A  CURRENT `RPG_CARD_TEACH` — the baseline, including the new anti-recitation tail.
//   B  A minus the tail — isolates whether the anti-recitation line suppresses emission outright.
//   C  STRONGER INVITATION (expectation, not permission) + the tail.
//   D  C + a one-line worked example of a tiny card, inline in the teach.
//   E  A + one capability-reassurance sentence ("this client renders cards natively") — the SURFACE-DOUBT
//      hypothesis: the same teach makes the local 8B emit a card nearly every turn, so Sonnet's zero is a
//      disposition (withhold unsolicited markup), not a comprehension failure.
//   F  The RPG-Companion (ST extension) HTML prompt, minimally adapted to our fence — a wild-tested phrasing
//      with near-zero protocol overhead; tests whether our three sentences of fence rules are the drag.
//   G  A + the worked example only (permission framing + tail unchanged) — the conservative recommendation
//      candidate, added after run 1 showed the failure is OPENER GRAMMAR, not reluctance.
//   H  G + a prose-order clue (D/G place the card FIRST; the clue asks for prose around it).
//
// The game state deliberately carries recitable numbers (HP, Stamina, a Corruption meter, credits, an NPC's
// Trust) — that is the §4g#5 bait the tail exists to defuse. A "recitation violation" here is a card whose
// CONTENT is a status readout rather than something a character is looking at.
//
// Run: node_modules/.bin/tsx scripts/probes/rpg-extraction/card-teach-probe.ts   (~$2-3, OR key)
//      env CARD_ARMS=A,C  to re-run a subset · CARD_OUT=<file> to name the transcript.

import fs from "node:fs";
import type { RpgSnapshotState, RpgTrackerDef, RpgTrackerView } from "@orb/contracts/rpg";
import { tokenizeContent } from "@orb/kit/content";
import { RPG_PROFILE_FREEFORM, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { LiteReminderInput } from "../../../packages/server/src/domain/rpg/contract/params";
import { RPG_CARD_TEACH, buildLiteReminder } from "../../../packages/server/src/domain/rpg/substrate/reminder";

const REPO = "/home/inktomi/inktomi-stack/development/orbweaver";

const KEY = (() => {
  const line = fs
    .readFileSync(`${REPO}/.env`, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("OPENROUTER_API_KEY="));
  if (line === undefined) throw new Error("no OPENROUTER_API_KEY in .env");
  let v = line.slice("OPENROUTER_API_KEY=".length).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
})();
const MODEL = "anthropic/claude-sonnet-5";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const SPEND_CAP = 4.5;

const SYSTEM =
  "You are the game master of an immersive interactive story set in a decaying arcology. Narrate the world in vivid second person for the player character, Vex. Voice the present cast in dialogue. Keep replies to 2-3 short paragraphs.";

// ── The teach arms ────────────────────────────────────────────────────────────────────────────────────

/** The anti-recitation tail, verbatim from `RPG_CARD_TEACH` — the measured variable in arm B. */
const TAIL =
  " Cards are for things the CHARACTERS see in the world — never a status readout, stat block, or tracker display; the tracked values stay woven into your prose, never recited.";

/** C's reframe: expectation, not permission. Same mechanics paragraph, same tail; only the INVITATION moves. */
const TEACH_C =
  'When the scene presents a document, screen, sign, poster, letter, book page, map, UI panel, or any visual artifact the characters can look at, RENDER it as an immersive card — aim for a card whenever a visual object takes focus. Open with `:::card title="a short label"` on its own line, then your HTML/CSS/JS, then `:::` on its own line. Make whatever fits the moment — animations, layouts, interactive bits are all welcome. Embed everything inline (no external scripts/fonts/images). Do not wrap it in a code fence. Close the card with its own `:::` line BEFORE you open any other directive (a `:::choices` block never goes inside a card).' +
  TAIL;

/** The worked example — a three-line sign. Its real job turned out to be GRAMMAR, not enthusiasm: it pins the
 *  opener line's exact shape, and the opener is where hosted Sonnet drifts (`:::card title="…">`, a stray `>`
 *  that makes `parseFenceAttrs` reject the line ⇒ the card is DROPPED, never rendered). */
const EXAMPLE = `

For example, a three-line sign is enough:
:::card title="Crossing sign"
<div style="font-family:monospace;text-align:center;padding:14px;border:2px solid #6b5c3e;background:#e9e1cb;color:#3a2f1c;letter-spacing:2px">
  <div>EAST CROSSING</div><div>CLINIC — 2 KM</div><div>NO ENTRY AFTER DARK</div>
</div>
:::`;

/** D = C + the worked example inline, so the shape is demonstrated, not only described. */
const TEACH_D = TEACH_C + EXAMPLE;

/** The PROSE-ORDER clue — D's one regression was placing the card FIRST on 10/10 turns (it mimics the example,
 *  which is all card and no prose). One clause restores the narrate-around-it order. */
const PROSE_ORDER = " Keep narrating around the card — a line of prose before it and after it; the card is part of the scene, not a replacement for it.";

/** F = the RPG-Companion (SillyTavern extension) HTML prompt — a phrasing battle-tested in the wild against
 *  Sonnet-class models — adapted MINIMALLY to our fence protocol: their invitation ("freely and naturally
 *  within the narrative", "whenever they enhance visual storytelling", the theme-styling line) verbatim, their
 *  no-code-fence rule swapped for our `:::card` open/close stated in ONE clause, our anti-recitation tail kept.
 *  It tests near-zero protocol overhead against our three sentences of fence rules. */
const TEACH_F =
  "If appropriate, include inline HTML, CSS, and JS whenever they enhance visual storytelling (e.g. for in-world screens, posters, books, letters, signs, crests, labels, etc.). Style them to match the setting's theme, keep the text readable, and embed all assets directly (inline SVG only — no external scripts, libraries, or fonts). Use these elements freely and naturally within the narrative as characters would encounter them, including animations, 3D effects, pop-ups, dropdowns, websites, and so on. Do not wrap them in code fences — open with `:::card title=\"a short label\"` on its own line and close with `:::` on its own line." +
  TAIL;

/** G = the CURRENT teach + the worked example. The conservative recommendation candidate: permission framing
 *  and the anti-recitation tail unchanged (both measured harmless), only the opener grammar demonstrated. */
const TEACH_G = RPG_CARD_TEACH + EXAMPLE;

/** H = G + the prose-order clue. */
const TEACH_H = RPG_CARD_TEACH + PROSE_ORDER + EXAMPLE;

/** E's hypothesis (owner live data point, 2026-07-31): the local 8B emits a card almost every turn on THIS
 *  SAME teach while Sonnet emits zero — a model-DISPOSITION split, not a comprehension one. Strong assistants
 *  are trained to withhold unsolicited raw markup from a surface that probably will not render it. E therefore
 *  removes the SURFACE DOUBT and changes nothing else: permission framing (not C's expectation framing), tail
 *  intact, one reassurance sentence prepended. If E beats C, the fix is a sentence, not a rewrite. */
const REASSURE =
  "This client renders your cards natively in a sandboxed frame — cards are a first-class, expected part of the experience here, not raw markup. ";

const ARMS: Readonly<Record<string, { readonly label: string; readonly teach: string }>> = {
  A: { label: "A current (with tail)", teach: RPG_CARD_TEACH },
  B: { label: "B no anti-recite tail", teach: RPG_CARD_TEACH.replace(TAIL, "") },
  C: { label: "C strong invitation", teach: TEACH_C },
  D: { label: "D strong + example", teach: TEACH_D },
  E: { label: "E current + reassurance", teach: REASSURE + RPG_CARD_TEACH },
  F: { label: "F RPG-Companion phrasing", teach: TEACH_F },
  G: { label: "G current + example", teach: TEACH_G },
  H: { label: "H G + prose-order clue", teach: TEACH_H },
};

// ── The scene: 10 turns, 10 explicit card OPPORTUNITIES ───────────────────────────────────────────────

const ACTIONS = [
  "I stop under the district sign at the crossing and read what's left of it.",
  "There's a note taped to the door of unit 4B. I peel it off and read it.",
  "I step up to the ration vendor in the lobby and study its screen.",
  "I dig the crumpled receipt out of my coat pocket and flatten it under the light.",
  "I unfold the hand-drawn map the courier sold me and trace the route with a finger.",
  "I wake the maintenance terminal on the wall and read the login screen.",
  "There's a public-health poster half-peeled off the tunnel wall. I read the whole thing.",
  "I hold the dead woman's ID badge up to the light and read every field on it.",
  "I check the elevator's directory plate to find which floor the clinic is on.",
  "I open the ration ledger on the counter and read the last page of entries.",
] as const;

const OPPORTUNITIES = ACTIONS.map((_, i) => i + 1);
const BEAT_NOUNS = ["district sign", "taped note", "ration vendor", "receipt", "courier map", "maintenance terminal", "health poster", "ID badge", "directory plate", "ration ledger"] as const;

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

/** Recitable state — the §4g#5 bait. A party Corruption meter, an NPC Trust meter, HP/Stamina/credits: all
 *  the numbers a model tempted to render "the panel" as a card would reach for. */
const TRACKERS = [
  rpgTrackerDefSchema.parse({ key: "corruption", label: "Corruption", shape: "meter", write: "delta", subject: "actor", appliesTo: "party", max: 100, hint: "how much the arcology's rot has gotten into you" }),
  rpgTrackerDefSchema.parse({ key: "trust", label: "Trust", shape: "meter", write: "set", subject: "actor", appliesTo: "npcs", max: 100, hint: "how far this person will stick their neck out for you" }),
];

/** The REAL production reminder for one turn, with ONLY the card-teach block swapped for the arm variant. */
function armReminder(teach: string, beats: readonly string[]): string {
  const view: RpgTrackerView = {
    ambient: { location: "Ward 7, the lower concourse", calendarDate: null, clock: { day: 3, hour: 21, minute: 0 }, weather: { type: "rain", label: "" } },
    lockedPaths: [],
    actors: [
      {
        actorRef: { kind: "cast", castKey: "vex" },
        name: "Vex",
        sheet: { className: "scavenger", attributes: {}, maxHp: null, level: 2, trackerGrants: [], trackerRevokes: [] },
        trackers: [
          TRACKERS[0] as RpgTrackerDef,
          rpgTrackerDefSchema.parse({ key: "Stamina", label: "Stamina", shape: "meter", write: "delta", subject: "actor", max: 14 }),
        ],
        volatile: {
          actorRef: { kind: "cast", castKey: "vex" },
          hp: { value: 22, max: 30 },
          trackerValues: { Stamina: { value: 9, items: null, max: null }, corruption: { value: 31, items: null, max: null } },
          conditions: [],
          inventory: [
            { id: "i1", name: "flashlight", description: "", quantity: 1, location: "", type: "" },
            { id: "i2", name: "courier map", description: "", quantity: 1, location: "", type: "" },
            { id: "i3", name: "ID badge", description: "", quantity: 1, location: "", type: "" },
          ],
          wallet: [{ name: "credits", amount: 48 }],
          status: "",
        },
      },
    ],
    cast: [{ key: "Marrow", name: "Marrow", emoji: "🩶", mood: "wary", relationship: { kind: "custom", label: "fixer" } }],
    trackerDefs: [...TRACKERS],
    castTrackers: { Marrow: [{ def: TRACKERS[1] as RpgTrackerDef, value: { value: 55, items: null, max: null } }] },
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
      immersiveHtml: true,
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
  const real = buildLiteReminder(input);
  if (!real.includes(RPG_CARD_TEACH)) throw new Error("card teach block not found in the real reminder — the constant drifted");
  return real.replace(RPG_CARD_TEACH, teach);
}

// ── Wire ──────────────────────────────────────────────────────────────────────────────────────────────

type Msg = { role: string; content: string };

let spent = 0;

async function call(messages: Msg[], maxTokens: number): Promise<{ text: string; cost: number }> {
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
  if (!j.choices) throw new Error(JSON.stringify(j.error ?? j).slice(0, 300));
  return { text: j.choices[0]?.message.content ?? "", cost: j.usage?.cost ?? 0 };
}

// ── Scoring ───────────────────────────────────────────────────────────────────────────────────────────

interface CardHit {
  readonly openLine: number;
  readonly title: string | null;
  readonly closed: boolean;
  readonly wellFormed: boolean;
  readonly fenced: boolean;
  readonly body: string;
  /** Where the card sits in the response: `lead` = before any prose · `end` = nothing after it · `mid`. */
  readonly position: "lead" | "mid" | "end";
  readonly recitation: boolean;
}

const STATE_WORDS = /\b(HP|Stamina|Corruption|Trust|credits|conditions?)\b/gi;
const RECITE_TITLE = /status|stat[s ]|vitals|character sheet|tracker|condition|panel/i;

/** A card is a RECITATION violation when its content is a readout of the tracked state rather than a thing a
 *  character is looking at: a status-ish title, or ≥2 distinct state words alongside a `n/m` reading. */
function isRecitation(title: string | null, body: string): boolean {
  if (title !== null && RECITE_TITLE.test(title)) return true;
  const words = new Set((body.match(STATE_WORDS) ?? []).map((w) => w.toLowerCase()));
  return words.size >= 2 && /\d+\s*\/\s*\d+/.test(body);
}

function scanCards(text: string): CardHit[] {
  const lines = text.split("\n");
  const hits: CardHit[] = [];
  let inCodeFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (!/^\s*:::card\b/.test(line)) continue;
    const titleMatch = line.match(/title\s*=\s*"([^"]*)"/);
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*:::\s*$/.test(lines[j] ?? "")) {
        close = j;
        break;
      }
    }
    const body = lines.slice(i + 1, close === -1 ? lines.length : close).join("\n");
    const rest = lines.slice(close === -1 ? lines.length : close + 1).join("").trim();
    const before = lines.slice(0, i).join("").trim();
    hits.push({
      openLine: i,
      title: titleMatch?.[1] ?? null,
      closed: close !== -1,
      // Well-formed = the exact production grammar: the opener alone on its line with a quoted title, a bare
      // `:::` closer on its own line, and no surrounding code fence (the tokenizer sees none of it otherwise).
      wellFormed: close !== -1 && !inCodeFence && /^:::card title="[^"]+"\s*$/.test(line),
      fenced: inCodeFence,
      body,
      position: rest === "" ? "end" : before === "" ? "lead" : "mid",
      recitation: isRecitation(titleMatch?.[1] ?? null, body),
    });
    if (close !== -1) i = close;
  }
  return hits;
}

const REFUSAL = /\b(I (?:won'?t|will not|can'?t|cannot|should not|shouldn'?t) (?:render|create|make|generate|produce)|no card|not (?:render|include) a card|instead of a card)\b/i;

interface TurnResult {
  readonly turn: number;
  readonly action: string;
  readonly text: string;
  readonly cards: CardHit[];
  /** The number the PLAYER actually sees: `card` spans off the REAL production tokenizer (`@orb/kit/content`,
   *  `committed: true` = the post-commit reading surface). An emitted-but-off-grammar fence scores 0 here — it
   *  degrades to an `unknown-directive` span and is DROPPED, which is exactly F2's "cards are rare". */
  readonly rendered: number;
  readonly refusalTalk: boolean;
  readonly chars: number;
}

function renderedCards(text: string): number {
  return tokenizeContent(text, { committed: true }).filter((s) => s.kind === "card").length;
}

function scoreTurn(turn: number, action: string, text: string): TurnResult {
  const cards = scanCards(text);
  return { turn, action, text, cards, rendered: renderedCards(text), refusalTalk: cards.length === 0 && REFUSAL.test(text), chars: text.length };
}

async function runArm(armId: string): Promise<TurnResult[]> {
  const arm = ARMS[armId];
  if (arm === undefined) throw new Error(`unknown arm ${armId}`);
  const history: { u: string; a: string }[] = [];
  const beats: string[] = [];
  const turns: TurnResult[] = [];
  for (let t = 0; t < ACTIONS.length; t++) {
    if (spent > SPEND_CAP) throw new Error(`spend cap hit ($${spent.toFixed(2)}) — aborting`);
    const msgs: Msg[] = [{ role: "system", content: SYSTEM }];
    for (const h of history) {
      msgs.push({ role: "user", content: h.u });
      msgs.push({ role: "assistant", content: h.a });
    }
    // Delivery matches steer-probe-real: the reminder rides the user turn (the Anthropic-pinned wire rejects
    // a mid-history system role); production ships it as its own depth-0 system injection, same text.
    msgs.push({ role: "user", content: `${armReminder(arm.teach, beats)}\n\n${ACTIONS[t] ?? ""}` });
    const { text, cost } = await call(msgs, 1600);
    spent += cost;
    const scored = scoreTurn(t + 1, ACTIONS[t] ?? "", text);
    history.push({ u: ACTIONS[t] ?? "", a: text });
    beats.push(`Vex read the ${BEAT_NOUNS[t]}`);
    turns.push(scored);
    process.stdout.write(
      `  ${armId} t${t + 1} ${text.length}ch emitted=${scored.cards.length} rendered=${scored.rendered}${scored.cards.some((c) => c.recitation) ? " RECITE" : ""}${scored.cards.length > scored.rendered ? " EATEN" : ""}\n`,
    );
  }
  return turns;
}

function summarize(armId: string, turns: readonly TurnResult[]) {
  const all = turns.flatMap((t) => t.cards);
  const turnsWithCard = turns.filter((t) => t.cards.length > 0).length;
  return {
    arm: armId,
    label: ARMS[armId]?.label ?? armId,
    opportunities: OPPORTUNITIES.length,
    turnsWithCard,
    turnsRendered: turns.filter((t) => t.rendered > 0).length,
    cardsTotal: all.length,
    renderedTotal: turns.reduce((s, t) => s + t.rendered, 0),
    wellFormed: all.filter((c) => c.wellFormed).length,
    fenced: all.filter((c) => c.fenced).length,
    unclosed: all.filter((c) => !c.closed).length,
    recitations: all.filter((c) => c.recitation).length,
    lead: all.filter((c) => c.position === "lead").length,
    atEnd: all.filter((c) => c.position === "end").length,
    midProse: all.filter((c) => c.position === "mid").length,
    refusalTalk: turns.filter((t) => t.refusalTalk).length,
    avgChars: Math.round(turns.reduce((s, t) => s + t.chars, 0) / turns.length),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────────────────────────────

const selected = (process.env["CARD_ARMS"] ?? "A,B,C,D,E").split(",").map((s) => s.trim()).filter((s) => s !== "");
const outFile = process.env["CARD_OUT"] ?? `${REPO}/scripts/probes/rpg-extraction/card-teach-out.json`;

console.log("\n=== F2: which card TEACH copy makes hosted Sonnet emit `:::card`? ===");
console.log(`model ${MODEL} · ${OPPORTUNITIES.length} opportunities/arm · arms ${selected.join(",")}\n`);

// `CARD_DRY=1` — print each arm's assembled injection and exit without spending anything (the swap check).
if (process.env["CARD_DRY"] === "1") {
  for (const armId of selected) {
    console.log(`\n───────── ${ARMS[armId]?.label} ─────────\n${armReminder(ARMS[armId]?.teach ?? "", ["Vex read the district sign"])}`);
  }
  process.exit(0);
}

const results: Record<string, TurnResult[]> = {};

// `CARD_SCORE=<transcript.json>` — re-score an EXISTING run (free): the scoring evolved after run 1 (the
// tokenizer pass + the lead/mid/end split), and re-buying 50 turns to apply a metric change is waste.
const rescore = process.env["CARD_SCORE"];
if (rescore !== undefined && rescore !== "") {
  const prior = JSON.parse(fs.readFileSync(rescore, "utf8")) as { arms: Record<string, { turns: { turn: number; action: string; text: string }[] }> };
  for (const [armId, arm] of Object.entries(prior.arms)) {
    results[armId] = arm.turns.map((t) => scoreTurn(t.turn, t.action, t.text));
  }
} else {
  for (const armId of selected) {
    console.log(`${ARMS[armId]?.label ?? armId}:`);
    results[armId] = await runArm(armId);
  }
}

const armIds = Object.keys(results);
console.log("\narm                      emitted/opp  RENDERED/opp  eaten  recite  lead/mid/end  refusal-talk  avg-chars");
console.log("-".repeat(108));
const summaries = armIds.map((a) => summarize(a, results[a] ?? []));
for (const s of summaries) {
  console.log(
    `${s.label.padEnd(24)} ${`${s.turnsWithCard}/${s.opportunities}`.padEnd(12)} ${`${s.turnsRendered}/${s.opportunities}`.padEnd(13)} ${String(s.cardsTotal - s.renderedTotal).padEnd(6)} ${String(s.recitations).padEnd(7)} ${`${s.lead}/${s.midProse}/${s.atEnd}`.padEnd(13)} ${String(s.refusalTalk).padEnd(13)} ${s.avgChars}`,
  );
}

if (rescore === undefined || rescore === "") {
  fs.writeFileSync(outFile, JSON.stringify({ model: MODEL, arms: Object.fromEntries(armIds.map((a) => [a, { teach: ARMS[a]?.teach, turns: results[a] }])), summaries, spent }, null, 2));
  console.log(`\ntranscripts -> ${outFile} · total $${spent.toFixed(4)}\n`);
} else {
  console.log(`\nre-scored ${rescore} (no spend)\n`);
}
