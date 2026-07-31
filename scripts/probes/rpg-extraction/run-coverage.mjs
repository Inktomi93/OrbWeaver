// Spike 2: field-coverage A/B of the 1call-tools path (terse vs enriched tool descriptions).
// Reuses Spike-1 OR plumbing (key load / orCall / applyOp / computeDelta patterns) from run.mjs.
// Reads OPENROUTER_API_KEY from repo .env at runtime; NEVER prints/logs/writes the key.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
// SPIKE_OUT lets a variant run (e.g. a reasoning sweep) write beside the committed baseline instead of
// clobbering it. SPIKE_EFFORT sweeps the reasoning ladder — the original matrix only measured the ends
// ("none" here, "high" in run.mjs's +reasoning arms), leaving low/medium/xhigh unmeasured. SPIKE_ARMS runs
// a subset (the enriched arm alone is the cheap F1 probe: 8 calls, ~$0.15, vs ~$0.30 for both).
const OUT = path.join(DIR, process.env.SPIKE_OUT || "out2");
const EFFORT = process.env.SPIKE_EFFORT || "none";
const ARMS_RUN = (process.env.SPIKE_ARMS || "A,B").split(",").map((s) => s.trim()).filter(Boolean);
const REPO_ENV = "~/dev/orbweaver/.env";
// SPIKE_ENDPOINT/SPIKE_MODEL retarget the harness at any OpenAI-compatible server (e.g. the local vLLM
// gen engine on 127.0.0.1:8703). SPIKE_LOCAL=1 strips the OpenRouter-only body fields (provider routing,
// plugins, usage.include, reasoning) that vLLM rejects or ignores.
const MODEL = process.env.SPIKE_MODEL || "anthropic/claude-sonnet-5";
const LOCAL = process.env.SPIKE_LOCAL === "1";
const ENDPOINT = process.env.SPIKE_ENDPOINT || "https://openrouter.ai/api/v1/chat/completions";
const MAX_FETCHES = 40; // hard safety cap across the whole run (spec: stop if a call would push over ~40)

// ---- creds (never logged) ----
const KEY = (() => {
  const line = fs.readFileSync(REPO_ENV, "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENROUTER_API_KEY="));
  if (!line) throw new Error("OPENROUTER_API_KEY not found in .env");
  let v = line.slice("OPENROUTER_API_KEY=".length).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
})();

// ---- 7 real tools (verbatim schemas; Arm A uses verbatim descriptions) ----
const cheapTpl = JSON.parse(fs.readFileSync(path.join(DIR, "real-cheap-toolround.json"), "utf8"));
const TOOLS_A = cheapTpl.tools; // Arm A: verbatim descriptions

// Arm B: same names + parameter schemas; ONLY the description string changes (enriched, from spec).
const ENRICHED = {
  update_party: "Record changes to any actor's body/condition. hpDelta: damage (negative) or healing (positive). poolDeltas: spend/restore named pools like Mana/Stamina/Focus (negative=spent). addCondition: a new status effect (e.g. Blessed, Bleeding, Poisoned) with an optional numeric modifier. removeCondition: when an effect ends. status: a short current-state line ('bleeding, on edge'). EXAMPLE — took a cut and spent wind fighting: {targetRef:'player', hpDelta:-5, poolDeltas:[{name:'Stamina',delta:-3}], addCondition:{name:'Bleeding',modifier:-1}, status:'bleeding, breathing hard'}.",
  update_inventory: "Items and coin on an actor. add: new items — ALWAYS give a `description` and a `location` (where it's carried: 'belt pouch', 'sheathed'), plus quantity. remove: items used/lost/given away. walletDeltas: coin gained/spent (negative=spent). EXAMPLE — gifted an oil vial, paid 20 gold: {targetRef:'player', add:[{name:'Vial of Sanctified Oil', description:'warded holy oil, faintly glowing', quantity:1, location:'belt pouch'}], walletDeltas:[{name:'gold', delta:-20}]}.",
  update_scene: "The scene + who is present. Set location/timeOfDay/weather when they change; calendarDate/day as days pass; advance plot.act/title/actSummary as the story moves. presentUpsert: for EACH character on screen set mood (every demeanor shift), appearance + outfit (when described), thoughts (their implied inner state), relationship {kind,label}, and customFields trust/role. recentEvent: a one-line beat. EXAMPLE — a priest warms to you: {timeOfDay:'evening', presentUpsert:[{name:'Sister Vesna', emoji:'🕯️', mood:'warming', appearance:'tall, silver-haired, sharp-eyed', outfit:'patched grey habit', thoughts:'weighing whether to trust you', relationship:{kind:'ally',label:'wary priest'}, customFields:[{name:'trust',value:'40'},{name:'role',value:'chapel keeper'}]}], recentEvent:'Vesna softened as you shared road news'}.",
  set_widget_value: "Set a custom meter the game defines (e.g. Suspicion). value: the new reading; max: if the ceiling changes; items: for list-type widgets. EXAMPLE — suspicion rises as she watches you: {widgetRef:'Suspicion', value:35}.",
  upsert_quest: "Create/update/complete/fail a quest. Give a description and objectives[] on create; use action 'complete'/'fail' when it resolves. EXAMPLE — a new task opens: {name:'Reach the Vault of Ash', action:'create', description:'Get to the vault before the new moon', objectives:['Find the road north','Enter the vault']}.",
  add_journal_entry: "Log a notable beat with the right type (location/npc/combat/quest/item/event/note) + a short title + content. EXAMPLE: {type:'combat', title:'Ambush at the Chapel', content:'Corvin drew on you at the altar; you took a cut but stayed up.'}.",
  no_changes: "Call ONLY when nothing trackable changed. Do NOT use this to avoid filling fields — if anything in the fiction moved, record it.",
};
const TOOLS_B = JSON.parse(JSON.stringify(TOOLS_A)).map((t) => {
  const enr = ENRICHED[t.function.name];
  if (!enr) throw new Error(`no enriched description for ${t.function.name}`);
  t.function.description = enr;
  return t;
});

// ---- system prompts (spec) ----
const GM_BASE =
  "You are the game master of an immersive tabletop role-play. Narrate the world in vivid second person, staying in character and in the fiction. You ALSO keep the game's tracked state in sync using the provided tools — call the tools each turn to record what changed in the story you just told. Narrate first, then make the tool calls that reflect your narration.";
const CLAUSE_A = "Use whichever tools fit what happened this turn.";
const CLAUSE_B =
  "STATE-TRACKING GUIDE — be thorough; the panel should reflect the FULL richness of your narration, not just the headline change. Each turn, ask which of these changed and record ALL of them:\n" +
  "- Any character on screen → update_scene.presentUpsert: set `mood` EVERY time their demeanor shifts; set `appearance` + `outfit` the first time (or whenever) you describe how they look; set `thoughts` when you imply their inner state; set `relationship` when it forms or changes; set customFields `trust`/`role` as they establish. Don't leave a described character as just a name.\n" +
  "- Scene → set location/timeOfDay/weather whenever they change; set calendarDate/day when time passes; advance `plot.actSummary` (and act/title) as the story moves.\n" +
  "- The PC or an NPC's body → update_party: hpDelta for wounds/healing, poolDeltas for mana/stamina/focus spent or restored, addCondition for a new effect (with a numeric modifier if it has one), removeCondition when it ends, status for a short current-state line.\n" +
  "- Items → update_inventory: add with a `description` AND `location` (where it's carried), remove when used/lost, walletDeltas for coin. Quantities matter.\n" +
  "- Meters the game defines (e.g. Suspicion) → set_widget_value when they move.\n" +
  "- Quests → upsert_quest with objectives; complete/fail as they resolve.\n" +
  "- add_journal_entry for a notable beat, with the right `type`.\n" +
  "Fill every field the fiction supports. Sparse tracking makes the panel feel dead.";

const ARMS = {
  A: { tools: TOOLS_A, system: `${GM_BASE}\n\n${CLAUSE_A}` },
  B: { tools: TOOLS_B, system: `${GM_BASE}\n\n${CLAUSE_B}` },
};

// ---- seed state ("The Sanctified Map") ----
function seedState() {
  return {
    scene: { location: "", calendarDate: "", timeOfDay: "", weather: "", recentEvent: "" },
    plot: { act: 1, maxActs: 3, title: "The Sanctified Map", actTitle: "", actSummary: "" },
    party: [{
      ref: "player", name: "Kestrel", role: "relic-hunter", level: 3,
      hp: { value: 26, max: 26 },
      pools: [{ name: "Mana", value: 12, max: 12 }, { name: "Stamina", value: 14, max: 14 }],
      conditions: [], status: "alert",
      items: [
        { name: "Worn Shortsword", quantity: 1, location: "sheathed", description: "" },
        { name: "Traveler's Cloak", quantity: 1, location: "worn", description: "" },
      ],
      wallet: { gold: 40, silver: 5 },
    }],
    present: [],
    trackers: { Suspicion: { value: 10, max: 100 } },
    quests: [],
    journal: [],
    beats: [],
  };
}

const ACTIONS = [
  "I step into the lantern-lit chapel out of the evening drizzle. A robed woman tends the altar — tall, silver-haired, in a patched grey habit, her eyes sharp. I approach quietly.",
  "I introduce myself and share news from the outer roads. Sister Vesna, she calls herself — she softens a little as we talk, warming to me.",
  "She offers a blessing. She anoints my blade — I feel it thrum with warded light — and presses a small Vial of Sanctified Oil into my hand, tucked into my belt pouch.",
  "I ask about the relic. She wants 20 gold for the old vault map. I pay it. She watches my hands a beat too long as I take it — something in her gaze sharpens.",
  "The chapel door bangs open — Corvin Ashe, my rival, blade already drawn. He lunges; I take a shallow cut across the ribs and it costs me wind, but I stay up.",
  "I press a cloth to the wound to stop the bleeding and swig a stamina draught from my pack to steady myself.",
  "Vesna calls the guard on Corvin; with him hauled off, she declares my errand proven — I've earned her trust. She names my next task: reach the Vault of Ash before the new moon.",
  "Dawn light comes grey through the chapel windows. I gather the map and the oil and step out onto the road north, the chapel bell fading behind me.",
];

// ---- F1: the "Afflictions" game — a DECISIVE test for removeCondition / hpDelta -----------------
// "The Sanctified Map" offers ~1 genuine condition-retirement, so 0/8 vs 1/8 there is a single event and
// cannot distinguish a real effect from the 15/43-field variance floor (§4a). This game scripts FIVE
// unambiguous retirements and four explicit damage beats, each with per-turn GROUND TRUTH, so recall is
// measured against what the fiction actually demanded rather than against a state-derived over-count.
//
// `ensure` forces the condition to be present at turn start regardless of whether the model emitted
// addCondition earlier. That is a deliberate harness intervention: without it a missed ADD silently
// removes a REMOVE opportunity, and the run would measure two things at once. We are isolating retirement.
const AFFLICTIONS_ACTIONS = [
  // 1 — add Bleeding + damage
  { text: "The ambush comes at the ford. A blade opens a long gash across my forearm and the blood runs freely down to my fingers before I drive the man off.", expectHp: true },
  // 2 — persists
  { text: "I keep moving along the riverbank, pressing the arm to my side, watching the treeline for the second one." },
  // 3 — RETIRE Bleeding
  { text: "I stop, tear a strip of clean linen from my pack and bind the gash tight. The bleeding stops.", ensure: ["Bleeding"], expectRemove: ["Bleeding"] },
  // 4 — add Poisoned
  { text: "The marsh road stinks of rot. I breathe it too long and something turns in my gut — a sick, creeping heat under the skin.", },
  // 5 — persists + damage
  { text: "I stumble on a sunken root and go down hard on the stones, knocking the wind clean out of me.", ensure: ["Poisoned"], expectHp: true },
  // 6 — RETIRE Poisoned
  { text: "I dig out the antidote vial and swallow it whole. Within minutes the heat drains out of me and my head clears — the poison is gone.", ensure: ["Poisoned"], expectRemove: ["Poisoned"] },
  // 7 — add Blessed
  { text: "At the wayshrine an old priest lays his hands on my blade and speaks the warding rite. The steel takes on a faint, steady light.", },
  // 8 — persists + damage
  { text: "The warden of the bridge will not let me pass. We fight; his cudgel catches my shoulder before I put him down.", ensure: ["Blessed"], expectHp: true },
  // 9 — RETIRE Blessed
  { text: "The light gutters and dies out of the blade as the last of the rite burns away. The blessing is spent.", ensure: ["Blessed"], expectRemove: ["Blessed"] },
  // 10 — add Exhausted
  { text: "I push on through the whole night without rest, and by grey dawn I am swaying on my feet, barely tracking the road.", },
  // 11 — add Lamed + damage
  { text: "On the scree slope my ankle turns under me with a sick wrench and I come down on the rocks.", ensure: ["Exhausted"], expectHp: true },
  // 12 — RETIRE Exhausted AND Lamed
  { text: "I take a full night at the waystation — a real bed, a hot meal, the ankle bound and rested. I wake clear-headed and strong, and the limp is gone.", ensure: ["Exhausted", "Lamed"], expectRemove: ["Exhausted", "Lamed"] },
];

function seedAfflictions() {
  const s = seedState();
  s.plot.title = "The Ford Road";
  s.scene.location = "the ford";
  s.party[0].name = "Rook";
  s.party[0].role = "courier";
  return s;
}

const GAMES = {
  sanctified: { seed: seedState, actions: ACTIONS.map((text) => ({ text })), title: "The Sanctified Map" },
  afflictions: { seed: seedAfflictions, actions: AFFLICTIONS_ACTIONS, title: "The Ford Road" },
};
const GAME_KEY = process.env.SPIKE_GAME || "sanctified";
if (!GAMES[GAME_KEY]) throw new Error(`SPIKE_GAME must be one of ${Object.keys(GAMES).join("|")}`);
const GAME = GAMES[GAME_KEY];

// ---- clone / actor ----
const clone = (o) => JSON.parse(JSON.stringify(o));
function findActor(state, ref) {
  if (!ref || ref === "player" || ref === "Alex") return state.party[0];
  const a = state.party.find((p) => p.name === ref || p.ref === ref);
  return a || state.party[0]; // party updates in this game all target the PC
}

// ---- apply (running state so the reminder evolves; mirrors run.mjs applyOp) ----
function applyOp(state, name, args, touched) {
  args = args || {};
  switch (name) {
    case "update_party": {
      const a = findActor(state, args.targetRef);
      if (typeof args.hpDelta === "number") { a.hp.value = Math.max(0, Math.min(a.hp.max, a.hp.value + args.hpDelta)); touched.party = true; }
      for (const pd of args.poolDeltas || []) {
        const p = a.pools.find((x) => x.name.toLowerCase() === String(pd.name).toLowerCase());
        if (p) p.value = Math.max(0, Math.min(p.max, p.value + pd.delta));
        else a.pools.push({ name: pd.name, value: Math.max(0, pd.delta), max: Math.max(pd.delta, 10) });
        touched.party = true;
      }
      if (args.addCondition?.name && !a.conditions.includes(args.addCondition.name)) { a.conditions.push(args.addCondition.name); touched.party = true; }
      if (args.removeCondition) { a.conditions = a.conditions.filter((c) => c !== args.removeCondition); touched.party = true; }
      if (typeof args.status === "string" && args.status) { a.status = args.status; touched.party = true; }
      return;
    }
    case "update_inventory": {
      const a = findActor(state, args.targetRef);
      for (const it of args.add || []) {
        const ex = a.items.find((x) => x.name.toLowerCase() === String(it.name).toLowerCase());
        if (ex) ex.quantity += it.quantity || 1;
        else a.items.push({ name: it.name, quantity: it.quantity || 1, location: it.location || "", description: it.description || "" });
        touched.inventory = true;
      }
      for (const it of args.remove || []) {
        const ex = a.items.find((x) => x.name.toLowerCase() === String(it.name).toLowerCase());
        if (ex) { ex.quantity -= it.quantity || 1; if (ex.quantity <= 0) a.items = a.items.filter((x) => x !== ex); touched.inventory = true; }
      }
      for (const w of args.walletDeltas || []) { a.wallet[w.name] = (a.wallet[w.name] || 0) + w.delta; touched.inventory = true; }
      return;
    }
    case "update_scene": {
      if (args.location) { state.scene.location = args.location; touched.scene = true; }
      if (args.calendarDate) { state.scene.calendarDate = args.calendarDate; touched.scene = true; }
      if (args.timeOfDay) { state.scene.timeOfDay = args.timeOfDay; touched.scene = true; }
      if (args.weather) { state.scene.weather = args.weather; touched.scene = true; }
      if (typeof args.day === "number") { state.scene.day = args.day; touched.scene = true; }
      if (args.recentEvent) { state.scene.recentEvent = args.recentEvent; state.beats.push(args.recentEvent); touched.scene = true; }
      if (args.plot) {
        if (typeof args.plot.act === "number") state.plot.act = args.plot.act;
        if (args.plot.title) state.plot.title = args.plot.title;
        if (args.plot.actTitle) state.plot.actTitle = args.plot.actTitle;
        if (args.plot.actSummary) state.plot.actSummary = args.plot.actSummary;
        touched.scene = true;
      }
      for (const u of args.presentUpsert || []) {
        let c = state.present.find((x) => x.name.toLowerCase() === String(u.name).toLowerCase());
        if (!c) { c = { name: u.name, emoji: "", mood: "", appearance: "", outfit: "", thoughts: "", customFields: {}, relationship: { kind: "", label: "" } }; state.present.push(c); }
        for (const k of ["emoji", "mood", "appearance", "outfit", "thoughts"]) if (u[k]) c[k] = u[k];
        if (Array.isArray(u.customFields)) for (const cf of u.customFields) c.customFields[cf.name] = cf.value;
        else if (u.customFields && typeof u.customFields === "object") Object.assign(c.customFields, u.customFields);
        if (u.relationship) { if (u.relationship.kind) c.relationship.kind = u.relationship.kind; if (u.relationship.label) c.relationship.label = u.relationship.label; }
        touched.scene = true;
      }
      for (const r of args.presentRemove || []) { state.present = state.present.filter((x) => x.name !== r && x.name.toLowerCase() !== String(r).toLowerCase()); touched.scene = true; }
      return;
    }
    case "set_widget_value": {
      const w = state.widgets[args.widgetRef] || {};
      if (typeof args.value === "number") w.value = args.value;
      if (typeof args.max === "number") w.max = args.max;
      if (Array.isArray(args.items)) w.items = args.items;
      state.widgets[args.widgetRef] = w;
      touched.widgets = true;
      return;
    }
    case "upsert_quest": {
      const action = String(args.action || "").toLowerCase();
      let q = state.quests.find((x) => x.name.toLowerCase() === String(args.name || "").toLowerCase());
      const objs = (args.objectives || []).map((t) => ({ text: t, completed: action === "complete" }));
      if (!q) { q = { name: args.name, status: "active", description: args.description || "", objectives: objs }; state.quests.push(q); }
      else { if (args.description) q.description = args.description; if (objs.length) q.objectives = objs; }
      if (action === "complete") q.status = "completed";
      else if (action === "fail") q.status = "failed";
      else if (action === "create" || action === "update") q.status = "active";
      touched.quests = true;
      return;
    }
    case "add_journal_entry": {
      state.journal.push({ type: args.type || "note", title: args.title || "", content: args.content || "" });
      touched.journal = true;
      return;
    }
    default: return;
  }
}
function applyOps(state, ops) {
  const touched = { party: false, inventory: false, scene: false, widgets: false, quests: false, journal: false };
  for (const [name, args] of ops) applyOp(state, name, args, touched);
  return touched;
}

// ---- reminder / state-fold rendering ----
function fmtWallet(w) { return Object.entries(w).map(([k, v]) => `${v} ${k}`).join(", "); }
function fmtItems(items) { return items.map((i) => i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name).join(", ") || "nothing"; }
function fmtPools(pools) { return pools.map((p) => `${p.name} ${p.value}/${p.max}`).join(", "); }

function renderReminder(state, action, changesLine) {
  const s = state.scene;
  const pc = state.party[0];
  const lines = [];
  lines.push("[System note — current tracked game state:");
  const sceneBits = [s.location || "(unset)", s.calendarDate || "", s.timeOfDay || "", s.weather || ""].filter(Boolean);
  lines.push(`Scene: ${sceneBits.join(" · ")}`);
  const actLabel = state.plot.actTitle ? `: ${state.plot.actTitle}` : "";
  const situation = s.recentEvent ? ` — ${s.recentEvent}` : "";
  lines.push(`Story: ${state.plot.title} — act ${state.plot.act}/${state.plot.maxActs}${actLabel}${situation}`);
  lines.push("Party:");
  const cond = pc.conditions.length ? pc.conditions.join(", ") : pc.status;
  lines.push(`- ${pc.name} — (${pc.role}) — Lv ${pc.level} — HP ${pc.hp.value}/${pc.hp.max} — ${fmtPools(pc.pools)} — ${fmtWallet(pc.wallet)} — carrying: ${fmtItems(pc.items)} — ${cond}`);
  lines.push("Present cast:");
  if (state.present.length) {
    for (const c of state.present) {
      const trust = c.customFields.trust != null ? ` — Trust ${c.customFields.trust}/100` : "";
      const role = c.customFields.role ? ` — Role: ${c.customFields.role}` : "";
      const rel = c.relationship.label || c.relationship.kind || "";
      lines.push(`- ${c.emoji ? c.emoji + " " : ""}${c.name} — ${c.mood || "—"}${rel ? " — " + rel : ""}${trust}${role}`);
    }
  } else lines.push("- (none yet)");
  lines.push("Custom trackers:");
  for (const [name, w] of Object.entries(state.widgets)) lines.push(`- ${name}: ${w.value}${w.max != null ? "/" + w.max : ""}`);
  if (state.quests.length) {
    lines.push("Active quests:");
    for (const q of state.quests) {
      lines.push(`- ${q.name} [${q.status}]`);
      for (const o of q.objectives) lines.push(`  ${o.completed ? "●" : "○"} ${o.text}`);
    }
  } else lines.push("Active quests: (none)");
  if (state.beats.length) {
    lines.push("Recent beats:");
    for (const b of state.beats.slice(-3)) lines.push(`- ${b}`);
  }
  lines.push("");
  lines.push(`CHANGES SINCE LAST BEAT: ${changesLine}`);
  lines.push("Narrate this turn, then call the tools that record what changed.]");
  return `${action}\n\n${lines.join("\n")}`;
}

// ---- delta (hint line only) ----
function computeDelta(before, after) {
  const parts = [];
  const bp = before.party[0], ap = after.party[0];
  if (bp.hp.value !== ap.hp.value) parts.push(`HP ${bp.hp.value}→${ap.hp.value}`);
  for (const pool of ap.pools) {
    const pb = bp.pools.find((x) => x.name === pool.name);
    if (pb && pb.value !== pool.value) parts.push(`${pool.name} ${pb.value}→${pool.value}`);
  }
  for (const c of ap.conditions) if (!bp.conditions.includes(c)) parts.push(`+condition "${c}"`);
  for (const c of bp.conditions) if (!ap.conditions.includes(c)) parts.push(`-condition "${c}"`);
  if (bp.status !== ap.status) parts.push(`status → "${ap.status}"`);
  const bItems = new Set(bp.items.map((i) => i.name.toLowerCase()));
  const aItems = new Set(ap.items.map((i) => i.name.toLowerCase()));
  for (const it of ap.items) if (!bItems.has(it.name.toLowerCase())) parts.push(`+item ${it.name}`);
  for (const it of bp.items) if (!aItems.has(it.name.toLowerCase())) parts.push(`-item ${it.name}`);
  for (const [k, v] of Object.entries(ap.wallet)) { const bv = bp.wallet[k] ?? 0; if (bv !== v) parts.push(`${k} ${bv}→${v}`); }
  if (before.scene.location !== after.scene.location && after.scene.location) parts.push(`scene → ${after.scene.location}`);
  if (before.scene.timeOfDay !== after.scene.timeOfDay && after.scene.timeOfDay) parts.push(`time → ${after.scene.timeOfDay}`);
  if (before.scene.weather !== after.scene.weather && after.scene.weather) parts.push(`weather → ${after.scene.weather}`);
  const bN = new Set(before.present.map((c) => c.name.toLowerCase()));
  const aN = new Set(after.present.map((c) => c.name.toLowerCase()));
  for (const c of after.present) if (!bN.has(c.name.toLowerCase())) parts.push(`+NPC ${c.name}`);
  for (const c of before.present) if (!aN.has(c.name.toLowerCase())) parts.push(`-NPC ${c.name}`);
  for (const [name, w] of Object.entries(after.widgets)) { const bw = before.widgets[name]; if (bw && bw.value !== w.value) parts.push(`${name} ${bw.value}→${w.value}`); }
  const bQ = Object.fromEntries(before.quests.map((q) => [q.name.toLowerCase(), q.status]));
  for (const q of after.quests) {
    if (!(q.name.toLowerCase() in bQ)) parts.push(`quest "${q.name}" started`);
    else if (bQ[q.name.toLowerCase()] !== q.status) parts.push(`quest "${q.name}" ${q.status}`);
  }
  if (after.journal.length > before.journal.length) parts.push(`+${after.journal.length - before.journal.length} journal`);
  return parts.length ? parts.join("; ") : "no tracked change";
}

// ---- OR call ----
let FETCHES = 0;
async function orCall(body, label) {
  const started = Date.now();
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (FETCHES >= MAX_FETCHES) throw new Error(`fetch cap ${MAX_FETCHES} reached — aborting before ${label}`);
    FETCHES++;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://localhost/spike", "X-Title": "orb-spike2" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) { lastErr = new Error(`${label} HTTP ${res.status}: ${text.slice(0, 400)}`); continue; }
      const json = JSON.parse(text);
      if (json.error) { lastErr = new Error(`${label} api-error: ${JSON.stringify(json.error).slice(0, 400)}`); continue; }
      const finish = json.choices?.[0]?.finish_reason;
      if (finish === "length" && attempt === 1 && (body.max_tokens ?? 0) < 16000) { body = { ...body, max_tokens: 16000 }; continue; }
      return { json, latency_ms: Date.now() - started };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
function usageOf(json) {
  const u = json.usage || {};
  // reasoning_tokens is the CAUSAL evidence for any effort-ladder claim: without it, "higher effort fixed
  // it" is inferred from the request parameter rather than observed in the response. run.mjs recorded it;
  // this harness did not, which left §4a's mechanism unverified. Always capture it.
  return {
    cost_usd: u.cost ?? 0,
    prompt_tokens: u.prompt_tokens ?? 0,
    completion_tokens: u.completion_tokens ?? 0,
    reasoning_tokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}
function parseToolCalls(msg) {
  const ops = [];
  for (const tc of msg.tool_calls || []) {
    let args = {};
    try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
    ops.push([tc.function.name, args]);
  }
  return ops;
}

const BASE = LOCAL
  ? { model: MODEL, stream: false }
  : { model: MODEL, stream: false, usage: { include: true }, provider: { order: ["Anthropic"], allow_fallbacks: false }, plugins: [{ id: "context-compression", enabled: false }] };

// ---- R4a: PER-MESSAGE steering ---------------------------------------------------------------
// Anthropic documents a third lever, distinct from effort and from tool descriptions: thinking is
// steerable per message from the USER turn, and — unlike an effort change — "guidance appended to the
// newest user message leaves earlier cache breakpoints intact". That makes it the only conditional lever
// that doesn't bust the prompt cache, so it can be paid for ONLY on turns that need it.
//
// Two variants, because they test different mechanisms and §4 already settled one of them:
//   think     — the documented generic thinking nudge. Tests DELIBERATION, matching §4a's finding that
//               effort (deliberation) fixed removeCondition where prose (instruction) did not.
//   reconcile — a targeted instruction. §4 disproved instruction in the TOOL DESCRIPTIONS and the
//               system-prompt guide; the user turn is a different position and was never tested.
// Both fire ONLY when a condition is active at turn start — the conditional-cost property is the point.
const NUDGES = {
  think: "\n\nPlease think hard before responding.",
  reconcile:
    "\n\nBefore you record state: re-read the conditions listed above and decide, for each one, whether this beat ENDED it. If it did, emit removeCondition for it.",
};
const NUDGE_MODE = process.env.SPIKE_NUDGE || "off"; // off | think | reconcile
if (NUDGE_MODE !== "off" && !NUDGES[NUDGE_MODE]) throw new Error(`SPIKE_NUDGE must be off|think|reconcile, got "${NUDGE_MODE}"`);

/** Nudge iff a condition is actually active — same precondition the §4b denominator uses, so "turns
 *  nudged" and "opportunities" line up and the cost of the lever is legible. */
function nudgeFor(state) {
  if (NUDGE_MODE === "off") return "";
  return state.party.some((p) => (p.conditions || []).length > 0) ? NUDGES[NUDGE_MODE] : "";
}

function messages(system, history, action, state, changesLine, nudge = "") {
  const msgs = [{ role: "system", content: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] }];
  for (const h of history) { msgs.push({ role: "user", content: h.action }); msgs.push({ role: "assistant", content: h.narrative }); }
  // Appended to the NEWEST user message only — everything before the breakpoint is byte-identical.
  msgs.push({ role: "user", content: renderReminder(state, action, changesLine) + nudge });
  return msgs;
}

// ---- COVERAGE: leaf-field checkers (spec's full leaf set) ----
const nStr = (v) => typeof v === "string" && v.trim() !== "";
const nNum = (v) => typeof v === "number" && Number.isFinite(v);
const nArr = (v) => Array.isArray(v) && v.length > 0;
const someAdd = (list, k, pred) => (list || []).some((a) => (a.add || []).some((it) => pred(it[k])));
const somePU = (list, fn) => (list || []).some((a) => (a.presentUpsert || []).some(fn));

// FIELD_SPECS: { key (matrix label), tool, test(argsListForThatTool) }. argsList = all calls of that tool this turn.
const FIELD_SPECS = [
  // update_party
  ["update_party.targetRef", "update_party", (L) => L.some((a) => nStr(a.targetRef))],
  ["update_party.hpDelta", "update_party", (L) => L.some((a) => nNum(a.hpDelta))],
  ["update_party.poolDeltas", "update_party", (L) => L.some((a) => nArr(a.poolDeltas))],
  ["update_party.addCondition", "update_party", (L) => L.some((a) => a.addCondition && nStr(a.addCondition.name))],
  ["update_party.removeCondition", "update_party", (L) => L.some((a) => nStr(a.removeCondition))],
  ["update_party.status", "update_party", (L) => L.some((a) => nStr(a.status))],
  // update_inventory
  ["update_inventory.targetRef", "update_inventory", (L) => L.some((a) => nStr(a.targetRef))],
  ["update_inventory.add.name", "update_inventory", (L) => someAdd(L, "name", nStr)],
  ["update_inventory.add.description", "update_inventory", (L) => someAdd(L, "description", nStr)],
  ["update_inventory.add.location", "update_inventory", (L) => someAdd(L, "location", nStr)],
  ["update_inventory.add.quantity", "update_inventory", (L) => someAdd(L, "quantity", nNum)],
  ["update_inventory.remove", "update_inventory", (L) => L.some((a) => nArr(a.remove))],
  ["update_inventory.walletDeltas", "update_inventory", (L) => L.some((a) => nArr(a.walletDeltas))],
  // update_scene
  ["update_scene.location", "update_scene", (L) => L.some((a) => nStr(a.location))],
  ["update_scene.calendarDate", "update_scene", (L) => L.some((a) => nStr(a.calendarDate))],
  ["update_scene.day", "update_scene", (L) => L.some((a) => nNum(a.day))],
  ["update_scene.timeOfDay", "update_scene", (L) => L.some((a) => nStr(a.timeOfDay))],
  ["update_scene.weather", "update_scene", (L) => L.some((a) => nStr(a.weather))],
  ["update_scene.presentUpsert.name", "update_scene", (L) => somePU(L, (p) => nStr(p.name))],
  ["update_scene.presentUpsert.emoji", "update_scene", (L) => somePU(L, (p) => nStr(p.emoji))],
  ["update_scene.presentUpsert.mood", "update_scene", (L) => somePU(L, (p) => nStr(p.mood))],
  ["update_scene.presentUpsert.appearance", "update_scene", (L) => somePU(L, (p) => nStr(p.appearance))],
  ["update_scene.presentUpsert.outfit", "update_scene", (L) => somePU(L, (p) => nStr(p.outfit))],
  ["update_scene.presentUpsert.thoughts", "update_scene", (L) => somePU(L, (p) => nStr(p.thoughts))],
  ["update_scene.presentUpsert.customFields", "update_scene", (L) => somePU(L, (p) => nArr(p.customFields))],
  ["update_scene.presentUpsert.relationship", "update_scene", (L) => somePU(L, (p) => p.relationship && nStr(p.relationship.kind))],
  ["update_scene.presentRemove", "update_scene", (L) => L.some((a) => nArr(a.presentRemove))],
  ["update_scene.recentEvent", "update_scene", (L) => L.some((a) => nStr(a.recentEvent))],
  ["update_scene.plot.act", "update_scene", (L) => L.some((a) => a.plot && nNum(a.plot.act))],
  ["update_scene.plot.title", "update_scene", (L) => L.some((a) => a.plot && nStr(a.plot.title))],
  ["update_scene.plot.actTitle", "update_scene", (L) => L.some((a) => a.plot && nStr(a.plot.actTitle))],
  ["update_scene.plot.actSummary", "update_scene", (L) => L.some((a) => a.plot && nStr(a.plot.actSummary))],
  // set_widget_value
  ["set_widget_value.widgetRef", "set_widget_value", (L) => L.some((a) => nStr(a.widgetRef))],
  ["set_widget_value.value", "set_widget_value", (L) => L.some((a) => nNum(a.value))],
  ["set_widget_value.max", "set_widget_value", (L) => L.some((a) => nNum(a.max))],
  ["set_widget_value.items", "set_widget_value", (L) => L.some((a) => nArr(a.items))],
  // upsert_quest
  ["upsert_quest.name", "upsert_quest", (L) => L.some((a) => nStr(a.name))],
  ["upsert_quest.action", "upsert_quest", (L) => L.some((a) => nStr(a.action))],
  ["upsert_quest.description", "upsert_quest", (L) => L.some((a) => nStr(a.description))],
  ["upsert_quest.objectives", "upsert_quest", (L) => L.some((a) => nArr(a.objectives))],
  // add_journal_entry
  ["add_journal_entry.type", "add_journal_entry", (L) => L.some((a) => nStr(a.type))],
  ["add_journal_entry.title", "add_journal_entry", (L) => L.some((a) => nStr(a.title))],
  ["add_journal_entry.content", "add_journal_entry", (L) => L.some((a) => nStr(a.content))],
];

function coverageForTurn(ops) {
  const byTool = {};
  for (const [name, args] of ops) (byTool[name] ||= []).push(args);
  const row = {};
  for (const [key, tool, test] of FIELD_SPECS) row[key] = !!test(byTool[tool] || []);
  return row;
}

// ---- run one arm ----
async function runArm(armKey) {
  const arm = ARMS[armKey];
  const adir = path.join(OUT, armKey);
  fs.mkdirSync(adir, { recursive: true });
  const state = GAME.seed();
  const history = [];
  let changesLine = GAME_KEY === "afflictions" ? "SCENE OPENS — the ford at first light" : "SCENE OPENS — the chapel at dusk";
  const transcript = [`# Arm ${armKey} — transcript ("${GAME.title}")\n\nModel: ${MODEL} · 1call-tools (persona + 7 tools + tool_choice:auto) · descriptions: ${armKey === "A" ? "TERSE (verbatim)" : "ENRICHED"} · reasoning effort: ${EFFORT} · game: ${GAME_KEY}\n`];
  const turns = [];
  let cost = 0, toolCalls = 0, latency = 0, promptTok = 0, complTok = 0;
  const failures = [];

  for (let t = 0; t < GAME.actions.length; t++) {
    const spec = GAME.actions[t];
    const action = spec.text;
    // Ground-truth setup: guarantee the condition exists so a missed ADD on an earlier turn can't
    // silently delete this turn's REMOVE opportunity. Isolates retirement from addition.
    for (const c of spec.ensure ?? []) {
      const pc = state.party[0];
      if (!pc.conditions.includes(c)) pc.conditions.push(c);
    }
    const before = clone(state);
    const nudge = nudgeFor(before);
    const body = { ...BASE, max_tokens: 8192, ...(LOCAL ? {} : { reasoning: { effort: EFFORT } }), messages: messages(arm.system, history, action, state, changesLine, nudge), tools: arm.tools, tool_choice: "auto" };
    let r;
    try { r = await orCall(body, `arm${armKey}/turn${t + 1}`); }
    catch (e) { failures.push(`turn ${t + 1}: ${e.message}`); transcript.push(`\n## Turn ${t + 1}\n**Player:** ${action}\n\n**ERROR:** ${e.message}\n`); break; }

    const msg = r.json.choices[0].message;
    const narrative = msg.content || "";
    const ops = parseToolCalls(msg);
    const u = usageOf(r.json);
    cost += u.cost_usd; latency += r.latency_ms; promptTok += u.prompt_tokens; complTok += u.completion_tokens;
    toolCalls += ops.length;

    const cov = coverageForTurn(ops);
    applyOps(state, ops);
    const after = clone(state);
    const delta = computeDelta(before, after);

    // Opportunity is evaluated against `before` — the state as it stood when the model was prompted.
    const opportunity = Object.fromEntries(Object.entries(PRECONDITIONS).map(([k, fn]) => {
      try { return [k, !!fn(before)]; } catch { return [k, false]; } // a malformed plane must not kill the run
    }));
    // ---- ground-truth scoring (afflictions game) ----
    // Matched case-insensitively on a prefix, because the model writes "Bleeding (-1)" or "Bleeding wound"
    // where the truth says "Bleeding". Scoring the concept, not the string.
    const emittedRemoves = ops.filter(([n]) => n === "update_party").map(([, a]) => a.removeCondition).filter(Boolean);
    const emittedHp = ops.filter(([n]) => n === "update_party").some(([, a]) => typeof a.hpDelta === "number" && a.hpDelta !== 0);
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, "");
    const hit = (want) => emittedRemoves.some((got) => norm(got).startsWith(norm(want)) || norm(want).startsWith(norm(got)));
    const expectRemove = spec.expectRemove ?? [];
    const truth = {
      expectRemove,
      removeHits: expectRemove.filter(hit),
      removeMisses: expectRemove.filter((w) => !hit(w)),
      // A retirement of something the fiction did NOT end this turn — over-firing is its own failure.
      removeSpurious: emittedRemoves.filter((got) => !expectRemove.some((w) => norm(got).startsWith(norm(w)) || norm(w).startsWith(norm(got)))),
      expectHp: spec.expectHp === true,
      hpHit: spec.expectHp === true && emittedHp,
    };
    turns.push({ turn: t + 1, action, narrative, ops, coverage: cov, opportunity, nudged: nudge !== "", truth, num_tool_calls: ops.length, tools_called: ops.map(([n]) => n), delta, usage: u, finish: r.json.choices[0].finish_reason });

    // transcript
    transcript.push(`\n## Turn ${t + 1}\n`);
    transcript.push(`**Player:** ${action}\n`);
    transcript.push(`**Narrative** (${narrative.length} chars, finish=${r.json.choices[0].finish_reason}):\n\n${narrative || "_(no narrative)_"}\n`);
    transcript.push(`**Tool calls (${ops.length}): ${ops.map(([n]) => n).join(", ") || "(none)"}**\n`);
    transcript.push("```json\n" + JSON.stringify(ops.map(([n, a]) => ({ [n]: a })), null, 2) + "\n```\n");
    transcript.push(`**Delta:** ${delta} · cost $${u.cost_usd.toFixed(4)} · ${r.latency_ms}ms\n`);

    history.push({ action, narrative });
    changesLine = delta;
  }

  fs.writeFileSync(path.join(adir, "transcript.md"), transcript.join("\n"));

  // per-field tally. `tally` stays the raw hit count (unchanged shape — old readers still work);
  // `denom` is what that count should be read against: opportunities for a conditional field, turns
  // otherwise. `missed` is the actionable number — chances the model had and didn't take.
  const tally = {};
  const denom = {};
  const missed = {};
  for (const [key] of FIELD_SPECS) {
    tally[key] = turns.filter((tn) => tn.coverage[key]).length;
    denom[key] = PRECONDITIONS[key] ? turns.filter((tn) => tn.opportunity?.[key]).length : turns.length;
    missed[key] = PRECONDITIONS[key] ? turns.filter((tn) => tn.opportunity?.[key] && !tn.coverage[key]).length : null;
  }

  // COVERAGE.md matrix
  writeArmCoverageMd(adir, armKey, turns, tally, denom, missed);

  // Ground-truth recall — the number F1 turns on. Unlike the state-derived denominator, this counts only
  // turns where the FICTION explicitly ended an effect, so it is a true rate.
  const gt = {
    removeExpected: turns.reduce((a, t) => a + (t.truth?.expectRemove.length ?? 0), 0),
    removeHit: turns.reduce((a, t) => a + (t.truth?.removeHits.length ?? 0), 0),
    removeSpurious: turns.reduce((a, t) => a + (t.truth?.removeSpurious.length ?? 0), 0),
    hpExpected: turns.filter((t) => t.truth?.expectHp).length,
    hpHit: turns.filter((t) => t.truth?.hpHit).length,
  };
  if (gt.removeExpected > 0) {
    console.log(`       GROUND TRUTH: removeCondition ${gt.removeHit}/${gt.removeExpected} (spurious ${gt.removeSpurious}) · hpDelta ${gt.hpHit}/${gt.hpExpected}`);
  }

  const conditional = Object.keys(PRECONDITIONS)
    .map((k) => `${k.split(".").pop()} ${tally[k]}/${denom[k]}`).join(" · ");
  console.log(`[done] arm ${armKey}: turns=${turns.length} toolCalls=${toolCalls} cost=$${cost.toFixed(4)}${failures.length ? " FAIL:" + failures.length : ""}`);
  console.log(`       conditional (hits/opportunities): ${conditional} · nudged ${turns.filter((t) => t.nudged).length}/${turns.length} turns`);
  return { armKey, turns, tally, denom, missed, gt, totals: { cost: +cost.toFixed(4), toolCalls, latency, promptTok, complTok, turnsCompleted: turns.length }, failures };
}

const TOOL_ORDER = ["update_party", "update_inventory", "update_scene", "set_widget_value", "upsert_quest", "add_journal_entry"];
function writeArmCoverageMd(adir, armKey, turns, tally, denom, missed) {
  const nT = turns.length;
  const rows = [];
  rows.push(`# Arm ${armKey} — field coverage matrix`);
  rows.push("");
  rows.push(`Descriptions: ${armKey === "A" ? "TERSE (verbatim)" : "ENRICHED (when-to-use + example)"} · ${nT} turns · reasoning effort: ${EFFORT} · ✓ = field present+non-empty in that turn's tool_calls`);
  rows.push("");
  // Conditional fields get their own block up front — reading them off the /nT column is the mistake
  // this section exists to prevent (a field that could only fire twice does not "score 0/8").
  const condKeys = Object.keys(PRECONDITIONS).filter((k) => FIELD_SPECS.some(([f]) => f === k));
  if (condKeys.length) {
    rows.push(`## Conditional fields — scored against OPPORTUNITIES, not turns`);
    rows.push("");
    rows.push(`A field here can only fire on a turn where its precondition held at turn start (a condition`);
    rows.push(`was active, the actor held items, someone was on screen). \`/${nT}\` is meaningless for these.`);
    rows.push("");
    rows.push(`| Field | hits | opportunities | missed | of ${nT} turns |`);
    rows.push(`|---|:-:|:-:|:-:|:-:|`);
    for (const k of condKeys) {
      const opp = denom[k] ?? 0;
      const rate = opp > 0 ? `${tally[k]}/${opp}` : "n/a (never possible)";
      rows.push(`| \`${k}\` | ${tally[k]} | ${opp} | **${missed[k] ?? 0}** | ${rate} |`);
    }
    rows.push("");
    rows.push(`> \`missed\` is the actionable number: turns the model had the chance and didn't take it.`);
    rows.push(`> Opportunity is state-derived (was the precondition true at turn start), not prose-derived,`);
    rows.push(`> so it OVER-counts — a condition can sit active for turns the story never ends it. Read`);
    rows.push(`> \`missed\` as an upper bound on neglect, not a defect count.`);
    rows.push("");
  }
  const header = `| Field | ${turns.map((t) => `T${t.turn}`).join(" | ")} | /${nT} |`;
  const sep = `|---|${turns.map(() => ":-:").join("|")}|:-:|`;
  for (const tool of TOOL_ORDER) {
    rows.push(`\n### ${tool}\n`);
    rows.push(header);
    rows.push(sep);
    for (const [key, tl] of FIELD_SPECS) {
      if (tl !== tool) continue;
      const short = key.slice(tool.length + 1);
      const cells = turns.map((t) => (t.coverage[key] ? "✓" : "·")).join(" | ");
      rows.push(`| ${short} | ${cells} | **${tally[key]}** |`);
    }
  }
  rows.push("\n### tool_calls per turn\n");
  rows.push(header);
  rows.push(sep);
  rows.push(`| # calls | ${turns.map((t) => t.num_tool_calls).join(" | ")} | — |`);
  fs.writeFileSync(path.join(adir, "COVERAGE.md"), rows.join("\n"));
}

function writeSummary(A, B) {
  const rows = [];
  rows.push("# Spike 2 — field-coverage A/B SUMMARY (1call-tools: terse vs enriched tool descriptions)");
  rows.push("");
  rows.push(`Model: \`${MODEL}\` · game "The Sanctified Map" · 8 turns/arm · 1call-tools (persona + 7 tools + tool_choice:auto, max_tokens 8192, no reasoning).`);
  rows.push(`Arm A = current TERSE tool descriptions + generic clause. Arm B = ENRICHED "when-to-use + example" descriptions + state-tracking guide. Same seed, same 8 player actions, same tool parameter schemas — ONLY the descriptions + system tracking clause differ.`);
  rows.push("");
  const totalCost = (A.totals.cost + B.totals.cost);
  rows.push(`**Total spend: $${totalCost.toFixed(4)}** · Arm A $${A.totals.cost.toFixed(4)} (${A.totals.toolCalls} tool_calls) · Arm B $${B.totals.cost.toFixed(4)} (${B.totals.toolCalls} tool_calls).`);
  if (A.failures.length || B.failures.length) rows.push(`\n⚠ Failures — A: ${A.failures.join("; ") || "none"} · B: ${B.failures.join("; ") || "none"}`);
  rows.push("");

  // side-by-side table
  rows.push("## Per-field coverage: A vs B (turns populated / 8)");
  rows.push("");
  rows.push("| Field | A /8 | B /8 | Δ | note |");
  rows.push("|---|:-:|:-:|:-:|---|");
  const skippedToCovered = [];
  const neverA = [], neverB = [];
  let improvedFields = 0, regressedFields = 0;
  for (const [key] of FIELD_SPECS) {
    const a = A.tally[key], b = B.tally[key];
    const d = b - a;
    if (a === 0) neverA.push(key);
    if (b === 0) neverB.push(key);
    if (a === 0 && b > 0) { skippedToCovered.push(key); }
    if (d > 0) improvedFields++;
    if (d < 0) regressedFields++;
    let note = "";
    if (a === 0 && b > 0) note = "**skipped→covered**";
    else if (a === 0 && b === 0) note = "never-touched (both)";
    else if (d > 0) note = "improved";
    else if (d < 0) note = "regressed";
    rows.push(`| \`${key}\` | ${a} | ${b} | ${d > 0 ? "+" + d : d} | ${note} |`);
  }
  rows.push("");

  rows.push("## NEVER-TOUCHED fields (0/8 in that arm)");
  rows.push("");
  rows.push(`**Arm A (terse) — ${neverA.length} fields never populated:**`);
  rows.push(neverA.length ? neverA.map((k) => `\`${k}\``).join(", ") : "_none — every field hit at least once_");
  rows.push("");
  rows.push(`**Arm B (enriched) — ${neverB.length} fields never populated:**`);
  rows.push(neverB.length ? neverB.map((k) => `\`${k}\``).join(", ") : "_none — every field hit at least once_");
  rows.push("");

  rows.push("## Skipped → covered under enrichment");
  rows.push("");
  rows.push(`Enrichment RESCUED **${skippedToCovered.length}** field(s) that Arm A never touched:`);
  rows.push(skippedToCovered.length ? skippedToCovered.map((k) => `\`${k}\``).join(", ") : "_none_");
  rows.push("");

  // aggregate leaf coverage
  const totalFields = FIELD_SPECS.length;
  const aTouched = FIELD_SPECS.filter(([k]) => A.tally[k] > 0).length;
  const bTouched = FIELD_SPECS.filter(([k]) => B.tally[k] > 0).length;
  const aSum = FIELD_SPECS.reduce((s, [k]) => s + A.tally[k], 0);
  const bSum = FIELD_SPECS.reduce((s, [k]) => s + B.tally[k], 0);
  rows.push("## Aggregate");
  rows.push("");
  rows.push(`- Distinct leaf fields ever populated: **A ${aTouched}/${totalFields}** · **B ${bTouched}/${totalFields}**.`);
  rows.push(`- Total field-populations across all turns (sum of tallies, max ${totalFields * 8}): **A ${aSum}** · **B ${bSum}** (${bSum >= aSum ? "+" : ""}${bSum - aSum}).`);
  rows.push(`- Fields improved under B: **${improvedFields}** · regressed: **${regressedFields}** · unchanged: **${totalFields - improvedFields - regressedFields}**.`);
  rows.push("");

  // still-neglected = never-touched under B (enrichment couldn't fix) — the fields needing a different lever
  rows.push("## STILL-NEGLECTED even with examples (Arm B ≤ 1/8) — need a different fix (schema default / required / dedicated nudge)");
  rows.push("");
  const stillNeglected = FIELD_SPECS.filter(([k]) => B.tally[k] <= 1).map(([k]) => k);
  for (const k of stillNeglected) rows.push(`- \`${k}\` — A ${A.tally[k]}/8, B ${B.tally[k]}/8`);
  if (!stillNeglected.length) rows.push("_none — every field hit ≥2/8 under enrichment_");
  rows.push("");

  // verdict (data-driven)
  rows.push("## VERDICT");
  rows.push("");
  const materiallyHelped = (bTouched - aTouched >= 3) || (skippedToCovered.length >= 3) || (bSum - aSum >= 8);
  rows.push(`Enrichment ${materiallyHelped ? "**materially improved**" : "**did NOT materially improve**"} field coverage: distinct fields ever-touched went ${aTouched}→${bTouched} (${bTouched - aTouched >= 0 ? "+" : ""}${bTouched - aTouched}), total populations ${aSum}→${bSum} (${bSum - aSum >= 0 ? "+" : ""}${bSum - aSum}), and it rescued ${skippedToCovered.length} field(s) that terse descriptions never touched. Cost went A $${A.totals.cost.toFixed(4)} → B $${B.totals.cost.toFixed(4)}; tool_calls ${A.totals.toolCalls} → ${B.totals.toolCalls}.`);
  rows.push("");
  rows.push(`The fields STILL neglected under enrichment (listed above) are the ones examples can't fix — they need a structural lever (schema default, make-required in the enforced schema, or a dedicated per-turn nudge), because the model won't fill them from prose guidance alone.`);
  rows.push("");
  rows.push("_(Prose verdict above is generated from the measured tallies; see per-arm COVERAGE.md for the full field×turn matrices and transcript.md for narration + raw tool_calls.)_");

  fs.writeFileSync(path.join(OUT, "COVERAGE-SUMMARY.md"), rows.join("\n"));
  return { totalCost, skippedToCovered, neverA, neverB, stillNeglected, aTouched, bTouched, aSum, bSum, materiallyHelped };
}

// ---- OPPORTUNITY DENOMINATORS ----------------------------------------------------------------
// A raw `n/turns` tally is misleading for SUBTRACTIVE / conditional fields: `removeCondition` can only
// fire on a turn where a condition is actually active, so scoring it out of all 8 turns reads like a rate
// and isn't. (The 2026-07-29 run reported removeCondition 0/8 — but `addCondition` fired only twice all
// game, so the real ceiling was ~2.) These predicates run against the state at TURN START and yield the
// number of turns where the field COULD have fired; unlisted fields keep the plain turn denominator.
//
// Deliberately state-derived, not prose-derived — "did the fiction end an effect this turn" is a judgement
// call, "was an effect active at turn start" is a fact. This under-counts opportunity (a condition can be
// active for turns without the story ending it), so treat the result as a CEILING-corrected floor, not a
// true rate. Fields whose opportunity is genuinely unknowable from state (hpDelta — any beat may deal
// damage) are intentionally absent.
const PRECONDITIONS = {
  "update_party.removeCondition": (s) => s.party.some((p) => (p.conditions || []).length > 0),
  "update_inventory.remove": (s) => s.party.some((p) => (p.items || []).length > 0),
  "update_scene.presentRemove": (s) => (s.present || []).length > 0,
};

const serializeArm = (r) => ({
  tally: r.tally, denom: r.denom, missed: r.missed, gt: r.gt, totals: r.totals, failures: r.failures,
  turns: r.turns.map((t) => ({ turn: t.turn, coverage: t.coverage, opportunity: t.opportunity, nudged: t.nudged, truth: t.truth, tools_called: t.tools_called, num_tool_calls: t.num_tool_calls, delta: t.delta, usage: t.usage, finish: t.finish })),
});

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`[config] game=${GAME_KEY} arms=${ARMS_RUN.join(",")} effort=${EFFORT} nudge=${NUDGE_MODE} out=${path.basename(OUT)}`);
  const results = {};
  for (const key of ARMS_RUN) {
    if (!ARMS[key]) throw new Error(`unknown arm "${key}" (have: ${Object.keys(ARMS).join(",")})`);
    results[key] = await runArm(key);
  }
  // machine matrix — records the effort so a sweep's outputs are self-describing
  fs.writeFileSync(path.join(OUT, "coverage.json"), JSON.stringify({
    model: MODEL, game: GAME.title, game_key: GAME_KEY, reasoning_effort: EFFORT, nudge_mode: NUDGE_MODE, arms_run: ARMS_RUN,
    fields: FIELD_SPECS.map(([k]) => k),
    arms: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, serializeArm(r)])),
  }, null, 2));

  const totalCost = Object.values(results).reduce((a, r) => a + r.totals.cost, 0);
  // The A-vs-B summary only means anything with both arms; a single-arm sweep skips it.
  if (results.A && results.B) {
    const s = writeSummary(results.A, results.B);
    console.log(`\n=== TOTAL SPEND: $${s.totalCost.toFixed(4)} over ${FETCHES} OR fetches ===`);
    console.log(`ever-touched: A ${s.aTouched}/${FIELD_SPECS.length} B ${s.bTouched}/${FIELD_SPECS.length} · skipped→covered ${s.skippedToCovered.length} · still-neglected(B≤1) ${s.stillNeglected.length}`);
  } else {
    console.log(`\n=== TOTAL SPEND: $${totalCost.toFixed(4)} over ${FETCHES} OR fetches ===`);
    for (const [k, r] of Object.entries(results)) {
      const touched = FIELD_SPECS.filter(([key]) => (r.tally[key] ?? 0) > 0).length;
      console.log(`arm ${k}: ever-touched ${touched}/${FIELD_SPECS.length} · ${r.totals.toolCalls} tool calls · $${r.totals.cost.toFixed(4)}`);
    }
    console.log(`(single-arm run — A/B summary skipped; compare coverage.json against the baseline out2/)`);
  }
}
main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
