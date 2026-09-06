// Affinity Tracker — the QUIET THINKER archetype of an Orbweaver plugin.
//
// WHAT IT DOES. Every few messages it reads the recent transcript, asks the model — privately, outside the
// room, on the installer's own summarize connection — how warm the scene has become, keeps the number in its
// own storage, and notifies the installer only when it MOVES. Nothing it does is ever visible in the room.
//
// THE ONE THING THAT MAKES THIS ARCHETYPE DIFFERENT: `llm.quiet` is SPEND. It is the only host function that
// costs the installer money, and it is bounded by exactly two things — the host's hourly per-plugin floor
// (30 calls/hour, the domain's rate belt) and YOUR OWN DEBOUNCE. The floor is a backstop against a runaway
// plugin, not a budget: hitting it means every later call this hour is refused, so a plugin whose design
// relies on the floor is a plugin that stops working halfway through a busy evening. Score every Nth message,
// not every message.
//
// THE MODEL'S ANSWER IS UNTRUSTED INPUT. It is not your code and it is not the host's; it is a string a
// language model produced, and it will eventually be "7/10", "seven", or a paragraph of preamble. Parse it
// strictly, clamp it, and treat an unparseable answer as "no reading this time" rather than as a zero — a
// zero you invented is a number that then gets acted on.
//
// WHAT `llm.quiet` IS NOT: it cannot write. It commits no message, emits no event, takes no turn slot. You
// get a string back and must route it through some OTHER granted capability to make anything happen — which
// is precisely why the capability is addable at all. Here it goes to private storage and a notice.

const host = orb.host(1);

/** Score every Nth committed message. THE budget dial — see the header. */
const SCORE_EVERY = 8;

/** How much transcript the reading is taken over. `listMessages` is capped at 50 host-side and each message's
 *  content is capped at 16 KiB; a dozen is plenty for "how is this scene going" and keeps the prompt cheap. */
const WINDOW = 12;

/** How far the score must move before the installer is told. Without this the notice fires on 6→7 noise, and
 *  a notification that fires on noise is a notification people mute. (The host also enforces a 60 s per-chat
 *  cooldown on plugin notices — that is a flood backstop, not a substitute for having something to say.) */
const NOTIFY_DELTA = 3;

const SCORE_MIN = 0;
const SCORE_MAX = 10;

/** How much of an unusable model reply gets logged — enough to diagnose the prompt, short enough that a
 *  chatty model cannot flood the plugin's bounded log ring with one line. */
const LOG_EXCERPT_CHARS = 80;

/** The FIRST integer in the model's reply, or `null`. Deliberately not `Number(text)`: a reply of
 *  "Warmth: 7 — they finally sat down together" is the common case, not the exception. */
const FIRST_INT_RE = /-?\d+/;

const countKey = (chatId) => `count:${chatId}`;
const scoreKey = (chatId) => `score:${chatId}`;

/** The prompt. Short, closed, and stated as a FORMAT instruction, because the parse below is the contract:
 *  every word you spend asking for prose is a word you then have to defend against. */
function buildPrompt(messages) {
  const transcript = messages.map((m) => `${m.authorDisplayName}: ${m.content}`).join("\n");
  return `Read this excerpt from a roleplay scene and rate how warm and close the participants are toward each other, from ${SCORE_MIN} (hostile) to ${SCORE_MAX} (intimate). Answer with the number and nothing else.\n\n${transcript}`;
}

/** How many times a contended compare-and-set is retried before this plugin gives up on the write. There is
 *  no backoff and none is possible — the sandbox has no timers and no randomness — but none is needed: the
 *  loop never waits, it only re-reads the value that beat it, and each turn is one host call. */
const CAS_ATTEMPTS = 5;

/** Derive a stored value from its own previous value, ATOMICALLY. Returns the value that landed, or `null`
 *  when the key stayed contended past the bound.
 *
 *  WHY, stated exactly, because the obvious version is wrong: this plugin's own SERVER handlers do NOT race
 *  each other — `infra/plugin-host/port.ts` runs every invoke on one resident through a serialized tail chain,
 *  so a tool call, an event delivery and a panel action never interleave. What is NOT serialized is the OTHER
 *  caller of the same KV rows: a Tier-C scripted `ui.js` reaches `storage.*` through `plugin.uiHostCall`,
 *  which goes straight to the bridge with no queue at all — and two browser tabs are two such callers. So any
 *  value derived from its own previous value needs a compare-and-set the moment a plugin grows a client-side
 *  writer, which is the moment nobody remembers to come back and add one.
 *
 *  `host.storage.compareAndSet` writes only while the key still holds what we read, and reports the value
 *  that won when it does not — which is exactly the input the next attempt needs, so a retry costs no extra
 *  read. Copy this helper; it is the house idiom for a counter. */
async function updateStored(key, nextFrom) {
  let current = await host.storage.get(key);
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const next = nextFrom(current);
    const result = await host.storage.compareAndSet(key, current, next);
    if (result.applied) {
      return next;
    }
    current = result.current;
  }
  return null;
}

/** Read + bump the per-chat message counter. Returns the new count, or `null` when the counter stayed
 *  contended. The counter lives in the plugin's OWN KV (per plugin × installing owner), so it is invisible to
 *  every other plugin and to the room. */
async function bumpCount(chatId) {
  const next = await updateStored(countKey(chatId), (raw) => String((Number(raw) || 0) + 1));
  return next === null ? null : Number(next);
}

/** Ask the model, parse strictly, clamp. `null` for every failure shape — an unusable answer is not a score. */
async function readScore(chat) {
  const messages = await host.chat.listMessages(chat, { limit: WINDOW });
  if (messages.length === 0) {
    return null;
  }
  const answer = await host.llm.quiet(buildPrompt(messages));
  const match = FIRST_INT_RE.exec(String(answer));
  if (match === null) {
    host.log.info(`unparseable reading: ${String(answer).slice(0, LOG_EXCERPT_CHARS)}`);
    return null;
  }
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Number(match[0])));
}

/** Tell the installer only when the reading MOVED. `"host"` is the recipient selector — the host membrane
 *  resolves it DOMAIN-side to the installing user, so a plugin can never notify someone who is not a
 *  participant, and can never name a recipient at all. */
async function announceIfMoved(chat, chatId, score) {
  const previous = await host.storage.get(scoreKey(chatId));
  // COMPARE-AND-SET, not `set`. If anything recorded a reading between this read and this write — a Tier-C
  // surface, another tab; not another of THIS plugin's server handlers, which the host serializes — that
  // reading is the newer truth, and overwriting it here would both discard it and announce a delta measured
  // against a number that is no longer in the store.
  if (!(await host.storage.compareAndSet(scoreKey(chatId), previous, String(score))).applied) {
    return;
  }
  if (previous === null) {
    return; // The first reading is a baseline, not a change.
  }
  const moved = score - Number(previous);
  if (Math.abs(moved) < NOTIFY_DELTA) {
    return;
  }
  const direction = moved > 0 ? "warmer" : "cooler";
  await host.notifications.post(chat, "host", `The scene has turned ${direction} (${previous} → ${score}).`);
}

host.events.on("messageCommitted", async (fact) => {
  try {
    const chatId = fact?.chatId ? fact.chatId : null;
    if (chatId === null) {
      return; // A chat-less domain fact — nothing to read. (This handler only subscribes to a chat trigger.)
    }
    const count = await bumpCount(chatId);
    // `null` = the counter stayed contended past the retry bound. Skip this message rather than score it: a
    // reading is a sample, not a ledger, so losing one costs nothing and double-counting would be a lie.
    if (count === null || count % SCORE_EVERY !== 0) {
      return; // THE DEBOUNCE. Seven messages out of eight cost one KV read and one KV write.
    }
    // `chat.current()` is the invocation's admitted room. Fetched here, after the debounce, because a handle
    // is only ever valid inside the invocation that minted it — there is nothing to cache.
    const chat = host.chat.current();
    const score = await readScore(chat);
    if (score === null) {
      return;
    }
    host.log.info(`affinity reading for ${chatId}: ${score}`);
    await announceIfMoved(chat, chatId, score);
    // …and push the same reading onto the ROOM SURFACE (the chat-flank widget registered below). This is the
    // whole shape of a live plugin widget: a room event lands, you compute, you `setState`, and the app
    // repaints the surface for you. Nothing here draws anything — the spec below is the drawing.
    await publishFlank(chat, score);
  } catch (err) {
    // A handler must never throw — three consecutive rejections auto-disable the plugin. The two failures
    // this one actually meets are the hourly `llm.quiet` floor and a model provider having a bad minute;
    // both are "try again later", neither is a defect.
    // `String(err)` rather than `err.message`: it never throws (a guest realm can `throw null`) and an Error
    // stringifies to `Name: message`, which is exactly what a log line wants.
    host.log.warn(`reading skipped: ${String(err)}`);
  }
});

// ── THE SETTINGS PANEL (ui.surface) ──────────────────────────────────────────────────────────────────────
//
// A plugin's UI is a DECLARATIVE SPEC drawn by the app itself — you name house controls as DATA, never DOM.
// This one shows the person a PRIVATE roll-up of the warmth readings this plugin has taken (nothing here is
// ever visible in a room), and a button that recomputes it on demand.
//
// THE STATE MODEL, because it is the whole point of `setState`: the spec's values are bound with `{ $state }`
// to a state object you PUBLISH. `setState` replaces the whole object and the app refetches — so the panel is
// always a projection of what you last published, never a value you hand-wove into the tree. The panel starts
// empty (nothing published yet), and the button's action is what fills it.
//
// The `onAction` handler runs SERVER-SIDE in this same guest, under the invocation budget, when a button is
// clicked — exactly like an event handler. It reads the plugin's OWN storage (no new capability: `storage.kv`
// is already granted) and publishes the summary. It commits nothing to any room; a settings panel has no room.

/** The one place a WARMTH number is turned into a human phrase — the spec renders the label, the code owns it. */
const AVERAGE_DIVISOR = 10;

/** The declarative surface spec — a stack of house nodes, all bound to the published state. */
const AFFINITY_PANEL_SPEC = {
  kind: "stack",
  gap: "block",
  children: [
    {
      kind: "text",
      voice: "gloss",
      value: "A private summary of the warmth readings this plugin has taken across your rooms. Nothing here is ever visible in a room — it is yours to read.",
    },
    {
      kind: "keyValue",
      rows: [
        { key: "Chats tracked", value: { $state: "trackedChats" } },
        { key: "Average warmth", value: { $state: "averageLabel" } },
      ],
    },
    { kind: "meter", label: "Average warmth", max: SCORE_MAX, value: { $state: "averageWarmth" } },
    { kind: "text", value: { $state: "summary" } },
    { kind: "button", actionId: "refresh", label: "Refresh readings", variant: "outline" },
  ],
};

/** Recompute the roll-up from the plugin's OWN per-chat score keys and publish it. `storage.list("score:")`
 *  returns this plugin's keys only (per plugin × installing owner), so the summary can never leak another
 *  plugin's or another person's data. */
async function publishSummary() {
  const keys = await host.storage.list("score:");
  // Read the scores in parallel (a person tracks a handful of rooms; the membrane caps concurrent host calls
  // at 32 and contains any overflow), then fold — no per-key await in the loop.
  const raw = await Promise.all(keys.map((key) => host.storage.get(key)));
  let sum = 0;
  let count = 0;
  for (const value of raw.map(Number)) {
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  const average = count === 0 ? 0 : Math.round((sum / count) * AVERAGE_DIVISOR) / AVERAGE_DIVISOR;
  await host.ui.setState("affinity_summary", {
    trackedChats: count,
    averageWarmth: average,
    averageLabel: count === 0 ? "no readings yet" : `${average} / ${SCORE_MAX}`,
    summary:
      count === 0
        ? "No readings yet. The tracker takes one every few messages once a room gets going — come back after some conversation."
        : `Tracking ${count} chat${count === 1 ? "" : "s"}, at an average warmth of ${average} out of ${SCORE_MAX}.`,
  });
}

// FEATURE-DETECT THE GRANT before every UI registration — never assume it. A user may tick `llm.quiet` and
// leave `ui.surface` unticked; their call, and the tracker still works headless (readings, notices). Calling
// a host fn you were not granted THROWS, and registrations run at activation, so ONE unguarded `ui.register`
// takes the whole plugin down — no event handler, no readings — over a decoration. `host.grants` is the
// guest-readable grant set for exactly this. (Every UI call site in this file sits behind the same guard.)
if (host.grants.includes("ui.surface")) {
  host.ui.register({
    id: "affinity_summary",
    anchor: "settings",
    title: "Affinity readings",
    tier: "static",
    spec: AFFINITY_PANEL_SPEC,
    // The action round-trip. A settings surface carries no room, so `a.chat` is null; the handler reads private
    // storage and publishes — which is the whole allowed shape (a UI action cannot write a room by itself).
    onAction: async (a) => {
      if (a.actionId === "refresh") {
        await publishSummary();
      }
    },
  });
}

// ── THE ROOM WIDGET (ui.surface at the `chat-flank` anchor) ──────────────────────────────────────────────
//
// The SAME vocabulary as the settings panel, mounted beside the transcript instead of in the settings screen.
// The app draws it in a labelled frame that names this plugin — you cannot draw the room's own chrome, and
// you never have to: what you get for free is the room's theme, spacing, focus order and a11y.
//
// THE TWO RULES THAT MATTER AT THIS ANCHOR:
//  1. SILENT UNTIL YOU HAVE SOMETHING TO SAY. A flank surface whose values are `{ $state }` bindings renders
//     NOTHING until you have published state, and a room that shows no widget is byte-identical to a room
//     with no plugin at all. So do not publish a placeholder — publish when you have a reading.
//  2. STATE CAN BE PER-ROOM, AND HERE IT SHOULD BE. `setState` takes an optional third argument: the CHAT
//     HANDLE of the room the reading belongs to. Pass it and the widget in that room shows that room's number;
//     omit it and every room shows the same publication. A warmth reading is a fact about ONE conversation, so
//     it is passed. (Omitting it is still right for something genuinely cross-room — the settings panel's
//     roll-up below publishes with no handle for exactly that reason.) You can only name a room this
//     invocation was admitted to: the handle comes from `host.chat.current()` and a forged one is refused.
const AFFINITY_FLANK_SPEC = {
  kind: "stack",
  gap: "field",
  children: [
    { kind: "meter", label: "Warmth", max: SCORE_MAX, value: { $state: "score" } },
    { kind: "text", voice: "gloss", value: { $state: "caption" } },
  ],
};

/** Publish the latest reading to the room widget, keyed to THIS ROOM. Called from the event handler — that is
 *  what makes the widget LIVE: the app is told the surface changed and repaints it wherever it is on screen.
 *  Grant-guarded HERE (not at the caller): the event handler runs headless too, and a `setState` for a
 *  surface that was never registered is a refusal we can simply not ask for. */
async function publishFlank(chat, score) {
  if (!host.grants.includes("ui.surface")) {
    return;
  }
  await host.ui.setState("affinity_flank", { score, caption: `This room's warmth, ${score} of ${SCORE_MAX}, read every ${SCORE_EVERY} messages.` }, chat);
}

if (host.grants.includes("ui.surface")) {
  host.ui.register({
    id: "affinity_flank",
    anchor: "chat-flank",
    title: "Warmth",
    tier: "static",
    spec: AFFINITY_FLANK_SPEC,
    // No `onAction`: this surface is a READOUT. A surface with no actions is a perfectly good surface — it is
    // the cheapest thing to build and the least that can go wrong in a room.
  });
}

// ── THE SCRIPTED SURFACE (tier: "scripted" — the Tier-C half, drawn by `ui.js`) ──────────────────────────
//
// The registration is the SAME `host.ui.register` call, with two differences and no third: `tier` is
// `"scripted"`, and there is NO `spec` — because the tree is not a constant here, it is whatever `ui.js`
// computes IN THE BROWSER and publishes with `orb.ui(1).render`. That is the entire declaration; everything
// else about the surface (its label, its anchor, its shell) works exactly as it does for a static one.
//
// WHY THIS SURFACE IS SCRIPTED AND THE OTHER TWO ARE NOT — the honest rule for choosing a tier: this one has a
// FILTER BOX. A static surface's every keystroke would be a round-trip through `onAction`, which is both slow
// and wrong (a filter is not an action). The panel above and the room widget below have no local interaction at
// all — they display what the server published — so making them scripted would buy nothing and cost a WASM
// interpreter. Reach for the scripted tier when a surface has to THINK between clicks; stay static otherwise.
//
// There is no `onAction` either: a scripted surface's events go to its own `onEvent` handler in `ui.js`, not
// back to this file.
if (host.grants.includes("ui.surface")) {
  host.ui.register({
    id: "affinity_browser",
    anchor: "settings",
    title: "Browse readings",
    tier: "scripted",
  });
}

host.log.info(`affinity tracker ready — scoring every ${SCORE_EVERY} messages (grants: ${host.grants.join(", ") || "none"})`);
