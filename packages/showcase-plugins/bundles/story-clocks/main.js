// Story Clocks — the ROOM-MECHANICS archetype of an Orbweaver plugin.
//
// WHAT IT DOES. Blades-in-the-Dark progress clocks for a room: "The Ritual 3/6". The room's host starts and
// ticks them from the host-controls band, the MODEL ticks them mid-turn through a tool, a flank widget shows
// them filling — and when a human tick FILLS one, the plugin asks the narrator to take a turn and make it
// matter. It is the cheapest real "game mechanics" layer a story table can add.
//
// WHY THE CLOCKS LIVE IN CHAT VARIABLES, and not in this plugin's private storage — the decision this
// archetype exists to teach. Orbweaver gives a plugin TWO writable state planes:
//   - `storage.kv` — PRIVATE, per plugin × installer. Nobody else can see it. Perfect for counters,
//     cooldowns, sessions (see affinity-tracker, oracle-deck).
//   - CHAT VARIABLES (`chat.applyVariableOps`) — the ROOM's member-visible plane: the same store that
//     `{{getvar}}` macros read, CEL predicates test, and automation rules react to.
// A clock is ROOM STATE. Writing it as `clock:the_ritual = "3/6"` means the room's own machinery composes
// with it for free: a member can put `{{getvar::clock:the_ritual}}` in an author's note, and an automation
// rule can fire on `vars["clock:the_ritual"] == "6/6"` — none of which this plugin had to build. When your
// state is ABOUT the room, put it IN the room.
//
// THE PRICE OF THAT PLANE: host authority. `applyVariableOps` is a room-state write, so it works only where
// the INSTALLER HOSTS the room — a flat refusal elsewhere (a variable delta is not a human-weighable ask, so
// it never becomes a confirm card). The host-controls surface below only MOUNTS for the host, so the human
// path is coherent by construction; the model's tool path catches the refusal and tells the model instead.
//
// THE THIRD LESSON: A READ-MODIFY-WRITE ON A SHARED PLANE NEEDS A COMPARE-AND-SET. Ticking a clock is
// read `3/6` → write `4/6`, and this plugin has TWO writers that do not see each other: the `advance_clock`
// tool runs on the plugin's serialized invoke queue, a panel button arrives on a fresh bridge that never
// touches it. Unconditional writes both "succeed" and one tick vanishes. `chat.applyVariableOps` takes an
// optional `expect` — the values you believe you read — and refuses AS DATA (`{outcome:"stale", actual}`)
// when they moved, so `tick` retries against `actual`. If your plugin computes a new value FROM the old one,
// on any plane a second writer can reach, this is the shape.
//
// THE OTHER LESSON HERE: `turn.trigger`. When a human tick fills a clock, the plugin calls
// `chat.requestTurn` with a guided instruction — a SPEND capability, budget-gated like the automation
// `trigger_turn` action, and suggest-shaped: without host authority the request becomes a confirm card for
// the room's host and the call throws `PluginSuggestedError` ("it became a question" — not a failure).
// The fill-trigger fires ONLY on the human tick path, deliberately: when the MODEL fills a clock it is
// already narrating, and chaining a second turn onto its own tick would be automation eating the table.

const host = orb.host(1);

/** Chat-variable key prefix. The KEY carries the clock's identity (`clock:the_ritual`); the VALUE is the
 *  compact `"cur/max"` everyone — macros, CEL, this plugin — parses the same way. */
const VAR_PREFIX = "clock:";

/** How many clocks one room may run. Four is a table's honest attention budget, and it is also the flank
 *  widget's slot count — a static surface declares its nodes up front, so the cap and the layout agree. */
const MAX_CLOCKS = 4;

/** Segment bounds. 4/6/8 are the classic clock sizes; 12 is the hard parse ceiling so a hand-edited
 *  variable cannot draw an absurd dial. */
const CLOCK_SIZE_SHORT = 4;
const CLOCK_SIZE_CLASSIC = 6;
const CLOCK_SIZE_LONG = 8;
const CLOCK_SIZES = [CLOCK_SIZE_SHORT, CLOCK_SIZE_CLASSIC, CLOCK_SIZE_LONG];
const DEFAULT_SEGMENTS = CLOCK_SIZE_CLASSIC;
const MAX_SEGMENTS = 12;
/** The slug ceiling — the variable-key discipline (a key is a bounded programmatic name). */
const SLUG_MAX = 40;

/** The dot glyphs a clock renders as — `●●●○○○ 3/6` reads at a glance in a text node, and the plugin owns
 *  the SENTENCE (the vocabulary has no radial meter; pre-render your own language — the oracle's
 *  `countLabel` lesson, one surface over). */
const FILLED = "●";
const EMPTY = "○";

// ── clock model (pure helpers over the `"cur/max"` value grammar) ──────────────────────────────────────────

/** Lowercase a human name into the variable-key slug: `The Ritual` → `the_ritual`. Returns null for input
 *  that leaves nothing (symbols only) — a clock needs a name a person can say. */
function slugify(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
  return slug.length === 0 ? null : slug.slice(0, SLUG_MAX);
}

/** `the_ritual` → `the ritual` — the display name is derived, never stored twice. */
function displayName(slug) {
  return slug.replaceAll("_", " ");
}

/** Parse a `"cur/max"` value. `null` for anything malformed — a hand-edited variable is user input. */
function parseClock(value) {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(String(value ?? ""));
  if (match === null) {
    return null;
  }
  const max = Number(match[2]);
  const cur = Math.min(Number(match[1]), max);
  if (max < 1 || max > MAX_SEGMENTS) {
    return null;
  }
  return { cur, max };
}

/** Every clock in a variables snapshot, in key order — `[{slug, cur, max}]`. */
function clocksIn(vars) {
  const out = [];
  for (const key of Object.keys(vars).sort()) {
    if (!key.startsWith(VAR_PREFIX)) {
      continue;
    }
    const parsed = parseClock(vars[key]);
    if (parsed !== null) {
      out.push({ slug: key.slice(VAR_PREFIX.length), cur: parsed.cur, max: parsed.max });
    }
  }
  return out;
}

/** One clock as its display line: `the ritual  ●●●○○○ 3/6`. */
function clockLine(clock) {
  return `${displayName(clock.slug)}  ${FILLED.repeat(clock.cur)}${EMPTY.repeat(clock.max - clock.cur)} ${clock.cur}/${clock.max}`;
}

// ── publishing (the surfaces are projections of the room's variables) ──────────────────────────────────────

/** Publish the room's clocks to BOTH surfaces, keyed to THIS room (the third `setState` argument — omit it
 *  and every room would show the same publication; a clock is a fact about ONE room). The state shape is the
 *  flank's slot model: four line slots, blank when unused — a static spec declares its nodes up front, so
 *  absent clocks publish as "" and render as nothing-worth-reading rather than broken furniture. */
async function publishClocks(chat, vars) {
  if (!host.grants.includes("ui.surface")) {
    return; // Headless is a fine way to run — the model can still tick clocks and macros still read them.
  }
  const clocks = clocksIn(vars);
  const state = { count: clocks.length };
  for (let i = 0; i < MAX_CLOCKS; i += 1) {
    state[`line${i}`] = i < clocks.length ? clockLine(clocks[i]) : "";
  }
  state.summary = clocks.length === 0 ? "No clocks yet — the host starts one below." : `${clocks.length} of ${MAX_CLOCKS} clocks running.`;
  await host.ui.setState("clock_flank", state, chat);
  await host.ui.setState("clock_panel", state, chat);
}

/** Read-then-publish, the refresh everything funnels through. */
async function refresh(chat) {
  await publishClocks(chat, await host.chat.getVariables(chat));
}

// ── the write path (one place turns a verb into variable ops) ──────────────────────────────────────────────

/** Apply one clock mutation via the delta seam. `ops` ride the SAME `set`/`delete` vocabulary the automation
 *  `set_variable` action uses — a plugin write is indistinguishable from a rule's, by design. Throws the
 *  host's own refusal in a room the installer does not host (the callers catch and translate). */
async function writeClock(chat, slug, value) {
  const key = `${VAR_PREFIX}${slug}`;
  await host.chat.applyVariableOps(chat, value === null ? [{ op: "delete", key }] : [{ op: "set", key, value }]);
}

/** How many times a tick re-derives after losing the compare-and-set. Each loss means ANOTHER writer moved
 *  this clock, so the loop makes progress by construction; the bound only stops a pathological spin. */
const TICK_ATTEMPTS = 4;

/** Tick one clock by one segment — a READ-MODIFY-WRITE, and therefore a COMPARE-AND-SET (the lesson this
 *  function now carries). Two writers reach the same clock from opposite sides of the plugin invoke queue: the
 *  `advance_clock` TOOL runs on the plugin's resident, where every invoke is serialized, while a panel action
 *  arrives on a fresh bridge that never touches that queue. Both read `3/6`, both write `4/6`, and one tick is
 *  gone — silently, because an unconditional write always "succeeds". So the write states the value it was
 *  derived from; the host refuses it AS DATA when the clock has moved, and we re-derive from the value the
 *  refusal hands back rather than taking another read (a second read is another window).
 *
 *  Returns `{clock, filled}` after the write, `null` when the clock is absent, or `{contended: true}` when the
 *  room out-ticked us `TICK_ATTEMPTS` times — an honest "try again", never a silent no-op. */
async function tick(chat, slug, vars) {
  const key = `${VAR_PREFIX}${slug}`;
  let live = vars[key] ?? null;
  for (let attempt = 0; attempt < TICK_ATTEMPTS; attempt += 1) {
    const existing = parseClock(live);
    if (existing === null) {
      return null;
    }
    const cur = Math.min(existing.cur + 1, existing.max);
    const result = await host.chat.applyVariableOps(chat, [{ op: "set", key, value: `${cur}/${existing.max}` }], [{ key, expected: live }]);
    if (result.outcome === "applied") {
      return { clock: { slug, cur, max: existing.max }, filled: cur === existing.max && existing.cur < existing.max };
    }
    live = result.actual[key] ?? null;
  }
  return { contended: true };
}

/** The filled-clock consequence: ask the narrator to take a turn about it. Suggest-shaped spend — see the
 *  file header. Called ONLY from the human tick path. */
async function narrateFill(chat, slug) {
  if (!host.grants.includes("turn.trigger")) {
    return; // Ungranted is a fine answer: the clock still filled, the room just narrates it themselves.
  }
  try {
    await host.chat.requestTurn(chat, { guided: `The clock "${displayName(slug)}" has just filled. Narrate the consequence landing — now, on screen.` });
  } catch (err) {
    logTurnRefusal(err);
  }
}

/** Classify a `requestTurn` refusal by its class NAME (it crosses the sandbox boundary intact), behind a
 *  null-tolerant read — a guest realm can `throw null`, so the guard is load-bearing, not defensive noise. */
function logTurnRefusal(err) {
  const name = err?.name ? err.name : "Error";
  if (name === "PluginSuggestedError") {
    // Not the host of this room: the turn became a confirm card for the host. That is the designed outcome,
    // not a failure — do not retry (a retry only replaces the pending card).
    host.log.info("filled-clock turn became an ask for the room's host");
    return;
  }
  // The other honest refusals here are the turn budget and D17 — "later", in both cases.
  host.log.warn(`filled-clock turn not taken: ${String(err)}`);
}

// ── the model's tool ───────────────────────────────────────────────────────────────────────────────────────
// One tool, verb-shaped: advance a named clock (starting it on first mention). The tool result is a SENTENCE
// (not a JSON document, deliberately — contrast with the oracle's `drawResult`): no card binds it, so its one
// audience is the model, and a model reads prose. There is no tool-card registered for it either, which is
// itself the lesson: an unregistered tool renders in the app's generic tool block, and for a one-line answer
// that block is exactly right. Register a card when you have a DOCUMENT; skip it when you have a sentence.
if (host.grants.includes("tools.register") && host.grants.includes("chat.read") && host.grants.includes("chat.variables.write")) {
  host.tools.register({
    name: "advance_clock",
    description:
      "Advance a named story clock by one segment (start it first if new). Use when the fiction moves a threat, project, or countdown forward. Returns the clock's new state.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The clock's name, e.g. 'the ritual'." },
        // `number`, NOT `integer`: the host lifts a guest schema to zod, and zod has no integer literal — so an
        // `integer` node carrying an `enum` is a typed refusal, which is activation-fatal for the whole plugin
        // (it cost this example its entire runtime until #1865). The enum members ARE the constraint here; the
        // three sizes are integers whether or not the node says so.
        segments: { type: "number", enum: CLOCK_SIZES, description: "Size when STARTING a new clock (default 6)." },
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const slug = slugify(args ? args.name : "");
      if (slug === null) {
        return "That clock needs a speakable name.";
      }
      // A tool invocation's chat handle is minted fresh per call (no stable room identity — the tool-provider
      // lesson), but WITHIN this call it names the room the model is narrating, which is all a clock needs.
      const chat = host.chat.current();
      try {
        const vars = await host.chat.getVariables(chat);
        const existing = parseClock(vars[`${VAR_PREFIX}${slug}`]);
        if (existing === null) {
          if (clocksIn(vars).length >= MAX_CLOCKS) {
            return `The room already runs ${MAX_CLOCKS} clocks — clear one before starting another.`;
          }
          const rawSegments = Number(args ? args.segments : DEFAULT_SEGMENTS);
          const max = CLOCK_SIZES.includes(rawSegments) ? rawSegments : DEFAULT_SEGMENTS;
          await writeClock(chat, slug, `1/${max}`);
          await refresh(chat);
          return `Started the clock "${displayName(slug)}" at 1/${max}.`;
        }
        const result = await tick(chat, slug, vars);
        await refresh(chat);
        if (result === null) {
          return `No clock named "${displayName(slug)}" is running.`;
        }
        if (result.contended === true) {
          // The room ticked this clock underneath us the whole time we were retrying — say so in prose, which
          // is what the model can act on. Nothing was written, so the count is still honest.
          return `"${displayName(slug)}" is being changed by someone else right now — read it again before you move it.`;
        }
        // The model filled it: report the fact and let the model narrate — it is already speaking. The
        // requestTurn arm belongs to the HUMAN tick path only (see the header).
        return result.filled
          ? `The clock "${displayName(slug)}" is FULL (${result.clock.cur}/${result.clock.max}). Its consequence lands now — narrate it.`
          : `"${displayName(slug)}" advances to ${result.clock.cur}/${result.clock.max}.`;
      } catch (err) {
        // The expected refusal: a room the installer does not host (variables are host-authority writes).
        // Answer the MODEL in prose — a thrown tool is a crash strike; a sentence is information.
        host.log.info(`advance_clock refused: ${String(err)}`);
        return "The clocks belong to the room's host, and this room has a different host — leave the clock be.";
      }
    },
  });
}

// ── the host-panel actions (split per verb so each reads as its own small story) ──────────────────────────

/** `Start`: refuse a duplicate or a fifth clock; otherwise mint at `0/max` from the select's value. */
async function startAction(chat, slug, vars, segmentsValue) {
  if (parseClock(vars[`${VAR_PREFIX}${slug}`]) !== null) {
    await host.ui.toast("warn", `"${displayName(slug)}" is already running — Tick it instead.`);
    return;
  }
  if (clocksIn(vars).length >= MAX_CLOCKS) {
    await host.ui.toast("warn", `This room already runs ${MAX_CLOCKS} clocks — clear one first.`);
    return;
  }
  const parsed = Number(segmentsValue);
  const max = CLOCK_SIZES.includes(parsed) ? parsed : DEFAULT_SEGMENTS;
  await writeClock(chat, slug, `0/${max}`);
  await host.ui.toast("success", `"${displayName(slug)}" starts at 0/${max}.`);
}

/** `Tick`: advance by one; a FILL celebrates and asks the narrator to land it (the turn.trigger arm). */
async function tickAction(chat, slug, vars) {
  const result = await tick(chat, slug, vars);
  if (result === null) {
    await host.ui.toast("warn", `No clock named "${displayName(slug)}" — Start it first.`);
    return;
  }
  if (result.contended === true) {
    // Nothing was written: somebody (or the narrator's tool) kept moving this clock while we retried. An
    // honest "nothing happened, look again" beats a toast claiming a tick that did not land.
    await host.ui.toast("warn", `"${displayName(slug)}" is moving under you — the panel will refresh; tick it again.`);
    return;
  }
  if (result.filled) {
    await host.ui.toast("success", `"${displayName(slug)}" is FULL — asking the narrator to make it land.`);
    await narrateFill(chat, slug);
    return;
  }
  await host.ui.toast("info", `"${displayName(slug)}" → ${result.clock.cur}/${result.clock.max}`);
}

/** Dispatch one panel action. The vars snapshot is read ONCE per action, here, so every branch judges the
 *  same moment — two reads could disagree mid-click. */
async function runClockAction(chat, actionId, slug, values) {
  const vars = await host.chat.getVariables(chat);
  if (actionId === "start") {
    await startAction(chat, slug, vars, values.segments);
  } else if (actionId === "tick") {
    await tickAction(chat, slug, vars);
  } else if (actionId === "clear") {
    await writeClock(chat, slug, null);
    await host.ui.toast("info", `"${displayName(slug)}" cleared.`);
  }
}

// ── the surfaces ───────────────────────────────────────────────────────────────────────────────────────────
if (host.grants.includes("ui.surface") && host.grants.includes("chat.read") && host.grants.includes("chat.variables.write")) {
  /** The flank line slots — `text` nodes bound per slot. An empty slot's "" renders as nothing to read; the
   *  summary line beneath carries the honest empty state (the three-states law reaching a plugin surface). */
  const LINE_SLOTS = Array.from({ length: MAX_CLOCKS }, (_unused, i) => ({ kind: "text", value: { $state: `line${i}` } }));

  // THE ROOM READOUT (chat-flank): pure projection, no actions — everyone in the room sees the host's app
  // draw it, but the DATA is per-room published state, so each room shows its own clocks.
  host.ui.register({
    id: "clock_flank",
    anchor: "chat-flank",
    title: "Clocks",
    tier: "static",
    spec: {
      kind: "stack",
      gap: "field",
      children: [...LINE_SLOTS, { kind: "text", voice: "gloss", value: { $state: "summary" } }],
    },
  });

  // THE HOST CONTROLS (chat-settings-section): this anchor rides the room's host-controls band and MOUNTS
  // ONLY FOR THE ROOM'S HOST — the app enforces that at the mount, so the surface never has to ask "am I the
  // host" (and could not: a spec is data). The action handler still runs under the same host-authority walls;
  // the mount gate and the write gate agree by construction.
  host.ui.register({
    id: "clock_panel",
    anchor: "chat-settings-section",
    title: "Story clocks",
    tier: "static",
    spec: {
      kind: "stack",
      gap: "block",
      children: [
        ...LINE_SLOTS,
        { kind: "text", voice: "gloss", value: { $state: "summary" } },
        {
          kind: "row",
          gap: "field",
          children: [
            { kind: "textField", name: "name", label: "Clock", placeholder: "the ritual" },
            {
              kind: "select",
              name: "segments",
              label: "Segments",
              options: [
                { value: "4", label: "4" },
                { value: "6", label: "6" },
                { value: "8", label: "8" },
              ],
              value: "6",
            },
          ],
        },
        {
          kind: "row",
          gap: "field",
          children: [
            { kind: "button", actionId: "start", label: "Start", variant: "outline" },
            { kind: "button", actionId: "tick", label: "Tick", variant: "neutral" },
            { kind: "confirmButton", actionId: "clear", label: "Clear", confirmTitle: "Clear this clock?", confirmBody: "Its progress is gone for good." },
          ],
        },
      ],
    },
    // The action round-trip: `a.values` is the collected form (name + segments), `a.chat` is the ROOM the
    // band lives in — present for a room-anchored surface, null only for room-less anchors like `settings`.
    onAction: async (a) => {
      if (a.chat === null) {
        return;
      }
      const slug = slugify(a.values.name);
      if (slug === null) {
        await host.ui.toast("warn", "Name the clock first — the field above the buttons.");
        return;
      }
      try {
        await runClockAction(a.chat, a.actionId, slug, a.values);
        await refresh(a.chat);
      } catch (err) {
        // Belt for the walls the mount gate already implies (and any transient): say it, never throw it.
        host.log.warn(`clock action failed: ${String(err)}`);
        await host.ui.toast("error", "That didn't take — see the plugin log.");
      }
    },
  });
}

// ── liveness: hydrate the room's surfaces when a room opens ────────────────────────────────────────────────
// A per-room bound surface renders NOTHING until state is published for that room. `chatOpened` is the
// hydration moment: read the room's variables once, publish, done — the idiom every per-room widget wants.
// (After that, every mutation path above republishes; a variable someone ELSE changes — a rule, a macro —
// is picked up on the next open or the next action. Honest limit, stated.)
if (host.grants.includes("events.subscribe") && host.grants.includes("chat.read")) {
  host.events.on("chatOpened", async () => {
    try {
      await refresh(host.chat.current());
    } catch (err) {
      host.log.warn(`clock hydrate skipped: ${String(err)}`);
    }
  });
}

host.log.info(`story clocks ready — up to ${MAX_CLOCKS} per room (grants: ${host.grants.join(", ") || "none"})`);
