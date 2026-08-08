// ARCHIVED 2026-08-02 — pre-R2R3 vocabulary (hpDelta et al., retired by the actor-state reshape); kept as
// historical measurement records; do NOT run against the current contracts — mint fresh corpora instead.
//
// Throwaway spike harness: narrative+state-extraction method matrix over a fixed 6-turn game.
// Reads OPENROUTER_API_KEY from repo .env at runtime; NEVER prints/logs/writes the key.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "out");
const REPO_ENV = "~/dev/orbweaver/.env";
const MODEL = "anthropic/claude-sonnet-5";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// ---- creds (never logged) ----
const KEY = (() => {
  const line = fs.readFileSync(REPO_ENV, "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENROUTER_API_KEY="));
  if (!line) throw new Error("OPENROUTER_API_KEY not found in .env");
  let v = line.slice("OPENROUTER_API_KEY=".length).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
})();

// ---- real templates ----
const cheapTpl = JSON.parse(fs.readFileSync(path.join(DIR, "real-cheap-toolround.json"), "utf8"));
const reliableTpl = JSON.parse(fs.readFileSync(path.join(DIR, "real-reliable-structured.json"), "utf8"));
const narrTpl = JSON.parse(fs.readFileSync(path.join(DIR, "real-narrative-turn.json"), "utf8"));

const TOOLS = cheapTpl.tools; // 7 real tools, verbatim
const TOOL_SYS = cheapTpl.messages[0].content; // real cheap-round system prompt (array-of-parts, verbatim)
const EXTRACT_SYS = reliableTpl.messages[0].content; // real reliable extraction system prompt (string, verbatim)
const STATE_SCHEMA = reliableTpl.response_format.json_schema.schema; // real rpg_state_extraction schema, verbatim
// KEY FINDING (documented in SUMMARY.md): the real rpg_state_extraction schema CANNOT be grammar-enforced by
// claude-sonnet-5's structured-output path (the 4.6 capture could). Three walls, in order:
//   1. min/max on integers: "For 'integer' type, properties maximum, minimum are not supported".
//   2. sparse form: 41 optional params > the 24-optional cap ("grammar compilation inefficient").
//   3. all-required form: "The compiled grammar is too large" (all-required also forces fabrication).
// SUPERSEDED PLAN (kept only to explain why STATE_SCHEMA is still loaded): an earlier revision fell back to
// response_format {type:"json_object"} with the schema as PROMPT TEXT — no grammar enforcement. The owner's
// enforced-only rule killed that (see the STRICT-LEAN block below), so the structured/wrapper arms were
// REDESIGNED onto LEAN_SCHEMA / LEAN_WRAPPER_SCHEMA, both sent via `leanRF` as
// {type:"json_schema", strict:true}. json_object is NOT used on any live path — grep confirms the only two
// mentions are this comment and the directive below. STATE_SCHEMA survives as the measured-against artifact
// (the three walls above were found on it); it is not sent as a response_format.
// Tool methods (M2/M3/M4/M7) are UNAFFECTED — the tools API accepts the schema exactly as captured.
(function stripBounds(node) {
  if (Array.isArray(node)) return node.forEach(stripBounds);
  if (node && typeof node === "object") {
    if (node.type === "integer" || node.type === "number") { delete node.minimum; delete node.maximum; }
    for (const k of Object.keys(node)) stripBounds(node[k]);
  }
})(STATE_SCHEMA);
// robust JSON parse (strict json_schema output is already clean JSON; keep this as belt-and-suspenders).
function parseLenientJson(s) {
  if (!s) return {};
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  else { const i = t.indexOf("{"); const j = t.lastIndexOf("}"); if (i >= 0 && j > i) t = t.slice(i, j + 1); }
  try { return JSON.parse(t); } catch { return {}; }
}

// ---- STRICT-LEAN schema (owner directive: enforced-only, no json_object) ----
// The real rpg_state_extraction schema will NOT compile as a strict grammar on sonnet-5 (min/max unsupported;
// 41 optionals > 24-cap; all-required -> "grammar too large"). So the structured arm uses this LEAN schema:
// ALL fields required (0 optional), ZERO union/nullable fields, shallow, additionalProperties:false on every
// object, enums for closed sets. Probed on sonnet-5 -> compiles strict + returns valid output. Consequence
// (a KEY comparison point): all-required makes it NON-SPARSE — the model re-emits the FULL state snapshot
// every turn, so apply OVERWRITES (vs the tools methods' sparse deltas). Watch for stale/dropped items/NPCs.
const OBJ = (req, props) => ({ type: "object", additionalProperties: false, required: req, properties: props });
const LEAN_SCHEMA = OBJ(["scene", "party", "present", "inventory", "wallet", "quests", "journal"], {
  scene: OBJ(["location", "time_of_day", "weather"], {
    location: { type: "string" },
    time_of_day: { type: "string", enum: ["dawn", "morning", "afternoon", "evening", "night", "midnight", "unknown"] },
    weather: { type: "string" },
  }),
  party: OBJ(["hp_current", "hp_max", "status"], { hp_current: { type: "integer" }, hp_max: { type: "integer" }, status: { type: "string" } }),
  present: { type: "array", items: OBJ(["name", "mood", "disposition"], {
    name: { type: "string" }, mood: { type: "string" },
    disposition: { type: "string", enum: ["lover", "friend", "ally", "neutral", "enemy", "rival", "unknown"] },
  }) },
  inventory: { type: "array", items: OBJ(["item", "qty"], { item: { type: "string" }, qty: { type: "integer" } }) },
  wallet: OBJ(["gold", "silver"], { gold: { type: "integer" }, silver: { type: "integer" } }),
  quests: { type: "array", items: OBJ(["title", "status"], {
    title: { type: "string" }, status: { type: "string", enum: ["active", "completed", "failed"] },
  }) },
  journal: { type: "array", items: OBJ(["beat"], { beat: { type: "string" } }) },
});
const LEAN_WRAPPER_SCHEMA = OBJ(["message", "state"], { message: { type: "string" }, state: LEAN_SCHEMA });
const leanRF = (schema, name) => ({ type: "json_schema", json_schema: { name, strict: true, schema } });
// Lean extraction system prompt. The real EXTRACT_SYS describes the big DELTA-shaped schema (poolDeltas etc.)
// and can't be reused for a full-snapshot lean schema — so this is a minimal matched prompt (documented).
const LEAN_EXTRACT_SYS = "You keep a role-play game's tracked state in sync with the story. You are given the RECENT STORY, the CURRENT TRACKED STATE, and the LATEST BEAT. Output the COMPLETE current tracked state as ONE JSON object — this is a full SNAPSHOT, not a delta: restate every field at its current value, carrying forward everything still true from the current state and folding in what the latest beat changed. Never drop a character, item, or quest that is still in play. Use \"unknown\" for an enum you can't determine yet. Never invent facts the story doesn't show.";

// The two trailing instruction paragraphs (immersive-card grammar + never-recite-numbers), byte-for-byte.
const NARR_FULL_NOTE = narrTpl.messages[4].content;
const TRAILING = NARR_FULL_NOTE.slice(NARR_FULL_NOTE.indexOf("When it fits the scene")); // ends with the closing "]"

// GM persona system. NOTE (documented in SUMMARY.md): the real template's persona is a DIFFERENT game
// (Lantern-keeper / Aldric Vane / House Vane). Using it verbatim would inject a contradictory story into
// every Kestrel turn and invalidate the state-population measurement, so we adapt the persona to the seed
// game while keeping the template's terse/wry GM VOICE and the two trailing instruction paragraphs verbatim.
const PERSONA = "You are the game master of a dark low-fantasy tale. Keep replies terse and wry, grounded in the rain-soaked roads and taverns of the frontier town of Ashfall. Narrate vivid, immersive second-person prose for the player character, a sellsword named Kestrel.";

// ---- seed state ----
function seedState() {
  return {
    scene: { location: "", calendarDate: "", timeOfDay: "", weather: "", recentEvent: "" },
    plot: { act: 1, maxActs: 3, title: "The Ashfall Courier", actTitle: "", actSummary: "" },
    party: [{
      ref: "player", name: "Kestrel", role: "sellsword", level: 2,
      hp: { value: 22, max: 22 },
      pools: [{ name: "Stamina", value: 10, max: 10 }],
      conditions: [], status: "dry",
      items: [
        { name: "Worn Shortsword", quantity: 1, location: "sheathed" },
        { name: "Traveler's Cloak", quantity: 1, location: "worn" },
      ],
      wallet: { gold: 0, silver: 5 },
    }],
    present: [],
    widgets: {},
    quests: [],
    journal: [],
    beats: [],
  };
}

const ACTIONS = [
  "I push through the tavern door, shake off the rain, and scan the room for anyone who looks like they're waiting for someone.",
  "I sit across from the hooded figure and slide my last three silver across the table. 'You're Ashe? I was told you had work.'",
  "I take the job. Ashe hands me a sealed letter — I tuck it into my coat and ask where the courier went missing.",
  "On the road at dusk, I reach the overturned courier cart. I draw my blade and approach, watching the treeline.",
  "Two bandits rush from the brush. I roll to strike the nearer one before they close.",
  "Wounded but still standing, I search the wrecked cart for the courier's missing satchel.",
];

// ---- clone / actor lookup ----
const clone = (o) => JSON.parse(JSON.stringify(o));
function findActor(state, ref) {
  if (ref === "player" || ref === "Alex") return state.party[0];
  let a = state.party.find((p) => p.name === ref || p.ref === ref);
  if (a) return a;
  // unknown ref (schema enum is locked to the template's cast) -> default to player character
  return state.party[0];
}

// ---- ops (unified apply for tool-calls AND structured object) ----
function applyOp(state, name, args, touched) {
  args = args || {};
  switch (name) {
    case "update_party": {
      const a = findActor(state, args.targetRef);
      if (typeof args.hpDelta === "number") { a.hp.value = Math.max(0, Math.min(a.hp.max, a.hp.value + args.hpDelta)); touched.party = true; }
      for (const pd of args.poolDeltas || []) {
        const p = a.pools.find((x) => x.name.toLowerCase() === pd.name.toLowerCase());
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
        const ex = a.items.find((x) => x.name.toLowerCase() === it.name.toLowerCase());
        if (ex) ex.quantity += it.quantity || 1;
        else a.items.push({ name: it.name, quantity: it.quantity || 1, location: it.location || "", description: it.description || "" });
        touched.inventory = true;
      }
      for (const it of args.remove || []) {
        const ex = a.items.find((x) => x.name.toLowerCase() === it.name.toLowerCase());
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
        let c = state.present.find((x) => x.name.toLowerCase() === u.name.toLowerCase());
        if (!c) { c = { name: u.name, emoji: "", mood: "", appearance: "", outfit: "", thoughts: "", customFields: {}, relationship: { kind: "", label: "" } }; state.present.push(c); }
        for (const k of ["emoji", "mood", "appearance", "outfit", "thoughts"]) if (u[k]) c[k] = u[k];
        // customFields can be array (schema) or object
        if (Array.isArray(u.customFields)) for (const cf of u.customFields) c.customFields[cf.name] = cf.value;
        else if (u.customFields && typeof u.customFields === "object") Object.assign(c.customFields, u.customFields);
        if (u.relationship) { if (u.relationship.kind) c.relationship.kind = u.relationship.kind; if (u.relationship.label) c.relationship.label = u.relationship.label; }
        touched.scene = true;
      }
      for (const r of args.presentRemove || []) { state.present = state.present.filter((x) => x.name !== r && x.name.toLowerCase() !== String(r).toLowerCase()); touched.scene = true; }
      return;
    }
    case "set_widget_value": {
      state.widgets[args.widgetRef] = { value: args.value, max: args.max, items: args.items };
      touched.widgets = true;
      return;
    }
    case "upsert_quest": {
      const action = String(args.action || "").toLowerCase(); // enum casing not guaranteed
      let q = state.quests.find((x) => x.name.toLowerCase() === (args.name || "").toLowerCase());
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
    case "no_changes":
      return;
    default:
      return;
  }
}

// structured rpg_state_extraction object -> op list
function structuredToOps(obj) {
  const ops = [];
  if (!obj || typeof obj !== "object") return ops;
  for (const p of obj.party || []) ops.push(["update_party", p]);
  for (const i of obj.inventory || []) ops.push(["update_inventory", i]);
  if (obj.scene && Object.keys(obj.scene).length) {
    const s = { ...obj.scene };
    if (s.plot && !s.plot.actTitle && s.plot.title === undefined) { /* keep */ }
    ops.push(["update_scene", s]);
  }
  for (const w of obj.widgets || []) ops.push(["set_widget_value", w]);
  for (const q of obj.quests || []) ops.push(["upsert_quest", q]);
  for (const j of obj.journal || []) ops.push(["add_journal_entry", j]);
  return ops;
}

function applyOps(state, ops) {
  const touched = { party: false, inventory: false, scene: false, widgets: false, quests: false, journal: false };
  for (const [name, args] of ops) applyOp(state, name, args, touched);
  return touched;
}

// Apply a LEAN full-state SNAPSHOT by OVERWRITING running state (non-sparse semantics). touched flags are
// derived by diffing before vs after so completeness/delta metrics stay comparable with the tools methods.
const TOD = new Set(["dawn", "morning", "afternoon", "evening", "night", "midnight"]);
function applyLeanSnapshot(state, snap) {
  const touched = { party: false, inventory: false, scene: false, widgets: false, quests: false, journal: false };
  if (!snap || typeof snap !== "object") return touched;
  const pc = state.party[0];
  if (snap.scene && typeof snap.scene === "object") {
    if (snap.scene.location) state.scene.location = snap.scene.location;
    if (snap.scene.time_of_day && TOD.has(String(snap.scene.time_of_day).toLowerCase())) state.scene.timeOfDay = String(snap.scene.time_of_day).toLowerCase();
    if (snap.scene.weather) state.scene.weather = snap.scene.weather;
    touched.scene = true;
  }
  if (snap.party && typeof snap.party === "object") {
    if (typeof snap.party.hp_current === "number") pc.hp.value = snap.party.hp_current;
    if (typeof snap.party.hp_max === "number") pc.hp.max = snap.party.hp_max;
    if (typeof snap.party.status === "string" && snap.party.status) pc.status = snap.party.status;
    touched.party = true;
  }
  if (Array.isArray(snap.present)) {
    state.present = snap.present.map((c) => ({
      name: c.name, emoji: "", mood: c.mood || "", appearance: "", outfit: "", thoughts: "",
      customFields: {}, relationship: { kind: c.disposition || "", label: "" },
    }));
    touched.scene = true;
  }
  if (Array.isArray(snap.inventory)) {
    pc.items = snap.inventory.map((i) => ({ name: i.item, quantity: i.qty || 1, location: "", description: "" }));
    touched.inventory = true;
  }
  if (snap.wallet && typeof snap.wallet === "object") {
    if (typeof snap.wallet.gold === "number") pc.wallet.gold = snap.wallet.gold;
    if (typeof snap.wallet.silver === "number") pc.wallet.silver = snap.wallet.silver;
    touched.inventory = true;
  }
  if (Array.isArray(snap.quests)) {
    state.quests = snap.quests.map((q) => ({ name: q.title, status: String(q.status || "active").toLowerCase(), description: "", objectives: [] }));
    touched.quests = true;
  }
  if (Array.isArray(snap.journal) && snap.journal.length) {
    state.journal = snap.journal.map((j) => ({ type: "note", title: "", content: j.beat }));
    touched.journal = true;
  }
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
  lines.push("[Note from system: # Game state");
  const sceneBits = [s.location || "(unset)", s.calendarDate || "", s.timeOfDay || "", s.weather ? `${s.weather}` : ""].filter(Boolean);
  lines.push(`Scene: ${sceneBits.join(" · ")}`);
  const actLabel = state.plot.actTitle ? `: ${state.plot.actTitle}` : "";
  const situation = s.recentEvent ? ` — ${s.recentEvent}` : "";
  lines.push(`Story: ${state.plot.title} — act ${state.plot.act}/${state.plot.maxActs}${actLabel}${situation}`);
  lines.push("Party:");
  const carrying = fmtItems(pc.items);
  const cond = pc.conditions.length ? pc.conditions.join(", ") : pc.status;
  lines.push(`- ${pc.name} — (${pc.role}) — Lv ${pc.level} — HP ${pc.hp.value}/${pc.hp.max} — ${fmtPools(pc.pools)} — ${fmtWallet(pc.wallet)} — carrying: ${carrying} — ${cond}`);
  if (state.present.length) {
    lines.push("Present:");
    for (const c of state.present) {
      const trust = c.customFields.trust != null ? ` — Trust ${c.customFields.trust}/100` : "";
      const role = c.customFields.role ? ` — Role: ${c.customFields.role}` : "";
      const rel = c.relationship.label || c.relationship.kind || "";
      lines.push(`- ${c.emoji ? c.emoji + " " : ""}${c.name} — ${c.mood || "—"}${rel ? " — " + rel : ""}${trust}${role}`);
    }
  }
  if (state.quests.length) {
    lines.push("Active quests:");
    for (const q of state.quests) {
      lines.push(`- ${q.name} [${q.status}]`);
      for (const o of q.objectives) lines.push(`  ${o.completed ? "●" : "○"} ${o.text}`);
    }
  }
  if (state.beats.length) {
    lines.push("Recent beats:");
    for (const b of state.beats.slice(-3)) lines.push(`- ${b}`);
  }
  lines.push("");
  lines.push(`CHANGES SINCE LAST BEAT: ${changesLine}`);
  lines.push("");
  const body = lines.join("\n") + TRAILING; // TRAILING closes with "]"
  return `${action}\n\n${body}`;
}

// ---- delta computation (before vs after) ----
function computeDelta(before, after) {
  const parts = [];
  const b = before, a = after;
  const bp = b.party[0], ap = a.party[0];
  if (bp.hp.value !== ap.hp.value) parts.push(`HP ${bp.hp.value}→${ap.hp.value} (${ap.hp.value - bp.hp.value >= 0 ? "+" : ""}${ap.hp.value - bp.hp.value})`);
  for (const pool of ap.pools) {
    const pb = bp.pools.find((x) => x.name === pool.name);
    if (pb && pb.value !== pool.value) parts.push(`${pool.name} ${pb.value}→${pool.value} (${pool.value - pb.value >= 0 ? "+" : ""}${pool.value - pb.value})`);
  }
  for (const c of ap.conditions) if (!bp.conditions.includes(c)) parts.push(`+ condition "${c}"`);
  for (const c of bp.conditions) if (!ap.conditions.includes(c)) parts.push(`- condition "${c}"`);
  if (bp.status !== ap.status) parts.push(`status "${bp.status}"→"${ap.status}"`);
  // items
  const bItems = Object.fromEntries(bp.items.map((i) => [i.name.toLowerCase(), i.quantity]));
  const aItems = Object.fromEntries(ap.items.map((i) => [i.name.toLowerCase(), i.quantity]));
  for (const it of ap.items) if (!(it.name.toLowerCase() in bItems)) parts.push(`+ ${it.name}`);
  for (const it of bp.items) if (!(it.name.toLowerCase() in aItems)) parts.push(`- ${it.name}`);
  for (const [k, v] of Object.entries(aItems)) if (k in bItems && bItems[k] !== v) parts.push(`${k} ×${bItems[k]}→×${v}`);
  // wallet
  for (const [k, v] of Object.entries(a.party[0].wallet)) {
    const bv = b.party[0].wallet[k] ?? 0;
    if (bv !== v) parts.push(`${k} ${bv}→${v} (${v - bv >= 0 ? "+" : ""}${v - bv})`);
  }
  // scene
  if (b.scene.location !== a.scene.location && a.scene.location) parts.push(`scene → ${a.scene.location}`);
  if (b.scene.timeOfDay !== a.scene.timeOfDay && a.scene.timeOfDay) parts.push(`time → ${a.scene.timeOfDay}`);
  if (b.scene.weather !== a.scene.weather && a.scene.weather) parts.push(`weather → ${a.scene.weather}`);
  // present cast
  const bNames = new Set(b.present.map((c) => c.name.toLowerCase()));
  const aNames = new Set(a.present.map((c) => c.name.toLowerCase()));
  for (const c of a.present) if (!bNames.has(c.name.toLowerCase())) parts.push(`+ NPC ${c.name}`);
  for (const c of b.present) if (!aNames.has(c.name.toLowerCase())) parts.push(`- NPC ${c.name} (dropped)`);
  for (const c of a.present) {
    const bc = b.present.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
    if (bc && bc.customFields.trust !== c.customFields.trust && c.customFields.trust != null) parts.push(`${c.name} trust ${bc.customFields.trust ?? "?"}→${c.customFields.trust}`);
  }
  // quests
  const bQ = Object.fromEntries(b.quests.map((q) => [q.name.toLowerCase(), q.status]));
  for (const q of a.quests) {
    if (!(q.name.toLowerCase() in bQ)) parts.push(`quest "${q.name}" started`);
    else if (bQ[q.name.toLowerCase()] !== q.status) parts.push(`quest "${q.name}" ${q.status}`);
  }
  // journal
  if (a.journal.length > b.journal.length) parts.push(`+${a.journal.length - b.journal.length} journal`);
  return parts.length ? parts.join("; ") : "no tracked change";
}

// state-completeness: populated planes this turn (0..5)
function completeness(state, touched) {
  let n = 0;
  if (state.scene.location) n++;
  if (state.present.length >= 1) n++;
  if (state.quests.length >= 1) n++;
  if (touched.inventory) n++;
  if (touched.party) n++;
  return n;
}

// count null/empty leaf fields in an extraction payload (approximation)
function countEmptyLeaves(obj) {
  let n = 0;
  const walk = (v) => {
    if (v === null || v === undefined || v === "") { n++; return; }
    if (Array.isArray(v)) { if (v.length === 0) return; v.forEach(walk); return; }
    if (typeof v === "object") { const ks = Object.keys(v); if (ks.length === 0) return; ks.forEach((k) => walk(v[k])); return; }
  };
  walk(obj);
  return n;
}

// ---- OpenRouter call ----
async function orCall(body, label) {
  const started = Date.now();
  let lastErr;
  // Budget: 2 attempts. Spend the 2nd on a max_tokens bump if the 1st truncated (finish_reason "length").
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://localhost/spike", "X-Title": "orb-spike" },
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
  return {
    cost_usd: u.cost ?? 0,
    prompt_tokens: u.prompt_tokens ?? 0,
    completion_tokens: u.completion_tokens ?? 0,
    reasoning_tokens: u.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

// ---- narrative body ----
function narrativeMessages(history, action, reminderState, changesLine) {
  const msgs = [{ role: "system", content: [{ type: "text", text: PERSONA, cache_control: { type: "ephemeral" } }] }];
  for (const h of history) { msgs.push({ role: "user", content: h.action }); msgs.push({ role: "assistant", content: h.narrative }); }
  msgs.push({ role: "user", content: renderReminder(reminderState, action, changesLine) });
  return msgs;
}

const BASE = { model: MODEL, stream: false, usage: { include: true }, provider: { order: ["Anthropic"], allow_fallbacks: false }, plugins: [{ id: "context-compression", enabled: false }] };

// build extraction B user message (shared M1/M2 for fairness)
function extractionUserMessage(history, currentNarrative, state) {
  const story = history.map((h) => `Player: ${h.action}\nGM: ${h.narrative}`).join("\n\n");
  const stateJson = JSON.stringify(serializeStateForExtract(state));
  return `RECENT STORY (oldest first):\n${story ? story + "\n\n" : ""}Player: ${state.__lastAction}\n\nCURRENT TRACKED STATE:\n${stateJson}\n\nLATEST BEAT (the newest story turn above — your delta covers exactly this):\n${currentNarrative}`;
}
function serializeStateForExtract(state) {
  const pc = state.party[0];
  return {
    location: state.scene.location, calendarDate: state.scene.calendarDate, timeOfDay: state.scene.timeOfDay,
    weather: state.scene.weather, recentEvents: state.beats.slice(-3),
    presentCharacters: state.present.map((c) => ({ name: c.name, mood: c.mood, customFields: c.customFields, relationship: c.relationship })),
    plot: { act: state.plot.act, title: state.plot.title, actTitle: state.plot.actTitle },
    party: [{ name: pc.name, hp: pc.hp, pools: pc.pools, conditions: pc.conditions, status: pc.status, wallet: pc.wallet, items: pc.items }],
    quests: state.quests, widgets: state.widgets,
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

// max_tokens ceilings (owner directive): narrative-bearing calls 8192, pure extraction rounds 4096;
// orCall bumps to 16000 once on finish_reason "length".
const MT_NARR = 8192, MT_EXTRACT = 4096;

// ---- method runners ----
// Returns {narrative, ops?, snapshot?, kind, extractPayload, calls}. kind="ops" => applyOps(ops);
// kind="snapshot" => applyLeanSnapshot(snapshot).
async function runMethod(method, history, action, state, changesLine) {
  const narrMsgs = narrativeMessages(history, action, state, changesLine);
  const calls = [];
  const rec = (r) => { calls.push({ usage: usageOf(r.json), latency_ms: r.latency_ms, finish: r.json.choices[0].finish_reason, message: r.json.choices[0].message }); return r.json.choices[0].message; };

  // ---- STRICT-LEAN 2-call: A prose, B strict-lean full-snapshot extraction ----
  if (method === "2call-strict-lean") {
    const A = await orCall({ ...BASE, max_tokens: MT_NARR, reasoning: { effort: "none" }, messages: narrMsgs }, `${method}/A`);
    const narrative = rec(A).content || "";
    const userMsg = extractionUserMessage(history, narrative, { ...state, __lastAction: action });
    const B = await orCall({ ...BASE, provider: { ...BASE.provider, require_parameters: true }, max_tokens: MT_EXTRACT, reasoning: { effort: "none" },
      messages: [{ role: "system", content: LEAN_EXTRACT_SYS }, { role: "user", content: userMsg }], response_format: leanRF(LEAN_SCHEMA, "rpg_state_lean") }, `${method}/B`);
    const snap = parseLenientJson(rec(B).content);
    return { narrative, snapshot: snap, kind: "snapshot", extractPayload: snap, calls };
  }

  // ---- 2-call TOOL round: A prose, B strict-tool extraction (today's cheap path) ----
  if (method === "2call-cheap") {
    const A = await orCall({ ...BASE, max_tokens: MT_NARR, reasoning: { effort: "none" }, messages: narrMsgs }, `${method}/A`);
    const narrative = rec(A).content || "";
    const userMsg = extractionUserMessage(history, narrative, { ...state, __lastAction: action });
    const B = await orCall({ ...BASE, max_tokens: MT_EXTRACT, reasoning: { effort: "none" },
      messages: [{ role: "system", content: TOOL_SYS }, { role: "user", content: userMsg }], tools: TOOLS, tool_choice: "required" }, `${method}/B`);
    const ops = parseToolCalls(rec(B));
    return { narrative, ops, kind: "ops", extractPayload: ops.map(([n, a]) => ({ [n]: a })), calls };
  }

  // ---- 1-call TOOLS: persona system + tools; keep BOTH content and tool_calls ----
  if (method === "1call-tools" || method === "1call-tools+reasoning" || method === "1call-tools-required") {
    const body = { ...BASE, max_tokens: MT_NARR, messages: narrMsgs, tools: TOOLS,
      tool_choice: method === "1call-tools-required" ? "required" : "auto",
      reasoning: method === "1call-tools+reasoning" ? { effort: "high" } : { effort: "none" } };
    const msg = rec(await orCall(body, method));
    const ops = parseToolCalls(msg);
    return { narrative: msg.content || "", ops, kind: "ops", extractPayload: ops.map(([n, a]) => ({ [n]: a })), calls };
  }

  // ---- M8: extraction-framing system (cheap tool round) + tools required, in ONE call; keep the message ----
  // Tests "we already pay for the cheap tool round; is its co-emitted (currently discarded) message usable
  // as the narrative?" Same narrative user turn as M3 (so there's story to advance), but the SYSTEM is the
  // extraction/tool framing (TOOL_SYS, which says "Do not narrate") + tool_choice:"required".
  if (method === "1call-tools-required-extractframe") {
    const msgs = [{ role: "system", content: TOOL_SYS }, ...narrMsgs.slice(1)];
    const msg = rec(await orCall({ ...BASE, max_tokens: MT_NARR, messages: msgs, tools: TOOLS, tool_choice: "required", reasoning: { effort: "none" } }, method));
    const ops = parseToolCalls(msg);
    return { narrative: msg.content || "", ops, kind: "ops", extractPayload: ops.map(([n, a]) => ({ [n]: a })), calls };
  }

  // ---- 1-call STRICT-LEAN WRAPPER: grammar-enforced {message, state:<lean>} ----
  if (method === "1call-wrapper-strict-lean" || method === "1call-wrapper-strict-lean+reasoning") {
    const body = { ...BASE, provider: { ...BASE.provider, require_parameters: true }, max_tokens: MT_NARR, messages: narrMsgs,
      response_format: leanRF(LEAN_WRAPPER_SCHEMA, "narrative_and_lean_state"),
      reasoning: method.endsWith("+reasoning") ? { effort: "high" } : { effort: "none" } };
    const msg = rec(await orCall(body, method));
    const parsed = parseLenientJson(msg.content);
    return { narrative: parsed.message || "", snapshot: parsed.state || {}, kind: "snapshot", extractPayload: parsed.state || {}, calls };
  }

  throw new Error("unknown method " + method);
}

// M8 (1call-tools-required-extractframe) DROPPED from the run: replaying the real cheap tool-round body
// against OR returns message.content="" under BOTH tool_choice required AND auto (finish_reason tool_calls)
// — the extraction system prompt tells the model to only extract, so the co-emitted message is empty and
// cannot serve as the narrative. Recorded as a one-liner in SUMMARY.md; not worth spending 6 turns on.
let METHODS = [
  "2call-strict-lean", "2call-cheap", "1call-tools", "1call-tools+reasoning",
  "1call-wrapper-strict-lean", "1call-wrapper-strict-lean+reasoning",
  "1call-tools-required",
];
let MAX_TURNS = ACTIONS.length;
if (process.env.SPIKE_METHODS) METHODS = process.env.SPIKE_METHODS.split(",");
if (process.env.SPIKE_TURNS) MAX_TURNS = Number(process.env.SPIKE_TURNS);

const CARD_RE = /:::\s*card/i;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const summary = { model: MODEL, methods: {}, totalCost: 0, totalCalls: 0 };
  let globalCalls = 0;

  for (const method of METHODS) {
    const mdir = path.join(OUT, method);
    fs.mkdirSync(mdir, { recursive: true });
    const state = seedState();
    const history = [];
    let changesLine = "SCENE OPENS";
    const transcript = [`# ${method}\n\nModel: ${MODEL} · fixed 6-turn game "The Ashfall Courier"\n`];
    const perTurn = [];
    let mCost = 0, mLat = 0, completSum = 0, narrCount = 0, fullStateCount = 0;
    const failures = [];

    for (let t = 0; t < MAX_TURNS; t++) {
      const action = ACTIONS[t];
      const before = clone(state);
      let result;
      try {
        result = await runMethod(method, history, action, state, changesLine);
      } catch (e) {
        failures.push(`turn ${t + 1}: ${e.message}`);
        transcript.push(`\n## Turn ${t + 1}\n**Player:** ${action}\n\n**ERROR:** ${e.message}\n`);
        break;
      }
      globalCalls += result.calls.length;
      const ops = result.ops || [];
      const touched = result.kind === "snapshot" ? applyLeanSnapshot(state, result.snapshot) : applyOps(state, ops);
      const after = clone(state);
      const turnDelta = computeDelta(before, after);
      // metrics
      const usage = result.calls.reduce((acc, c) => ({
        prompt_tokens: acc.prompt_tokens + c.usage.prompt_tokens,
        completion_tokens: acc.completion_tokens + c.usage.completion_tokens,
        reasoning_tokens: acc.reasoning_tokens + c.usage.reasoning_tokens,
        cost_usd: acc.cost_usd + c.usage.cost_usd,
      }), { prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, cost_usd: 0 });
      const latency = result.calls.reduce((a, c) => a + c.latency_ms, 0);
      const finish = result.calls.map((c) => c.finish).join("+");
      const compl = completeness(state, touched);
      const emptyLeaves = countEmptyLeaves(result.extractPayload);
      const card = CARD_RE.test(result.narrative);
      const statePresent = result.kind === "snapshot"
        ? Object.keys(result.snapshot || {}).length > 0
        : (ops.some(([n]) => n !== "no_changes") && ops.length > 0);
      mCost += usage.cost_usd; mLat += latency; completSum += compl;
      if (result.narrative.trim().length > 0) narrCount++;
      if (compl >= 4) fullStateCount++;

      const turnMetrics = {
        turn: t + 1, latency_ms: latency, ...usage, finish_reason: finish,
        narrative_chars: result.narrative.length, state_present: statePresent,
        state_completeness: compl, null_or_empty_fields: emptyLeaves, card_emitted: card,
        num_ops: ops.length, delta: turnDelta,
      };
      perTurn.push(turnMetrics);

      // raw json
      fs.writeFileSync(path.join(mdir, `turn-${t + 1}.json`), JSON.stringify({
        turn: t + 1, method, action,
        requestMeta: { model: MODEL, calls: result.calls.length, method_note: "no api key stored" },
        narrative: result.narrative, extractPayload: result.extractPayload, ops,
        stateAfter: after, delta: turnDelta, metrics: turnMetrics,
        responses: result.calls.map((c) => ({ usage: c.usage, latency_ms: c.latency_ms, finish: c.finish, message: c.message })),
      }, null, 2));

      // transcript
      transcript.push(`\n## Turn ${t + 1}\n`);
      transcript.push(`**Player:** ${action}\n`);
      transcript.push(`**Narrative** (${result.narrative.length} chars${card ? ", card" : ""}, finish=${finish}):\n\n${result.narrative || "_(no narrative)_"}\n`);
      const extractLabel = result.kind === "snapshot" ? "strict-lean full snapshot" : `${ops.length} tool ops`;
      transcript.push(`**Extracted (${extractLabel}):**\n\n\`\`\`json\n${JSON.stringify(result.extractPayload, null, 2).slice(0, 4000)}\n\`\`\`\n`);
      transcript.push(`**Delta:** ${turnDelta}\n`);
      transcript.push(`**Metrics:** completeness ${compl}/5 · cost $${usage.cost_usd.toFixed(4)} · ${latency}ms · in ${usage.prompt_tokens} / out ${usage.completion_tokens} / reason ${usage.reasoning_tokens}\n`);

      // advance
      history.push({ action, narrative: result.narrative });
      changesLine = turnDelta === "no tracked change" ? "no tracked change" : turnDelta;
    }

    fs.writeFileSync(path.join(mdir, "transcript.md"), transcript.join("\n"));
    const nTurns = perTurn.length;
    summary.methods[method] = {
      total_cost_usd: +mCost.toFixed(4), total_latency_ms: mLat,
      mean_completeness: nTurns ? +(completSum / nTurns).toFixed(2) : 0,
      turns_completed: nTurns, turns_with_narrative: narrCount, turns_with_full_state: fullStateCount,
      failures, perTurn,
    };
    summary.totalCost += mCost;
    console.log(`[done] ${method}: turns=${nTurns} cost=$${mCost.toFixed(4)} narr=${narrCount}/${nTurns} meanCompl=${(completSum / (nTurns || 1)).toFixed(2)}${failures.length ? " FAIL:" + failures.length : ""}`);
  }

  summary.totalCost = +summary.totalCost.toFixed(4);
  summary.totalCalls = globalCalls;
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  writeSummaryMd(summary);
  console.log(`\n=== TOTAL SPEND: $${summary.totalCost} over ${globalCalls} calls ===`);
}

function writeSummaryMd(summary) {
  const rows = [];
  rows.push("# Spike SUMMARY — narrative+state extraction method matrix");
  rows.push("");
  rows.push(`Model: \`${summary.model}\` · fixed 6-turn game "The Ashfall Courier" · 1 rep/method.`);
  rows.push(`Total spend: **$${summary.totalCost}** over ${summary.totalCalls} OpenRouter calls.`);
  rows.push("");
  const MECH = {
    "2call-strict-lean": "2 calls · strict json_schema (lean, full-snapshot)",
    "2call-cheap": "2 calls · strict tool args (sparse)",
    "1call-tools": "1 call · persona + tools auto (sparse)",
    "1call-tools+reasoning": "1 call · persona + tools auto + reasoning:high (sparse)",
    "1call-wrapper-strict-lean": "1 call · strict json_schema {message,state} (full-snapshot)",
    "1call-wrapper-strict-lean+reasoning": "1 call · strict wrapper + reasoning:high (full-snapshot)",
    "1call-tools-required": "1 call · persona + tools REQUIRED (sparse)",
    "1call-tools-required-extractframe": "1 call · extraction-framing + tools REQUIRED (sparse)",
  };
  rows.push("| Method | Mechanism (all ENFORCED) | Total cost | Latency | Mean compl (/5) | Narrative kept? | Cards | Notes |");
  rows.push("|---|---|---|---|---|---|---|---|");
  for (const m of METHODS) {
    const s = summary.methods[m];
    if (!s) continue;
    const narr = s.turns_with_narrative === s.turns_completed && s.turns_completed > 0
      ? `yes ${s.turns_with_narrative}/${s.turns_completed}`
      : `PARTIAL ${s.turns_with_narrative}/${s.turns_completed}`;
    const avgChars = Math.round(s.perTurn.reduce((a, p) => a + p.narrative_chars, 0) / (s.perTurn.length || 1));
    const cards = s.perTurn.filter((p) => p.card_emitted).length;
    const reason = s.perTurn.reduce((a, p) => a + p.reasoning_tokens, 0);
    const dropped = s.perTurn.filter((p) => /\(dropped\)|^- |; - /.test(p.delta)).length;
    const notes = [];
    if (s.failures.length) notes.push(`FAILED ${s.failures.length}`);
    notes.push(`~${avgChars} chars/narr`);
    if (reason) notes.push(`${reason} reason toks`);
    const trunc = s.perTurn.filter((p) => String(p.finish_reason).includes("length")).length;
    if (trunc) notes.push(`${trunc} truncated`);
    if (dropped) notes.push(`${dropped} turns dropped carry-over`);
    rows.push(`| \`${m}\` | ${MECH[m] || "?"} | $${s.total_cost_usd.toFixed(4)} | ${(s.total_latency_ms / 1000).toFixed(1)}s | ${s.mean_completeness} | ${narr} | ${cards}/${s.turns_completed} | ${notes.join(" · ")} |`);
  }
  rows.push("");
  rows.push("Completeness = populated planes/turn (0–5): scene-has-location, ≥1 present cast, ≥1 quest, inventory-touched, party-touched. NOTE: full-snapshot methods (strict-lean) re-emit ALL planes every turn, so their completeness runs high by construction — it measures coverage, not change-detection skill. \"dropped carry-over\" = a turn whose delta removed an item/NPC that was still in play (the stale-overwrite risk of non-sparse full-state extraction).");
  rows.push("");
  rows.push("## Verdict");
  rows.push("_(verdict prose written after run inspection — see per-method out/<method>/transcript.md for turn-by-turn behavior)_");
  fs.writeFileSync(path.join(OUT, "SUMMARY.md"), rows.join("\n"));
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
